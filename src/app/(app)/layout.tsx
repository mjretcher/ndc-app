import { requireCoach } from "@/lib/server/session";
import { Logo } from "@/components/Logo";
import { NavLinks, MobileNav } from "@/components/Nav";
import { signOut } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireCoach();
  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col shrink-0 bg-ink text-white">
        <div className="px-5 py-5 border-b border-white/10">
          <Logo light />
          <p className="mt-1 text-xs text-white/60">Napoleon Diving Club</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
          <NavLinks role={session.role} />
        </nav>
        <div className="px-5 py-4 border-t border-white/10 text-sm">
          <p className="font-semibold truncate">{session.name}</p>
          <p className="text-white/60 text-xs">{session.role === "owner_admin" ? "Owner / admin" : "Coach"}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/sign-in" });
            }}
          >
            <button className="mt-2 text-white/70 hover:text-white text-xs underline underline-offset-2">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-20 md:pb-0">
        <main className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-8">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
