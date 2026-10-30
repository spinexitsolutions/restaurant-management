"use server";

import Anthropic from "@anthropic-ai/sdk";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { aiAvailable, aiSummary } from "@/server/insights";

export async function getAiSummary(language: "en" | "hinglish"): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const s = await requireRestaurantSession(MANAGE_ROLES);
  if (!aiAvailable()) return { ok: false, error: "AI summary is not set up on this server." };
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: s.restaurantId }, select: { name: true } });
  try {
    return { ok: true, text: await aiSummary(s.restaurantId, r.name, language === "hinglish" ? "hinglish" : "en") };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "The AI service is busy. Try again in a minute." };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "The AI key on this server is invalid." };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, error: "Couldn't reach the AI service." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `AI service error (${e.status}).` };
    if (e instanceof Error) return { ok: false, error: e.message };
    throw e;
  }
}
