# Backup & restore

The database is the only stateful component — the app itself is stateless and
redeployable from Git at any time.

## Automatic backups (Neon)

Neon keeps continuous point-in-time history for every project (check the
retention window on your plan and extend it if needed). To recover from a bad
change: Neon console → **Restore**, pick a timestamp, restore into a *branch*,
verify the data, then promote or copy it back. This covers the common
disasters (accidental deletion, bad migration).

## Manual off-site backups (recommended monthly)

```bash
pg_dump "$DATABASE_URL" --no-owner --format=custom -f ndc-$(date +%F).dump
```

Store the file somewhere separate from Neon (e.g. the club's Google Drive).
Because the dump contains minors' personal and medical information, keep it
access-restricted and delete dumps older than your retention policy.

Restore into an empty database:

```bash
pg_restore --no-owner --dbname "$NEW_DATABASE_URL" ndc-YYYY-MM-DD.dump
```

Then point `DATABASE_URL` at the restored database and redeploy.

## Verify a backup (do this once per season)

1. Create a scratch Neon branch/database.
2. `pg_restore` the latest dump into it.
3. Point a local `.env.local` at it, run `npm run dev`, sign in, and spot-check
   a family, an invoice, and the audit log.

## What is *not* in the database

- Environment secrets (`AUTH_SECRET`, `RESEND_API_KEY`) — keep a copy in the
  club's password manager.
- The code — lives in Git/GitHub.

## Family data deletion

When a family leaves and requests deletion: export their invoices first
(financial records you may need to retain), then delete the family from the
app — related divers, guardians, and medical records cascade. Issued invoice
rows retain the billing name for bookkeeping; the audit log records who
deleted what.
