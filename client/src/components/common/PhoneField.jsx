import { useState, useEffect, useMemo, useRef } from 'react';
import { getCountries, getCountryCallingCode, parsePhoneNumber } from 'react-phone-number-input';
import en from 'react-phone-number-input/locale/en.json';

const DEFAULT_COUNTRY = 'IN';

const ALL_COUNTRIES = getCountries()
  .map((code) => ({ code, name: en[code] || code, dial: getCountryCallingCode(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));

// Combines a country + national number into the E.164 string (`+<code><digits>`)
// that `leads.mobile` is stored as everywhere else in the app (validateLead's own
// 10-digit → +91 rule, and comm.service.js's Anantya send path) — building it here
// means every lead created/edited through this field is already in the exact shape
// WhatsApp/RCS sends expect, for any country, not just the previously-hardcoded +91.
function toE164(country, national) {
  const digits = String(national || '').replace(/\D/g, '');
  if (!digits) return '';
  return `+${getCountryCallingCode(country)}${digits}`;
}

const DROPDOWN_WIDTH = 280;
const EDGE_PADDING = 10;

export default function PhoneField({ value, onChange, placeholder = 'XXXXXXXXXX' }) {
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [national, setNational] = useState('');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownLeft, setDropdownLeft] = useState(0);
  const wrapRef = useRef(null);

  // Parses an incoming E.164 value (e.g. an existing lead loaded for edit) into
  // {country, national} for display.
  useEffect(() => {
    if (!value) { setNational(''); return; }
    try {
      const parsed = parsePhoneNumber(value);
      if (parsed) {
        setCountry(parsed.country || DEFAULT_COUNTRY);
        setNational(parsed.nationalNumber);
        return;
      }
    } catch { /* fall through — show whatever digits we can salvage below */ }
    setNational(String(value).replace(/^\+\d{1,3}/, '').replace(/\D/g, ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return ALL_COUNTRIES;
    return ALL_COUNTRIES.filter((c) => c.name.toLowerCase().includes(s) || c.dial.includes(s));
  }, [search]);

  const selected = ALL_COUNTRIES.find((c) => c.code === country) || ALL_COUNTRIES.find((c) => c.code === DEFAULT_COUNTRY);

  // The dropdown is wider (280px) than the field itself, which sits in a two-column
  // grid (e.g. the New Lead drawer's half-width Mobile field) — anchoring it at
  // `left: 0` let it spill past the drawer/card's own edge and forced the whole
  // panel to scroll sideways. Clamp it to whichever is tighter: the nearest drawer
  // /modal container, or the viewport, so it always stays fully visible instead.
  const toggleOpen = () => {
    if (open) { setOpen(false); return; }
    const fieldRect = wrapRef.current.getBoundingClientRect();
    const bounds = wrapRef.current.closest('.crm-drawer-body, .crm-drawer, .crm-modal-card') || document.body;
    const boundsRect = bounds.getBoundingClientRect();
    const maxRight = Math.min(boundsRect.right, window.innerWidth) - EDGE_PADDING;
    const minLeftAbs = Math.max(boundsRect.left, 0) + EDGE_PADDING;

    let offset = 0; // left-align with the field by default
    if (fieldRect.left + DROPDOWN_WIDTH > maxRight) offset = maxRight - (fieldRect.left + DROPDOWN_WIDTH);
    if (fieldRect.left + offset < minLeftAbs) offset = minLeftAbs - fieldRect.left;

    setDropdownLeft(offset);
    setOpen(true);
  };

  const pickCountry = (code) => {
    setCountry(code);
    setOpen(false);
    setSearch('');
    onChange(toE164(code, national));
  };

  const changeNumber = (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    setNational(digits);
    onChange(toE164(country, digits));
  };

  return (
    <div className="crm-phone-field" ref={wrapRef}>
      <div className="crm-phone-field-row">
        <button type="button" className="crm-phone-country-btn" onClick={toggleOpen}>
          +{selected?.dial}<i className="bi bi-chevron-down" />
        </button>
        <input
          type="tel"
          value={national}
          onChange={changeNumber}
          placeholder={placeholder}
          className="crm-input crm-phone-number-input"
        />
      </div>
      {open && (
        <div className="crm-phone-country-dropdown" style={{ left: dropdownLeft, width: DROPDOWN_WIDTH }}>
          <input
            autoFocus
            className="crm-input mb-1"
            placeholder="Search country…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="crm-phone-country-list">
            {filtered.length === 0 && <div className="text-muted text-12 text-center py-2">No match</div>}
            {filtered.map((c) => (
              <button
                type="button"
                key={c.code}
                className={`crm-phone-country-option${c.code === country ? ' active' : ''}`}
                onClick={() => pickCountry(c.code)}
              >
                <span className="text-truncate">{c.name}</span>
                <span className={c.code === country ? '' : 'text-muted-3'}>+{c.dial}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
