import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { formatDate } from '../../utils/formatters.js';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';

const TABS = [
  { key: 'pending',   label: 'Pending',   icon: 'clock' },
  { key: 'overdue',   label: 'Overdue',   icon: 'exclamation-circle' },
  { key: 'completed', label: 'Completed', icon: 'check-circle' },
];

const BLANK = { title: '', due_at: '', priority: 'normal', description: '' };

export default function TasksPage() {
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(BLANK);
  const [saving, setSaving]     = useState(false);

  const { data, loading, reload } = useResource(`/api/tasks?status=${status}`, [status]);
  const tasks  = data?.tasks  ?? [];
  const counts = data?.counts ?? { pending: 0, overdue: 0, completed: 0 };

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/tasks', { ...form, due_at: form.due_at || null });
      toast('Task added.', 'success');
      setForm(BLANK);
      setShowForm(false);
      reload();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const markDone = async (id) => {
    try {
      await api.post(`/api/tasks/${id}/done`, {});
      toast('Task completed!', 'success');
      reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  };

  const deleteTask = async (id) => {
    if (!confirm('Delete this task?')) return;
    try {
      await api.delete(`/api/tasks/${id}`);
      reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  };

  const activeTab = TABS.find((t) => t.key === status);

  return (
    <div>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h5 className="fw-bold mb-0 text-brand">Tasks</h5>
        <button onClick={() => setShowForm((v) => !v)} className="btn btn-crm">
          <i className="bi bi-plus-lg" />Add Task
        </button>
      </div>

      {/* Add Task Form */}
      {showForm && (
        <div className="card crm-card mb-4">
          <div className="card-body p-4">
            <h6 className="fw-bold mb-3 text-brand">
              <i className="bi bi-plus-circle me-2 text-purple" />New Task
            </h6>
            <form onSubmit={handleAdd}>
              <div className="row g-3">
                <div className="col-md-5">
                  <label className="crm-label">Title <span className="req">*</span></label>
                  <input
                    className="form-control crm-input"
                    placeholder="Task title…"
                    value={form.title} onChange={(e) => set('title', e.target.value)} required
                  />
                </div>
                <div className="col-md-3">
                  <label className="crm-label">Due Date</label>
                  <input
                    type="datetime-local" className="form-control crm-input"
                    value={form.due_at} onChange={(e) => set('due_at', e.target.value)}
                  />
                </div>
                <div className="col-md-2">
                  <label className="crm-label">Priority</label>
                  <select className="form-select crm-select"
                    value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div className="col-md-2 d-flex align-items-end">
                  <button className="btn btn-crm w-100" disabled={saving}>
                    {saving ? <span className="spinner-border spinner-border-sm" /> : 'Add'}
                  </button>
                </div>
                <div className="col-12">
                  <label className="crm-label">Description (optional)</label>
                  <textarea className="form-control crm-input no-resize"
                    rows={2} placeholder="Add details…"
                    value={form.description} onChange={(e) => set('description', e.target.value)} />
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="d-flex gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`crm-task-tab${status === t.key ? ` ${t.key}-active` : ''}`}
          >
            <i className={`bi bi-${t.icon}`} />
            {t.label}
            <span className="crm-task-tab-count">{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="card crm-card">
        {loading ? <LoadingBox /> : tasks.length === 0 ? (
          <div className="crm-empty">
            <i className={`bi bi-${activeTab?.icon} crm-empty-icon`} />
            <div className="crm-empty-title">No {activeTab?.label.toLowerCase()} tasks</div>
          </div>
        ) : (
          <ul className="list-unstyled mb-0">
            {tasks.map((t) => {
              const isOverdue = !t.done && t.due_at && new Date(t.due_at) < new Date();
              return (
                <li key={t.id} className={`crm-task-item d-flex align-items-start gap-3 px-4 py-3${t.done ? ' done' : ''}`}>
                  {/* Done icon / circle button */}
                  {t.done
                    ? <i className="bi bi-check-circle-fill text-success flex-shrink-0 mt-1 fs-5" />
                    : <button onClick={() => markDone(t.id)} title="Mark as done"
                        className={`crm-task-circle${isOverdue ? ' overdue' : ''}`} />
                  }

                  {/* Content */}
                  <div className="flex-grow-1 min-w-0">
                    <div className={`crm-task-title fw-semibold text-truncate${t.done ? ' done' : ''}`}>
                      {t.title}
                    </div>
                    <div className="d-flex align-items-center gap-2 mt-1 flex-wrap">
                      <span className={`badge badge-crm badge-${t.priority ?? 'normal'}`}>
                        {t.priority === 'high' ? 'High' : t.priority === 'low' ? 'Low' : 'Normal'}
                      </span>
                      {t.due_at && (
                        <span className={`crm-task-meta${isOverdue ? ' crm-task-overdue' : ' text-muted-2'}`}>
                          <i className={`bi bi-${isOverdue ? 'exclamation-circle-fill' : 'calendar3'} me-1`} />
                          {formatDate(t.due_at)}{isOverdue && ' — Overdue'}
                        </span>
                      )}
                      {t.lead_name && (
                        <span className="crm-task-meta text-purple">
                          <i className="bi bi-person me-1" />{t.lead_name}
                        </span>
                      )}
                      {t.done && t.done_at && (
                        <span className="crm-task-meta text-muted-3">
                          <i className="bi bi-check2 me-1" />Completed {formatDate(t.done_at)}
                        </span>
                      )}
                    </div>
                    {t.description && <div className="text-12 text-muted-2 mt-1">{t.description}</div>}
                  </div>

                  {/* Delete */}
                  <button onClick={() => deleteTask(t.id)} className="crm-task-delete">
                    <i className="bi bi-trash3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
