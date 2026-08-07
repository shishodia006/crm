import express from 'express';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import swaggerUi from 'swagger-ui-express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { currentUser } from './middleware/auth.js';
import { currentCompany } from './middleware/company.js';
import { validateCsrf } from './middleware/csrf.js';
import routes from './routes/index.js';
import { buildOpenApiSpec } from './docs/openapi.js';

// API docs (Swagger UI) are for one person only. Everyone else — logged out
// or logged in as anyone else — gets a plain 404, same as any other unknown
// route, so the existence of /docs isn't revealed to non-admins either.
const DOCS_ALLOWED_EMAIL = 'admin@dotdomino.com';
function requireDocsAccess(req, res, next) {
  if (req.user?.email?.toLowerCase() === DOCS_ALLOWED_EMAIL) return next();
  res.status(404);
  if (req.accepts('html')) return res.type('html').send('<!doctype html><title>Not Found</title><p>Not found.</p>');
  res.type('txt').send('Not found');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Persistent, MySQL-backed session store — the default express-session
// MemoryStore leaks memory and forgets every session on restart/redeploy,
// which isn't viable in production. Uses its own table (not the app's
// `sessions` table, which has a different, user-management-only schema).
const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  createDatabaseTable: true,
  schema: { tableName: 'express_sessions' },
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000
});

// Without this listener, a transient DB error (idle connection dropped,
// brief network blip) crashes the entire Node process — EventEmitter
// throws on an unhandled 'error' event.
sessionStore.on('error', (err) => {
  console.error('[session-store]', err);
});

export function createApp() {
  const app = express();

  // Hostinger terminates HTTPS at a reverse proxy. Trust it so secure
  // express-session cookies are issued correctly in production.
  app.set('trust proxy', 1);

  // Basic security headers (no extra dependency needed for this small set).
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Allow the configured frontend to call this API from a separate domain.
  // Local development keeps using the Vite proxy, while production uses APP_URL.
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && origin === config.appUrl) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
  });

  // /webhook and /track paths are meant to be called by arbitrary third-party
  // services (Anantya, Meta, etc.) — some of these "test" buttons run as
  // browser JS from the provider's own dashboard, which means the request is
  // subject to CORS. The frontend-only rule above only allows our own app's
  // origin, so any such browser-based test would get silently blocked before
  // ever reaching the route below. These paths need no cookies/credentials, so
  // allowing any origin here is safe.
  // /capture is the same idea but for the customer's OWN websites: the embed
  // snippet on their popup/landing page/contact form runs as browser JS on
  // *their* domain, not ours, so it needs the same open-CORS treatment.
  app.use((req, res, next) => {
    if (!req.path.startsWith('/webhook/') && !req.path.startsWith('/track/') && !req.path.startsWith('/capture/')) return next();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY, X-Api-Key, Authorization, authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Third-party webhook senders don't reliably set `Content-Type: application/json`
  // (Anantya's own test payload omitted it) — the global JSON parser below only
  // parses bodies whose content-type it recognizes, and the urlencoded parser after
  // it would otherwise consume the stream first and mangle a JSON body it wasn't
  // meant to touch. For /webhook paths, capture the true raw body up front —
  // before either global parser gets a chance to touch the stream — and skip them
  // both here so they can't silently overwrite this with an empty/garbled body.
  app.use((req, res, next) => {
    if (!req.path.startsWith('/webhook/')) return next();
    express.raw({ type: () => true, limit: '2mb' })(req, res, (err) => {
      if (err) return next(err);
      const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
      req.rawBody = text;
      if (req.path.startsWith('/webhook/twilio/')) {
        // Twilio's voice webhooks (the incoming-call TwiML request + every
        // status callback) are always application/x-www-form-urlencoded, never
        // JSON — the JSON.parse below would silently produce {} and drop
        // CallSid/From/To/CallStatus/DialCallStatus/etc entirely.
        req.body = Object.fromEntries(new URLSearchParams(text));
      } else {
        try { req.body = text ? JSON.parse(text) : {}; } catch { req.body = {}; }
      }
      next();
    });
  });

  // Multipart form support for public lead-capture endpoints (/ingest, /qr,
  // /capture) — some website embed snippets submit as multipart/form-data
  // (e.g. a page whose form also has an unrelated file input elsewhere)
  // rather than urlencoded/JSON, which the global json/urlencoded parsers
  // below can't read at all (req.body comes back empty, failing validation
  // with a misleading "Name is required"). Only text fields are accepted
  // (upload.none()) — these routes are keyed by nothing more than a shared
  // API key or a guessable slug, so accepting arbitrary file uploads here
  // would be an easy anonymous disk-fill DoS vector.
  const leadCaptureUpload = multer().none();
  app.use((req, res, next) => {
    const isLeadCapture = req.path.startsWith('/ingest/') || req.path.startsWith('/qr/') || req.path.startsWith('/capture/');
    if (!isLeadCapture || !(req.get('content-type') || '').startsWith('multipart/form-data')) return next();
    leadCaptureUpload(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: `Invalid form submission: ${err.message}` });
      req.rawBody = ''; // not used by these routes; only sentinel so the parsers below skip an already-consumed stream
      next();
    });
  });

  // Raw body capture (needed for webhook signature verification)
  app.use((req, _res, next) => {
    if (req.rawBody !== undefined) return next(); // already handled above for /webhook paths
    express.json({
      verify: (req, _res, buf) => { req.rawBody = buf.toString(); }
    })(req, _res, next);
  });
  app.use((req, _res, next) => {
    if (req.rawBody !== undefined) return next(); // already handled above for /webhook paths
    express.urlencoded({ extended: true })(req, _res, next);
  });

  // Session
  app.use(session({
    store: sessionStore,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.env === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000
    }
  }));

  // CSRF token generation (on every session request)
  app.use((req, _res, next) => {
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    next();
  });

  // Send CSRF token as response header so frontend can read it
  app.use((req, res, next) => {
    if (req.session?.csrfToken) res.setHeader('x-csrf-token', req.session.csrfToken);
    next();
  });

  // Attach current user to req
  app.use(currentUser);
  app.use(currentCompany);

  // API docs (Swagger UI) — restricted to DOCS_ALLOWED_EMAIL only, see above.
  const openApiSpec = buildOpenApiSpec();
  app.use('/docs', requireDocsAccess, swaggerUi.serve, swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'Dot Domino CRM — API Docs'
  }));

  // CSRF validation for mutating API routes
  app.use('/api', validateCsrf);

  // Serve uploaded files
  app.use('/uploads', express.static(config.uploadPath));

  // All routes
  app.use(routes);

  // Serve built client in production
  if (config.env === 'production') {
    const clientDist = path.resolve(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // Global error handler
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = config.env === 'production' && status === 500
      ? 'An unexpected error occurred.'
      : (err.message || 'Internal server error');
    if (status === 500) console.error('[Error]', err);
    res.status(status).json({ success: false, message });
  });

  return app;
}
