import type { NextAuthConfig } from "next-auth";

// Extend the session/JWT with the user id so server code can look up roles.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

// Edge-safe config: no Prisma, no bcrypt — safe to import from middleware.
export const authConfig = {
  pages: { signIn: "/login" },
  providers: [], // full providers live in auth.ts (Node runtime)
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      if (pathname === "/" || pathname.startsWith("/api/auth")) return true;

      const isAuthRoute = pathname === "/login" || pathname === "/register";
      if (isAuthRoute) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard", request.nextUrl));
        }
        return true;
      }

      // Protected routes: redirect to /login when not signed in.
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
