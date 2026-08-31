import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db, tables } from "@/db";
import { eq } from "drizzle-orm";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: "owner_admin" | "coach" | "family";
      clubId: string;
      familyId?: string;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  trustHost: true,
  providers: [
    // Coach / owner-admin sign-in. Family accounts are explicitly rejected here
    // so a guardian credential can never land in the coach-facing app.
    Credentials({
      id: "credentials",
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const user = await db.query.users.findFirst({ where: eq(tables.users.email, email) });
        if (!user || !user.active || !user.passwordHash) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        const membership = await db.query.clubMemberships.findFirst({
          where: eq(tables.clubMemberships.userId, user.id),
        });
        if (!membership || !membership.active || membership.role === "family") return null;
        return {
          id: user.id, email: user.email, name: user.name,
          role: membership.role, clubId: membership.clubId,
        } as never;
      },
    }),
    // Family portal sign-in. Only accepts role="family" memberships, and only
    // ever returns that family's own familyId in the session.
    Credentials({
      id: "family",
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const user = await db.query.users.findFirst({ where: eq(tables.users.email, email) });
        if (!user || !user.active || !user.passwordHash) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        const membership = await db.query.clubMemberships.findFirst({
          where: eq(tables.clubMemberships.userId, user.id),
        });
        if (!membership || !membership.active || membership.role !== "family" || !membership.familyId) return null;
        return {
          id: user.id, email: user.email, name: user.name,
          role: "family", clubId: membership.clubId, familyId: membership.familyId,
        } as never;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as { id: string; role: string; clubId: string; familyId?: string };
        token.uid = u.id; token.role = u.role; token.clubId = u.clubId;
        if (u.familyId) token.familyId = u.familyId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.role = token.role as "owner_admin" | "coach" | "family";
      session.user.clubId = token.clubId as string;
      if (token.familyId) session.user.familyId = token.familyId as string;
      return session;
    },
  },
});
