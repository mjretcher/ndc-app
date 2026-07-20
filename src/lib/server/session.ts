import "server-only";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export type CoachSession = {
  userId: string; email: string; name: string;
  role: "owner_admin" | "coach"; clubId: string;
};

/** Require any authenticated coach. Redirects to sign-in otherwise. */
export async function requireCoach(): Promise<CoachSession> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.clubId) redirect("/sign-in");
  return { userId: u.id, email: u.email, name: u.name, role: u.role, clubId: u.clubId };
}

/** Require owner/admin. Throws (server actions) so callers can surface an error. */
export async function requireAdmin(): Promise<CoachSession> {
  const s = await requireCoach();
  if (s.role !== "owner_admin") {
    throw new Error("This action requires owner/admin permission.");
  }
  return s;
}

export async function maybeCoach(): Promise<CoachSession | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.clubId) return null;
  return { userId: u.id, email: u.email, name: u.name, role: u.role, clubId: u.clubId };
}
