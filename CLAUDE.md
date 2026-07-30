# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Dot Domino CRM — a full-stack, multi-tenant CRM for lead management, sales pipeline, drip marketing campaigns, unified conversations (email/WhatsApp/SMS/RCS), and AI-assisted analytics.

**Stack:** React 18 + Vite (frontend, port 5173) · Node.js/Express ESM (backend, port 8090) · MySQL/MariaDB via `mysql2` · Bootstrap 5.3 + Bootstrap Icons (CDN, no CSS framework build step) · plain CSS design system (`client/src/styles/crm.css`) — no Tailwind, no CSS-in-JS, no CSS Modules.

## Commands

```bash
npm run install:all     # install server + client deps (also runs on `npm install` via postinstall)
npm run dev              # runs server (:8090, --watch) and client (:5173) concurrently
npm run build             # builds the client for production (client/dist)
npm start                 # runs the server in production mode (serves client/dist when NODE_ENV=production)
npm run cron               # one-off drip/job/report-schedule processing, for an external cron trigger
```

Windows convenience: double-click `start-dev.bat` to launch both dev servers.

There is no test suite and no lint script configured in this repo — don't invent `npm test`/`npm run lint` commands. Verify changes with `node --check <file>` (server) and `npx vite build` (client) from within the respective `server/`/`client/` directories.

Local DB setup: `mysql -u root -p -e "CREATE DATABASE dot_domino_crm"` then `mysql -u root -p dot_domino_crm < database/schema.sql`. `server/.env` is copied from `server/.env.example` (DB creds, `SESSION_SECRET`, `PORT`, `APP_URL`). Default seeded login: `admin@dotdomino.com` / `Admin@123`.

## Architecture

### Two-process app, one repo
`client/` (Vite SPA) and `server/` (Express API) are independent npm packages with their own `package.json` and `node_modules`, wired together only by the root `package.json`'s `dev`/`build`/`start` scripts. In production, `server/src/app.js` serves `client/dist` as static files and falls through to `index.html` for client-side routing — there is no separate frontend host.

### Schema evolution: `database/schema.sql` + `server/src/db/autoMigrate.js`
`schema.sql` is the canonical, idempotent (`CREATE TABLE IF NOT EXISTS`) schema for fresh installs. Existing/production databases are brought up to date automatically: `runAutoMigrations()` runs once at every server boot (before `app.listen`, see `server.js`), checks `INFORMATION_SCHEMA` for each column/index/FK it expects, and only issues an `ALTER TABLE` for what's actually missing — safe to run on every restart. **This exists because the MySQL used in production predates `ADD COLUMN IF NOT EXISTS` support (MySQL < 8.0.29) — `schema.sql` itself uses that syntax for later `ALTER TABLE` statements, which silently fails on older servers, so `autoMigrate.js` re-implements the same additive changes with `pool.query()` (plain-text protocol) plus manual existence checks instead.** When adding a new column/table for an existing feature, add the change to **both** `schema.sql` (fresh installs) **and** `autoMigrate.js` (existing installs) — a change in only one will drift the two environments apart. There are also numbered one-off migration files in `database/migrations/*.sql` documenting the history of these additive changes, but they are not auto-run; `autoMigrate.js` is the source of truth for what actually gets applied.

`autoMigrate.js` also does a one-time **data** migration: any sensitive credential still sitting in the legacy global `settings` table gets moved into the original company's `company_settings` row and deleted from `settings`, then never touches `settings` for that key again (see multi-tenancy section below).

### Multi-tenancy: `companies` / `company_users` / two settings tables
- A **user** (`users`) can belong to multiple **companies** via `company_users` (join table carrying a per-company `role`). `req.companyId`/`req.company`/`req.companyRole` are resolved once per request by `currentCompany` middleware (`server/src/middleware/company.js`), which picks the session's selected company from the caller's actual memberships.
- **`companiesForUser()` / `canAccessCompany()` (`server/src/services/company.service.js`) are always membership-scoped** — a user's global `role` field (`admin`/`superadmin`) affects what they're *allowed to do* within a company, never which companies they can *see*. Don't reintroduce a "global admin sees every company" shortcut here; that was a real cross-tenant data leak that got fixed. `allActiveCompanies()` is the one deliberate exception, used only by the admin-gated Master Dashboard.
- Settings live in two tables: global `settings` (legacy, pre-multi-tenancy, and still used for a handful of genuinely shared non-sensitive defaults) and per-company `company_settings`. **`getSetting()`/`companySettings()` (`server/src/services/settings.service.js`) never let a sensitive key** (anything matching `/(_pass|_pwd|_key|_secret|_token)$/i`, see `isSensitive()`) **fall back from one company to another or to the global table** — a new company always starts with blank credentials for every integration, full stop. Non-sensitive settings (e.g. a default SMS gateway URL template) may still inherit from the global table as a convenience default. Credentials are AES-256-GCM encrypted at rest (`server/src/utils/crypto.js`, prefix `enc:v1:`) transparently by `saveCompanySetting`/`saveSetting`/`getSetting` based on that same sensitivity pattern.
- Any query that lists users/agents (`SELECT ... FROM users WHERE role IN (...)`) must join through `company_users` and filter by `cu.company_id = ?` — a bare `users` query with no company join leaks every company's staff into every other company's dropdowns. This has been the single most common regression in this codebase; check for it whenever adding a new "assign to agent" type feature.

### Webhook → company resolution
Inbound webhooks (Anantya WhatsApp/RCS, Shopify, HubSpot, Mailchimp, Zendesk, IndiaMart, Meta, Google Ads, etc.) all land on `server/src/routes/public.routes.js` → `public.controller.js` `webhook()`, unauthenticated by definition (`requireAuth` doesn't apply — there's no logged-in user, just a third party calling in). Each provider resolves *which company* the call belongs to differently, centralized in `settings.service.js`:
- Providers with a per-account key baked into the URL (`/webhook/:source/:webhookKey`) resolve via `integration_accounts.webhook_key`.
- Anantya's generic no-key route (`/webhook/anantya`, used for a company's *default* WhatsApp number) resolves via `resolveCompanyByAnantyaKey()` — it loops every company's stored (encrypted) `wa_anantya_api_key` and decrypts-and-compares until one matches the `X-Api-Key` header Anantya echoes back.
- Shopify resolves via the `X-Shopify-Shop-Domain` header against `shopify_shop_domain`.
Every inbound webhook payload is logged to `webhook_logs` (status: `received` → `processed`/`ignored`/`failed`, with the raw payload) regardless of outcome — this is the first place to look when a provider integration "isn't working": check `webhook_logs` before assuming application code is broken. A `status='ignored'` row with a masked/placeholder phone number is almost always the provider's own "send test webhook" button, not a real event.

### Lead ingestion: `processLead()` (`server/src/services/lead.service.js`)
Single funnel for every lead source (manual entry, CSV/Excel import, Google Sheets sync, all webhook-driven sources): `validateLead()` → dedupe by email/mobile within `dedupWindowHours` (creates an `is_duplicate=1` audit row instead of a real second lead if a match is younger than the window; merges missing fields into the existing lead otherwise) → `insertLead()` → auto-enroll into any drip campaign whose `entry_rules` match the source/product-interest. `listLeads()` always filters `is_duplicate = 0` so these audit rows never show up as separate leads in the UI.

### Drip campaign engine (`server/src/services/drip.service.js`)
`workflow_steps` form a linked list (`parent_id`) per `campaign_id`, each `lead_enrollments` row tracking one lead's `current_step_id` + `next_execute_at`. Two ways a step executes:
1. **Scheduled** — `processDue()` runs every 60s from `server.js`'s in-process timer (also triggerable via `npm run cron` for external scheduling), picks up any enrollment whose `next_execute_at <= NOW()`, and calls `executeWorkflowStep()`.
2. **Instant-chain** — after a step executes, `advanceEnrollment()` immediately re-invokes `executeWorkflowStep()` (depth-limited via `MAX_CHAIN`) for the *next* step if that next step has zero delay, so a zero-delay step never waits for the next scheduler tick — including the very first step right at `enrollLead()` time.

`executeWorkflowStep()` branches on `step.type` (`send_email`/`email`, `send_whatsapp`/`whatsapp`, `send_rcs`/`rcs`, `send_sms`/`sms`, `multi_send`, `condition`, `assign_agent`, `create_task`/`task`, `update_score`, `move_pipeline`, `tag_lead`, `exit`, and the implicit no-op `wait`) — both the long and short forms of each channel type must stay in the ENUM (`workflow_steps.type`) in `schema.sql`/`autoMigrate.js` and in `VALID_TYPES` in `campaigns.controller.js`'s `saveSteps()`; a new step type added to the Builder UI without updating both will fail silently in production with a MySQL ENUM truncation error.

### Outbound sends (`server/src/services/comm.service.js`)
Single entry point `sendCommunication(channel, lead, template, ...)` for every channel, always writing a `communications` row first (status `queued` → `sent`/`failed`) so delivery history exists even if the provider call itself throws. WhatsApp/RCS go through Anantya.ai (`https://apiv1.anantya.ai`):
- **Template sends** (drip steps, broadcasts, "New Message" to a lead with no open thread) use `/api/Campaign/SendSingleTemplateMessage` — WhatsApp policy requires an approved template to *initiate* contact.
- **Free-text replies** within an already-open conversation thread use `/api/Messages/sendtext` (a "session message", valid only within WhatsApp's 24h customer-care window after the lead's last inbound message) — this path only exists for WhatsApp; RCS has no free-text equivalent and always requires a template (`REPLY_TEMPLATE_ONLY_CHANNELS` in `ConversationsPage.jsx` / `TEMPLATE_ONLY_CHANNELS` in `conversation.service.js`).
- Email uses per-company SMTP (Nodemailer) or a named `integration_accounts` sender; SMS uses MShastra or a generic HTTP provider (`sms.service.js`).

### Frontend routing & layout conventions
`App.jsx` is the single route table. Authenticated pages render inside `Layout.jsx`, which owns the sidebar, topbar (search/notifications/user menu), and a **unified single-bar topbar for tabbed pages** — any page with its own internal tabs must call `usePageTabs(tabs, active, onChange)` (`client/src/hooks/usePageTabs.js`) rather than rendering its own second header bar; `Layout.jsx` renders the tab strip itself via `PageHeaderContext` so there's never two stacked headers. `Settings` (`/settings/*`, Profile/Team/General/Pipeline Stages/Billing) and the standalone `/integrations` route (all provider credentials: Email/WhatsApp/SMS/RCS/AI + the full "Lead Sources API" catalog — IndiaMart through Shopify/HubSpot/Salesforce/Mailchimp/Zendesk/Apollo/etc.) are deliberately separate top-level areas, not nested under each other.

### `db/pool.js` query helpers
All DB access goes through `q()` (many rows), `one()` (single row or null), `scalar()` (single value), `run()` (INSERT/UPDATE/DELETE, returns the mysql2 result), and `transaction(fn)` (BEGIN/COMMIT/ROLLBACK wrapper) — never the raw `pool` export directly in controllers/services, except `autoMigrate.js`, which intentionally uses `pool.query()` (text protocol) instead of the prepared-statement protocol these helpers use, because DDL (`ALTER TABLE`) is unreliable over MySQL's binary/prepared-statement protocol on some server versions.
