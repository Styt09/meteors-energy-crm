# METEORS ENERGY CRM

A Cloudflare-first solar EPC CRM for lead intake, customer lifecycle, quotations, projects, follow-ups, payments, team workflows, inventory and a customer portal.

## Status

This repository starts as an independent application. It does **not** modify the existing METEORS ENERGY marketing website or production DNS. Deploy only after configuring Cloudflare resources and secrets.

## Stack

- Cloudflare Workers + Hono API
- Cloudflare D1 (SQLite) with SQL migrations
- Cloudflare KV for lightweight document metadata (binary file storage is not enabled yet)
- Cloudflare Access / app-level session auth (production setup documented)
- Vanilla TypeScript frontend built as a static SPA

## Local development

1. Install Node.js 20+ and npm.
2. `npm install`
3. `npm run dev`
4. Open the local URL printed by Wrangler.

For local D1 migrations: `npm run db:migrate:local`

## Cloudflare deployment

See [DEPLOYMENT.md](./docs/DEPLOYMENT.md). Never commit API tokens, database secrets, auth secrets, customer data or production credentials.

## Security

- All data endpoints are server-side.
- API access is deny-by-default and role checked.
- Customer-facing routes are scoped to the authenticated customer's own records.
- Passwords are hashed with PBKDF2; raw passwords are never stored.
- Session cookies are HttpOnly, Secure in production, and SameSite=Lax.
- Private file metadata is stored in D1; objects belong in a private R2 bucket.
- Configure rate limiting, backups, alerting and production secret rotation before launch.

## Live preview

Deploy from `src/index.ts` and `public/` using Wrangler; do not use the legacy standalone `worker.js` bundle. The custom hostname `crm.meteorsenergy.com` is not attached yet because the Cloudflare zone is still pending nameserver activation. The existing `meteorsenergy.com` website and its DNS records have not been changed.

## Current scope

Initial implementation includes working CRUD APIs and UI for leads, customers, quotations, projects, follow-ups, payments, team, inventory, customer portal and dashboard aggregates. Third-party WhatsApp/email delivery, PDF generation, identity verification and production SSO require provider credentials/configuration and are documented separately.
