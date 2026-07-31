// Anantya's own error strings (e.g. "Unauthorized client") are account-level
// authorization failures, not something our code can retry or fix — surfaced
// as-is they just look like a broken feature. This appends a plain-language
// explanation so the sync/send UI tells the user what's actually wrong and
// what to do about it, instead of a bare provider error string.
export function explainAnantyaError(raw) {
  const msg = String(raw || '').trim() || 'Anantya error.';
  if (/unauthoriz/i.test(msg)) {
    return `${msg} — this Anantya account isn't authorized for this channel yet. Contact Anantya support to enable it, then Sync again.`;
  }
  return msg;
}
