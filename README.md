# Dot Domino CRM

A full-stack CRM for lead management, sales pipeline, drip marketing campaigns, and AI-assisted analytics — built with React (frontend) and Node.js/Express (backend), backed by MySQL/MariaDB.

## Tech Stack

- **Frontend:** React 18 + Vite, React Router, Bootstrap 5.3 + Bootstrap Icons (via CDN), Chart.js (via CDN)
- **Backend:** Node.js (ESM) + Express, express-session, Nodemailer, Multer
- **Database:** MySQL / MariaDB (`mysql2` driver)

## Features

- **Dashboard** — Overview, Pipeline, Drip Report, and Full Report tabs with real-time KPIs, funnel health, stalled-deal alerts, lead source trends, monthly goal tracking, and a live activity feed
- **Leads** — capture, scoring, tagging, segmentation, CSV import/export, timeline
- **Pipeline (Deals)** — Kanban board with drag-and-drop stages, stalled/upcoming-meeting indicators, and a table view
- **Campaigns & Drip** — visual workflow builder (email / WhatsApp / SMS / RCS), templates, scheduling
- **Conversations** — unified inbox across channels
- **Tasks & To-do** — My Tasks / Overdue / Team / Completed views, board view, linked to leads/deals
- **Custom Reports** — save, share (private/team/link), schedule (daily/weekly/monthly email delivery), and export reports across 8 real data sources (revenue, agents, funnel, stalled deals, lead source ROI, drip performance, response time SLA, regional breakdown)
- **My Analyst** — AI chat assistant that answers plain-English questions about your pipeline/leads/campaigns, grounded in your real CRM data (requires an OpenAI-compatible provider configured in Settings)
- **Settings** — general/email/SMS/WhatsApp config, monthly goals, AI provider, users, integrations, lead sources, pipeline stages, AI agents
- **Multi-company** — company switcher with per-company data isolation and a master (cross-company) dashboard for admins

## Project Structure

```
crm/
├── client/               # React 18 + Vite frontend (port 5173)
│   └── src/
│       ├── features/     # auth, dashboard, leads, pipeline, campaigns, templates,
│       │                   tasks, conversations, reports, analyst, settings
│       ├── components/   # common/, charts/, layout/
│       ├── context/       # Auth, Toast
│       ├── hooks/         # useAuth, useToast, useResource
│       ├── services/     # api.js (fetch wrapper + CSRF)
│       └── styles/       # crm.css (design system)
├── server/               # Express API (ESM, port 8090)
│   └── src/
│       ├── config/, db/, middleware/, utils/
│       ├── services/     # business logic (score, lead, job, comm, drip, dashboard, reports, analyst…)
│       ├── controllers/  # request handlers
│       └── routes/       # auth, app (tenant-scoped), public (unauthenticated)
├── database/
│   └── schema.sql        # full MySQL/MariaDB schema (idempotent — safe to re-run)
├── uploads/              # user-uploaded files
├── public/               # static assets
└── start-dev.bat         # Windows convenience script to launch both servers
```

## Getting Started

### Prerequisites

- Node.js 18+
- MySQL or MariaDB running locally (or reachable)

### 1. Install dependencies

```bash
npm run install:all
# or manually:
cd server && npm install
cd ../client && npm install
```

### 2. Set up the database

Create a database and load the schema:

```bash
mysql -u root -p -e "CREATE DATABASE dot_domino_crm"
mysql -u root -p dot_domino_crm < database/schema.sql
```

The schema is idempotent (`CREATE TABLE IF NOT EXISTS`), so it's safe to re-run after pulling schema changes.

### 3. Configure environment

```bash
cd server
cp .env.example .env
```

Edit `server/.env` with your database credentials and session secret. Key variables:

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` | Database connection |
| `SESSION_SECRET` | Long random string for session signing |
| `PORT` | API server port (default `8090`) |
| `APP_URL` | Frontend origin (default `http://localhost:5173`) |

SMTP, WhatsApp, SMS, and AI provider credentials can be set per-company from **Settings → General** in the app instead of `.env`.

### 4. Run in development

```bash
npm run dev
```

This starts both the backend (`:8090`) and frontend (`:5173`) concurrently. On Windows you can also double-click `start-dev.bat`.

- Frontend: http://localhost:5173
- Backend API: http://localhost:8090

### 5. Log in

A default admin is seeded by `schema.sql`:

- **Email:** `admin@dotdomino.com`
- **Password:** `Admin@123`

Change this password after your first login.

## Other Scripts

```bash
npm run build   # Build the client for production
npm start        # Run the server in production mode
npm run cron     # Run one-off drip/job/report-schedule processing (for an external cron trigger)
```

In normal `dev`/`start` mode, drip sending, background jobs, and scheduled report emails already run automatically on a 1-minute in-process timer — `npm run cron` is only needed if you want an external scheduler (e.g. a system cron job) to trigger processing instead.

## Notes

- Currency/timezone defaults to INR / Asia/Kolkata; configurable per company in Settings.
- Email delivery uses SMTP (configured per company); WhatsApp/RCS uses the Anantya.ai API; SMS supports MSHastra or a generic HTTP provider.
- The "My Analyst" AI chat and AI Agents features require an OpenAI-compatible chat-completions endpoint (URL, API key, model) configured in Settings → General.
