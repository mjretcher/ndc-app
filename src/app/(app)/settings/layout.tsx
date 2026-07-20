import Link from "next/link";
import { requireAdmin } from "@/lib/server/session";

const tabs = [
  { href: "/settings/pricing", label: "Pricing" },
  { href: "/settings/club", label: "Club" },
  { href: "/settings/guides", label: "Guides" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/users", label: "Coaches" },
  { href: "/settings/import", label: "Import/Export" },
  { href: "/settings/audit", label: "Audit log" },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="display text-2xl md:text-3xl">Settings</h1>
      </header>
      <nav aria-label="Settings sections" className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className="chip chip-mute hover:bg-pool hover:text-navy font-semibold">
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
