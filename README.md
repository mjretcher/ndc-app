# Napoleon Diving Club — Operations App

Coach-operated web app for Napoleon Diving Club: family/diver registration and
approval, practice calendar, pool-deck mobile attendance, automatic charge
creation, and coach-reviewed monthly invoicing.

Built with **Next.js (App Router) + TypeScript + Tailwind v4 + Drizzle ORM +
PostgreSQL + Auth.js**. Money is always integer cents. All timestamps are UTC
in the database and rendered in `America/New_York`.

## Quick start (local)

Requirements: Node 22+, PostgreSQL 16+.

```bash
npm install
createdb ndc_dev                      # or use an existing Postgres
cp .env.example .env.local            # then fill in DATABASE_URL + AUTH_SECRET
npx drizzle-kit migrate               # apply migrations in ./drizzle
npx tsx src/db/seed.ts                # club, groups, plans, rates, templates, admin
npm run dev                           # http://localhost:3000
```

Default seeded admin: `mike@napoleondiving.example` / `change-me-ndc`
(override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` before seeding —
**change this before anyone real uses the app**).

Public pages (no sign-in): `/register` (family intake), `/guides/aau`,
`/guides/usa-diving`. Everything else requires a coach account.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npx vitest run` | Unit tests (billing engine: rates, plans, invoices) |
| `npx tsx --conditions=react-server scripts/smoke-charges.ts` | Integration smoke of the attendance→charge pipeline against the dev DB |
| `npx drizzle-kit generate` | Create a new migration after editing `src/db/schema.ts` |
| `npx drizzle-kit migrate` | Apply migrations |
| `npx tsx src/db/seed.ts` | Idempotent seed |

## How the code is organized

```
src/db/            schema.ts (all tables + relations), seed.ts, client
src/lib/           money.ts (integer cents), dates.ts (DST-safe NY time),
                   billing-engine.ts (pure pricing/invoice math + tests)
src/lib/server/    session.ts (requireCoach/requireAdmin), audit.ts,
                   notify.ts (templated email + send log), charge-sync.ts
                   (attendance→charge reconciliation), import.ts (CSV),
                   invoice-pdf.tsx
src/app/actions/   server actions (all writes; every one audits + authorizes)
src/app/(app)/     authenticated coach screens
src/app/register/  public multi-diver intake form
src/app/api/       register, export CSVs, invoice PDF, auth
```

### Billing invariants (do not break these)

- **Idempotent charges**: every charge has a unique `(source_type, source_id)`.
  Re-marking attendance updates the one charge; it never duplicates.
- **Effective-dated pricing**: practices bill at the rate in force on the
  practice date. Adding a future rate closes the old one; history never moves.
- **Invoiced = immutable**: once a charge is on an issued invoice, corrections
  become `adjustment` charges (next cycle) — never edits.
- **Human gate**: nothing is emailed or numbered until an owner/admin issues
  the invoice. Invoice numbers are assigned atomically and never reused
  (voiding keeps the number, releases the charges, restores consumed credit).
- **Attention markers**: billable attendance that can't be priced (no rate, or
  no plan in effect on that date) creates a $0 `NEEDS REVIEW` draft charge that
  is excluded from invoices until a coach resolves or waives it.

## Docs

- `docs/DEPLOYMENT.md` — Neon + Vercel + Resend production setup
- `docs/COACH-GUIDE.md` — day-to-day guide for coaches
- `docs/BACKUP-RESTORE.md` — backups and disaster recovery
- `docs/KNOWN-LIMITATIONS.md` — decision log + post-MVP backlog
- Section 21 of the build plan lists items NDC must confirm before launch
  (prices are seeded but flagged "confirm before launch" in Settings → Pricing).
