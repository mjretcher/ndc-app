import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { renderGuidePdf } from "@/lib/server/guide-pdf";
import type { YMD } from "@/lib/dates";

const slugToOrg: Record<string, "aau" | "usa_diving"> = {
  aau: "aau",
  "usa-diving": "usa_diving",
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ org: string }> }) {
  const { org: slug } = await ctx.params;
  const org = slugToOrg[slug];
  if (!org) return NextResponse.json({ error: "Unknown guide." }, { status: 404 });

  const guide = await db.query.externalGuides.findFirst({ where: eq(tables.externalGuides.organization, org) });
  if (!guide) return NextResponse.json({ error: "Guide not found." }, { status: 404 });

  const club = await db.query.clubs.findFirst({ where: eq(tables.clubs.id, guide.clubId) });

  const pdf = await renderGuidePdf({
    clubName: club?.name ?? "Napoleon Diving Club",
    title: guide.title,
    bodyMarkdown: guide.bodyMarkdown,
    clubCode: guide.clubCode,
    lastVerifiedAt: guide.lastVerifiedAt as YMD | null,
    links: guide.links as { label: string; url: string }[],
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}-membership-guide.pdf"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
