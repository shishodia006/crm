// OpenAPI 3.0 spec for the Dot Domino CRM API, served (Swagger UI) at /docs.
// Access to /docs itself is restricted to admin@dotdomino.com — see app.js.
//
// This file is hand-written from the actual route/controller code (not
// auto-generated), so keep it in sync when routes change: add/update the
// matching entry in `paths` below whenever a route is added, removed, or its
// request/response shape changes in routes/*.js or controllers/*.js.

import { config } from '../config/index.js';

const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    message: { type: 'string' },
    errors: { nullable: true, description: 'Field-level validation errors ({field: message}) or null.' }
  }
};

function errRes(description, example) {
  return { description, content: { 'application/json': { schema: errorSchema, example } } };
}

const responses = {
  Unauthenticated: errRes('Not logged in (no valid session).', { success: false, message: 'Unauthenticated', errors: null }),
  Forbidden: errRes('Logged in, but role/company-role is not sufficient for this action.', { success: false, message: 'Insufficient permissions.', errors: null }),
  NotFound: errRes('No matching record in the caller\'s company.', { success: false, message: 'Not found.', errors: null }),
  Validation: errRes('Request body failed validation.', { success: false, message: 'Validation failed', errors: { field: 'reason' } })
};

function envelope(dataSchema, description = 'OK', message = 'OK') {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: message },
            data: dataSchema
          }
        }
      }
    }
  };
}

function dataOk(example, description = 'OK', message = 'OK') {
  return envelope({ type: 'object', example }, description, message);
}

function nullDataOk(message, description = 'OK') {
  return envelope({ type: 'null', example: null }, description, message);
}

function json(schema, example) {
  return { content: { 'application/json': { schema, example } } };
}

function body(example, required = true, description) {
  return { required, description, content: { 'application/json': { schema: { type: 'object', example }, example } } };
}

function qp(name, description, { type = 'string', required = false, example } = {}) {
  return { name, in: 'query', description, required, schema: { type, example } };
}

function pp(name, description, type = 'integer') {
  return { name, in: 'path', required: true, description, schema: { type } };
}

const CSRF_NOTE =
  'Requires a valid session cookie AND the `X-CSRF-Token` header (see Authentication section above) since this mutates data.';

const paths = {};
const merge = (obj) => Object.assign(paths, obj);

// ---------------------------------------------------------------------------
// Auth (/api/auth/*) — no company scoping, session-cookie based
// ---------------------------------------------------------------------------
merge({
  '/api/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'Get current session (who am I)',
      description: 'Always returns 200, even when logged out — check `data.user` for null. Frontend calls this on every page load to hydrate session state.',
      security: [],
      responses: {
        200: dataOk(
          { user: { id: 1, name: 'Admin', email: 'admin@dotdomino.com', role: 'superadmin', avatar: null, phone: null, timezone: 'Asia/Kolkata', status: 'active', is_active: 1, last_login_at: '2026-08-07T04:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' }, company: { id: 1, name: 'Dot Domino', slug: 'dot-domino', timezone: 'Asia/Kolkata', currency: 'INR' }, companies: [{ id: 1, name: 'Dot Domino', company_role: 'admin' }], csrfToken: 'a1b2c3...', env: 'production' },
          'Session info (user may be null if logged out)', 'Session loaded.'
        )
      }
    }
  },
  '/api/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Log in with email + password',
      description: 'Rate-limited: 10 attempts / 15 min, keyed by IP + email. Regenerates the session and returns a fresh `csrfToken` — the client must use this token in `X-CSRF-Token` for all subsequent mutating requests.',
      security: [],
      requestBody: body({ email: 'admin@dotdomino.com', password: 'Admin@123' }, true, 'email (required), password (required)'),
      responses: {
        200: dataOk({ user: { id: 1, name: 'Admin', email: 'admin@dotdomino.com', role: 'superadmin' }, company: { id: 1, name: 'Dot Domino' }, companies: [{ id: 1, name: 'Dot Domino', company_role: 'admin' }], csrfToken: 'a1b2c3...' }, 'Logged in', 'Logged in.'),
        401: errRes('Wrong email/password, or account inactive.', { success: false, message: 'Invalid credentials.', errors: null }),
        422: errRes('Missing email or password.', { success: false, message: 'Email and password required.', errors: null }),
        429: errRes('Too many login attempts — rate limited.', { success: false, message: 'Too many attempts. Try again later.', errors: null })
      }
    }
  },
  '/api/auth/register': {
    post: {
      tags: ['Auth'],
      summary: 'Self-service sign-up (creates a new workspace)',
      description: 'Rate-limited: 10/hour per IP. The very first user ever created in the whole install becomes `role=superadmin`; every subsequent self-registered user is `role=admin` of their own brand-new company. Auto-logs-in on success (same session semantics as /login).',
      security: [],
      requestBody: body({ name: 'Jane Doe', email: 'jane@example.com', password: 'MinLength6', company: "Jane's Company (optional)" }, true, 'name, email, password required; company optional, defaults to "{name}\'s Company"'),
      responses: {
        200: dataOk({ csrfToken: 'a1b2c3...' }, 'Account + workspace created, logged in', 'Account created! Welcome to Dot Domino CRM.'),
        409: errRes('Email already registered.', { success: false, message: 'An account with this email already exists.', errors: null }),
        422: errRes('Invalid name/email/password.', { success: false, message: 'Password must be at least 6 characters.', errors: null })
      }
    }
  },
  '/api/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Log out (destroy session)',
      description: CSRF_NOTE,
      responses: { 200: nullDataOk('Logged out.'), 401: responses.Unauthenticated }
    }
  },
  '/api/auth/forgot': {
    post: {
      tags: ['Auth'],
      summary: 'Request a password-reset email',
      description: 'Rate-limited: 5/hour per IP. Always returns 200 regardless of whether the email exists (anti-enumeration). In `NODE_ENV=development` only, `data.resetUrl` is included directly in the response for convenience (no SMTP needed locally).',
      security: [],
      requestBody: body({ email: 'user@example.com' }),
      responses: {
        200: dataOk({ resetUrl: '(development only) http://localhost:5173/reset-password/abcd1234...' }, 'Always 200', 'If that email exists, a reset link has been sent.'),
        422: errRes('Malformed email.', { success: false, message: 'Invalid email.', errors: null })
      }
    }
  },
  '/api/auth/reset/{token}': {
    get: {
      tags: ['Auth'],
      summary: 'Check whether a reset token is still valid',
      security: [],
      parameters: [pp('token', 'Token from the reset-password email link', 'string')],
      responses: { 200: dataOk({ valid: true, email: 'user@example.com' }, 'Always 200 — check data.valid', 'Reset token valid.') }
    },
    post: {
      tags: ['Auth'],
      summary: 'Set a new password using a reset token',
      security: [],
      parameters: [pp('token', 'Token from the reset-password email link', 'string')],
      requestBody: body({ password: 'NewPassw0rd!', password_confirm: 'NewPassw0rd!' }, true, 'password (min 8 chars), password_confirm (must match) — `passwordConfirm` camelCase also accepted'),
      responses: {
        200: nullDataOk('Password reset. Please login.'),
        404: errRes('Token missing/used/expired.', { success: false, message: 'Invalid or expired token.', errors: null }),
        422: responses.Validation
      }
    }
  },
  '/api/auth/profile': {
    patch: {
      tags: ['Auth'],
      summary: 'Update own profile',
      description: `Partial update — only send the fields you want to change. At least one field required. ${CSRF_NOTE}`,
      requestBody: body({ name: 'Admin User', email: 'admin@dotdomino.com', phone: '+919999999999', timezone: 'Asia/Kolkata' }, true, 'All fields optional (partial update); at least one required'),
      responses: {
        200: dataOk({ user: { id: 1, name: 'Admin User', email: 'admin@dotdomino.com', role: 'superadmin', avatar: null, phone: '+919999999999', timezone: 'Asia/Kolkata', is_active: 1, last_login_at: '2026-08-07T04:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' } }, 'Updated profile', 'Profile updated.'),
        401: responses.Unauthenticated,
        409: errRes('Email already used by another account.', { success: false, message: 'Another account already uses this email.', errors: null }),
        422: responses.Validation
      }
    }
  },
  '/api/auth/change-password': {
    post: {
      tags: ['Auth'],
      summary: 'Change own password',
      description: CSRF_NOTE,
      requestBody: body({ current_password: 'Admin@123', password: 'NewPassw0rd!', password_confirm: 'NewPassw0rd!' }),
      responses: {
        200: nullDataOk('Password changed.'),
        401: errRes('Wrong current password.', { success: false, message: 'Current password is incorrect.', errors: null }),
        422: responses.Validation
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Session / meta / dashboard / notifications
// ---------------------------------------------------------------------------
merge({
  '/api/meta': {
    get: {
      tags: ['Session & Meta'],
      summary: 'Dropdown data for forms (sources, agents, stages, templates, campaigns)',
      responses: { 200: dataOk({ sources: [{ id: 1, name: 'Website', slug: 'website', category: 'organic' }], agents: [{ id: 1, name: 'Admin', email: 'admin@dotdomino.com', role: 'superadmin' }], stages: [{ id: 1, name: 'New', stage_order: 1 }], templates: [{ id: 1, name: 'Welcome Email', channel: 'email' }], campaigns: [{ id: 1, name: 'Onboarding Drip', status: 'active' }] }), 401: responses.Unauthenticated }
    }
  },
  '/api/dashboard': {
    get: {
      tags: ['Dashboard'],
      summary: 'Main dashboard (stats, funnel, priorities, drip performance, live activity)',
      description: 'Large aggregation endpoint used by the home dashboard. See `data.overview` for the "Business Health" panel (score, action-required list, lead-source trends, monthly goal pacing, live activity feed).',
      responses: { 200: dataOk({ stats: { total_leads: 1200, new_today: 8, hot_leads: 34, converted: 210, revenue: 4500000, active_campaigns: 5, pending_tasks: 12, active_agents: 6 }, dripStats: { active_enrollments: 340, total_converted: 88, msgs_today: 210, email_open_rate: 42.5, wa_read_rate: 61.2, failed_today: 2 }, channelSends: { whatsapp: { channel: 'whatsapp', sent: 500, delivered: 480, failed: 5 } }, dailyLeads: [{ date: '2026-08-06', total: 14 }], sourceStats: [{ source: 'Website', slug: 'website', total: 400, won: 30 }], categoryStats: [{ category: 'hot', total: 34 }], funnelStats: [{ stage: 'New', total: 120 }], recentLeads: [], pendingTasks: [], overview: { stats: { pipelineValue: 900000, dealsWonThisMonth: 12, closeRate: 18.4 }, funnel: [], businessHealth: { score: 78, subScores: { leadMagnet: 80, management: 75, conversion: 79 }, closeRate: 18.4, industryBenchmark: 2.1 }, actionRequired: [], leadSources: [], monthlyGoals: {}, drip: {}, liveActivity: [] } }) }
    }
  },
  '/api/dashboard/master': {
    get: {
      tags: ['Dashboard'],
      summary: '[Admin only] Cross-tenant master dashboard — every company in the install',
      description: 'The one deliberate exception to normal company scoping — aggregates across *all* active companies regardless of the caller\'s memberships. Restricted to global role admin/superadmin.',
      responses: { 200: dataOk({ stats: { total_leads: 5000, new_today: 40, converted: 900, hot_leads: 120, revenue: 20000000, company_count: 6 }, companies: [{ id: 1, name: 'Dot Domino', slug: 'dot-domino', total_leads: 1200, converted: 210, messages_sent: 3000, engaged: 900, revenue: 4500000 }], dailyLeads: [{ date: '2026-08-06', total: 60 }] }), 403: responses.Forbidden }
    }
  },
  '/api/stats/daily': {
    get: {
      tags: ['Dashboard'],
      summary: 'Daily lead-count series for charts',
      parameters: [qp('days', 'Number of days back (clamped 1–365)', { type: 'integer', example: 30 })],
      responses: { 200: dataOk({ rows: [{ date: '2026-08-06', total: 14 }] }) }
    }
  },
  '/api/notifications': {
    get: {
      tags: ['Notifications'],
      summary: 'List my recent notifications (last 20)',
      description: 'NOTE: unlike every other endpoint, this one does NOT use the `{success,message,data}` envelope — it returns `{unread, items}` directly at the top level.',
      responses: { 200: json({ type: 'object', properties: { unread: { type: 'integer' }, items: { type: 'array', items: { type: 'object' } } } }, { unread: 3, items: [{ id: 1, type: 'lead_assigned', title: 'New lead assigned', body: 'Rahul Sharma was assigned to you', link: '/leads/42', is_read: false, created_at: '2026-08-07T03:00:00.000Z' }] }) }
    }
  },
  '/api/notifications/read-all': {
    post: { tags: ['Notifications'], summary: 'Mark all my notifications as read', description: CSRF_NOTE, responses: { 200: nullDataOk('All notifications marked as read.') } }
  },
  '/api/notifications/{id}/read': {
    post: {
      tags: ['Notifications'],
      summary: 'Mark one notification as read',
      description: CSRF_NOTE,
      parameters: [pp('id', 'Notification id')],
      responses: { 200: nullDataOk('Marked as read.') }
    }
  }
});

// ---------------------------------------------------------------------------
// Companies (workspaces / multi-tenancy)
// ---------------------------------------------------------------------------
merge({
  '/api/companies': {
    get: { tags: ['Companies'], summary: 'List companies I belong to', responses: { 200: dataOk({ companies: [{ id: 1, name: 'Dot Domino', slug: 'dot-domino', timezone: 'Asia/Kolkata', currency: 'INR', company_role: 'admin' }], selectedCompanyId: 1 }) } },
    post: {
      tags: ['Companies'],
      summary: '[Admin only] Create a new company (workspace)',
      description: `Auto-selects the new company for the caller's session. ${CSRF_NOTE}`,
      requestBody: body({ name: 'Acme Inc', timezone: 'Asia/Kolkata', currency: 'INR' }, true, 'name required; timezone, currency optional'),
      responses: { 200: dataOk({ company: { id: 2, name: 'Acme Inc', slug: 'acme-inc', timezone: 'Asia/Kolkata', currency: 'INR' } }, 'Created', 'Company created.'), 403: responses.Forbidden, 422: responses.Validation }
    }
  },
  '/api/companies/select': {
    post: {
      tags: ['Companies'],
      summary: 'Switch the active company for this session',
      description: `Every tenant-scoped endpoint reads \`req.companyId\` from the session — call this after login/company-switch in the UI. ${CSRF_NOTE}`,
      requestBody: body({ company_id: 1 }),
      responses: { 200: dataOk({ company: { id: 1, name: 'Dot Domino' } }, 'Switched', 'Company switched.') }
    }
  },
  '/api/companies/members': {
    get: { tags: ['Companies'], summary: 'List members of the current company', responses: { 200: dataOk({ members: [{ id: 1, name: 'Admin', email: 'admin@dotdomino.com', role: 'superadmin', status: 'active', is_active: 1, company_role: 'admin' }] }) } },
    post: {
      tags: ['Companies'],
      summary: '[Admin only] Add/update a member\'s role in the current company',
      description: CSRF_NOTE,
      requestBody: body({ user_id: 5, role: 'manager' }, true, 'user_id required (existing, active user); role optional, default agent'),
      responses: { 200: nullDataOk('Company member saved.'), 403: responses.Forbidden, 404: responses.NotFound, 422: responses.Validation }
    }
  },
  '/api/companies/members/{userId}': {
    delete: {
      tags: ['Companies'],
      summary: '[Admin only] Remove a member from the current company',
      description: `Blocked with 422 if this would remove the last admin. ${CSRF_NOTE}`,
      parameters: [pp('userId', 'User id to remove')],
      responses: { 200: nullDataOk('Company member removed.'), 403: responses.Forbidden, 404: responses.NotFound, 422: errRes('Would remove the last admin.', { success: false, message: 'Cannot remove the last admin.', errors: null }) }
    }
  }
});

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------
merge({
  '/api/leads': {
    get: {
      tags: ['Leads'],
      summary: 'List leads (paginated, filterable)',
      description: 'Agents (`company_role=agent`) only see their own/unassigned leads; managers/admins see everyone\'s.',
      parameters: [
        qp('page', 'Page number', { type: 'integer', example: 1 }),
        qp('limit', 'Page size (clamped 10–100)', { type: 'integer', example: 25 }),
        qp('search', 'Free-text search (name/email/mobile/company)'),
        qp('source_id', 'Filter by lead source id'),
        qp('status', 'Filter by status (new|contacted|qualified|proposal|negotiation|won|lost|unsubscribed|invalid)'),
        qp('category', 'Filter by category (cold|warm|hot|sales_ready)'),
        qp('assigned', 'Filter by assigned agent user id'),
        qp('date_from', 'Created-at range start (YYYY-MM-DD)'),
        qp('date_to', 'Created-at range end (YYYY-MM-DD)')
      ],
      responses: { 200: dataOk({ leads: [{ id: 42, name: 'Rahul Sharma', email: 'rahul@example.com', mobile: '+919999999999', company: 'Acme', status: 'new', category: 'warm', score: 40, source_name: 'Website', assigned_name: 'Admin', created_at: '2026-08-06T10:00:00.000Z' }], pagination: { total: 1200, per_page: 25, current_page: 1, last_page: 48 }, filters: { search: '', source_id: '', status: '', category: '', assigned: '', date_from: '', date_to: '' }, sources: [{ id: 1, name: 'Website' }], agents: [{ id: 1, name: 'Admin' }] }) }
    },
    post: {
      tags: ['Leads'],
      summary: 'Create a lead manually (requires agent role or above)',
      description: `One of \`email\`/\`mobile\` required. Runs through the same dedupe funnel as every other ingestion path — a match within the dedupe window merges instead of creating a duplicate. ${CSRF_NOTE}`,
      requestBody: body({ name: 'Rahul Sharma', email: 'rahul@example.com', mobile: '9999999999', company: 'Acme Inc', designation: 'CTO', industry: 'IT', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400001', website: 'https://acme.com', product_interest: 'CRM Software', source_id: 19, custom_fields: { budget: '5L' } }, true, 'name required; email or mobile required; everything else optional'),
      responses: { 200: dataOk({ success: true, lead_id: 42, is_duplicate: false, errors: [] }, 'Created (or merged into an existing duplicate)', 'Lead created.'), 422: responses.Validation, 403: responses.Forbidden }
    }
  },
  '/api/leads/export': { get: { tags: ['Leads'], summary: 'Export current filtered lead list as CSV', description: 'Returns a raw CSV file, not the JSON envelope.', responses: { 200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } } } } },
  '/api/leads/import/sample': { get: { tags: ['Leads'], summary: 'Download the sample .xlsx template for bulk import', responses: { 200: { description: 'XLSX file', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } } } } } },
  '/api/leads/import': {
    post: {
      tags: ['Leads'],
      summary: 'Bulk import leads from a CSV or Excel file',
      description: `\`multipart/form-data\` upload. File field name **csv** (also accepts .xlsx/.xls despite the name), max 10MB. ${CSRF_NOTE}`,
      requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { csv: { type: 'string', format: 'binary', description: 'CSV or XLSX file' }, source_id: { type: 'integer', default: 16 } }, required: ['csv'] } } } },
      responses: { 200: dataOk({ total: 100, imported: 92, duplicates: 6, failed: 2, errors: ['Row 14: invalid mobile'] }) }
    }
  },
  '/api/leads/check-duplicate': {
    get: { tags: ['Leads'], summary: 'Check if an email/mobile already exists (pre-submit warning)', parameters: [qp('email', 'Email to check'), qp('mobile', 'Mobile to check (10-digit assumes +91)')], responses: { 200: dataOk({ duplicate: { id: 42, name: 'Rahul Sharma', email: 'rahul@example.com', mobile: '+919999999999', status: 'new' } }, 'null if no match') } }
  },
  '/api/leads/{id}': {
    get: {
      tags: ['Leads'],
      summary: 'Get a lead with full timeline, enrollments, and score history',
      parameters: [pp('id', 'Lead id')],
      responses: { 200: dataOk({ lead: { id: 42, name: 'Rahul Sharma', status: 'new', source_name: 'Website', assigned_name: 'Admin' }, timeline: [{ entity: 'communication', id: 5, subtype: 'email', status: 'opened', created_at: '2026-08-06T10:00:00.000Z', summary: 'Welcome Email opened' }], campaigns: [{ id: 1, name: 'Onboarding Drip' }], agents: [{ id: 1, name: 'Admin' }], sources: [{ id: 1, name: 'Website' }], enrollments: [{ id: 9, campaign_id: 1, campaign_name: 'Onboarding Drip', status: 'active' }], scoreHistory: [{ event: 'email_open', points: 5, created_at: '2026-08-06T10:05:00.000Z' }], tags: [{ id: 1, name: 'VIP', color: '#ff9900' }] }), 404: responses.NotFound }
    },
    patch: {
      tags: ['Leads'],
      summary: 'Update a lead (requires agent role or above)',
      description: `Partial update — only send fields being changed. Transitioning \`status\` to \`qualified\` for the first time auto-creates a deal in the earliest active pipeline stage. ${CSRF_NOTE}`,
      parameters: [pp('id', 'Lead id')],
      requestBody: body({ name: 'Rahul Sharma', email: 'rahul@example.com', mobile: '+919999999999', company: 'Acme', designation: 'CTO', industry: 'IT', city: 'Mumbai', state: 'Maharashtra', country: 'India', product_interest: 'CRM Software', status: 'qualified', category: 'hot', lead_type: 'inbound', notes: 'Ready to buy', assigned_to: 1, source_id: 1 }, true, 'All fields optional — send only what changed'),
      responses: { 200: nullDataOk('Lead updated.'), 403: responses.Forbidden, 404: responses.NotFound, 422: responses.Validation }
    },
    delete: {
      tags: ['Leads'],
      summary: '[Admin only] Delete a lead',
      description: CSRF_NOTE,
      parameters: [pp('id', 'Lead id')],
      responses: { 200: nullDataOk('Lead deleted.'), 403: responses.Forbidden }
    }
  },
  '/api/leads/{id}/enroll': {
    post: {
      tags: ['Leads'],
      summary: 'Enroll a lead into a drip campaign',
      description: CSRF_NOTE,
      parameters: [pp('id', 'Lead id')],
      requestBody: body({ campaign_id: 1 }),
      responses: { 200: dataOk({ enrolled: true }), 404: responses.NotFound }
    }
  },
  '/api/leads/bulk-enroll': {
    post: {
      tags: ['Leads'],
      summary: 'Enroll multiple leads into a drip campaign at once',
      description: CSRF_NOTE,
      requestBody: body({ campaign_id: 1, lead_ids: [42, 43, 44] }),
      responses: { 200: dataOk({ enrolled: 3, skipped: 0, total: 3 }) }
    }
  },
  '/api/leads/{id}/score': {
    post: { tags: ['Leads'], summary: 'Manually add a lead-score event', description: CSRF_NOTE, parameters: [pp('id', 'Lead id')], requestBody: body({ event: 'manual' }, false, 'Optional — defaults to "manual"'), responses: { 200: dataOk({ score: 45 }) } }
  },
  '/api/leads/{id}/timeline': {
    get: { tags: ['Leads'], summary: 'Get a lead\'s activity timeline only', parameters: [pp('id', 'Lead id')], responses: { 200: envelope({ type: 'array', items: { type: 'object' } }, 'Array of timeline events'), 404: responses.NotFound } }
  },
  '/api/leads/{id}/call': {
    post: {
      tags: ['Leads'],
      summary: 'Place an outbound Twilio call to this lead (agent role or above)',
      description: `Calls the agent's own phone first, then bridges to the lead's mobile once the agent answers. Requires Voice to be configured (Settings → Integrations) and the calling agent to have a valid \`phone\` set on their profile. ${CSRF_NOTE}`,
      parameters: [pp('id', 'Lead id')],
      responses: { 200: dataOk({ comm_id: 501, call_sid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }), 422: errRes('Voice not configured, or invalid lead/agent phone.', { success: false, message: 'Voice calling is not configured for this company.', errors: null }), 404: responses.NotFound }
    }
  },
  '/api/leads/{id}/enrollments/{eid}': {
    get: {
      tags: ['Leads'],
      summary: 'Get one drip-campaign enrollment\'s step log for a lead',
      parameters: [pp('id', 'Lead id'), pp('eid', 'Enrollment id')],
      responses: { 200: dataOk({ enrollment: { id: 9, campaign_id: 1, campaign_name: 'Onboarding Drip', campaign_type: 'drip', status: 'active' }, steps: [{ id: 1, step_order: 1, type: 'send_email', log_status: 'sent', executed_at: '2026-08-06T10:00:00.000Z' }], comms: [{ channel: 'email', status: 'opened', subject: 'Welcome!', sent_at: '2026-08-06T10:00:00.000Z' }] }), 404: responses.NotFound }
    }
  }
});

// ---------------------------------------------------------------------------
// Campaigns (drip sequences) + Broadcasts + Segments + Company Directory
// ---------------------------------------------------------------------------
merge({
  '/api/campaigns': {
    get: { tags: ['Campaigns (Drip)'], summary: 'List drip campaigns with performance stats', responses: { 200: dataOk({ campaigns: [{ id: 1, name: 'Onboarding Drip', status: 'active', enrolled: 340, active_leads: 120, converted: 88, step_count: 5, channels: ['email', 'whatsapp'], open_rate: 42.5, click_rate: 12.1, insight: { type: 'positive', text: 'Open rate is above average' } }] }) } },
    post: {
      tags: ['Campaigns (Drip)'],
      summary: '[Admin/Manager] Create a drip campaign (draft)',
      description: CSRF_NOTE,
      requestBody: body({ name: 'Onboarding Drip', description: 'Nurture new leads over 2 weeks', goal: 'conversion', entry_source_ids: [1, 2], reentry: 'always', reentry_after_days: 0, quiet_hours: { enabled: true, start: '21:00', end: '09:00', timezone: 'Asia/Kolkata' } }, true, 'name required; everything else optional. Created with status=draft.'),
      responses: { 200: dataOk({ id: 1 }), 403: responses.Forbidden }
    }
  },
  '/api/campaigns/{id}': {
    get: { tags: ['Campaigns (Drip)'], summary: 'Get a campaign with stage/channel analytics', parameters: [pp('id', 'Campaign id')], responses: { 200: dataOk({ campaign: { id: 1, name: 'Onboarding Drip', status: 'active' }, stats: { total: 340, active: 120, completed: 130, converted: 88, exited: 2 }, channels: [{ channel: 'email', sent: 900, delivered: 890, opened: 400, clicked: 90 }], workflowSteps: [{ id: 1, type: 'send_email', step_order: 1 }], stepAnalytics: [{ step_id: 1, type: 'send_email', sent: 340, delivered: 335 }] }), 404: responses.NotFound } },
    patch: {
      tags: ['Campaigns (Drip)'],
      summary: '[Admin/Manager] Update campaign settings',
      description: CSRF_NOTE,
      parameters: [pp('id', 'Campaign id')],
      requestBody: body({ name: 'Onboarding Drip v2', description: '...', goal: 'conversion', reentry: 'once', reentry_after_days: 30, quiet_hours: { enabled: true, start: '21:00', end: '09:00', timezone: 'Asia/Kolkata' } }),
      responses: { 200: nullDataOk('Campaign updated.'), 403: responses.Forbidden, 404: responses.NotFound }
    },
    delete: { tags: ['Campaigns (Drip)'], summary: '[Admin/Manager] Delete a campaign', description: CSRF_NOTE, parameters: [pp('id', 'Campaign id')], responses: { 200: nullDataOk('Sequence deleted.'), 403: responses.Forbidden, 404: responses.NotFound } }
  },
  '/api/campaigns/{id}/activate': { post: { tags: ['Campaigns (Drip)'], summary: '[Admin/Manager] Activate a campaign', description: CSRF_NOTE, parameters: [pp('id', 'Campaign id')], responses: { 200: nullDataOk('Campaign activated.'), 403: responses.Forbidden } } },
  '/api/campaigns/{id}/pause': { post: { tags: ['Campaigns (Drip)'], summary: '[Admin/Manager] Pause a campaign', description: CSRF_NOTE, parameters: [pp('id', 'Campaign id')], responses: { 200: nullDataOk('Campaign paused.'), 403: responses.Forbidden } } },
  '/api/campaigns/{id}/builder': { get: { tags: ['Campaigns (Drip)'], summary: 'Get everything needed to render the visual workflow builder', parameters: [pp('id', 'Campaign id')], responses: { 200: dataOk({ campaign: { id: 1, name: 'Onboarding Drip' }, templates: [{ id: 1, name: 'Welcome Email', channel: 'email' }], agents: [{ id: 1, name: 'Admin' }], stages: [{ id: 1, name: 'New' }], workflowSteps: [{ id: 1, type: 'send_email', step_order: 1, x: 100, y: 100 }], integrationAccounts: [{ id: 1, name: 'Main WhatsApp', provider: 'anantya', channel: 'whatsapp' }], activeEnrollments: 120 }), 404: responses.NotFound } } },
  '/api/campaigns/{id}/steps': {
    post: {
      tags: ['Campaigns (Drip)'],
      summary: '[Admin/Manager] Save the full workflow step graph (replaces all steps)',
      description: `Full replace-on-save: deletes and reinserts every step for this campaign in one transaction. Step \`type\` must be one of: email, whatsapp, rcs, sms, send_email, send_whatsapp, send_rcs, send_sms, multi_send, wait, condition, assign_agent, task, create_task, move_pipeline, update_score, tag_lead, exit. ${CSRF_NOTE}`,
      parameters: [pp('id', 'Campaign id')],
      requestBody: body({
        steps: [
          { id: 'tmp-1', type: 'send_email', step_order: 1, template_id: 3, delay_value: 0, delay_unit: 'days', x: 100, y: 100 },
          { id: 'tmp-2', type: 'wait', step_order: 2, delay_value: 2, delay_unit: 'days', x: 300, y: 100 },
          { id: 'tmp-3', type: 'condition', step_order: 3, condition: 'email_opened', condition_op: 'is_true', x: 500, y: 100 }
        ],
        connections: [{ from: 'tmp-1', to: 'tmp-2', label: 'out' }, { from: 'tmp-2', to: 'tmp-3', label: 'out' }],
        activate: false
      }, true, 'steps: array of step nodes; connections: array of {from,to,label}; activate: optional bool to also activate the campaign'),
      responses: { 200: dataOk({ step_count: 3 }), 403: responses.Forbidden, 422: errRes('Unknown/missing step type.', { success: false, message: 'Invalid step type.', errors: null }) }
    }
  },

  '/api/broadcasts': {
    get: { tags: ['Broadcasts'], summary: 'List one-off broadcast blasts', responses: { 200: dataOk({ broadcasts: [{ id: 10, name: 'Diwali Offer', status: 'sent', template_name: 'Diwali Promo', audience_label: 'All contacts', audience_count: 5000, sent_count: 4980, open_rate: 38.2 }], audienceTypes: [{ key: 'all_contacts', label: 'All Contacts' }, { key: 'active_leads', label: 'Active Leads' }, { key: 'lead_status', label: 'By Lead Status' }, { key: 'lead_source', label: 'By Lead Source' }, { key: 'pipeline_stage', label: 'By Pipeline Stage' }, { key: 'segment', label: 'By List/Segment' }] }) } },
    post: {
      tags: ['Broadcasts'],
      summary: '[Admin/Manager] Create a broadcast (draft or scheduled)',
      description: `\`status\` becomes \`scheduled\` if \`start_at\` given, else \`draft\`. ${CSRF_NOTE}`,
      requestBody: body({ name: 'Diwali Offer', template_id: 3, audience_type: 'lead_status', audience_value: 'qualified', start_at: '2026-10-20T09:00:00' }, true, 'name, template_id required; audience_type defaults all_contacts; start_at optional'),
      responses: { 200: dataOk({ id: 10 }), 403: responses.Forbidden, 404: errRes('Template not found.', { success: false, message: 'Template not found.', errors: null }), 422: responses.Validation }
    }
  },
  '/api/broadcasts/segments': { get: { tags: ['Broadcasts'], summary: 'List segments usable as a broadcast audience', responses: { 200: dataOk({ segments: [{ id: 1, name: 'High-Value Leads', type: 'dynamic', count: 200 }] }) } } },
  '/api/broadcasts/audience-preview': { get: { tags: ['Broadcasts'], summary: 'Preview audience size for a given audience type/value before sending', parameters: [qp('type', 'One of the audienceTypes keys', { example: 'lead_status' }), qp('value', 'Meaning depends on type (status string / source id / stage id / segment id)')], responses: { 200: dataOk({ count: 1450, label: 'Leads with status "qualified"' }) } } },
  '/api/broadcasts/{id}/send': {
    post: {
      tags: ['Broadcasts'],
      summary: '[Admin/Manager] Trigger the broadcast send',
      description: `Fire-and-forget — returns \`{status:'sending'}\` immediately while the actual bulk send runs in the background. Poll \`GET /api/broadcasts\` to watch \`sent_count\`/\`status\` progress. ${CSRF_NOTE}`,
      parameters: [pp('id', 'Broadcast id')],
      responses: { 200: dataOk({ status: 'sending' }), 403: responses.Forbidden, 404: responses.NotFound, 422: errRes('Already sending.', { success: false, message: 'Broadcast is already sending.', errors: null }) }
    }
  },
  '/api/broadcasts/{id}': { delete: { tags: ['Broadcasts'], summary: '[Admin/Manager] Delete a broadcast', description: CSRF_NOTE, parameters: [pp('id', 'Broadcast id')], responses: { 200: nullDataOk('Deleted.'), 403: responses.Forbidden, 404: responses.NotFound } } },

  '/api/company-directory': {
    get: {
      tags: ['Company Directory'],
      summary: 'List distinct companies (from lead records) with deal rollups',
      parameters: [qp('page', 'Page number', { type: 'integer', example: 1 }), qp('limit', 'Page size (clamped 10–100)', { type: 'integer', example: 25 })],
      responses: { 200: dataOk({ companies: [{ name: 'Acme Inc', industry: 'IT', contacts: 3, deals: 2, value: 500000 }], total: 80, page: 1, lastPage: 4 }) }
    }
  },
  '/api/segments': {
    get: { tags: ['Segments & Lists'], summary: 'List segments/lists', responses: { 200: dataOk({ segments: [{ id: 1, name: 'High-Value Leads', type: 'dynamic', member_count: 200, created_by_name: 'Admin' }] }) } },
    post: {
      tags: ['Segments & Lists'],
      summary: 'Create a segment (static list of chosen leads, or dynamic rule-based)',
      description: `\`type=static\` uses \`lead_ids\`; \`type=dynamic\` uses \`conditions\` and auto-backfills matching leads. ${CSRF_NOTE}`,
      requestBody: body({ name: 'High-Value Leads', type: 'dynamic', description: 'Leads worth pursuing', conditions: { category: 'hot', min_score: 70 } }, true, 'name required; type static|dynamic; lead_ids (static) or conditions (dynamic)'),
      responses: { 200: dataOk({ id: 5, added: 42 }), 422: responses.Validation }
    }
  },
  '/api/segments/{id}/members': {
    get: { tags: ['Segments & Lists'], summary: 'List leads in a segment', parameters: [pp('id', 'Segment id')], responses: { 200: dataOk({ segment: { id: 5, name: 'High-Value Leads', type: 'dynamic' }, leads: [{ id: 42, name: 'Rahul Sharma', email: 'rahul@example.com', status: 'new' }] }), 404: responses.NotFound } },
    post: { tags: ['Segments & Lists'], summary: 'Add leads to a static segment', description: CSRF_NOTE, parameters: [pp('id', 'Segment id')], requestBody: body({ lead_ids: [42, 43] }), responses: { 200: dataOk({ added: 2 }), 404: responses.NotFound, 422: errRes('Not a static list.', { success: false, message: 'Only static lists can have members added manually.', errors: null }) } }
  },
  '/api/segments/{id}/members/{leadId}': { delete: { tags: ['Segments & Lists'], summary: 'Remove one lead from a static segment', description: CSRF_NOTE, parameters: [pp('id', 'Segment id'), pp('leadId', 'Lead id')], responses: { 200: nullDataOk('Removed.'), 404: responses.NotFound } } },
  '/api/segments/{id}': { delete: { tags: ['Segments & Lists'], summary: 'Delete a segment', description: CSRF_NOTE, parameters: [pp('id', 'Segment id')], responses: { 200: nullDataOk('Deleted.'), 404: responses.NotFound } } }
});

// ---------------------------------------------------------------------------
// Pipeline & Deals
// ---------------------------------------------------------------------------
merge({
  '/api/pipeline': { get: { tags: ['Pipeline & Deals'], summary: 'Get the Kanban pipeline board (stages + deals)', responses: { 200: dataOk({ stages: [{ id: 1, name: 'Discovery', count: 12, value: 600000, deals: [{ id: 1, title: 'Acme — CRM Deal', lead_name: 'Rahul Sharma', value: 50000, status_text: 'On track', status_color: 'green' }] }], summary: { totalValue: 900000, totalDeals: 40 } }) } } },
  '/api/deals': {
    get: { tags: ['Pipeline & Deals'], summary: 'List deals (paginated, 25/page)', parameters: [qp('page', 'Page number', { type: 'integer', example: 1 })], responses: { 200: dataOk({ deals: [{ id: 1, title: 'Acme — CRM Deal', lead_name: 'Rahul Sharma', stage_name: 'Discovery', agent_name: 'Admin', value: 50000 }], total: 40, page: 1, lastPage: 2 }) } },
    post: {
      tags: ['Pipeline & Deals'],
      summary: 'Create a deal',
      description: CSRF_NOTE,
      requestBody: body({ title: 'Acme — CRM Deal', lead_id: 42, stage_id: 1, assigned_to: 1, value: 50000, probability: 40, expected_close_date: '2026-09-30', notes: 'Budget approved' }, true, 'title, lead_id, stage_id required'),
      responses: { 200: dataOk({ id: 1 }), 404: errRes('Lead not found.', { success: false, message: 'Lead not found.', errors: null }), 422: responses.Validation }
    }
  },
  '/api/deals/{id}': {
    get: { tags: ['Pipeline & Deals'], summary: 'Get a deal with activities and open tasks', parameters: [pp('id', 'Deal id')], responses: { 200: dataOk({ deal: { id: 1, title: 'Acme — CRM Deal', status: 'open', value: 50000, lead_name: 'Rahul Sharma', stage_name: 'Discovery', assigned_name: 'Admin' }, activities: [{ id: 1, type: 'note', body: 'Called, interested', user_name: 'Admin', created_at: '2026-08-06T10:00:00.000Z' }], tasks: [{ id: 2, title: 'Send proposal', assigned_name: 'Admin' }], stages: [{ id: 1, name: 'Discovery' }], agents: [{ id: 1, name: 'Admin' }] }), 404: responses.NotFound } },
    patch: { tags: ['Pipeline & Deals'], summary: 'Update deal fields', description: CSRF_NOTE, parameters: [pp('id', 'Deal id')], requestBody: body({ title: 'Acme — CRM Deal (renewal)', value: 60000, probability: 60, expected_close: '2026-10-15', assigned_to: 1, notes: 'Updated forecast' }, true, 'All optional; at least one required'), responses: { 200: nullDataOk('Deal updated.'), 404: responses.NotFound, 422: errRes('Nothing to update.', { success: false, message: 'Nothing to update.', errors: null }) } }
  },
  '/api/deals/{id}/stage': { post: { tags: ['Pipeline & Deals'], summary: 'Move a deal to a different pipeline stage', description: CSRF_NOTE, parameters: [pp('id', 'Deal id')], requestBody: body({ stage_id: 2 }), responses: { 200: dataOk({ stage_name: 'Proposal Sent' }), 404: responses.NotFound } } },
  '/api/deals/{id}/note': { post: { tags: ['Pipeline & Deals'], summary: 'Add a note activity to a deal', description: CSRF_NOTE, parameters: [pp('id', 'Deal id')], requestBody: body({ subject: 'Call recap', body: 'Discussed pricing, follow up next week' }, false, 'Both optional (default Note / empty)'), responses: { 200: nullDataOk('Note added.'), 404: responses.NotFound } } },
  '/api/deals/{id}/task': { post: { tags: ['Pipeline & Deals'], summary: 'Create a task linked to a deal', description: CSRF_NOTE, parameters: [pp('id', 'Deal id')], requestBody: body({ title: 'Send proposal', assigned_to: 1, priority: 'high', due_at: '2026-08-10T12:00:00' }, true, 'title required; assigned_to defaults to caller; priority defaults medium'), responses: { 200: nullDataOk('Task created.'), 404: responses.NotFound } } },
  '/api/deals/{id}/meeting': { post: { tags: ['Pipeline & Deals'], summary: 'Schedule a meeting for a deal (also fires a score event)', description: CSRF_NOTE, parameters: [pp('id', 'Deal id')], requestBody: body({ title: 'Demo call', platform: 'Google Meet', meeting_url: 'https://meet.google.com/abc-defg-hij', scheduled_at: '2026-08-12T15:00:00', duration: 30 }, true, 'title, scheduled_at required; platform/meeting_url/duration optional'), responses: { 200: nullDataOk('Meeting scheduled.'), 404: responses.NotFound } } },
  '/api/deals/{id}/file': {
    post: {
      tags: ['Pipeline & Deals'],
      summary: 'Upload a file attachment to a deal',
      description: `\`multipart/form-data\`. Field name **file**. Allowed: pdf, doc, docx, xls, xlsx, png, jpg, jpeg, csv (max 10MB). ${CSRF_NOTE}`,
      parameters: [pp('id', 'Deal id')],
      requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } } } },
      responses: { 200: dataOk({ file: 'deal_1_1691234567890.pdf' }), 404: responses.NotFound, 422: errRes('Bad/missing file.', { success: false, message: 'File type not allowed.', errors: null }) }
    }
  },
  '/api/deals/{id}/won': { post: { tags: ['Pipeline & Deals'], summary: 'Mark a deal Won (moves to the Won stage, converts lead + enrollments, records revenue)', description: CSRF_NOTE, parameters: [pp('id', 'Deal id')], responses: { 200: nullDataOk('Deal marked as Won!') } } },
  '/api/deals/{id}/lost': { post: { tags: ['Pipeline & Deals'], summary: 'Mark a deal Lost', description: CSRF_NOTE, parameters: [pp('id', 'Deal id')], requestBody: body({ reason: 'Went with a competitor' }, false, 'Optional'), responses: { 200: nullDataOk('Deal marked as Lost.'), 404: responses.NotFound, 422: errRes('No Lost stage configured.', { success: false, message: 'No "Lost" pipeline stage is configured.', errors: null }) } } }
});

// ---------------------------------------------------------------------------
// Conversations, Tasks, Templates, Reports, Custom Reports, My Analyst
// ---------------------------------------------------------------------------
merge({
  '/api/conversations': {
    get: { tags: ['Conversations'], summary: 'List unified inbox threads (email/WhatsApp/SMS/RCS)', parameters: [qp('channel', 'all | email | whatsapp | sms | rcs'), qp('assigned', '"unassigned" to filter unclaimed threads'), qp('search', 'Search by lead name/company/email')], responses: { 200: dataOk({ conversations: [{ id: 1, channel: 'whatsapp', status: 'open', lead_name: 'Rahul Sharma', last_message_preview: 'Sounds good, thanks!', unread_count: 1, assigned_name: 'Admin' }], counts: { all: 40, email: 10, whatsapp: 20, sms: 5, rcs: 5, unassigned: 8 } }) } },
    post: {
      tags: ['Conversations'],
      summary: 'Start or continue a conversation with a lead (optionally sending the first message)',
      description: `If \`message\` or \`template_id\` is given, actually sends via the configured provider for that channel. ${CSRF_NOTE}`,
      requestBody: body({ lead_id: 42, channel: 'whatsapp', message: 'Hi Rahul, following up on our call', template_id: 3, integration_account_id: 1 }, true, 'lead_id required; channel defaults email; message/template_id/integration_account_id optional'),
      responses: { 200: dataOk({ id: 1, message: { id: 10, direction: 'out', body: 'Hi Rahul...' }, delivered: true }), 404: responses.NotFound, 422: errRes('Template required / daily limit reached / etc.', { success: false, message: 'A template is required to start a WhatsApp conversation.', errors: null }) }
    }
  },
  '/api/conversations/{id}/messages': {
    get: { tags: ['Conversations'], summary: 'Get full message history for a thread', parameters: [pp('id', 'Conversation id')], responses: { 200: dataOk({ conversation: { id: 1, channel: 'whatsapp', lead_name: 'Rahul Sharma' }, deal: { value: 50000, currency: 'INR', stage_name: 'Discovery' }, messages: [{ id: 10, direction: 'out', body: 'Hi Rahul...', status: 'delivered', created_at: '2026-08-06T10:00:00.000Z' }] }), 404: responses.NotFound } },
    post: { tags: ['Conversations'], summary: 'Send a reply in an existing thread', description: `Free-text replies on WhatsApp only work within the 24h customer-care window; outside it (or on RCS) a template is required. ${CSRF_NOTE}`, parameters: [pp('id', 'Conversation id')], requestBody: body({ body: 'Sure, sending the proposal now.' }), responses: { 200: dataOk({ message: { id: 11, direction: 'out', body: 'Sure, sending the proposal now.' }, delivered: true }), 404: responses.NotFound, 422: errRes('Send failed (template/limit).', { success: false, message: 'Daily send limit reached for this account.', errors: null }) } }
  },
  '/api/conversations/{id}/read': { post: { tags: ['Conversations'], summary: 'Mark a thread as read (clears unread badge)', description: CSRF_NOTE, parameters: [pp('id', 'Conversation id')], responses: { 200: nullDataOk('OK') } } },

  '/api/tasks': {
    get: { tags: ['Tasks'], summary: 'List my/team tasks with counts', parameters: [qp('status', 'open (default) | pending | overdue | completed'), qp('scope', 'mine (default) | all (managers/admins only)')], responses: { 200: dataOk({ tasks: [{ id: 1, title: 'Send proposal', lead_name: 'Rahul Sharma', assigned_name: 'Admin', due_at: '2026-08-10T12:00:00.000Z' }], counts: { mine: 5, overdue: 1, team: 20, completed: 40 } }) } },
    post: { tags: ['Tasks'], summary: 'Create a task', description: CSRF_NOTE, requestBody: body({ title: 'Send proposal', lead_id: 42, assigned_to: 1, description: 'Include pricing sheet', due_at: '2026-08-10T12:00:00' }, true, 'title required; rest optional (assigned_to defaults to caller)'), responses: { 200: dataOk({ id: 1 }), 422: errRes('Empty title.', { success: false, message: 'Task title required.', errors: null }) } }
  },
  '/api/tasks/{id}/done': { post: { tags: ['Tasks'], summary: 'Mark a task done', description: CSRF_NOTE, parameters: [pp('id', 'Task id')], responses: { 200: nullDataOk('Task marked done.'), 403: responses.Forbidden, 404: responses.NotFound } } },
  '/api/tasks/{id}': { delete: { tags: ['Tasks'], summary: 'Delete a task', description: CSRF_NOTE, parameters: [pp('id', 'Task id')], responses: { 200: nullDataOk('Task deleted.'), 403: responses.Forbidden, 404: responses.NotFound } } },

  '/api/templates': {
    get: { tags: ['Templates'], summary: 'List message templates', parameters: [qp('include_archived', '"1" to include archived templates'), qp('channel', 'email | whatsapp | rcs | sms'), qp('account_id', 'Filter by integration account id, or "none"'), qp('q', 'Search name/subject')], responses: { 200: dataOk({ templates: [{ id: 3, name: 'Welcome Email', channel: 'email', subject: 'Welcome!', status: 'active', used_in_count: 4 }], channel: '', search: '' }) } },
    post: {
      tags: ['Templates'],
      summary: '[Manager+] Create a template',
      description: `WhatsApp/RCS templates must supply \`wa_template_id\` (get it via /api/templates/wa-sync first — WhatsApp requires provider-approved templates). ${CSRF_NOTE}`,
      requestBody: body({ name: 'Welcome Email', body: 'Hi {{name}}, welcome to {{company}}!', channel: 'email', subject: 'Welcome!', variable_count: 2, status: 'active' }, true, 'name, body required; channel defaults email'),
      responses: { 200: dataOk({ id: 3 }), 403: responses.Forbidden, 422: errRes('Missing wa_template_id for WA/RCS channel.', { success: false, message: 'Please sync from Anantya to get the template ID.', errors: null }) }
    }
  },
  '/api/templates/wa-sync': { get: { tags: ['Templates'], summary: 'Sync approved WhatsApp/RCS templates from Anantya', description: 'Dry-run by default — pass `save=1` to actually upsert into the local templates table (and auto-archive local templates no longer present upstream).', parameters: [qp('channel', 'whatsapp (default) | rcs'), qp('account_id', 'Specific integration account id to sync from', { type: 'integer' }), qp('key', 'Override API key (else uses stored account/company/global key)'), qp('save', 'Pass "1" to persist changes; omit for preview only')], responses: { 200: dataOk({ imported: 4, skipped: 1, archived: 0, total: 5, templates: [{ waId: 'wa_123', name: 'welcome_message', status: 'APPROVED', variableCount: 2 }] }), 422: errRes('No API key configured.', { success: false, message: 'No WhatsApp API key configured.', errors: null }), 502: errRes('Anantya returned an error.', { success: false, message: 'Anantya API error: ...', errors: null }) } } },
  '/api/templates/{id}': {
    get: { tags: ['Templates'], summary: 'Get a single template', parameters: [pp('id', 'Template id')], responses: { 200: dataOk({ template: { id: 3, name: 'Welcome Email', channel: 'email', body: 'Hi {{name}}...' } }), 404: responses.NotFound } },
    patch: { tags: ['Templates'], summary: '[Manager+] Update a template', description: CSRF_NOTE, parameters: [pp('id', 'Template id')], requestBody: body({ name: 'Welcome Email v2', body: 'Hi {{name}}, welcome!', subject: 'Welcome!', wa_template_id: null, status: 'active' }, true, 'name, body required'), responses: { 200: nullDataOk('Template updated.'), 403: responses.Forbidden, 422: responses.Validation } },
    delete: { tags: ['Templates'], summary: '[Admin only] Delete a template', description: CSRF_NOTE, parameters: [pp('id', 'Template id')], responses: { 200: nullDataOk('Template deleted.'), 403: responses.Forbidden, 422: errRes('Template still in use by a workflow.', { success: false, message: 'Template is in use by a workflow step - cannot delete.', errors: null }) } }
  },

  '/api/reports/{type}': {
    get: {
      tags: ['Reports'],
      summary: 'Built-in analytics reports (funnel, drip, revenue, agents)',
      description: 'Omit `type` (or use an unknown value) to get back the list of available section keys instead of report data.',
      parameters: [{ name: 'type', in: 'path', required: false, description: 'funnel | drip | revenue | agents (omit for the section list)', schema: { type: 'string', enum: ['funnel', 'drip', 'revenue', 'agents'] } }],
      responses: { 200: dataOk({ stages: [{ name: 'Discovery', color: '#0d6efd', deals: 12, value: 600000 }], leadFunnel: [{ status: 'new', cnt: 120 }], totalLeads: 1200, totalWon: 210, convRate: 17.5 }, 'Shape depends on `type` — see description; default response is `{sections:["funnel","drip","revenue","agents"]}`') }
    }
  },

  '/api/custom-reports/counts': { get: { tags: ['Custom Reports'], summary: 'Tab counts for the Custom Reports page', responses: { 200: dataOk({ mine: 3, shared: 2, templates: 8, scheduled: 1 }) } } },
  '/api/custom-reports': {
    get: { tags: ['Custom Reports'], summary: 'List custom reports by tab', parameters: [qp('tab', 'mine (default) | templates | shared | scheduled')], responses: { 200: dataOk({ reports: [{ id: 1, name: 'Q3 Revenue by Source', data_source: 'revenue_by_source', visibility: 'private', status: 'live' }] }) } },
    post: {
      tags: ['Custom Reports'],
      summary: 'Create a custom report from a data-source template',
      description: `\`data_source\` must be one of: revenue_by_source, agent_leaderboard, funnel_dropoff, stalled_deals, lead_source_roi, drip_performance, response_time_sla, regional_breakdown. ${CSRF_NOTE}`,
      requestBody: body({ name: 'Q3 Revenue by Source', data_source: 'revenue_by_source', visibility: 'private', description: 'Revenue breakdown for Q3', status: 'live' }, true, 'name, data_source required'),
      responses: { 200: dataOk({ id: 1 }), 422: responses.Validation }
    }
  },
  '/api/custom-reports/export': { get: { tags: ['Custom Reports'], summary: 'Export the report list (current tab) as CSV', parameters: [qp('tab', 'mine (default) | templates | scheduled | shared')], responses: { 200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } } } } },
  '/api/custom-reports/{id}': {
    get: { tags: ['Custom Reports'], summary: 'Get one custom report\'s definition', parameters: [pp('id', 'Report id')], responses: { 200: dataOk({ report: { id: 1, name: 'Q3 Revenue by Source', data_source: 'revenue_by_source', owner_name: 'Admin' } }), 403: responses.Forbidden, 404: responses.NotFound } },
    patch: { tags: ['Custom Reports'], summary: 'Update a custom report (owner only)', description: CSRF_NOTE, parameters: [pp('id', 'Report id')], requestBody: body({ name: 'Q3 Revenue by Source (v2)', description: 'Updated', status: 'live', visibility: 'team' }, true, 'All optional; at least one required'), responses: { 200: nullDataOk('Updated.'), 403: responses.Forbidden, 404: responses.NotFound, 422: errRes('Nothing to update.', { success: false, message: 'Nothing to update.', errors: null }) } },
    delete: { tags: ['Custom Reports'], summary: 'Delete a custom report (owner only)', description: CSRF_NOTE, parameters: [pp('id', 'Report id')], responses: { 200: nullDataOk('Deleted.'), 403: responses.Forbidden, 404: responses.NotFound } }
  },
  '/api/custom-reports/{id}/data': { get: { tags: ['Custom Reports'], summary: 'Run a custom report and get its computed data', parameters: [pp('id', 'Report id')], responses: { 200: dataOk({ result: { rows: [{ source: 'Website', revenue: 500000 }] } }, 'Shape depends on the report\'s data_source'), 403: responses.Forbidden, 404: responses.NotFound } } },
  '/api/custom-reports/{id}/schedules': { post: { tags: ['Custom Reports'], summary: 'Schedule a recurring email delivery of this report (owner only)', description: CSRF_NOTE, parameters: [pp('id', 'Report id')], requestBody: body({ frequency: 'weekly', send_time: '09:00:00', day_of_week: 1, recipients: { type: 'users', user_ids: [1, 2] } }, true, 'All optional — frequency defaults weekly, send_time defaults 09:00:00'), responses: { 200: dataOk({ id: 1 }), 403: responses.Forbidden, 404: responses.NotFound } } },
  '/api/custom-reports/{id}/schedules/{sid}': {
    patch: { tags: ['Custom Reports'], summary: 'Update a report schedule (owner only)', description: CSRF_NOTE, parameters: [pp('id', 'Report id'), pp('sid', 'Schedule id')], requestBody: body({ status: 'paused', frequency: 'monthly', day_of_month: 1 }, true, 'All optional'), responses: { 200: nullDataOk('Updated.'), 403: responses.Forbidden, 404: responses.NotFound } },
    delete: { tags: ['Custom Reports'], summary: 'Delete a report schedule (owner only)', description: CSRF_NOTE, parameters: [pp('id', 'Report id'), pp('sid', 'Schedule id')], responses: { 200: nullDataOk('Deleted.'), 403: responses.Forbidden, 404: responses.NotFound } }
  },

  '/api/analyst/sessions': {
    get: { tags: ['My Analyst (AI)'], summary: 'List my AI-analyst chat sessions', responses: { 200: dataOk({ sessions: [{ id: 1, title: 'Why did leads drop last week?', first_message: 'Why did leads drop last week?', updated_at: '2026-08-06T10:00:00.000Z' }] }) } },
    post: { tags: ['My Analyst (AI)'], summary: 'Start a new AI-analyst chat session', description: CSRF_NOTE, responses: { 200: dataOk({ id: 5 }) } }
  },
  '/api/analyst/sessions/{id}/messages': {
    get: { tags: ['My Analyst (AI)'], summary: 'Get a session\'s message history', parameters: [pp('id', 'Session id')], responses: { 200: dataOk({ session: { id: 5, title: 'Why did leads drop last week?' }, messages: [{ id: 1, role: 'user', content: 'Why did leads drop last week?' }, { id: 2, role: 'assistant', content: 'Looking at your data...' }] }), 404: responses.NotFound } },
    post: {
      tags: ['My Analyst (AI)'],
      summary: 'Ask the AI analyst a question in this session',
      description: `Calls the company's configured AI provider (Settings → Integrations → AI) with CRM data as context. Effectively never returns an HTTP error once the session exists — a friendly fallback message is returned as the assistant reply if the AI provider isn't configured or errors. ${CSRF_NOTE}`,
      parameters: [pp('id', 'Session id')],
      requestBody: body({ message: 'Why did leads drop last week?' }),
      responses: { 200: dataOk({ id: 2, role: 'assistant', content: 'Looking at your data, lead volume from Website dropped 20%...' }), 404: responses.NotFound, 422: errRes('Empty message.', { success: false, message: 'Message required.', errors: null }) }
    }
  },
  '/api/analyst/sessions/{id}': { delete: { tags: ['My Analyst (AI)'], summary: 'Delete an AI-analyst session', description: CSRF_NOTE, parameters: [pp('id', 'Session id')], responses: { 200: nullDataOk('Deleted.'), 404: responses.NotFound } } }
});

// ---------------------------------------------------------------------------
// Settings (admin only) — general/users/integrations/sources/pipeline
// ---------------------------------------------------------------------------
const settingsExample = {
  app_name: 'Dot Domino CRM', timezone: 'Asia/Kolkata', currency: 'INR',
  smtp_host: 'smtp.gmail.com', smtp_port: '587', smtp_user: 'noreply@company.com', smtp_pass: 'app-password', smtp_from: 'noreply@company.com', smtp_from_name: 'Dot Domino CRM',
  wa_api_token: 'anantya-api-key', wa_phone_id: '919999999999',
  sms_provider: 'mshastra', sms_mshastra_user: 'user', sms_mshastra_pwd: 'pass', sms_mshastra_sender: 'DOTDOM',
  ai_enabled: '1', ai_api_url: 'https://api.openai.com/v1/chat/completions', ai_api_key: 'sk-...', ai_model: 'gpt-4o-mini',
  score_email_open: '5', score_email_click: '10', score_meeting_booked: '20', score_purchase_completed: '50',
  goal_monthly_revenue: '1000000', goal_monthly_deals: '50', goal_monthly_leads: '500', goal_monthly_demos: '30'
};

merge({
  '/api/settings': {
    get: { tags: ['Settings — General'], summary: '[Admin only] Get all general/SMTP/AI/scoring/goal settings', description: 'Secret values (SMTP password, API keys, etc.) are decrypted and returned in plaintext — this endpoint is admin-only for that reason.', responses: { 200: dataOk({ settings: settingsExample, rows: [{ key: 'app_name', value: 'Dot Domino CRM', group: 'general' }] }), 403: responses.Forbidden } },
    post: {
      tags: ['Settings — General'],
      summary: '[Admin only] Save general/SMTP/AI/scoring/goal settings',
      description: `Send any subset of known keys (see the GET response for the full key list — covers app/timezone/currency, SMTP, IMAP, WhatsApp, SMS (mshastra or generic), RCS, lead-scoring point values, AI provider config, and monthly goals). Keys matching \`*_pass|*_pwd|*_key|*_secret|*_token\` are AES-256-GCM encrypted at rest. ${CSRF_NOTE}`,
      requestBody: body(settingsExample, true, 'Partial update — send only keys you want to change'),
      responses: { 200: nullDataOk('Settings saved.'), 403: responses.Forbidden }
    }
  },
  '/api/settings/api-key': {
    get: {
      tags: ['Settings — General'],
      summary: '[Admin only] Get this company\'s API key (used to authenticate POST /ingest/:source)',
      description: 'One key per company (workspace), not per user — every team member, invited or original, shares this same value. Auto-generated when the company was created; this endpoint just reads it back (and lazily generates one on the rare pre-migration company that somehow doesn\'t have one yet).',
      responses: { 200: dataOk({ api_key: 'ddk_2444e6c496c8ad4221e1b7dd0ebd5a17b45ecdc71fa6dd86' }), 403: responses.Forbidden }
    }
  },
  '/api/settings/api-key/regenerate': {
    post: {
      tags: ['Settings — General'],
      summary: '[Admin only] Regenerate this company\'s API key',
      description: `Immediately invalidates the old key — any integration still using it starts getting 401 from POST /ingest/:source until updated with the new one. ${CSRF_NOTE}`,
      responses: { 200: dataOk({ api_key: 'ddk_b0a412ce094063445fad98344ca718bbc1756b5322bfd4e3' }, 'New key', 'API key regenerated — update any integrations still using the old one.'), 403: responses.Forbidden }
    }
  },
  '/api/settings/users': {
    get: { tags: ['Settings — Users & Team'], summary: '[Admin only] List company users', responses: { 200: dataOk({ users: [{ id: 1, name: 'Admin', email: 'admin@dotdomino.com', role: 'superadmin', status: 'active', is_active: 1, company_role: 'admin' }] }), 403: responses.Forbidden } },
    post: { tags: ['Settings — Users & Team'], summary: '[Admin only] Create a user directly with a password (no invite email)', description: CSRF_NOTE, requestBody: body({ name: 'New Agent', email: 'agent@company.com', password: 'TempPass123', role: 'agent' }, true, 'name, email, password required; role defaults agent'), responses: { 200: dataOk({ id: 6 }), 403: responses.Forbidden, 422: errRes('Email already exists.', { success: false, message: 'A user with this email already exists.', errors: null }) } }
  },
  '/api/settings/users/invite': {
    post: { tags: ['Settings — Users & Team'], summary: '[Admin only] Invite a teammate by email (sends a set-password link if SMTP is configured)', description: `role must be one of agent|manager|admin (defaults agent). ${CSRF_NOTE}`, requestBody: body({ name: 'New Manager', email: 'manager@company.com', role: 'manager' }), responses: { 200: dataOk({ id: 6, invite_url: '(development only) http://localhost:5173/accept-invite/...', email_sent: true }), 403: responses.Forbidden, 422: errRes('Already a member, or member of another company.', { success: false, message: 'This email is already a member of your team.', errors: null }) } }
  },
  '/api/settings/users/{id}': {
    patch: { tags: ['Settings — Users & Team'], summary: '[Admin only] Update a team member (name/role/active/password)', description: CSRF_NOTE, parameters: [pp('id', 'User id')], requestBody: body({ name: 'Updated Name', role: 'manager', is_active: true, password: 'OnlyIfChangingPw' }, true, 'All optional; password only applied if ≥8 chars'), responses: { 200: nullDataOk('User updated.'), 403: responses.Forbidden, 404: responses.NotFound } }
  },
  '/api/settings/integrations': {
    get: { tags: ['Settings — Integrations & Sources'], summary: '[Admin only] Get all third-party provider credentials + webhook keys', description: 'Lazily generates a stable webhook key per lead-source provider (IndiaMart, TradeIndia, Meta, Google Ads, JustDial, Bombora, G2 Intent) the first time this is called.', responses: { 200: dataOk({ integrations: [{ id: 1, type: 'email', name: 'SMTP', is_active: 1 }], settings: { indiamart_webhook_key: 'abcd1234...', meta_webhook_key: 'efgh5678...' } }), 403: responses.Forbidden } },
    post: {
      tags: ['Settings — Integrations & Sources'],
      summary: '[Admin only] Save third-party provider credentials',
      description: `Covers ~60 possible keys across email/whatsapp/sms/rcs/voice/lead-source/AI providers (e.g. sendgrid_key, wa_meta_token, wa_gupshup_api_key, twilio_account_sid, indiamart_key, meta_ads_token, shopify_admin_token, hubspot_access_token, mailchimp_api_key, zendesk_api_token, apollo_api_key, lusha_api_key, zoominfo_api_key, ai_api_key, ...). Send only the subset you're changing; secret-shaped keys are encrypted at rest. ${CSRF_NOTE}`,
      requestBody: body({ twilio_account_sid: 'ACxxxxxxxx', twilio_auth_token: 'xxxxxxxx', indiamart_key: 'xxxx', meta_ads_token: 'xxxx' }, true, 'Partial update — provider-credential keys, see description'),
      responses: { 200: nullDataOk('Integrations saved.'), 403: responses.Forbidden }
    }
  },
  '/api/settings/sources/{slug}/sync': {
    post: {
      tags: ['Settings — Integrations & Sources'],
      summary: '[Admin only] Manually trigger a pull-sync for a lead/intent source',
      description: `slug: indiamart | tradeindia | linkedin | justdial | apollo | lusha | zoominfo (lead sources, returns imported count) or bombora | g2_intent (intent signals, returns created task count). Webhook-only sources return 404. ${CSRF_NOTE}`,
      parameters: [pp('slug', 'Source slug', 'string')],
      responses: { 200: dataOk({ imported: 12 }, 'Shape varies: {imported} for lead sources, {created,total} for intent sources'), 403: responses.Forbidden, 404: responses.NotFound, 422: errRes('Sync failed.', { success: false, message: 'API key not configured for this source.', errors: null }) }
    }
  },
  '/api/settings/channel-metrics': { get: { tags: ['Settings — Integrations & Sources'], summary: '[Admin only] Delivery/open/click rates for one channel', parameters: [qp('channel', 'email (default) | whatsapp | sms | rcs | call')], responses: { 200: dataOk({ sent: 900, delivered: 890, delivery_rate: 98.9, open_rate: 42.5, click_rate: 12.1 }), 403: responses.Forbidden } } },
  '/api/settings/test-sms': { post: { tags: ['Settings — Integrations & Sources'], summary: '[Admin only] Send a test SMS to verify provider config', description: CSRF_NOTE, requestBody: body({ mobile: '+919999999999', message: 'Test message from Dot Domino CRM' }, true, 'mobile required; message optional'), responses: { 200: dataOk({ provider: 'mshastra', messageId: 'abc123' }), 403: responses.Forbidden, 422: errRes('Provider not configured / bad mobile.', { success: false, message: 'SMS provider is not configured.', errors: null }), 502: errRes('Provider returned an error.', { success: false, message: 'SMS error: ...', errors: null }) } } },
  '/api/settings/integration-accounts': {
    get: { tags: ['Settings — Integrations & Sources'], summary: '[Admin only] List named integration accounts (e.g. multiple WhatsApp numbers)', responses: { 200: dataOk({ accounts: [{ id: 1, name: 'Main WhatsApp', provider: 'anantya', channel: 'whatsapp', is_active: 1, sent_today: 120, daily_send_limit: 1000, webhook_key: 'wa_key_abcd1234' }] }), 403: responses.Forbidden } },
    post: {
      tags: ['Settings — Integrations & Sources'],
      summary: '[Admin only] Create or update a named integration account',
      description: `Pass \`id\` to update an existing account, omit to create new. \`config\` is an arbitrary credential blob (encrypted at rest) — its shape depends on \`provider\`. ${CSRF_NOTE}`,
      requestBody: body({ name: 'Main WhatsApp', provider: 'anantya', channel: 'whatsapp', external_account_id: '919999999999', daily_send_limit: 1000, config: { api_key: 'xxxx' }, is_active: true }, true, 'name, provider required; channel defaults other'),
      responses: { 200: dataOk({ id: 1, webhook_key: 'wa_key_abcd1234' }), 403: responses.Forbidden, 404: responses.NotFound, 422: errRes('Invalid channel.', { success: false, message: 'Invalid channel.', errors: null }) }
    }
  },
  '/api/settings/integration-accounts/{id}': { delete: { tags: ['Settings — Integrations & Sources'], summary: '[Admin only] Delete an integration account', description: CSRF_NOTE, parameters: [pp('id', 'Account id')], responses: { 200: nullDataOk('Integration account deleted.'), 403: responses.Forbidden } } },
  '/api/settings/sources': { get: { tags: ['Settings — Integrations & Sources'], summary: '[Admin only] List all lead sources with health/volume stats', description: 'Includes the decrypted `api_key` in plaintext for each source (admin-only for that reason).', responses: { 200: dataOk({ sources: [{ id: 1, name: 'IndiaMart', slug: 'indiamart', lead_count: 340, leads_this_month: 40, success_rate: 92.5, status: 'healthy', webhook_key: 'im_key_abcd', api_key: 'xxxx' }] }), 403: responses.Forbidden } } },
  '/api/settings/sources/{id}/config': { post: { tags: ['Settings — Integrations & Sources'], summary: '[Admin only] Save an API key for a lead source (creates/updates its integration account)', description: CSRF_NOTE, parameters: [pp('id', 'lead_sources.id')], requestBody: body({ api_key: 'xxxx' }, false, 'Optional — empty string clears it'), responses: { 200: dataOk({ id: 12 }), 403: responses.Forbidden, 404: responses.NotFound } } },
  '/api/settings/sources/{id}/test': { post: { tags: ['Settings — Integrations & Sources'], summary: '[Admin only] Check a lead source is configured (config-presence check, not a live network test)', description: CSRF_NOTE, parameters: [pp('id', 'lead_sources.id')], responses: { 200: dataOk({ webhook_url: 'https://panel.trringme.com/webhook/indiamart/im_key_abcd' }), 403: responses.Forbidden, 404: responses.NotFound, 422: errRes('Not configured.', { success: false, message: 'No API key configured for this source.', errors: null }) } } },
  '/api/settings/pipeline': {
    get: { tags: ['Settings — Pipeline Stages'], summary: '[Admin only] List pipeline stages', responses: { 200: dataOk({ stages: [{ id: 1, name: 'Discovery', stage_order: 1, color: '#0d6efd', is_won: 0, is_lost: 0, is_active: 1 }] }), 403: responses.Forbidden } },
    post: { tags: ['Settings — Pipeline Stages'], summary: '[Admin only] Save the full stage list (bulk upsert)', description: `Each item with an \`id\` is updated, items without \`id\` are inserted. Does not modify is_won/is_lost/is_active flags. ${CSRF_NOTE}`, requestBody: body({ stages: [{ id: 1, name: 'Discovery', color: '#0d6efd', stage_order: 1 }, { name: 'New Stage', color: '#6c757d', stage_order: 2 }] }), responses: { 200: nullDataOk('Pipeline stages saved.'), 403: responses.Forbidden } }
  },
  '/api/settings/pipeline/{id}': { delete: { tags: ['Settings — Pipeline Stages'], summary: '[Admin only] Delete a pipeline stage (blocked if deals reference it)', description: CSRF_NOTE, parameters: [pp('id', 'Stage id')], responses: { 200: nullDataOk('Pipeline stage deleted.'), 403: responses.Forbidden, 404: responses.NotFound, 409: errRes('Deals still reference this stage.', { success: false, message: 'Cannot delete — 4 deal(s) are in this stage.', errors: null }) } } },

  '/api/settings/ai-agents': {
    get: { tags: ['AI Agents'], summary: '[Admin only] List configured AI conversational agents', responses: { 200: dataOk({ agents: [{ id: 1, name: 'Lead Qualifier Bot', status: 'active', model: 'gpt-4o-mini', handoff_user_name: 'Admin', knowledge_count: 5 }] }), 403: responses.Forbidden } },
    post: { tags: ['AI Agents'], summary: '[Admin only] Create an AI agent', description: CSRF_NOTE, requestBody: body({ name: 'Lead Qualifier Bot', status: 'draft', model: 'gpt-4o-mini', system_prompt: 'You qualify inbound leads for a CRM company...', qualification_rules: { min_budget: 10000 }, handoff_user_id: 1 }, true, 'name required; status defaults draft'), responses: { 200: dataOk({ id: 1 }), 403: responses.Forbidden, 422: errRes('Empty name.', { success: false, message: 'Name is required.', errors: null }) } }
  },
  '/api/settings/ai-agents/{id}': { patch: { tags: ['AI Agents'], summary: '[Admin only] Update an AI agent', description: CSRF_NOTE, parameters: [pp('id', 'Agent id')], requestBody: body({ name: 'Lead Qualifier Bot', status: 'active', model: 'gpt-4o-mini', system_prompt: '...', qualification_rules: {}, handoff_user_id: 1 }), responses: { 200: nullDataOk('Updated.'), 403: responses.Forbidden, 404: responses.NotFound } } },
  '/api/settings/ai-agents/{id}/knowledge': {
    get: { tags: ['AI Agents'], summary: '[Admin only] List an agent\'s knowledge-base items', parameters: [pp('id', 'Agent id')], responses: { 200: dataOk({ items: [{ id: 1, title: 'Pricing FAQ', content: 'Our plans start at...', is_active: true }] }), 403: responses.Forbidden, 404: responses.NotFound } },
    post: { tags: ['AI Agents'], summary: '[Admin only] Add a knowledge-base item to an agent', description: CSRF_NOTE, parameters: [pp('id', 'Agent id')], requestBody: body({ title: 'Pricing FAQ', content: 'Our plans start at ₹999/month...' }), responses: { 200: dataOk({ id: 3 }), 403: responses.Forbidden, 404: responses.NotFound, 422: responses.Validation } }
  },
  '/api/settings/ai-agents/{id}/preview': { post: { tags: ['AI Agents'], summary: '[Admin only] Test an agent with a sample message (no real lead affected)', description: CSRF_NOTE, parameters: [pp('id', 'Agent id')], requestBody: body({ message: 'Hi, I want to know pricing' }), responses: { 200: dataOk({ handled: true, reply: 'Our plans start at ₹999/month, would you like a demo?' }), 403: responses.Forbidden, 422: errRes('Empty message.', { success: false, message: 'Message is required.', errors: null }) } } },

  '/api/settings/apps': { get: { tags: ['Third-Party Apps'], summary: '[Admin only] List connectable third-party apps (HubSpot, Salesforce, Mailchimp, Zendesk, Shopify, Google Sheets)', responses: { 200: dataOk({ apps: [{ slug: 'hubspot', name: 'HubSpot', type: 'crm', connected: false, status: 'inactive', config: null }] }), 403: responses.Forbidden } } },
  '/api/settings/apps/{slug}/connect': { post: { tags: ['Third-Party Apps'], summary: '[Admin only] Connect an app with API-key credentials (non-OAuth apps only)', description: `google_sheets and salesforce are OAuth-only — use GET /oauth/{provider} instead of this endpoint for those. ${CSRF_NOTE}`, parameters: [pp('slug', 'App slug (hubspot | mailchimp | zendesk | shopify | ...)', 'string')], requestBody: body({ api_key: 'xxxx', domain: 'mystore.myshopify.com' }, true, 'Fields vary per app — see the app\'s Connect form in Settings → Integrations'), responses: { 200: dataOk({ id: 1 }), 400: errRes('This app requires OAuth.', { success: false, message: 'Connect Salesforce via OAuth instead.', errors: null }), 404: responses.NotFound, 422: errRes('Connect failed.', { success: false, message: '...', errors: null }) } } },
  '/api/settings/apps/{slug}/disconnect': { post: { tags: ['Third-Party Apps'], summary: '[Admin only] Disconnect an app', description: CSRF_NOTE, parameters: [pp('slug', 'App slug', 'string')], responses: { 200: nullDataOk('Disconnected.'), 404: responses.NotFound } } },
  '/api/settings/apps/{slug}/sync': { post: { tags: ['Third-Party Apps'], summary: '[Admin only] Trigger a manual sync for a connected app', description: CSRF_NOTE, parameters: [pp('slug', 'App slug', 'string')], responses: { 200: dataOk({ imported: 8 }), 404: responses.NotFound, 422: errRes('Not connected.', { success: false, message: 'Connect HubSpot before syncing.', errors: null }) } } },
  '/api/settings/apps/google-sheets/connections': {
    get: { tags: ['Third-Party Apps'], summary: '[Admin only] List connected Google Sheets', responses: { 200: dataOk({ connections: [{ id: 1, sheet_name: 'Website Leads', sheet_id: '1abc...', last_synced_at: '2026-08-06T10:00:00.000Z' }] }), 403: responses.Forbidden } },
    post: { tags: ['Third-Party Apps'], summary: '[Admin only] Add a Google Sheet to sync from', description: `Requires Google Sheets to already be connected via GET /oauth/google_sheets first. ${CSRF_NOTE}`, requestBody: body({ sheet_url: 'https://docs.google.com/spreadsheets/d/1abc.../edit', sheet_name: 'Website Leads', column_mapping: { A: 'name', B: 'email', C: 'mobile' } }), responses: { 200: dataOk({ id: 2 }), 422: errRes('Invalid sheet/connect failure.', { success: false, message: '...', errors: null }) } }
  },
  '/api/settings/apps/google-sheets/connections/{id}': {
    put: { tags: ['Third-Party Apps'], summary: '[Admin only] Update a Google Sheet connection', description: CSRF_NOTE, parameters: [pp('id', 'Connection id')], requestBody: body({ sheet_name: 'Website Leads (renamed)', column_mapping: { A: 'name', B: 'email' } }), responses: { 200: nullDataOk('Sheet updated.'), 422: errRes('Update failed.', { success: false, message: '...', errors: null }) } },
    delete: { tags: ['Third-Party Apps'], summary: '[Admin only] Remove a Google Sheet connection', description: CSRF_NOTE, parameters: [pp('id', 'Connection id')], responses: { 200: nullDataOk('Sheet removed.') } }
  },
  '/api/settings/apps/google-sheets/connections/{id}/sync': { post: { tags: ['Third-Party Apps'], summary: '[Admin only] Manually sync one Google Sheet now', description: CSRF_NOTE, parameters: [pp('id', 'Connection id')], responses: { 200: dataOk({ imported: 5 }), 422: errRes('Sync failed.', { success: false, message: '...', errors: null }) } } },

  '/api/voice/token': { get: { tags: ['Voice (Twilio)'], summary: 'Get a Twilio Voice client token for browser-based calling (agent role or above)', description: 'Returns `{configured:false}` (not an error) if Voice isn\'t set up for this company — the frontend uses this to silently skip call-widget registration.', responses: { 200: dataOk({ configured: true, token: 'eyJhbGciOi...', identity: 'user_1' }), 403: responses.Forbidden } } }
});

// ---------------------------------------------------------------------------
// Public / unauthenticated routes — lead ingest, webhooks, tracking, capture,
// OAuth, cron, shared reports. Mounted with NO /api prefix.
// ---------------------------------------------------------------------------
merge({
  '/ingest/{source}': {
    post: {
      tags: ['Public — Lead Ingest'],
      summary: 'Push a lead in from an external system (Zapier, custom scripts, etc.)',
      description: 'Requires an `Authorization: Bearer <key>` header (not the session cookie/CSRF flow the rest of this API uses). Get your key from Settings → General → API Key (`GET /api/settings/api-key`) — it\'s one key per company, shared by every team member (invited or original), and a match automatically attaches the lead to that company (no need to pass a company id yourself). A legacy install-wide token (`API_TOKEN` in the server `.env`) is still accepted for older integrations, but it doesn\'t resolve a company on its own. `source` must match an existing lead source slug (see Settings → Sources for slugs). Field names are flexible — common aliases are accepted (e.g. `phone`/`phone_number` both map to mobile).',
      security: [],
      parameters: [pp('source', 'Lead source slug, e.g. "website", "zapier"', 'string'), { name: 'Authorization', in: 'header', required: true, description: 'Bearer <your company API key>', schema: { type: 'string', example: 'Bearer ddk_2444e6c496c8ad4221e1b7dd0ebd5a17b45ecdc71fa6dd86' } }],
      requestBody: body({ name: 'Rahul Sharma', email: 'rahul@example.com', mobile: '9999999999', company_name: 'Acme Inc', job_title: 'CTO', product: 'CRM Software', campaign: 'summer-promo', lead_id: 'external-ref-123' }, true, 'name; email or mobile; everything else optional — see description for accepted aliases'),
      responses: { 200: dataOk({ lead_id: 42, is_duplicate: false }), 401: errRes('Missing/invalid bearer token.', { success: false, message: 'Invalid API token.', errors: null }), 404: errRes('Unknown source slug.', { success: false, message: 'Unknown source: zapier', errors: null }), 422: responses.Validation }
    }
  },
  '/webhook/{source}': {
    post: {
      tags: ['Public — Webhooks'],
      summary: 'Inbound webhook receiver for third-party integrations',
      description: 'Provider-specific: source is one of shopify, hubspot, mailchimp, zendesk, indiamart, tradeindia, meta (or meta_leads), google_ads, justdial, bombora, g2_intent, anantya, or a custom-configured integration account. Auth differs per provider — HMAC signature header (Shopify: `X-Shopify-Hmac-Sha256`; generic accounts: `X-Hub-Signature-256`/`X-Webhook-Signature`/`X-Signature`), or `X-Api-Key` for Anantya\'s default route, or none for URL-keyed routes (see `/webhook/{source}/{webhookKey}`). Every call is logged to `webhook_logs` regardless of outcome, and this endpoint always responds 200 (even on internal failure) to avoid provider retry storms.',
      security: [],
      parameters: [pp('source', 'Provider slug', 'string')],
      requestBody: { required: false, content: { 'application/json': { schema: { type: 'object' }, description: 'Raw provider payload — shape is provider-defined' } } },
      responses: { 200: json({ type: 'object' }, { status: 'ok', events_received: 1, events_recorded: 1, inbound_recorded: 0 }), 401: errRes('Bad/missing signature or API key.', { success: false, message: 'Invalid webhook signature.', errors: null }), 403: errRes('GET verification handshake token mismatch.', { success: false, message: 'Verification failed', errors: null }), 404: errRes('Unknown webhook key.', { success: false, message: 'Webhook endpoint not found.', errors: null }) }
    },
    get: { tags: ['Public — Webhooks'], summary: 'Webhook verification handshake (Meta/WhatsApp-style hub.challenge)', security: [], parameters: [pp('source', 'Provider slug', 'string'), qp('hub.mode', 'Must be "subscribe"'), qp('hub.verify_token', 'Compared against the configured verify token'), qp('hub.challenge', 'Echoed back as plain text on success')], responses: { 200: { description: 'Plain-text echo of hub.challenge (or {status:"ok"} JSON for the anantya source)', content: { 'text/plain': { schema: { type: 'string' } } } }, 403: errRes('Token mismatch.', { success: false, message: 'Verification failed', errors: null }) } }
  },
  '/webhook/{source}/{webhookKey}': {
    post: {
      tags: ['Public — Webhooks'],
      summary: 'Inbound webhook receiver, URL-keyed to a specific integration account',
      description: 'Same behavior as `/webhook/{source}`, but resolves the target company/account via `webhookKey` (from Settings → Integrations, per-account webhook URL) instead of an API key header. If the account has a `webhook_secret` configured, non-GET requests must carry a matching HMAC-SHA256 signature.',
      security: [],
      parameters: [pp('source', 'Provider slug', 'string'), pp('webhookKey', 'Per-account webhook key from Settings → Integrations', 'string')],
      responses: { 200: json({ type: 'object' }, { status: 'ok', events_received: 1, events_recorded: 1, inbound_recorded: 0 }), 401: errRes('Bad signature.', { success: false, message: 'Invalid webhook signature.', errors: null }), 404: errRes('Unknown webhook key.', { success: false, message: 'Webhook endpoint not found.', errors: null }) }
    }
  },
  '/webhook/twilio/voice/inbound': { post: { tags: ['Public — Webhooks'], summary: 'Twilio "a call comes in" webhook (TwiML)', description: 'Called by Twilio, not by your app. Verified via `X-Twilio-Signature`. Responds with TwiML XML, not JSON.', security: [], responses: { 200: { description: 'TwiML XML', content: { 'text/xml': { schema: { type: 'string' } } } }, 403: errRes('Bad Twilio signature.', { success: false, message: 'Invalid Twilio signature.', errors: null }) } } },
  '/webhook/twilio/voice/browser-outbound': { post: { tags: ['Public — Webhooks'], summary: 'Twilio webhook for browser-initiated outbound calls (TwiML)', description: 'Called by Twilio when an agent places a call from the CRM\'s browser dialer. Responds with TwiML XML.', security: [], responses: { 200: { description: 'TwiML XML', content: { 'text/xml': { schema: { type: 'string' } } } }, 403: errRes('Bad Twilio signature.', { success: false, message: 'Invalid Twilio signature.', errors: null }) } } },
  '/webhook/twilio/voice/dial-status/{commId}': { post: { tags: ['Public — Webhooks'], summary: 'Twilio dial-status callback', description: 'Called by Twilio to report the outcome of a bridged call leg. No signature check. Always responds with an empty TwiML `<Response></Response>`.', security: [], parameters: [pp('commId', 'communications table row id linked to this call')], responses: { 200: { description: 'Empty TwiML', content: { 'text/xml': { schema: { type: 'string' } } } } } } },
  '/webhook/twilio/voice/recording-status/{commId}': { post: { tags: ['Public — Webhooks'], summary: 'Twilio recording-status callback', description: 'Called by Twilio once a call recording is ready. No signature check. Responds 200 with empty body.', security: [], parameters: [pp('commId', 'communications table row id linked to this call')], responses: { 200: { description: 'Empty 200 OK' } } } },

  '/track/open/{uid}': { get: { tags: ['Public — Tracking'], summary: 'Email open-tracking pixel (embedded in outbound email HTML)', description: 'Always returns a 1x1 transparent GIF with 200, regardless of whether the tracking id resolves — never surfaces an error to the email client.', security: [], parameters: [pp('uid', 'Opaque encoded tracking id', 'string')], responses: { 200: { description: '1x1 GIF pixel', content: { 'image/gif': { schema: { type: 'string', format: 'binary' } } } } } } },
  '/track/click/{uid}': { get: { tags: ['Public — Tracking'], summary: 'Email click-tracking redirect (embedded in outbound email links)', description: 'Records the click then 302-redirects to `url` (falls back to the app URL if `url` isn\'t a valid http(s) link). A resulting lead score ≥76 auto-promotes the lead to category "hot".', security: [], parameters: [pp('uid', 'Opaque encoded tracking id', 'string'), qp('url', 'Destination to redirect to after recording the click', { example: 'https://company.com/pricing' })], responses: { 302: { description: 'Redirect to the destination URL' } } } },

  '/qr/{source}': {
    get: { tags: ['Public — Lead Capture'], summary: 'Hosted lead-capture landing page (for QR codes / campaign links)', description: 'Returns a self-contained HTML form page, not JSON — this is the URL you\'d put behind a printed QR code.', security: [], parameters: [pp('source', 'Lead source slug', 'string')], responses: { 200: { description: 'HTML page', content: { 'text/html': { schema: { type: 'string' } } } }, 404: { description: 'Unknown source', content: { 'text/plain': { schema: { type: 'string' }, example: 'Lead source not found.' } } } } },
    post: { tags: ['Public — Lead Capture'], summary: 'Submit the QR/embed lead-capture form', security: [], parameters: [pp('source', 'Lead source slug', 'string')], requestBody: body({ name: 'Rahul Sharma', email: 'rahul@example.com', mobile: '9999999999', company: 'Acme Inc', product_interest: 'CRM Software' }, true, 'name required; rest optional — no field-name normalization (send exact field names)'), responses: { 200: dataOk({ lead_id: 42 }, 'Lead captured', 'Lead captured!'), 404: { description: 'Unknown source', content: { 'text/plain': { schema: { type: 'string' } } } }, 422: responses.Validation } }
  },
  '/capture/{source}': {
    get: { tags: ['Public — Lead Capture'], summary: 'Same as /qr/{source} — embeddable popup/landing-page/contact-form snippet', description: 'Identical handler to /qr/{source}; use whichever name reads better for the embed context (website popup vs. printed QR).', security: [], parameters: [pp('source', 'Lead source slug', 'string')], responses: { 200: { description: 'HTML page', content: { 'text/html': { schema: { type: 'string' } } } } } },
    post: { tags: ['Public — Lead Capture'], summary: 'Submit the website embed lead-capture form', security: [], parameters: [pp('source', 'Lead source slug', 'string')], requestBody: body({ name: 'Rahul Sharma', email: 'rahul@example.com', mobile: '9999999999' }), responses: { 200: dataOk({ lead_id: 42 }, 'Lead captured', 'Lead captured!'), 422: responses.Validation } }
  },

  '/api/public/reports/{token}': { get: { tags: ['Public — Shared Reports'], summary: 'View a custom report via its public share link', description: 'Only works for reports with `visibility="link"`. No authentication — the token itself is the credential, so treat it as a secret.', security: [], parameters: [pp('token', 'The report\'s share_token', 'string')], responses: { 200: dataOk({ report: { name: 'Q3 Revenue by Source', description: '...', data_source: 'revenue_by_source' }, result: { rows: [{ source: 'Website', revenue: 500000 }] } }), 404: responses.NotFound } } },

  '/oauth/{provider}': { get: { tags: ['Public — OAuth'], summary: '[Admin only] Start an OAuth connect flow, redirects to the provider\'s consent screen', description: 'provider: gmail | outlook | google_sheets | salesforce | linkedin. This is a browser-navigation endpoint (redirect), not meant to be called via fetch/XHR — link a "Connect" button\'s href directly to it.', parameters: [pp('provider', 'OAuth provider key', 'string')], responses: { 302: { description: 'Redirect to the provider\'s OAuth consent screen' }, 400: { description: 'Unknown provider', content: { 'text/plain': { schema: { type: 'string' } } } }, 403: responses.Forbidden } } },
  '/oauth/{provider}/callback': { get: { tags: ['Public — OAuth'], summary: '[Admin only] OAuth callback — exchanges the auth code and stores tokens', description: 'The provider redirects the browser here after consent; not meant to be called directly. Always redirects back to `/settings/integrations?oauth=connected&provider=...` (or `...?oauth=<error>&provider=...` on failure) — never returns JSON.', parameters: [pp('provider', 'OAuth provider key', 'string'), qp('code', 'Authorization code from the provider'), qp('state', 'CSRF state param, must match the session\'s stored value')], responses: { 302: { description: 'Redirect back into the app with an oauth= status query param' }, 403: responses.Forbidden } } },
  '/oauth/{provider}/revoke': { post: { tags: ['Public — OAuth'], summary: '[Admin only] Disconnect an OAuth-connected provider', description: CSRF_NOTE, parameters: [pp('provider', 'google_sheets | salesforce | linkedin | gmail | outlook', 'string')], responses: { 200: dataOk(null, 'Disconnected', '{provider} disconnected.'), 403: responses.Forbidden } } },

  '/cron/run': {
    post: {
      tags: ['Public — Cron'],
      summary: 'Trigger drip-campaign + scheduled-job processing (for an external cron service)',
      description: 'Intended to be called every ~1 minute by an external scheduler (e.g. cPanel/Hostinger cron, GitHub Actions) as a fallback/alternative to the in-process scheduler `server.js` already runs every 60s. Secret can be supplied via the `X-Cron-Secret` header (checked first), `secret` in the JSON body, or `?secret=` query param. **If `CRON_SECRET` is not set in the server .env, this endpoint runs with no authentication at all** — always set `CRON_SECRET` in production.',
      security: [],
      parameters: [
        qp('secret', 'Alternative to the X-Cron-Secret header/body field', { example: 'my-cron-secret' }),
        { name: 'X-Cron-Secret', in: 'header', required: false, description: 'Checked first, before the body/query secret field', schema: { type: 'string', example: 'my-cron-secret' } }
      ],
      requestBody: body({ secret: 'my-cron-secret' }, false, 'Optional — only needed if CRON_SECRET is configured and you\'re not using the header/query-param option instead'),
      responses: { 200: dataOk({ jobs: { processed: 12, errors: 0 }, drip: { processed: 34, errors: 0, skipped: 2 } }, 'Cron processed', 'Cron processed.'), 401: errRes('Wrong/missing secret (only enforced if CRON_SECRET is configured).', { success: false, message: 'Invalid cron secret.', errors: null }) }
    }
  }
});

export function buildOpenApiSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Dot Domino CRM API',
      version: '1.0.0',
      description: `The REST API lets you manage leads, campaigns, deals, conversations, tasks, templates, reports, and settings in Dot Domino CRM.

Parameters in GET requests are passed as query string. Parameters in POST/PATCH/PUT/DELETE requests are passed as a JSON-encoded request body. Almost every endpoint requires you to be logged in — the session cookie is sent automatically once you've signed in, plus an \`X-CSRF-Token\` header (get it from \`GET /api/auth/me\`) for anything that changes data.

One endpoint is different: \`POST /ingest/:source\` (for pushing leads in from Zapier or a custom script) is authorized with \`Authorization: Bearer <your API key>\` instead of a session.

**For getting your API Key, follow these steps:**
Step 1: Login to the CRM as an admin.
Step 2: Go to Settings → General.
Step 3: In the "API Key" section, click the eye icon to reveal your key (or "Regenerate" for a new one).

Base URL: \`${config.appUrl}\``
    },
    servers: [{ url: config.appUrl, description: config.env === 'production' ? 'Production' : 'Local dev (via Vite proxy)' }],
    tags: [
      { name: 'Auth' }, { name: 'Session & Meta' }, { name: 'Dashboard' }, { name: 'Notifications' }, { name: 'Companies' },
      { name: 'Leads' }, { name: 'Campaigns (Drip)' }, { name: 'Broadcasts' }, { name: 'Segments & Lists' }, { name: 'Company Directory' },
      { name: 'Pipeline & Deals' }, { name: 'Conversations' }, { name: 'Tasks' }, { name: 'Templates' }, { name: 'Reports' },
      { name: 'Custom Reports' }, { name: 'My Analyst (AI)' },
      { name: 'Settings — General' }, { name: 'Settings — Users & Team' }, { name: 'Settings — Integrations & Sources' }, { name: 'Settings — Pipeline Stages' },
      { name: 'AI Agents' }, { name: 'Third-Party Apps' }, { name: 'Voice (Twilio)' },
      { name: 'Public — Lead Ingest' }, { name: 'Public — Webhooks' }, { name: 'Public — Tracking' }, { name: 'Public — Lead Capture' }, { name: 'Public — Shared Reports' }, { name: 'Public — OAuth' }, { name: 'Public — Cron' }
    ],
    components: {
      // Deliberately just the one scheme here. /ingest/:source and /cron/run
      // use a bearer key / shared secret instead of the session cookie, but
      // those are documented as a plain header parameter on those two
      // operations (see below) rather than as their own securitySchemes
      // entries — every entry here shows up as a field in Swagger UI's
      // "Authorize" dialog, and since 120 of 122 endpoints only ever need the
      // cookie (already sent automatically once you're logged in), adding
      // schemes that only two endpoints use just clutters that dialog with
      // fields nobody browsing as a logged-in admin needs to fill in.
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'connect.sid', description: 'Session cookie set by POST /api/auth/login — sent automatically by the browser once you\'re logged in, nothing to fill in here. Mutating requests also need the X-CSRF-Token header (see the Authentication section in the top-level description).' }
      }
    },
    security: [{ cookieAuth: [] }],
    paths
  };
}
