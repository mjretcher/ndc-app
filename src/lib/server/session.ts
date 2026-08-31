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
  if (!u?.id || !u.clubId || u.role === "family") redirect("/sign-in");
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
  if (!u?.id || !u.clubId || u.role === "family") return null;
  return { userId: u.id, email: u.email, name: u.name, role: u.role, clubId: u.clubId };
}

export type FamilySession = {
  userId: string; email: string; name: string; clubId: string; familyId: string;
};

/** Require an authenticated guardian. Redirects to the portal sign-in otherwise. */
export async function requireFamily(): Promise<FamilySession> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || u.role !== "family" || !u.familyId) redirect("/portal/sign-in");
  return { userId: u.id, email: u.email, name: u.name, clubId: u.clubId, familyId: u.familyId! };
}

export async function maybeFamily(): Promise<FamilySession | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || u.role !== "family" || !u.familyId) return null;
  return { userId: u.id, email: u.email, name: u.name, clubId: u.clubId, familyId: u.familyId };
}
