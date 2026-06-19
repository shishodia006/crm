import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';

export default function PipelineSettings() {
  const toast = useToast();
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/settings/pipeline').then((d) => setStages(d.stages ?? [])).finally(() => setLoading(false));
  }, []);

  const update = (idx, field, value) =>
    setStages((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));

  const addStage = () =>
    setStages((prev) => [...prev, { name: 'New Stage', color: '#6c757d', stage_order: prev.length + 1 }]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/settings/pipeline', { stages });
      toast('Pipeline stages saved.', 'success');
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBox />;

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body p-4">
        <div className="d-flex align-items-center mb-3">
          <h6 className="fw-semibold mb-0 me-auto">Pipeline Stages</h6>
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={addStage}>
            <i className="bi bi-plus-lg me-1" />Add Stage
          </button>
        </div>
        <form onSubmit={save}>
          <div className="d-flex flex-column gap-2">
            {stages.map((stage, idx) => (
              <div key={idx} className="d-flex gap-2 align-items-center">
                <input
                  type="number"
                  className="form-control form-control-sm w-64px"
                  value={stage.stage_order}
                  onChange={(e) => update(idx, 'stage_order', Number(e.target.value))}
                />
                <input
                  type="text"
                  className="form-control form-control-sm flex-grow-1"
                  value={stage.name}
                  onChange={(e) => update(idx, 'name', e.target.value)}
                  required
                />
                <input
                  type="color"
                  className="form-control form-control-sm form-control-color w-48px"
                  value={stage.color}
                  onChange={(e) => update(idx, 'color', e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <button className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save Stages'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
