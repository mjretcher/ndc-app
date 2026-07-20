import "server-only";
import { tables } from "@/db";
import type { Db } from "@/db";

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function recordAudit(tx: Tx, e: {
  clubId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
}) {
  await tx.insert(tables.auditEvents).values({
    clubId: e.clubId,
    actorUserId: e.actorUserId ?? null,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    summary: e.summary,
    before: (e.before as object) ?? null,
    after: (e.after as object) ?? null,
  });
}
