import Link from "next/link";
import { requireCoach } from "@/lib/server/session";

export const metadata = { title: "More" };

export default async function MorePage() {
  const session = await requireCoach();
  const items = [
    { href: "/divers", label: "Divers", desc: "Roster, groups, plans" },
    { href: "/memberships", label: "Memberships", desc: "AAU & USA Diving tracker" },
    { href: "/registrations", label: "Registrations", desc: "Review queue" },
    { href: "/reports", label: "Reports", desc: "CSV exports" },
    ...(session.role === "owner_admin" ? [
      { href: "/settings/pricing", label: "Pricing", desc: "Rates & plans" },
      { href: "/settings/club", label: "Club setup", desc: "Groups, pools, info" },
      { href: "/settings/guides", label: "Guides", desc: "AAU / USA Diving how-tos" },
      { href: "/settings/notifications", label: "Notifications", desc: "Email templates & log" },
      { href: "/settings/users", label: "Coaches", desc: "Accounts & roles" },
      { href: "/settings/import", label: "Import / export", desc: "CSV backup & restore" },
      { href: "/settings/audit", label: "Audit log", desc: "Who did what" },
    ] : []),
  ];
  return (
    <div className="space-y-4">
      <h1 className="display text-2xl">More</h1>
      <ul className="card divide-y divide-line">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="flex items-center gap-3 p-4 hover:bg-paper">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{i.label}</span>
                <span className="block text-sm text-mute">{i.desc}</span>
              </span>
              <span aria-hidden className="text-mute">→</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-mute">Public registration form: <code className="font-semibold">/register</code></p>
    </div>
  );
}
