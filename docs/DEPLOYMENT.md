# Deployment guide

Target production stack: **Vercel** (app) + **Neon** (Postgres) + **Resend**
(email). Keep three environments: local dev, Vercel preview, Vercel production.

## 1. Database (Neon)

1. Create a Neon project (e.g. `ndc-prod`) in a US region.
2. Copy the **pooled** connection string — this is `DATABASE_URL`.
3. Apply migrations and seed from your machine:

   ```bash
   DATABASE_URL='postgres://…neon…/neondb?sslmode=require' npx drizzle-kit migrate
   DATABASE_URL='postgres://…' \
     SEED_ADMIN_EMAIL='mike@realdomain.com' \
     SEED_ADMIN_PASSWORD='a-strong-password' \
     npx tsx src/db/seed.ts
   ```

   The seed is idempotent — safe to re-run; it never overwrites edited data.

4. For previews, create a second Neon branch/database so preview deployments
   never touch production data. Never point previews at the prod database.

## 2. Email (Resend)

1. Create a Resend account, add and verify the sending domain
   (e.g. `mail.napoleondiving.com` — set the DNS records Resend shows you).
2. Create an API key → `RESEND_API_KEY`.
3. Set `EMAIL_FROM="Napoleon Diving Club <invoices@mail.napoleondiving.com>"`.

Without `RESEND_API_KEY`, the app logs emails to the server console and the
notification log instead of sending — that is the correct dev/preview setup.
Failed sends appear in **Settings → Notifications** with a retry button.

## 3. App (Vercel)

1. Push the repository to GitHub and import it into Vercel (framework preset:
   Next.js — no custom build settings needed).
2. Set environment variables (Production, and Preview with the preview DB):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon pooled connection string |
   | `AUTH_SECRET` | `openssl rand -base64 32` (different per environment) |
   | `AUTH_TRUST_HOST` | `true` |
   | `RESEND_API_KEY` | production only |
   | `EMAIL_FROM` | verified sender |
   | `NEXT_PUBLIC_APP_URL` | `https://your-domain` |

3. Deploy. Add the custom domain in Vercel → Domains.

## 4. Post-deploy checklist

- [ ] Sign in as the admin; **change the password** if you seeded a temporary one
      (Settings → Coaches).
- [ ] Settings → Pricing: confirm every rate/plan flagged "confirm before launch".
- [ ] Settings → Club: contact email/phone, invoice terms, invoice prefix.
- [ ] Settings → Guides: enter the real **AAU club code** (the seed ships a
      `CONFIRM-CLUB-CODE` placeholder) and set the last-verified date.
- [ ] Settings → Notifications: review the eight email templates.
- [ ] Create coach accounts (Settings → Coaches); leave `owner_admin` for Mike only.
- [ ] Submit a test registration at `/register`, approve it, delete the test family.
- [ ] Verify a test invoice PDF renders and the email arrives.
- [ ] Confirm Neon's automated backups are enabled (see BACKUP-RESTORE.md).

## Migrations in production

Schema changes: edit `src/db/schema.ts` → `npx drizzle-kit generate` → review
the SQL in `drizzle/` → run `drizzle-kit migrate` against production **before**
deploying app code that depends on it. Never edit applied migration files, and
never make manual production schema changes.
