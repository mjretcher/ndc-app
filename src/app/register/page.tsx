import { Logo } from "@/components/Logo";
import { RegistrationForm } from "./RegistrationForm";

export const metadata = {
  title: "Register",
  description: "Register your diver with Napoleon Diving Club",
};

export default function RegisterPage() {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="bg-ink text-white">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <Logo light />
          <h1 className="display mt-3 text-2xl md:text-3xl">Diver registration</h1>
          <p className="mt-1 text-white/75 text-sm max-w-prose">
            Tell us about your family and your diver(s). A coach reviews every
            registration and follows up about group placement — nothing is
            final until you hear from us.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <RegistrationForm />
      </main>
      <footer className="mx-auto max-w-2xl px-4 pb-10 text-xs text-mute">
        Questions? Contact Napoleon Diving Club and we&apos;ll walk you through it.
      </footer>
    </div>
  );
}
