export function formatDate(value, opts = {}) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', ...opts
  });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function money(amount, currency = 'INR') {
  const n = Number(amount);
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

export function scoreClass(score) {
  const n = Number(score) || 0;
  if (n >= 76) return 'danger';
  if (n >= 51) return 'warning';
  if (n >= 26) return 'info';
  return 'secondary';
}

export function scoreLabel(score) {
  const n = Number(score) || 0;
  if (n >= 76) return 'Hot';
  if (n >= 51) return 'Warm';
  if (n >= 26) return 'Cool';
  return 'Cold';
}

export function titleCase(str) {
  if (!str) return '';
  return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formDataObject(form) {
  const fd = new FormData(form);
  return Object.fromEntries(fd.entries());
}

export function truncate(str, max = 60) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

export function initials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
