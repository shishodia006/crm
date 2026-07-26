import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { usePageTabs } from '../../hooks/usePageTabs.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { formatDate, timeAgo, money, initials } from '../../utils/formatters.js';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import { useConfirm } from '../../hooks/useConfirm.js';
import LeadTaskModal from './LeadTaskModal.jsx';

const TABS = [
  { key: 'mine', label: 'My Tasks' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'team', label: 'Team' },
  { key: 'completed', label: 'Completed' },
];

const BLANK = { title: '', due_at: '', priority: 'medium', description: '' };

function dueLabel(dueAt) {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  const now = new Date();
  const dOnly = new Date(d); dOnly.setHours(0, 0, 0, 0);
  const nOnly = new Date(now); nOnly.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dOnly - nOnly) / 86400000);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Tomorrow, ${time}`;
  if (diffDays === -1) return 'Yesterday';
  if (diffDays < -1) return formatDate(dueAt);
  if (diffDays > 1 && diffDays <= 6) return d.toLocaleDateString('en-IN', { weekday: 'long' });
  return formatDate(dueAt);
}

function isOverdue(task) {
  if (task.done || !task.due_at) return false;
  const d = new Date(task.due_at);
  return d < new Date() && d.toDateString() !== new Date().toDateString();
}

function isToday(task) {
  return task.due_at && new Date(task.due_at).toDateString() === new Date().toDateString();
}

function groupTasks(tasks) {
  const overdue = [], today = [], upcoming = [], noDue = [];
  for (const t of tasks) {
    if (!t.due_at) noDue.push(t);
    else if (isOverdue(t)) overdue.push(t);
    else if (isToday(t)) today.push(t);
    else upcoming.push(t);
  }
  return [
    { key: 'overdue', label: 'Overdue', items: overdue },
    { key: 'today', label: 'Today', items: today },
    { key: 'upcoming', label: 'Upcoming', items: upcoming },
    { key: 'nodue', label: 'No Due Date', items: noDue },
  ].filter((g) => g.items.length > 0);
}

function linkedToInfo(task) {
  if (task.deal_id) return { icon: 'briefcase-fill', text: task.deal_title || 'Deal', extra: task.deal_value ? money(task.deal_value) : null };
  if (task.lead_id) return { icon: 'person-fill', text: task.lead_name || 'Lead', extra: null };
  return null;
}

function TaskRow({ task, onDone, onDelete, onOpen, showAssignee }) {
  const overdue = isOverdue(task);
  const accent = task.done ? '#22c55e' : overdue ? '#ef4444' : isToday(task) ? '#f59e0b' : '#c7cad1';
  const linked = linkedToInfo(task);
  const clickable = Boolean(task.lead_id);

  return (
    <div
      className={`crm-task-row${clickable ? ' crm-clickable-row' : ''}`}
      style={{ '--task-accent': accent }}
      onClick={() => clickable && onOpen(task)}
    >
      <button
        onClick={(e) => { e.stopPropagation(); if (!task.done) onDone(task.id); }}
        title={task.done ? 'Completed' : 'Mark as done'}
        className={`crm-task-circle flex-shrink-0${overdue ? ' overdue' : ''}`}
        disabled={task.done}
      >
        {task.done && <i className="bi bi-check-lg text-success" />}
      </button>

      <div className="flex-grow-1 min-w-0">
        <div className={`crm-task-row-title${task.done ? ' done' : ''}`}>{task.title}</div>
        <div className="crm-task-row-sub text-truncate">
          {showAssignee && task.assigned_name && <span className="me-2"><i className="bi bi-person-circle me-1" />{task.assigned_name}</span>}
          {linked ? <span><i className={`bi bi-${linked.icon} me-1`} />Linked to {linked.text}{linked.extra ? ` · ${linked.extra}` : ''}</span> : <span className="text-muted-3">Account task</span>}
        </div>
      </div>

      <div className={`crm-task-row-time flex-shrink-0 ${overdue ? 'text-danger fw-semibold' : isToday(task) ? 'icon-amber fw-semibold' : ''}`}>
        {task.done ? `Completed ${timeAgo(task.done_at)} ago` : dueLabel(task.due_at) || '—'}
      </div>

      <button onClick={(e) => { e.stopPropagation(); onDelete(task.id); }} className="crm-task-delete flex-shrink-0"><i className="bi bi-trash3" /></button>
    </div>
  );
}

function TeamTable({ tasks, onDone, onDelete, onOpen }) {
  if (!tasks.length) return <p className="text-muted text-center py-5 mb-0">No open tasks across the team.</p>;
  return (
    <div className="table-responsive">
      <table className="table align-middle mb-0 crm-table">
        <thead><tr><th>Task</th><th>Assignee</th><th>Linked To</th><th>Due</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {tasks.map((t) => {
            const overdue = isOverdue(t);
            const linked = linkedToInfo(t);
            const clickable = Boolean(t.lead_id);
            return (
              <tr key={t.id} className={clickable ? 'crm-clickable-row' : ''} onClick={() => clickable && onOpen(t)}>
                <td className="fw-semibold text-13">{t.title}</td>
                <td>
                  {t.assigned_name
                    ? <span className="d-flex align-items-center gap-2"><span className="crm-agent-avatar">{initials(t.assigned_name)}</span>{t.assigned_name}</span>
                    : <span className="text-muted-3">Unassigned</span>}
                </td>
                <td className="text-12">{linked ? `${linked.text}${linked.extra ? ` · ${linked.extra}` : ''}` : <span className="text-muted-3">Account</span>}</td>
                <td className={`text-12 ${overdue ? 'text-danger fw-semibold' : ''}`}>{dueLabel(t.due_at) || '—'}</td>
                <td><span className={`badge badge-crm badge-${overdue ? 'overdue' : 'pending'}`}>{overdue ? 'Overdue' : 'Pending'}</span></td>
                <td className="text-end" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => onDone(t.id)}><i className="bi bi-check-lg" /></button>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => onDelete(t.id)}><i className="bi bi-trash3" /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BoardView({ tasks, onDone, onDelete, onOpen }) {
  const groups = groupTasks(tasks);
  if (!groups.length) return <p className="text-muted text-center py-5 mb-0">Nothing here.</p>;
  return (
    <div className="d-flex gap-3 overflow-auto pb-2">
      {groups.map((g) => (
        <div key={g.key} className="crm-pipeline-col flex-shrink-0">
          <div className="d-flex align-items-center gap-2 mb-2 px-1">
            <span className="fw-semibold text-13">{g.label}</span>
            <span className="badge badge-crm badge-purple">{g.items.length}</span>
          </div>
          <div className="d-flex flex-column gap-2">
            {g.items.map((t) => {
              const clickable = Boolean(t.lead_id);
              return (
              <div
                key={t.id}
                className={`card border-0 shadow-sm crm-deal-card text-13${clickable ? ' crm-clickable-row' : ''}`}
                style={{ '--deal-accent': g.key === 'overdue' ? '#ef4444' : g.key === 'today' ? '#f59e0b' : '#c7cad1' }}
                onClick={() => clickable && onOpen(t)}
              >
                <div className="card-body p-2">
                  <div className="fw-semibold text-truncate">{t.title}</div>
                  <div className="text-11 text-muted-3 text-truncate mt-1">{linkedToInfo(t)?.text || 'Account task'}</div>
                  <div className="d-flex justify-content-between align-items-center mt-1">
                    <span className="text-11 text-muted-3">{dueLabel(t.due_at) || 'No due date'}</span>
                    <button className="btn btn-sm p-0 text-success" onClick={(e) => { e.stopPropagation(); onDone(t.id); }}><i className="bi bi-check-circle" /></button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TasksPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('mine');
  const [boardView, setBoardView] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [activeTask, setActiveTask] = useState(null);

  const statusParam = tab === 'mine' ? 'open' : tab === 'overdue' ? 'overdue' : tab === 'team' ? 'open' : 'completed';
  const scopeParam = tab === 'team' || tab === 'completed' ? 'all' : 'mine';
  const { data, loading, reload } = useResource(`/api/tasks?status=${statusParam}&scope=${scopeParam}`, [tab]);

  const tasks = data?.tasks ?? [];
  const counts = data?.counts ?? { mine: 0, overdue: 0, team: 0, completed: 0 };
  usePageTabs(TABS.map((t) => ({ ...t, badge: counts[t.key] })), tab, setTab);

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
    if (!(await confirm('Delete this task?', { title: 'Delete task' }))) return;
    try {
      await api.delete(`/api/tasks/${id}`);
      reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  };

  const groups = tab === 'mine' && !boardView ? groupTasks(tasks) : null;

  return (
    <div>
      <div className="d-flex align-items-center justify-content-end flex-wrap gap-2 mb-3">
        {tab === 'mine' && (
          <button className="btn btn-outline-secondary rounded-crm-xs text-13" onClick={() => setBoardView((v) => !v)}>
            <i className={`bi bi-${boardView ? 'list-ul' : 'kanban'} me-1`} />{boardView ? 'List View' : 'Board View'}
          </button>
        )}
        <button className="btn-crm" onClick={() => setShowForm((v) => !v)}><i className="bi bi-plus-lg" />New Task</button>
      </div>

      {showForm && (
        <div className="card crm-card my-3">
          <div className="card-body p-4">
            <h6 className="fw-bold mb-3 text-brand"><i className="bi bi-plus-circle me-2 text-purple" />New Task</h6>
            <form onSubmit={handleAdd}>
              <div className="row g-3">
                <div className="col-md-5">
                  <label className="crm-label">Title <span className="req">*</span></label>
                  <input className="crm-input" placeholder="Task title…" value={form.title} onChange={(e) => set('title', e.target.value)} required />
                </div>
                <div className="col-md-3">
                  <label className="crm-label">Due Date</label>
                  <input type="datetime-local" className="crm-input" value={form.due_at} onChange={(e) => set('due_at', e.target.value)} />
                </div>
                <div className="col-md-2">
                  <label className="crm-label">Priority</label>
                  <select className="crm-select w-100" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div className="col-md-2 d-flex align-items-end">
                  <button className="btn-crm w-100" disabled={saving}>{saving ? <span className="spinner-border spinner-border-sm" /> : 'Add'}</button>
                </div>
                <div className="col-12">
                  <label className="crm-label">Description (optional)</label>
                  <textarea className="crm-input no-resize" rows={2} placeholder="Add details…" value={form.description} onChange={(e) => set('description', e.target.value)} />
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? <LoadingBox /> : (
        <div className="card crm-card">
          <div className="card-body p-4">
            {tab === 'team' ? (
              <TeamTable tasks={tasks} onDone={markDone} onDelete={deleteTask} onOpen={setActiveTask} />
            ) : tab === 'mine' && boardView ? (
              <BoardView tasks={tasks} onDone={markDone} onDelete={deleteTask} onOpen={setActiveTask} />
            ) : tasks.length === 0 ? (
              <p className="text-muted text-center py-5 mb-0">Nothing here.</p>
            ) : groups ? (
              groups.map((g) => (
                <div key={g.key} className="mb-4">
                  <div className="crm-task-section-label">{g.label}</div>
                  {g.items.map((t) => <TaskRow key={t.id} task={t} onDone={markDone} onDelete={deleteTask} onOpen={setActiveTask} />)}
                </div>
              ))
            ) : (
              tasks.map((t) => <TaskRow key={t.id} task={t} onDone={markDone} onDelete={deleteTask} onOpen={setActiveTask} showAssignee={tab === 'completed'} />)
            )}
          </div>
        </div>
      )}

      {activeTask && <LeadTaskModal task={activeTask} onClose={() => setActiveTask(null)} />}
    </div>
  );
}
