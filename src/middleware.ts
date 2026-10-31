import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = req.nextUrl;

  if (!session) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/admin") && session.role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  if (pathname.startsWith("/partner") && session.role !== "RESELLER") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  // Partners have no restaurant; keep them in their portal.
  if (pathname.startsWith("/dashboard") && session.role === "RESELLER") {
    return NextResponse.redirect(new URL("/partner", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/admin/:path*", "/partner/:path*"] };
