import { Logo } from "@/components/Logo";
import { PortalSignInForm } from "./PortalSignInForm";
import { maybeFamily } from "@/lib/server/session";
import { redirect } from "next/navigation";

export const metadata = { title: "Family sign in" };

export default async function PortalSignInPage() {
  if (await maybeFamily()) redirect("/portal");
  return (
    <div className="min-h-dvh flex items-center justify-center px-4 bg-ink">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Logo light size="lg" />
          <p className="mt-2 text-white/70 text-sm">Family sign in</p>
        </div>
        <div className="card p-6">
          <PortalSignInForm />
        </div>
        <p className="mt-4 text-center text-xs text-white/50">
          Don&rsquo;t have a login yet, or forgot your password? Contact the club at{" "}
          <a className="underline" href="mailto:napoleondivingclub@gmail.com">
            napoleondivingclub@gmail.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
