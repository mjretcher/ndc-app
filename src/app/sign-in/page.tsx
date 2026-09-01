import { Logo } from "@/components/Logo";
import { SignInForm } from "./SignInForm";
import { maybeCoach } from "@/lib/server/session";
import { redirect } from "next/navigation";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await maybeCoach()) redirect("/today");
  return (
    <div className="min-h-dvh flex items-center justify-center px-4 bg-ink">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Logo light size="lg" />
          <p className="mt-2 text-white/70 text-sm">Coach sign in</p>
        </div>
        <div className="card p-6">
          <SignInForm />
        </div>
        <p className="mt-4 text-center text-xs text-white/50">
          Forgot your password? Ask a club admin to reset it from Coaches settings.
        </p>
      </div>
    </div>
  );
}
