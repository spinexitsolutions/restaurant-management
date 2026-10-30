// Creates (or updates) the platform super admin from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD.
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password || password === "change-me") {
    throw new Error("Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env first");
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await db.user.upsert({
    where: { email },
    update: { passwordHash, role: "SUPER_ADMIN", isActive: true },
    create: { email, name: "Super Admin", passwordHash, role: "SUPER_ADMIN" },
  });
  console.log(`Super admin ready: ${email}`);
}

main().finally(() => db.$disconnect());
