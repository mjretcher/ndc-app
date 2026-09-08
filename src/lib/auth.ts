import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db, tables } from "@/db";
import { eq, and, inArray, isNotNull } from "drizzle-orm";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: "owner_admin" | "coach" | "family" | "family_pending";
      clubId: string;
      familyId?: string;
      submissionId?: string;
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
        if (user && user.active && user.passwordHash) {
          const ok = await bcrypt.compare(password, user.passwordHash);
          if (ok) {
            const membership = await db.query.clubMemberships.findFirst({
              where: eq(tables.clubMemberships.userId, user.id),
            });
            if (membership?.active && membership.role === "family" && membership.familyId) {
              return {
                id: user.id, email: user.email, name: user.name,
                role: "family", clubId: membership.clubId, familyId: membership.familyId,
              } as never;
            }
          }
        }
        // No approved account yet — check for a pending/needs-followup
        // registration submission with a matching guardian email and
        // password. The guardian's email lives inside the JSON payload
        // rather than a queryable column, and submission volume for a
        // single club is small, so filter in application code.
        const submissions = await db.query.registrationSubmissions.findMany({
          where: and(
            inArray(tables.registrationSubmissions.status, ["pending", "needs_followup"]),
            isNotNull(tables.registrationSubmissions.passwordHash),
          ),
        });
        for (const s of submissions) {
          const payload = s.payload as { guardians?: { email?: string; name?: string }[] };
          const primaryEmail = payload.guardians?.[0]?.email?.toLowerCase().trim();
          if (primaryEmail !== email) continue;
          const ok = await bcrypt.compare(password, s.passwordHash!);
          if (!ok) continue;
          return {
            id: `pending:${s.id}`, email, name: payload.guardians?.[0]?.name ?? email,
            role: "family_pending", clubId: s.clubId, submissionId: s.id,
          } as never;
        }
        return null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as { id: string; role: string; clubId: string; familyId?: string; submissionId?: string };
        token.uid = u.id; token.role = u.role; token.clubId = u.clubId;
        if (u.familyId) token.familyId = u.familyId;
        if (u.submissionId) token.submissionId = u.submissionId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.role = token.role as "owner_admin" | "coach" | "family" | "family_pending";
      session.user.clubId = token.clubId as string;
      if (token.familyId) session.user.familyId = token.familyId as string;
      if (token.submissionId) session.user.submissionId = token.submissionId as string;
      return session;
    },
  },
});
