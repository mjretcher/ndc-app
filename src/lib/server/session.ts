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
  if (!u?.id || !u.clubId || (u.role !== "owner_admin" && u.role !== "coach")) redirect("/sign-in");
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
  if (!u?.id || !u.clubId || (u.role !== "owner_admin" && u.role !== "coach")) return null;
  return { userId: u.id, email: u.email, name: u.name, role: u.role, clubId: u.clubId };
}

export type FamilySession = {
  userId: string; email: string; name: string; clubId: string; familyId: string;
};

/** Require an authenticated guardian. Redirects to sign-in otherwise. */
export async function requireFamily(): Promise<FamilySession> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || u.role !== "family" || !u.familyId) redirect("/sign-in");
  return { userId: u.id, email: u.email, name: u.name, clubId: u.clubId, familyId: u.familyId! };
}

export async function maybeFamily(): Promise<FamilySession | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || u.role !== "family" || !u.familyId) return null;
  return { userId: u.id, email: u.email, name: u.name, clubId: u.clubId, familyId: u.familyId };
}

/**
 * A guardian who set a portal password at registration but whose submission
 * hasn't been approved yet, so there's no real family/diver record to attach
 * to. Deliberately carries a submissionId instead of a familyId — every
 * family-portal action that needs a real familyId (RSVP, billing, etc.) uses
 * requireFamily() instead of this, so a pending session is naturally unable
 * to reach them regardless of what UI is shown.
 */
export type PendingFamilySession = {
  role: "family_pending"; email: string; name: string; clubId: string; submissionId: string;
};

export type PortalSession = (FamilySession & { role: "family" }) | PendingFamilySession;

/** Require either an approved family session or a pending-review one. Used only by the portal's own layout/dashboard, which branches on `.role`. */
export async function requireFamilyOrPending(): Promise<PortalSession> {
  const session = await auth();
  const u = session?.user;
  if (u?.role === "family" && u.id && u.familyId) {
    return { role: "family", userId: u.id, email: u.email, name: u.name, clubId: u.clubId, familyId: u.familyId };
  }
  if (u?.role === "family_pending" && u.submissionId) {
    return { role: "family_pending", email: u.email, name: u.name, clubId: u.clubId, submissionId: u.submissionId };
  }
  redirect("/sign-in");
}

/** Same as requireFamilyOrPending, but returns null instead of redirecting — for the sign-in page's own "already logged in" check. */
export async function maybeFamilyOrPending(): Promise<PortalSession | null> {
  const session = await auth();
  const u = session?.user;
  if (u?.role === "family" && u.id && u.familyId) {
    return { role: "family", userId: u.id, email: u.email, name: u.name, clubId: u.clubId, familyId: u.familyId };
  }
  if (u?.role === "family_pending" && u.submissionId) {
    return { role: "family_pending", email: u.email, name: u.name, clubId: u.clubId, submissionId: u.submissionId };
  }
  return null;
}
