import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 800 * 1024; // the browser resizes before upload, so real files are far smaller

// Uploads a menu photo or logo for the signed-in owner/manager's restaurant.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.restaurantId) return NextResponse.json({ error: "Please log in again" }, { status: 401 });
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true, isActive: true, restaurantId: true } });
  if (!user?.isActive || !user.restaurantId || !["OWNER", "MANAGER"].includes(user.role)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "Use a JPG, PNG or WebP image" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is too large" }, { status: 400 });

  const data = Buffer.from(await file.arrayBuffer());
  const image = await db.image.create({ data: { restaurantId: user.restaurantId, mime: file.type, data, size: data.length } });
  return NextResponse.json({ url: `/api/images/${image.id}` });
}
