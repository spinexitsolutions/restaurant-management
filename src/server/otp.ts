import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { GRAPH_VERSION, toWaNumber } from "@/lib/whatsapp";
import { APP_NAME } from "@/lib/utils";

// One-time codes for password reset and OTP sign-in, delivered by whichever service is configured:
//   SMS      - MSG91 Flow API (MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID; template variable "otp")
//   WhatsApp - the platform's own Meta number (PLATFORM_WA_PHONE_NUMBER_ID, PLATFORM_WA_TOKEN,
//              PLATFORM_WA_OTP_TEMPLATE: an approved "Authentication" template with a copy-code button)
//   Email    - Resend (RESEND_API_KEY, EMAIL_FROM)
// In development with none configured (or with OTP_DEV_LOG=1 on a test server), the code is printed
// to the server log. Never set OTP_DEV_LOG on a live server.

export type OtpPurpose = "RESET" | "LOGIN";

const CODE_TTL_MS = 10 * 60_000;
const MAX_TRIES = 5;
const MAX_CODES_PER_15_MIN = 3;

export class OtpError extends Error {}

const env = () => ({
  msg91Key: process.env.MSG91_AUTH_KEY,
  msg91Template: process.env.MSG91_OTP_TEMPLATE_ID,
  waPhoneId: process.env.PLATFORM_WA_PHONE_NUMBER_ID,
  waToken: process.env.PLATFORM_WA_TOKEN,
  waTemplate: process.env.PLATFORM_WA_OTP_TEMPLATE,
  waLang: process.env.PLATFORM_WA_OTP_LANG || "en",
  resendKey: process.env.RESEND_API_KEY,
  emailFrom: process.env.EMAIL_FROM,
});

export function otpChannels() {
  const e = env();
  return { sms: !!(e.msg91Key && e.msg91Template), whatsapp: !!(e.waPhoneId && e.waToken && e.waTemplate), email: !!(e.resendKey && e.emailFrom) };
}

export function otpAvailable() {
  const c = otpChannels();
  return c.sms || c.whatsapp || c.email || devLog();
}

const devLog = () => process.env.NODE_ENV !== "production" || process.env.OTP_DEV_LOG === "1";

function hash(code: string, userId: string) {
  return createHmac("sha256", process.env.AUTH_SECRET || "dev").update(`${userId}:${code}`).digest("hex");
}

/** Finds the account for an email or a 10-digit mobile number (only if exactly one active user has it). */
export async function findAccount(identifier: string): Promise<User | null> {
  const id = identifier.trim().toLowerCase();
  if (id.includes("@")) return db.user.findFirst({ where: { email: id, isActive: true } });
  const phone = id.replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(phone)) return null;
  const users = await db.user.findMany({ where: { phone, isActive: true }, take: 2 });
  return users.length === 1 ? users[0] : null;
}

async function sendSms(phone: string, code: string) {
  const e = env();
  const res = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: { authkey: e.msg91Key!, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ template_id: e.msg91Template, short_url: "0", recipients: [{ mobiles: `91${phone}`, otp: code }] }),
  });
  if (!res.ok) throw new Error(`MSG91 ${res.status}`);
}

async function sendWhatsApp(phone: string, code: string) {
  const e = env();
  const to = toWaNumber(phone);
  if (!to) throw new Error("Invalid number");
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${e.waPhoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${e.waToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: e.waTemplate,
        language: { code: e.waLang },
        // Authentication templates take the code in the body and in the copy-code button.
        components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
        ],
      },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}`);
}

async function sendEmail(to: string, code: string, purpose: OtpPurpose) {
  const e = env();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${e.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: e.emailFrom,
      to,
      subject: `${code} is your ${APP_NAME} ${purpose === "RESET" ? "password reset" : "sign-in"} code`,
      text: `Your ${APP_NAME} code is ${code}. It expires in 10 minutes. If you didn't ask for it, ignore this email.`,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

/**
 * Creates and sends a code. Phone sign-ins prefer WhatsApp, then SMS; email requests prefer email.
 * Returns where it went (masked) so the UI can tell the user where to look.
 */
export async function issueOtp(user: User, purpose: OtpPurpose, preferEmail: boolean): Promise<{ channel: string }> {
  const recent = await db.otpCode.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } });
  if (recent >= MAX_CODES_PER_15_MIN) throw new OtpError("Too many codes requested. Please wait 15 minutes.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const c = otpChannels();
  const order: ("EMAIL" | "WHATSAPP" | "SMS")[] = preferEmail ? ["EMAIL", "WHATSAPP", "SMS"] : ["WHATSAPP", "SMS", "EMAIL"];
  let channel: string | null = null;
  for (const ch of order) {
    try {
      if (ch === "EMAIL" && c.email && user.email) await sendEmail(user.email, code, purpose);
      else if (ch === "WHATSAPP" && c.whatsapp && user.phone) await sendWhatsApp(user.phone, code);
      else if (ch === "SMS" && c.sms && user.phone) await sendSms(user.phone, code);
      else continue;
      channel = ch;
      break;
    } catch (e) {
      console.error(`OTP via ${ch} failed`, e);
    }
  }
  if (!channel) {
    if (!devLog()) throw new OtpError("Couldn't send the code right now. Ask your owner or manager to reset your password.");
    console.log(`[dev] ${purpose} code for ${user.email}: ${code}`);
    channel = "DEV";
  }
  await db.otpCode.create({ data: { userId: user.id, purpose, codeHash: hash(code, user.id), channel, expiresAt: new Date(Date.now() + CODE_TTL_MS) } });
  return { channel };
}

/** Checks a code; each code allows 5 tries and works once. */
export async function consumeOtp(user: User, purpose: OtpPurpose, code: string): Promise<boolean> {
  const otp = await db.otpCode.findFirst({
    where: { userId: user.id, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.attempts >= MAX_TRIES) return false;
  const a = Buffer.from(hash(code.trim(), user.id));
  const b = Buffer.from(otp.codeHash);
  const ok = /^\d{6}$/.test(code.trim()) && a.length === b.length && timingSafeEqual(a, b);
  // Mark used/attempted atomically so two parallel guesses can't both pass.
  const res = await db.otpCode.updateMany({
    where: { id: otp.id, usedAt: null, attempts: { lt: MAX_TRIES } },
    data: ok ? { usedAt: new Date(), attempts: { increment: 1 } } : { attempts: { increment: 1 } },
  });
  return ok && res.count === 1;
}
