import { useState } from 'react';
import { useToast } from '../../hooks/useToast.js';

export default function QuickForm({ fields, onSubmit, submitLabel = 'Save', className = '' }) {
  const [form, setForm] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? '']))
  );
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (err) {
      toast(err.message || 'Error', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      {fields.map((f) => (
        <div key={f.name} className="mb-3">
          <label className="form-label">{f.label}{f.required && ' *'}</label>
          {f.type === 'select' ? (
            <select name={f.name} value={form[f.name]} onChange={handleChange} className="form-select" required={f.required}>
              <option value="">— Select —</option>
              {(f.options || []).map((opt) => {
                const v = typeof opt === 'object' ? opt.value : opt;
                const l = typeof opt === 'object' ? opt.label : opt;
                return <option key={v} value={v}>{l}</option>;
              })}
            </select>
          ) : f.type === 'textarea' ? (
            <textarea name={f.name} value={form[f.name]} onChange={handleChange} className="form-control" rows={3} required={f.required} />
          ) : (
            <input
              type={f.type || 'text'}
              name={f.name}
              value={form[f.name]}
              onChange={handleChange}
              className="form-control"
              required={f.required}
              placeholder={f.placeholder}
            />
          )}
        </div>
      ))}
      <button className="btn btn-primary" disabled={saving}>
        {saving ? <><span className="spinner-border spinner-border-sm me-1" />Saving…</> : submitLabel}
      </button>
    </form>
  );
}
