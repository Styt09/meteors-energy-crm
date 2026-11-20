# Cloudflare deployment and production setup

## Important separation

This CRM is a separate Worker app. It does not alter `meteorsenergy.com`, its DNS, Pages project, website files or existing enquiry form. Integrate the website only after the CRM is deployed and tested, by posting enquiries to the API from a server-side Worker route or a protected form endpoint. Do not expose service credentials in browser JavaScript.

## Live preview

An initial R2-free Worker is deployed at https://meteors-energy-crm.ytst0931.workers.dev. It is bound to the existing D1 database and KV namespace. The first administrator can be created using the "Create first admin" option on the login page. Use a unique password of at least 12 characters. The bootstrap endpoint permanently closes once the first user exists.

The custom hostname `crm.meteorsenergy.com` is not attached while the Cloudflare zone is pending. Activate the zone's assigned nameservers at the registrar only after confirming all existing DNS records, especially mail MX/SPF/DKIM records, have been copied correctly. The apex website DNS has not been modified by this CRM deployment.

## 1. Provision resources

From this repository:

```bash
npm install
npx wrangler d1 create meteors-crm-db
npx wrangler r2 bucket create meteors-crm-private-files
```

Copy the D1 database ID into `wrangler.toml`. Keep the R2 bucket private; do not enable public access.

Apply schema:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

## 2. Secrets and authentication

Set a long random secret (at least 32 random bytes):

```bash
npx wrangler secret put SESSION_SECRET
```

Set `ENVIRONMENT=production` in Worker vars. Use HTTPS only. The initial administrator is created once by POSTing JSON to `/api/auth/register` with `name`, `email` and a password of at least 12 characters. Do this immediately after migrations over HTTPS, then disable/remove the bootstrap route in a production hardening release. Never put credentials in source control.

**Important current implementation note:** session tokens are hashed before storage, and passwords use PBKDF2-SHA256. Configure a strong SESSION_SECRET before any real use. Add Cloudflare Turnstile/rate limiting, password reset flow, session revocation UI, CSRF/origin protections, audit retention and security review before exposing login publicly.

## 3. Deploy

```bash
npm run deploy
```

Wrangler publishes a Worker URL. Validate `/api/health`, login, CRUD and customer record isolation before mapping a custom hostname. Map a dedicated subdomain such as `crm.meteorsenergy.com` only after confirming DNS ownership and reviewing the existing zone. Do not replace apex/www records or existing website routes.

## 4. Website enquiry integration

Recommended architecture:
1. Keep current website form and client-side validation unchanged.
2. Submit form to a same-origin Worker endpoint or a server-side relay.
3. Validate and rate-limit the payload; use an allowlist of fields.
4. Create a lead in D1 and record `source='website'`.
5. Notify the admin using an authorized email provider integration.
6. Never send D1 credentials or private API tokens to the browser.

## 5. Current API surface

- `POST /api/auth/register` one-time bootstrap admin
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/dashboard`
- CRUD: `/api/leads`, `customers`, `quotations`, `projects`, `followups`, `payments`, `inventory`, `support`
- `GET /api/team`, admin `POST /api/team`
- `GET /api/activities`
- `GET /api/customer-portal`, `POST /api/customer-portal/support`
- `GET /api/files/:id` (private R2 download with customer ownership check)

All resource APIs require login. Roles are checked server-side. Customer portal access is scoped to the authenticated user's linked customer ID.

## 6. Before production launch

- [ ] Set strong Worker secrets and production vars.
- [ ] Confirm D1 database ID and run remote migrations.
- [ ] Create private R2 bucket and implement authorized upload workflow.
- [ ] Add Cloudflare rate limiting/Turnstile and CSRF/origin protections.
- [ ] Add password reset, MFA/SSO policy, session management and account lockout.
- [ ] Restrict customer user provisioning to verified customer records.
- [ ] Add quotation PDF generation, invoice/receipt templates and email/WhatsApp provider integrations.
- [ ] Add file upload endpoint with MIME/size scanning and signed/authorized access.
- [ ] Add D1 scheduled backups/export, restore drill, monitoring and alerting.
- [ ] Test role matrix and customer A/B isolation, including direct object references.
- [ ] Configure a dedicated CRM hostname without changing existing apex/www routes.
- [ ] Connect website enquiry form through server-side relay and test end-to-end.
- [ ] Complete security review and legal/privacy notice before storing real customer data.

## 7. Current limitations

This is a functioning starter application, not a certified production launch. WhatsApp Business Cloud API, transactional email, PDF rendering, customer account invitation, secure file upload, backup automation, notifications, and complete reporting exports require provider credentials and additional implementation. The initial interface supports create/list/delete for core modules; edit forms and specialized workflows are follow-up work.
