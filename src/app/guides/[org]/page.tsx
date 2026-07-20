import { notFound } from "next/navigation";
import { db, tables } from "@/db";
import { eq } from "drizzle-orm";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Membership guide" };

const slugToOrg: Record<string, "aau" | "usa_diving"> = {
  aau: "aau",
  "usa-diving": "usa_diving",
};

/** Tiny renderer for the guide markdown subset: ## headings, numbered steps, bold, links, paragraphs. */
function renderGuide(md: string) {
  const blocks = md.split(/\n\n+/);
  return blocks.map((block, i) => {
    const t = block.trim();
    if (!t) return null;
    if (t.startsWith("## ")) {
      return <h2 key={i} className="display text-lg mt-6 mb-2">{t.slice(3)}</h2>;
    }
    if (/^\d+\. /m.test(t)) {
      const items = t.split(/\n(?=\d+\. )/).map((s) => s.replace(/^\d+\. /, ""));
      return (
        <ol key={i} className="list-decimal pl-5 space-y-2 my-3">
          {items.map((item, j) => <li key={j}>{inline(item)}</li>)}
        </ol>
      );
    }
    if (/^- /m.test(t)) {
      const items = t.split(/\n(?=- )/).map((s) => s.replace(/^- /, ""));
      return (
        <ul key={i} className="list-disc pl-5 space-y-1.5 my-3">
          {items.map((item, j) => <li key={j}>{inline(item)}</li>)}
        </ul>
      );
    }
    return <p key={i} className="my-3">{inline(t)}</p>;
  });
}

function inline(text: string): React.ReactNode[] {
  // links [label](url) and **bold**
  const parts: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      parts.push(
        <a key={k++} href={m[2]} target="_blank" rel="noopener noreferrer" className="font-semibold text-navy underline">
          {m[1]}
        </a>,
      );
    } else if (m[3]) {
      parts.push(<strong key={k++}>{m[3]}</strong>);
    }
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default async function GuidePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const org = slugToOrg[slug];
  if (!org) notFound();

  const guide = await db.query.externalGuides.findFirst({
    where: eq(tables.externalGuides.organization, org),
  });
  if (!guide) notFound();

  const body = guide.clubCode
    ? guide.bodyMarkdown.replaceAll("{{club_code}}", guide.clubCode)
    : guide.bodyMarkdown;
  const hasPlaceholder = !guide.clubCode || guide.clubCode.includes("CONFIRM");

  return (
    <div className="min-h-dvh bg-paper">
      <header className="bg-ink text-white">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <Logo light />
          <h1 className="display mt-3 text-2xl md:text-3xl">{guide.title}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6 text-[0.95rem] leading-relaxed">
        {hasPlaceholder && (
          <p className="card border-warn bg-warn-soft p-3 text-sm text-warn mb-4">
            Heads up: if any club code below looks like a placeholder, double-check with Coach Mike before entering it.
          </p>
        )}
        {renderGuide(body)}
        <p className="mt-8 text-xs text-mute border-t border-line pt-4">
          {guide.lastVerifiedAt
            ? `These steps were last verified by the club on ${guide.lastVerifiedAt}.`
            : "These steps haven't been re-verified recently — the organization's website may have changed."}
          {" "}If something doesn&apos;t match what you see, let Coach Mike know so we can update this guide.
        </p>
      </main>
    </div>
  );
}
