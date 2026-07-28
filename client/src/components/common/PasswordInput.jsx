import { useState } from 'react';

export default function PasswordInput({ className = 'form-control', value, onChange, placeholder, name, readOnly }) {
  const [show, setShow] = useState(false);
  return (
    <div className="crm-pass-wrap">
      <input
        type={show ? 'text' : 'password'}
        className={className}
        name={name}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        // These are credential/API-key fields, not an account login/signup password —
        // autoComplete="off" alone is ignored by Chrome's password manager, which still
        // offers to auto-fill a generated "strong password" into any type="password"
        // field. The attributes below are what actually opts each field out (across
        // Chrome, 1Password, LastPass, Dashlane).
        autoComplete="one-time-code"
        data-1p-ignore="true"
        data-lpignore="true"
        data-form-type="other"
      />
      <button type="button" className="crm-pass-eye" tabIndex={-1} onClick={() => setShow((v) => !v)}>
        <i className={`bi bi-eye${show ? '-slash' : ''}`} />
      </button>
    </div>
  );
}
