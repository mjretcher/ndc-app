"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Role = "owner_admin" | "coach";

const primary = [
  { href: "/", label: "Today" },
  { href: "/calendar", label: "Calendar" },
  { href: "/divers", label: "Divers" },
  { href: "/billing", label: "Billing" },
];
const secondary = (role: Role) => [
  { href: "/registrations", label: "Registrations" },
  { href: "/families", label: "Families" },
  { href: "/memberships", label: "Memberships" },
  { href: "/availability", label: "My availability" },
  { href: "/reports", label: "Reports" },
  ...(role === "owner_admin"
    ? [
        { href: "/settings/pricing", label: "Pricing & plans" },
        { href: "/settings/club", label: "Groups & facilities" },
        { href: "/settings/guides", label: "Membership guides" },
        { href: "/settings/notifications", label: "Notifications" },
        { href: "/settings/users", label: "Coaches" },
        { href: "/settings/import", label: "Import / export" },
        { href: "/settings/audit", label: "Audit log" },
      ]
    : []),
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function NavLinks({ role }: { role: Role }) {
  const pathname = usePathname();
  const linkCls = (href: string) =>
    `block rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
      isActive(pathname, href) ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/8 hover:text-white"
    }`;
  return (
    <div className="space-y-6">
      <ul className="space-y-0.5">
        {primary.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className={linkCls(l.href)} aria-current={isActive(pathname, l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <div>
        <p className="eyebrow px-3 mb-1 !text-white/40">Operations</p>
        <ul className="space-y-0.5">
          {secondary(role).map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={linkCls(l.href)} aria-current={isActive(pathname, l.href) ? "page" : undefined}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const mobileItems = [
  { href: "/", label: "Today", icon: "M12 3l8 6v11h-5v-6h-6v6H4V9z" },
  { href: "/calendar", label: "Calendar", icon: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" },
  { href: "/divers", label: "Divers", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.5-6 8-6s8 2 8 6" },
  { href: "/billing", label: "Billing", icon: "M4 7h16a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1zM3 11h18M7 15h4" },
  { href: "/more", label: "More", icon: "M5 12h.01M12 12h.01M19 12h.01" },
];

// `role` is accepted (and passed by the layout) for future per-role nav items.
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="md:hidden app-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {mobileItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 text-[0.7rem] font-semibold ${
                  active ? "text-navy" : "text-mute"
                }`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d={item.icon} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {item.label}
                {active && <span aria-hidden className="mt-0.5 h-1 w-6 rounded-full bg-accent" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
