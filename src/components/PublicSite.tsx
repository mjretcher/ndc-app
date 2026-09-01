import Link from "next/link";
import { Logo } from "@/components/Logo";

export function PublicNav() {
  return (
    <nav className="mx-auto max-w-6xl flex items-center justify-between px-5 py-6 md:px-10">
      <Link href="/" className="flex items-center gap-2.5 font-bold">
        <Logo size="sm" />
        <span className="hidden sm:inline">Napoleon Diving Club</span>
      </Link>
      <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-navy">
        <Link href="/programs" className="hover:text-ink">Programs</Link>
        <Link href="/#coaches" className="hover:text-ink">Coaches</Link>
        <Link href="/#schedule" className="hover:text-ink">Schedule</Link>
      </div>
      <div className="flex items-center gap-2.5">
        <Link href="/portal/sign-in" className="btn btn-secondary !min-h-10 !py-2 text-sm">Family sign in</Link>
        <Link href="/register" className="btn btn-primary !min-h-10 !py-2 text-sm">Register</Link>
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
