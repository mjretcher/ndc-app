import { redirect } from "next/navigation";

export default function PortalSignInRedirect() {
  redirect("/sign-in");
}
