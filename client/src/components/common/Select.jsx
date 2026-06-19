export default function Select({ label, name, value, onChange, options = [], required, className = '' }) {
  return (
    <div className={`mb-3 ${className}`}>
      {label && <label className="form-label">{label}{required && ' *'}</label>}
      <select
        name={name}
        value={value ?? ''}
        onChange={onChange}
        required={required}
        className="form-select"
      >
        <option value="">— Select —</option>
        {options.map((opt) => {
          const val = typeof opt === 'object' ? opt.value : opt;
          const lbl = typeof opt === 'object' ? opt.label : opt;
          return <option key={val} value={val}>{lbl}</option>;
        })}
      </select>
    </div>
  );
}
