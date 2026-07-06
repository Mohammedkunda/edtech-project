import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Next.js 16 "proxy" (formerly middleware) runs on the Edge runtime:
// only import the edge-safe config (no Prisma / bcrypt), so it stays Node-free.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
