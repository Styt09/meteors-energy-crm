# Cloudflare deployment and production setup

## Single source of truth

Deploy this application from `src/index.ts` with static assets in `public/` using the checked-in `wrangler.toml`. Do not upload the legacy root `worker.js` bundle; it does not include the current UI or security fixes.

## Authentication

Before enabling signup/login, configure a random secret of at least 32 bytes as a Cloudflare Worker secret:
```sh
npx wrangler secret put SESSION_SECRET
```
Never place this value in GitHub, Wrangler vars, source code or chat. Until configured, health reports `authConfigured:false` and login/signup return HTTP 503.

Passwords use PBKDF2-SHA256 with per-user salts. Session tokens are random and stored as HMAC-SHA256 hashes using `SESSION_SECRET`. Cookies are Secure, HttpOnly, SameSite=Lax and expire after eight hours. The first-admin registration is single-use and creates the first session in the same D1 batch.

## Deploy

```sh
npm install
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy
```
The deploy command uses `src/index.ts`, D1 `meteors-crm-db`, and KV `DOC_INDEX`. Static frontend assets are in `public/`.

## API

- `GET /api/health`
- `GET /api/auth/setup-status`
- `POST /api/auth/register` — one-time first-admin setup only
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- Protected dashboard, team, customer portal and CRUD APIs under `/api/*`

Customers are denied internal CRM list APIs and can access only records tied to their authenticated customer ID. Record deletion is admin-only. Documents/uploads remain unavailable until a private object-storage provider is implemented.

## Pre-launch gaps

Rate limiting/Turnstile, account lockout, password reset, MFA, session management, file upload/download, PDF generation, WhatsApp/email, backup restore drill, customer A/B isolation tests and an independent security review remain outstanding.
