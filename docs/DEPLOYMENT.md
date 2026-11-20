# Cloudflare deployment and production setup

## Current deployment

The live preview is served by `meteors-energy-crm.ytst0931.workers.dev`. The Worker and repo must be deployed from this repository's `src/index.ts` and `public/index.html` using Wrangler. Do not maintain a separate handwritten Worker bundle. The CRM custom hostname remains unbound until the Cloudflare zone is Active. The primary website's DNS must not be changed for this work.

## Authentication configuration

Before enabling signup or login, configure a random secret of at least 32 bytes using the protected Cloudflare Worker secret facility:
```sh
npx wrangler secret put SESSION_SECRET
```
Never put the secret in GitHub, `wrangler.toml`, source code or chat. The current auth code rejects login and signup with HTTP 503 until the secret is present. Passwords are PBKDF2-SHA256 hashed with per-user salts. Session tokens are random, HMAC-SHA256 hashed before storage, and issued in Secure, HttpOnly, SameSite=Lax cookies.

The public signup endpoint only creates the first admin and closes once an account exists. It also creates the initial session, so successful setup signs the administrator in automatically. Team accounts are created by the authenticated admin-only team API.

## Deploy from GitHub

Install the lockfile-pinned dependencies, run:
```sh
npm ci
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy
```
The configured Worker entrypoint is `src/index.ts`; static assets are served from `public/`. Use GitHub Actions checks before deploying.

## API and safety notes

- `GET /api/health` returns application health and whether SESSION_SECRET is configured, never the secret.
- `GET /api/auth/setup-status` says whether first-admin creation is available.
- `POST /api/auth/register` is a single-use first-admin bootstrap; it auto-logs-in.
- `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me`.
- All other API endpoints require a valid, non-expired session.
- Customer users may only access their own support requests and customer portal data. Internal CRM collections return 403 to customer accounts.
- Only admins can delete records. The UI hides delete affordances from non-admins.
- File upload/download is disabled until a private storage backend is configured. KV is metadata/cache only, never binary document storage.
- No test should mutate or delete real customer data. Automated tests use disposable local D1.

## Remaining pre-launch requirements

Turnstile/rate limiting, password reset, account lockout, session management, MFA policy, secure document uploads, PDF creation, WhatsApp/email delivery, backup restore drill, customer ownership tests, and production security review remain to be implemented and/or validated before the CRM is exposed publicly.
