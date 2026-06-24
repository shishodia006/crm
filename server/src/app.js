import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { currentUser } from './middleware/auth.js';
import { currentCompany } from './middleware/company.js';
import { validateCsrf } from './middleware/csrf.js';
import routes from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // Hostinger terminates HTTPS at a reverse proxy. Trust it so secure
  // express-session cookies are issued correctly in production.
  app.set('trust proxy', 1);

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

  // Raw body capture (needed for webhook signature verification)
  app.use((req, _res, next) => {
    express.json({
      verify: (req, _res, buf) => { req.rawBody = buf.toString(); }
    })(req, _res, next);
  });
  app.use(express.urlencoded({ extended: true }));

  // Session
  app.use(session({
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
      req.session.csrfToken = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
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
