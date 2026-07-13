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

export function moneyCompact(amount, currency = 'INR') {
  const n = Number(amount);
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(n);
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

export function timeAgo(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return '';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return formatDate(value);
}

export function pageRange(current, last) {
  const pages = [];
  const delta = 2;
  let prev = null;
  for (let i = 1; i <= last; i++) {
    if (i === 1 || i === last || (i >= current - delta && i <= current + delta)) {
      if (prev && i - prev > 1) pages.push('…');
      pages.push(i);
      prev = i;
    }
  }
  return pages;
}

export function initials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
