import { Logo } from "@/components/Logo";
import { SignInForm } from "./SignInForm";
import { maybeCoach, maybeFamilyOrPending } from "@/lib/server/session";
import { redirect } from "next/navigation";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await maybeCoach()) redirect("/today");
  if (await maybeFamilyOrPending()) redirect("/portal");
  return (
    <div className="min-h-dvh flex items-center justify-center px-4 bg-ink">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Logo light size="lg" />
          <p className="mt-2 text-white/70 text-sm">Sign in</p>
        </div>
        <div className="card p-6">
          <SignInForm />
        </div>
        <p className="mt-4 text-center text-xs text-white/50">
          Coach or family — this is the same sign-in either way. Forgot your password, or don&apos;t have a
          login yet? Contact the club at napoleondivingclub@gmail.com.
        </p>
      </div>
    </div>
  );
}
