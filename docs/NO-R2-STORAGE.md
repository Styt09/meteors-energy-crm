# Document storage without R2

## Current architecture

- D1 is the source of truth for CRM records and document metadata.
- Workers KV namespace `meteors-crm-document-index` stores small lookup metadata only; it is not a file store and must not contain customer documents or large file bytes.
- Private document bytes need a separate file-storage provider.

## Hostinger adapter configuration

The Worker has optional `HOSTINGER_UPLOAD_URL` and `HOSTINGER_TOKEN` bindings for a future server-side integration. Do not set these until the Hostinger plan exposes a supported file-management API or a small authenticated upload endpoint has been deployed in the user's hosting account.

A Hostinger website file manager/FTP or WebDAV credential is not automatically a secure HTTP file API. Do not guess endpoints or expose FTP/WebDAV credentials to browser code.

## Safe options

1. **Hostinger-backed upload service**: deploy a small authenticated endpoint in the user's Hostinger Web Hosting account, outside the public website root. The endpoint accepts multipart uploads over HTTPS, validates the CRM service token, file types and maximum sizes, writes to a private directory outside the web root, and serves downloads only after server-side authorization. Hostinger plan must include suitable web hosting/PHP or equivalent runtime.
2. **External object store**: connect an S3-compatible service with scoped private bucket credentials stored as Worker secrets.
3. **No attachment storage yet**: keep CRM metadata and customer/project records in D1; allow only references/links until a private file store is configured.

## Important

Never put customer documents in Workers KV or public static website assets. Never make private invoices, IDs, bills or site photos publicly accessible. The current `/api/files/:id` route intentionally returns 503 unless a private storage adapter has been configured; it does not pretend file storage works when it does not.
