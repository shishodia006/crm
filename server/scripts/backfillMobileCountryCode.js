// One-off data fix for leads created before PhoneField.jsx / normalizeMobile()
// existed: `leads.mobile` values saved without a `+<countrycode>` prefix (most
// likely via the old PATCH /api/leads/:id path, which wrote `mobile` straight
// through with no normalization — see leads.controller.js `update()`). Anantya
// silently rejects WhatsApp/RCS sends to a number with no country code, so any
// lead still in that state has been un-reachable via those channels.
//
// Usage:
//   node scripts/backfillMobileCountryCode.js          # apply the fix
//   node scripts/backfillMobileCountryCode.js --dry-run # preview only, no writes
//
// Only touches rows that are unambiguous: a bare 10-digit local number is
// assumed Indian (+91), matching the same default the rest of the app already
// uses (normalizeMobile in lead.service.js, comm.service.js's normalizePhone).
// Anything else (wrong digit count, already has letters, etc.) is left alone
// and printed for manual review rather than guessed at.

import { pool, q, run } from '../src/db/pool.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const rows = await q("SELECT id, mobile FROM leads WHERE mobile IS NOT NULL AND mobile <> '' AND mobile NOT LIKE '+%'");
  console.log(`[backfill] ${rows.length} lead(s) with a mobile number missing a country code.`);

  let fixed = 0;
  const skipped = [];
  for (const row of rows) {
    const digits = String(row.mobile).replace(/\D/g, '');
    if (!/^\d{10}$/.test(digits)) {
      skipped.push({ id: row.id, mobile: row.mobile });
      continue;
    }
    const next = `+91${digits}`;
    if (DRY_RUN) {
      console.log(`[backfill] (dry-run) lead #${row.id}: "${row.mobile}" -> "${next}"`);
    } else {
      await run('UPDATE leads SET mobile=?, mobile_valid=1 WHERE id=?', [next, row.id]);
    }
    fixed += 1;
  }

  console.log(`[backfill] ${DRY_RUN ? 'would fix' : 'fixed'} ${fixed} lead(s) (assumed India, +91).`);
  if (skipped.length) {
    console.log(`[backfill] ${skipped.length} lead(s) skipped — not a clean 10-digit number, needs manual review:`);
    for (const s of skipped) console.log(`  lead #${s.id}: "${s.mobile}"`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[backfill] failed:', err);
  process.exit(1);
});
