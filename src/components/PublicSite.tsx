import Link from "next/link";
import { Logo } from "@/components/Logo";

export function PublicNav() {
  return (
    <nav className="mx-auto max-w-6xl flex items-center justify-between px-5 py-6 md:px-10 gap-3">
      <Link href="/" className="flex items-center gap-2.5 font-bold shrink-0">
        <Logo size="sm" />
        <span className="hidden sm:inline">Napoleon Diving Club</span>
      </Link>
      <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-navy">
        <Link href="/programs" className="hover:text-ink">Programs</Link>
        <Link href="/#coaches" className="hover:text-ink">Coaches</Link>
        <Link href="/#schedule" className="hover:text-ink">Schedule</Link>
      </div>
      <div className="flex items-center gap-2.5">
        <Link href="/portal/sign-in" className="btn btn-secondary !min-h-10 !py-2 text-xs md:text-sm !px-3 md:!px-4">Family sign in</Link>
        <Link href="/register" className="btn btn-primary !min-h-10 !py-2 text-xs md:text-sm !px-3 md:!px-4">Register</Link>
        <details className="md:hidden relative">
          <summary className="list-none cursor-pointer w-10 h-10 rounded-lg border border-line flex items-center justify-center" aria-label="More links">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </summary>
          <div className="absolute right-0 top-12 z-20 bg-card border border-line rounded-xl shadow-lg py-2 w-44 text-sm font-semibold text-navy">
            <Link href="/programs" className="block px-4 py-2.5 hover:bg-paper">Programs</Link>
            <Link href="/#coaches" className="block px-4 py-2.5 hover:bg-paper">Coaches</Link>
            <Link href="/#schedule" className="block px-4 py-2.5 hover:bg-paper">Schedule</Link>
          </div>
        </details>
      </div>
    </nav>
  );
}

export function PublicFooter() {
  return (
    <footer className="mx-auto max-w-6xl px-5 md:px-10 py-9 flex flex-wrap justify-between gap-3 text-sm text-mute">
      <div>Napoleon Diving Club &middot; napoleondivingclub@gmail.com</div>
      <div className="flex gap-5">
        <span>Bowling Green State University &middot; Napoleon High School</span>
        <Link href="/sign-in" className="underline">Coach sign in</Link>
      </div>
    </footer>
  );
}
