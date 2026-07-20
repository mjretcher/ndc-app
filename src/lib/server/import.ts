import "server-only";
import { db, tables } from "@/db";
import { and, eq } from "drizzle-orm";
import { parseCsv, headerKey } from "@/lib/csv";
import { recordAudit } from "@/lib/server/audit";
import { todayYMD } from "@/lib/dates";

/**
 * Conservative CSV import for legacy family/diver spreadsheets.
 * One row = one diver (family/guardian columns repeat and are grouped by
 * family_billing_name + guardian_email). Nothing is written until the coach
 * confirms the previewed plan. Historical attendance/invoices are out of
 * scope by design.
 */

export const IMPORT_COLUMNS = [
  "family_billing_name", "guardian_name", "guardian_email", "guardian_phone",
  "address_line1", "city", "state", "zip",
  "diver_legal_name", "diver_preferred_name", "diver_birth_date", "group",
  "billing_plan", "aau_number", "aau_expires", "usa_diving_number", "usa_diving_expires",
] as const;

export interface ImportRow {
  line: number;
  values: Record<string, string>;
  errors: string[];
  warnings: string[];
}

export interface ImportPreview {
  ok: boolean;
  headerErrors: string[];
  rows: ImportRow[];
  families: number;
  divers: number;
  duplicateWarnings: number;
}

function normDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  // MM/DD/YYYY and M/D/YY variants common in club spreadsheets
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [, mo, da] = m;
    let yr = m[3];
    if (yr.length === 2) yr = Number(yr) > 30 ? `19${yr}` : `20${yr}`;
    return `${yr}-${mo.padStart(2, "0")}-${da.padStart(2, "0")}`;
  }
  return null;
}

export async function buildImportPreview(csvText: string, clubId: string): Promise<ImportPreview> {
  const parsed = parseCsv(csvText);
  const headerErrors: string[] = [];
  if (parsed.length < 2) {
    return { ok: false, headerErrors: ["The file needs a header row plus at least one data row."], rows: [], families: 0, divers: 0, duplicateWarnings: 0 };
  }
  const header = parsed[0].map(headerKey);
  const colIndex = new Map<string, number>();
  header.forEach((h, i) => colIndex.set(h, i));
  for (const required of ["family_billing_name", "guardian_email", "diver_legal_name"]) {
    if (!colIndex.has(required)) headerErrors.push(`Missing required column "${required}". Download the template for the expected headers.`);
  }
  if (headerErrors.length > 0) {
    return { ok: false, headerErrors, rows: [], families: 0, divers: 0, duplicateWarnings: 0 };
  }

  const groups = await db.query.groups.findMany({ where: eq(tables.groups.clubId, clubId) });
  const plans = await db.query.billingPlans.findMany({ where: eq(tables.billingPlans.clubId, clubId) });
  const existingGuardians = await db.query.guardians.findMany({ with: { family: true } });
  const existingDivers = await db.query.divers.findMany({ where: eq(tables.divers.clubId, clubId) });

  const rows: ImportRow[] = [];
  const familyKeys = new Set<string>();
  let duplicateWarnings = 0;

  for (let i = 1; i < parsed.length; i++) {
    const raw = parsed[i];
    const get = (k: string) => (colIndex.has(k) ? (raw[colIndex.get(k)!] ?? "").trim() : "");
    const values: Record<string, string> = {};
    for (const c of IMPORT_COLUMNS) values[c] = get(c);

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!values.family_billing_name) errors.push("family_billing_name is required");
    if (!values.diver_legal_name) errors.push("diver_legal_name is required");
    if (values.guardian_email && !/^\S+@\S+\.\S+$/.test(values.guardian_email)) errors.push("guardian_email is not a valid email");

    const bday = normDate(values.diver_birth_date);
    if (values.diver_birth_date && !bday) errors.push(`Unrecognized birth date "${values.diver_birth_date}" (use YYYY-MM-DD)`);
    if (bday) values.diver_birth_date = bday;
    const aauExp = normDate(values.aau_expires);
    if (values.aau_expires && !aauExp) warnings.push(`aau_expires "${values.aau_expires}" not recognized — will be skipped`);
    values.aau_expires = aauExp ?? "";
    const usadExp = normDate(values.usa_diving_expires);
    if (values.usa_diving_expires && !usadExp) warnings.push(`usa_diving_expires "${values.usa_diving_expires}" not recognized — will be skipped`);
    values.usa_diving_expires = usadExp ?? "";

    if (values.group) {
      const match = groups.find((g) => g.name.toLowerCase() === values.group.toLowerCase() || g.slug === headerKey(values.group));
      if (!match) warnings.push(`Group "${values.group}" doesn't match any club group — diver will be imported without a group`);
      else values.group = match.name;
    }
    if (values.billing_plan) {
      const match = plans.find((p) => p.name.toLowerCase() === values.billing_plan.toLowerCase());
      if (!match) warnings.push(`Billing plan "${values.billing_plan}" not found — no plan will be assigned`);
      else values.billing_plan = match.name;
    }

    // Duplicate checks against existing data
    const guardianHit = existingGuardians.find((g) => g.email && g.email.toLowerCase() === values.guardian_email.toLowerCase());
    if (guardianHit) {
      warnings.push(`Guardian email already exists on family "${guardianHit.family.billingName}" — this row will attach to that family instead of creating a new one`);
      duplicateWarnings++;
    }
    const diverHit = existingDivers.find(
      (d) => d.legalName.toLowerCase() === values.diver_legal_name.toLowerCase() && d.birthDate === (bday ?? d.birthDate),
    );
    if (diverHit) {
      errors.push("A diver with this name and birth date already exists — row will be skipped");
      duplicateWarnings++;
    }

    familyKeys.add(values.family_billing_name.toLowerCase() + "|" + values.guardian_email.toLowerCase());
    rows.push({ line: i + 1, values, errors, warnings });
  }

  return {
    ok: rows.some((r) => r.errors.length === 0),
    headerErrors: [],
    rows,
    families: familyKeys.size,
    divers: rows.filter((r) => r.errors.length === 0).length,
    duplicateWarnings,
  };
}

export interface ImportResult {
  created: number;
  attached: number;
  skipped: number;
  failed: { line: number; reason: string }[];
}

export async function commitImport(csvText: string, clubId: string, actorUserId: string): Promise<ImportResult> {
  const preview = await buildImportPreview(csvText, clubId);
  if (preview.headerErrors.length > 0) {
    return { created: 0, attached: 0, skipped: 0, failed: preview.headerErrors.map((r) => ({ line: 1, reason: r })) };
  }

  const groups = await db.query.groups.findMany({ where: eq(tables.groups.clubId, clubId) });
  const plans = await db.query.billingPlans.findMany({ where: eq(tables.billingPlans.clubId, clubId) });
  const today = todayYMD();

  let created = 0, attached = 0, skipped = 0;
  const failed: { line: number; reason: string }[] = [];

  await db.transaction(async (tx) => {
    // family cache within this import run, keyed by billing name + guardian email
    const familyCache = new Map<string, string>();

    for (const row of preview.rows) {
      if (row.errors.length > 0) { skipped++; continue; }
      const v = row.values;
      try {
        const cacheKey = v.family_billing_name.toLowerCase() + "|" + v.guardian_email.toLowerCase();
        let familyId = familyCache.get(cacheKey);

        if (!familyId && v.guardian_email) {
          const guardianHit = await tx.query.guardians.findFirst({
            where: eq(tables.guardians.email, v.guardian_email.toLowerCase()),
            with: { family: true },
          });
          if (guardianHit && guardianHit.family.clubId === clubId) {
            familyId = guardianHit.familyId;
            attached++;
          }
        }

        if (!familyId) {
          const [fam] = await tx.insert(tables.families).values({
            clubId,
            billingName: v.family_billing_name,
            addressLine1: v.address_line1 || null,
            city: v.city || null,
            state: v.state || null,
            zip: v.zip || null,
            notes: "Imported from CSV",
          }).returning({ id: tables.families.id });
          familyId = fam.id;
          if (v.guardian_name || v.guardian_email) {
            await tx.insert(tables.guardians).values({
              familyId,
              name: v.guardian_name || v.guardian_email,
              email: v.guardian_email.toLowerCase() || null,
              phone: v.guardian_phone || null,
              isPrimary: true,
            });
          }
        }
        familyCache.set(cacheKey, familyId);

        const group = groups.find((g) => g.name === v.group);
        const [diver] = await tx.insert(tables.divers).values({
          clubId,
          familyId,
          legalName: v.diver_legal_name,
          preferredName: v.diver_preferred_name || null,
          birthDate: v.diver_birth_date || null,
          status: "active",
          startDate: today,
          primaryGroupId: group?.id ?? null,
        }).returning({ id: tables.divers.id });

        for (const [org, num, exp] of [
          ["aau", v.aau_number, v.aau_expires],
          ["usa_diving", v.usa_diving_number, v.usa_diving_expires],
        ] as const) {
          await tx.insert(tables.diverMemberships).values({
            diverId: diver.id,
            organization: org,
            membershipNumber: num || null,
            expirationDate: exp || null,
            verification: num ? "pending" : "missing",
          }).onConflictDoNothing();
        }

        const plan = plans.find((p) => p.name === v.billing_plan);
        if (plan) {
          await tx.insert(tables.diverPlanAssignments).values({
            diverId: diver.id, planId: plan.id, effectiveStart: today,
            notes: "Assigned during CSV import",
          });
        }
        created++;
      } catch (err) {
        failed.push({ line: row.line, reason: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    await recordAudit(tx, {
      clubId, actorUserId,
      action: "import.csv", entityType: "club", entityId: clubId,
      summary: `CSV import: ${created} divers created, ${attached} rows attached to existing families, ${skipped} skipped, ${failed.length} failed`,
    });
  });

  return { created, attached, skipped, failed };
}

/** Duplicate check reused by the registration review screen. */
export async function findPossibleDuplicates(clubId: string, guardianEmails: string[], diverNames: { name: string; birthDate: string }[]) {
  const emailHits = guardianEmails.length
    ? await db.query.guardians.findMany({ with: { family: true } })
    : [];
  const matchedFamilies = emailHits
    .filter((g) => g.email && guardianEmails.some((e) => e.toLowerCase() === g.email!.toLowerCase()) && g.family.clubId === clubId)
    .map((g) => ({ familyId: g.familyId, billingName: g.family.billingName, via: `guardian email ${g.email}` }));

  const diverHits: { diverId: string; name: string; via: string }[] = [];
  for (const dn of diverNames) {
    const hit = await db.query.divers.findFirst({
      where: and(eq(tables.divers.clubId, clubId), eq(tables.divers.legalName, dn.name)),
    });
    if (hit && (!dn.birthDate || hit.birthDate === dn.birthDate)) {
      diverHits.push({ diverId: hit.id, name: hit.legalName, via: hit.birthDate === dn.birthDate ? "same name and birth date" : "same name" });
    }
  }
  const seen = new Set<string>();
  return {
    families: matchedFamilies.filter((f) => (seen.has(f.familyId) ? false : (seen.add(f.familyId), true))),
    divers: diverHits,
  };
}
