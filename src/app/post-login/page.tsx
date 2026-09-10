import { redirect } from "next/navigation";
import { maybeCoach, maybeFamilyOrPending } from "@/lib/server/session";

export default async function PostLoginPage() {
  if (await maybeCoach()) redirect("/today");
  if (await maybeFamilyOrPending()) redirect("/portal");
  redirect("/sign-in");
}
