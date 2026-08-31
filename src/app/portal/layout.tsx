import { requireFamily } from "@/lib/server/session";
import { Logo } from "@/components/Logo";
import { signOut } from "@/lib/auth";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireFamily();
  return (
    <div className="min-h-dvh bg-[var(--color-bg,#f7f5f0)]">
      <header className="bg-ink text-white">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Logo light />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-white/70 truncate max-w-[40vw]">{session.name}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/portal/sign-in" });
              }}
            >
              <button className="text-white/80 hover:text-white underline underline-offset-2">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
