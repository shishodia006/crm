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
        autoComplete="off"
      />
      <button type="button" className="crm-pass-eye" tabIndex={-1} onClick={() => setShow((v) => !v)}>
        <i className={`bi bi-eye${show ? '-slash' : ''}`} />
      </button>
    </div>
  );
}
