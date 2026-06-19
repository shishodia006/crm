const BASE = import.meta.env.VITE_API_BASE ?? '';

let _csrfToken = null;

async function getCsrf() {
  if (_csrfToken) return _csrfToken;
  const res = await fetch(`${BASE}/api/auth/me`, { credentials: 'include' });
  // Try response header first, then parse body as fallback
  _csrfToken = res.headers.get('x-csrf-token') || '';
  if (!_csrfToken) {
    try {
      const data = await res.clone().json();
      _csrfToken = data?.data?.csrfToken || '';
    } catch (_) {}
  }
  return _csrfToken;
}

export function clearCsrf() {
  _csrfToken = null;
}

async function request(method, path, body, options = {}) {
  const headers = { ...options.headers };
  const isMutating = !['GET', 'HEAD'].includes(method.toUpperCase());

  if (isMutating && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    const token = await getCsrf();
    if (token) headers['x-csrf-token'] = token;
  } else if (isMutating) {
    const token = await getCsrf();
    if (token) headers['x-csrf-token'] = token;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body instanceof FormData
      ? body
      : body != null
        ? JSON.stringify(body)
        : undefined,
    ...options
  });

  // Refresh CSRF from response header if server rotated it
  const newToken = res.headers.get('x-csrf-token');
  if (newToken) _csrfToken = newToken;

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      errMsg = data.message || errMsg;
    } catch (_) {}
    const err = new Error(errMsg);
    err.status = res.status;
    throw err;
  }

  const text = await res.text();
  if (!text) return null;
  const parsed = JSON.parse(text);
  // Unwrap {success, message, data} envelope — return just the data payload
  return parsed?.data !== undefined ? parsed.data : parsed;
}

export const api = {
  get: (path, opts) => request('GET', path, null, opts),
  post: (path, body, opts) => request('POST', path, body, opts),
  patch: (path, body, opts) => request('PATCH', path, body, opts),
  put: (path, body, opts) => request('PUT', path, body, opts),
  delete: (path, opts) => request('DELETE', path, null, opts),
};
