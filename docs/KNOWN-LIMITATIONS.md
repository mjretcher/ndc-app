# Known limitations, decisions, and post-MVP backlog

## Decision log (deviations & notable choices)

- **Local Postgres for dev, Neon for prod** — same engine, no Supabase; auth is
  Auth.js credentials with bcrypt, sessions as JWT.
- **Email driver behind an interface** — Resend when `RESEND_API_KEY` is set,
  console/log driver otherwise. Every send (or failure) is recorded in
  `notification_jobs` with an idempotency key; retry from Settings.
- **File uploads deferred** — the schema has a `files` table, but membership
  cards/waivers are tracked as numbers/typed signatures in the MVP. No binary
  storage dependency yet.
- **Attendance markers** — billable attendance that can't be priced (missing
  rate, or no plan effective on the practice date) creates a $0 `NEEDS REVIEW`
  draft charge. Markers surface in the cycle review and are excluded from
  invoices until fixed or waived, so nothing is silently under-billed.
- **Progressive-enhancement forms** — nearly all writes are server actions on
  plain `<form>`s; the attendance sheet is the one rich client component
  (optimistic taps with server confirmation).
- **No Playwright** — the environment can't fetch browser binaries. Coverage
  is: 36 unit tests on the billing engine + a DB-integration smoke script +
  the HTTP-level end-to-end pass documented in the delivery notes. Add
  Playwright once the repo runs in CI.
- **Emergency contact** is stored as a guardian row flagged
  `is_emergency_contact` rather than a separate table.

## Known limitations

- Invoice PDFs render with Helvetica (built-in), not the brand font.
- The in-memory rate limit on `/register` is per-serverless-instance; the real
  gate is coach approval. Swap in Vercel Firewall or Upstash for hard limits.
- Calendar month view loads one month at a time; there is no drag-to-reschedule.
- "Practices missing attendance" on Today scans the last 15 past practices.
- Recurring series are weekly-pattern only (any weekday combination); no
  every-other-week patterns yet.
- CSV import handles families/guardians/divers/memberships — intentionally not
  historical attendance or invoices.
- One club per deployment (schema carries `club_id` everywhere, so multi-club
  is a policy change, not a rewrite).

## Post-MVP backlog (in rough order)

1. Family accounts (schema reserves the role; RSVP tables already exist)
2. Practice RSVP / waitlists using the reserved `practice_rsvps` table
3. Online payments + reconciliation (a `payments` table already records manual
   checks/cash)
4. SMS via the notification-job pipeline (add a driver, template channel field)
5. Meet scheduling and meet-fee billing
6. Workout authoring/assignment
7. File uploads (membership cards, signed waivers) via the `files` table
8. Playwright end-to-end suite in CI
