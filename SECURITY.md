# Security Policy

## Reporting a Vulnerability

Please open a [GitHub Issue](https://github.com/Hamed-Gharghi/Cloudflare-Telegram-bot-builder/issues) with the `security` label, or contact the maintainer via GitHub. Do **not** post Cloudflare API tokens, Telegram bot tokens, or passwords in public issues.

---

## Hardening Checklist (Production)

1. **Set `JWT_SECRET`** — Add a Worker secret named `JWT_SECRET` with a long random value. Without it, the app uses a built-in fallback suitable only for testing.
2. **Protect your Cloudflare API token** — Use least privilege (Workers Scripts/Routes Edit, D1 Edit, Workers KV Storage Edit). Rotate if exposed.
3. **Protect Telegram bot tokens** — Treat them like passwords; anyone with a token can control the bot.
4. **Strong admin password** — There is no password-reset flow in v1.
5. **Media is public by URL** — `/api/media/:id/file` has no dashboard auth so Telegram can download files. Do not upload secrets or private documents.

---

## Known Limitations (v1.3)

| Topic | Limitation |
|---|---|
| **Accounts** | Single admin only. First registration becomes admin; further signups are locked. |
| **Password recovery** | No built-in reset. Recovery means editing D1 data or redeploying with a fresh setup. |
| **Media size** | Maximum **15MB** per file (KV value limits + Base64 encoding overhead). |
| **Media privacy** | Media file endpoints are intentionally **public**. URLs are not listed publicly, but anyone who has the URL can fetch the file. |
| **Broadcast** | Free-plan Workers have a limited subrequest budget. Broadcasts typically send up to **~40 recipients per request**. |
| **KV consistency** | Log and subscriber lists can lag briefly after writes (eventual consistency). |
| **Child Workers** | Upgrading the parent `worker.js` does not update already-deployed bots until you click **Deploy** again. |
| **Cloudflare Free plan** | Roughly **100,000 Worker requests/day**. Each deployed bot runs as its own Worker and shares account quotas. |
| **Deploy model** | Paste-and-deploy (`worker.js` into the Cloudflare editor). This repo does not ship Wrangler/npm local tooling. |
| **Password hashing** | SHA-256 with a fixed application salt — adequate for a personal admin panel, not a multi-tenant SaaS password store. |
| **Sessions** | JWTs expire after **7 days**. |

---

## What Is Protected

- Dashboard API routes (bots, rules, uploads, deploy) require a valid JWT (or equivalent auth).
- Cloudflare credentials are stored in the Worker secret `PLATFORM_CONFIG` after setup.
- Bot log ingestion checks the bot identity before accepting logs.
- Admin registration is one-time after the first user exists.
