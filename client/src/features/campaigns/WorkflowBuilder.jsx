import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';

// ─── Constants ────────────────────────────────────────────────────
const STEP_META = {
  multi_send:    { label: 'Multi-Channel',  icon: 'broadcast',      color: '#0ea5e9' },
  email:         { label: 'Send Email',     icon: 'envelope',       color: '#3b82f6' },
  whatsapp:      { label: 'WhatsApp',       icon: 'whatsapp',       color: '#25d366' },
  rcs:           { label: 'RCS Message',    icon: 'phone-vibrate',  color: '#8b5cf6' },
  sms:           { label: 'SMS',            icon: 'chat-dots',      color: '#f59e0b' },
  wait:          { label: 'Wait / Delay',   icon: 'clock',          color: '#6b7280' },
  condition:     { label: 'Condition',      icon: 'signpost-split', color: '#d97706' },
  assign_agent:  { label: 'Assign Agent',   icon: 'person-check',   color: '#7c3aed' },
  task:          { label: 'Create Task',    icon: 'check2-square',  color: '#0891b2' },
  move_pipeline: { label: 'Move Pipeline',  icon: 'kanban',         color: '#db2777' },
  exit:          { label: 'Exit',           icon: 'x-circle',       color: '#dc2626' },
};

const PALETTE = Object.entries(STEP_META).map(([type, m]) => ({ type, ...m }));

const STEP_INFO = {
  multi_send:    'Sends Email + WhatsApp + RCS all at once in a single step. Pick a template for each channel you want.',
  email:         'An email is sent to the lead using a pre-written template.',
  whatsapp:      'A WhatsApp message is sent to the lead automatically.',
  rcs:           'An RCS rich message is sent via Anantya to the lead.',
  sms:           "An SMS is sent to the lead's phone number.",
  wait:          'The automation pauses for this duration before the next step.',
  condition:     'Checks a condition — YES branch continues; NO branch diverges.',
  assign_agent:  'The lead is assigned to a team member or auto-distributed via round robin.',
  task:          'A follow-up task is created so no lead is missed.',
  move_pipeline: 'The lead is moved to a different pipeline stage automatically.',
  exit:          'The lead exits the workflow. No more steps will run for them.',
};

const WORKFLOW_TEMPLATES = [
  {
    id: 'new_lead', name: 'New Lead Nurturing', color: '#3b82f6', icon: 'person-plus',
    description: 'Welcome new leads with a multi-channel sequence',
    steps: [
      { type: 'whatsapp', label: 'Welcome WhatsApp',   delay_value: 0, delay_unit: 'hours' },
      { type: 'wait',     label: 'Wait 1 day',          delay_value: 1, delay_unit: 'days'  },
      { type: 'email',    label: 'Intro Email',          delay_value: 0, delay_unit: 'hours' },
      { type: 'wait',     label: 'Wait 2 days',          delay_value: 2, delay_unit: 'days'  },
      { type: 'whatsapp', label: 'Follow-up WhatsApp',  delay_value: 0, delay_unit: 'hours' },
      { type: 'wait',     label: 'Wait 3 days',          delay_value: 3, delay_unit: 'days'  },
      { type: 'sms',      label: 'SMS Reminder',         delay_value: 0, delay_unit: 'hours' },
    ],
  },
  {
    id: 'followup', name: 'Follow-up Sequence', color: '#10b981', icon: 'arrow-repeat',
    description: 'Persistent multi-channel follow-up for prospects',
    steps: [
      { type: 'email',    label: 'Follow-up Email',  delay_value: 0, delay_unit: 'hours' },
      { type: 'wait',     label: 'Wait 2 days',       delay_value: 2, delay_unit: 'days'  },
      { type: 'whatsapp', label: 'WhatsApp Check-in', delay_value: 0, delay_unit: 'hours' },
      { type: 'wait',     label: 'Wait 3 days',       delay_value: 3, delay_unit: 'days'  },
      { type: 'sms',      label: 'Final SMS',          delay_value: 0, delay_unit: 'hours' },
    ],
  },
  {
    id: 'contract', name: 'Contract Reminder', color: '#f59e0b', icon: 'file-earmark-text',
    description: 'Auto-remind leads until the contract is signed',
    steps: [
      { type: 'email',     label: 'Send Contract Email', delay_value: 0, delay_unit: 'hours' },
      { type: 'wait',      label: 'Wait 3 days',          delay_value: 3, delay_unit: 'days'  },
      { type: 'condition', label: 'Contract Signed?',     delay_value: 0, delay_unit: 'hours', condition: 'tag', condition_op: 'eq', condition_val: 'contract_signed' },
      { type: 'whatsapp',  label: 'WhatsApp Reminder',    delay_value: 0, delay_unit: 'hours' },
      { type: 'wait',      label: 'Wait 2 days',          delay_value: 2, delay_unit: 'days'  },
      { type: 'exit',      label: 'Exit',                 delay_value: 0, delay_unit: 'hours' },
    ],
  },
  {
    id: 'reengagement', name: 'Re-engagement', color: '#7c3aed', icon: 'lightning',
    description: 'Win back cold or inactive leads',
    steps: [
      { type: 'email',    label: 'Re-engagement Email', delay_value: 0, delay_unit: 'hours' },
      { type: 'wait',     label: 'Wait 5 days',          delay_value: 5, delay_unit: 'days'  },
      { type: 'whatsapp', label: 'WhatsApp Message',     delay_value: 0, delay_unit: 'hours' },
      { type: 'wait',     label: 'Wait 3 days',          delay_value: 3, delay_unit: 'days'  },
      { type: 'sms',      label: 'Final SMS',             delay_value: 0, delay_unit: 'hours' },
    ],
  },
  {
    id: 'appointment', name: 'Appointment Booking', color: '#ef4444', icon: 'calendar-check',
    description: 'Confirm and remind leads about their appointment',
    steps: [
      { type: 'email',    label: 'Confirmation Email', delay_value: 0, delay_unit: 'hours' },
      { type: 'wait',     label: 'Wait 1 day',          delay_value: 1, delay_unit: 'days'  },
      { type: 'whatsapp', label: 'Day-before Reminder', delay_value: 0, delay_unit: 'hours' },
      { type: 'wait',     label: 'Wait 2 hours',        delay_value: 2, delay_unit: 'hours' },
      { type: 'sms',      label: 'Day-of SMS',          delay_value: 0, delay_unit: 'hours' },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────
let _nid = 1;
const uid = () => `n${Date.now()}${_nid++}`;

function makeNodeData(type, overrides = {}) {
  return {
    stepType: type,
    label: STEP_META[type]?.label ?? type,
    template_id: '',
    delay_value: 0,
    delay_unit: 'days',
    condition: '',
    condition_op: 'eq',
    condition_val: '',
    agent_id: '',
    task_title: '',
    pipeline_stage: '',
    // multi_send channel template ids
    email_template_id: '',
    whatsapp_template_id: '',
    rcs_template_id: '',
    sms_template_id: '',
    ...overrides,
  };
}

function dbToFlowNodes(workflowSteps) {
  return workflowSteps.map((s, i) => {
    let ad = {};
    try { ad = typeof s.action_data === 'string' ? JSON.parse(s.action_data) : (s.action_data || {}); } catch {}
    return {
      id: `db${s.id}`,
      type: s.type === 'condition' ? 'conditionNode' : 'stepNode',
      position: { x: Number(s.x) || 220, y: Number(s.y) || 20 + i * 160 },
      data: makeNodeData(s.type, {
        label: ad.label || STEP_META[s.type]?.label || s.type,
        template_id: String(s.template_id ?? ''),
        delay_value: Number(s.delay_value ?? 0),
        delay_unit: s.delay_unit ?? 'days',
        condition: ad.condition || '',
        condition_op: ad.condition_op || 'eq',
        condition_val: ad.condition_val || '',
        agent_id: String(ad.agent_id ?? ''),
        task_title: ad.task_title || '',
        pipeline_stage: String(ad.pipeline_stage ?? ''),
        email_template_id: String(ad.email_template_id ?? ''),
        whatsapp_template_id: String(ad.whatsapp_template_id ?? ''),
        rcs_template_id: String(ad.rcs_template_id ?? ''),
        sms_template_id: String(ad.sms_template_id ?? ''),
      }),
    };
  });
}

function dbToFlowEdges(workflowSteps) {
  const edges = [];
  const idMap = {};
  workflowSteps.forEach(s => { idMap[s.id] = `db${s.id}`; });
  workflowSteps.forEach(s => {
    if (!s.parent_id || !idMap[s.parent_id]) return;
    const parent = workflowSteps.find(p => p.id === s.parent_id);
    const sh = parent?.type === 'condition'
      ? (parent.yes_next_id === s.id ? 'yes' : parent.no_next_id === s.id ? 'no' : 'out')
      : 'out';
    edges.push({
      id: `e_${idMap[s.parent_id]}_${idMap[s.id]}`,
      source: idMap[s.parent_id],
      target: idMap[s.id],
      sourceHandle: sh,
      type: 'smoothstep',
      animated: sh === 'yes',
      style: {
        stroke: sh === 'yes' ? '#22c55e' : sh === 'no' ? '#ef4444' : '#94a3b8',
        strokeWidth: 2,
      },
      label: sh === 'yes' ? 'YES' : sh === 'no' ? 'NO' : '',
      labelStyle: { fontSize: 10, fontWeight: 700 },
      labelBgStyle: { fill: sh === 'yes' ? '#d1fae5' : sh === 'no' ? '#fee2e2' : '#f8fafc', fillOpacity: 1 },
    });
  });
  return edges;
}

function templateToFlow(tplSteps) {
  const nodes = tplSteps.map((s, i) => ({
    id: uid(),
    type: s.type === 'condition' ? 'conditionNode' : 'stepNode',
    position: { x: 220, y: 20 + i * 160 },
    data: makeNodeData(s.type, { ...s }),
  }));
  const edges = nodes.slice(1).map((n, i) => ({
    id: `e_${nodes[i].id}_${n.id}`,
    source: nodes[i].id,
    target: n.id,
    sourceHandle: 'out',
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#94a3b8', strokeWidth: 2 },
  }));
  return { nodes, edges };
}

// ─── Custom Node: StepNode ─────────────────────────────────────────
const StepNode = memo(({ data, selected }) => {
  const meta = STEP_META[data.stepType] ?? { label: data.stepType, icon: 'circle', color: '#6b7280' };
  const isExit = data.stepType === 'exit';
  const isWait = data.stepType === 'wait';

  return (
    <div
      onClick={data.onSelect}
      style={{
        background: '#fff',
        borderRadius: 10,
        width: 200,
        boxShadow: selected
          ? `0 0 0 2px ${meta.color}, 0 4px 16px rgba(0,0,0,0.13)`
          : '0 2px 10px rgba(0,0,0,0.08)',
        borderTop: `3px solid ${meta.color}`,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {!isExit && (
        <Handle
          type="target" position={Position.Top} id="in"
          style={{ background: '#94a3b8', width: 10, height: 10, border: '2px solid #fff', top: -5 }}
        />
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 8px 8px 12px',
        borderBottom: '1px solid #f1f5f9',
      }}>
        <span style={{
          width: 28, height: 28, borderRadius: 6,
          background: meta.color + '1a', color: meta.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, flexShrink: 0,
        }}>
          <i className={`bi bi-${meta.icon}`} />
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1e293b' }}>
          {meta.label}
        </span>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); data.onDelete(); }}
          style={{ background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer', color: '#cbd5e1', fontSize: 11, lineHeight: 1, flexShrink: 0 }}
        >
          <i className="bi bi-x-lg" />
        </button>
      </div>

      <div style={{ padding: '8px 12px 10px', minHeight: 44 }}>
        {data.label !== meta.label && (
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.label}
          </div>
        )}
        <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
          {isExit ? 'Ends the workflow'
            : isWait && data.delay_value > 0 ? `⏱ ${data.delay_value} ${data.delay_unit}`
            : data.delay_value > 0 ? `⏱ After ${data.delay_value} ${data.delay_unit}`
            : 'Click to configure'}
        </div>
      </div>

      {!isExit && (
        <Handle
          type="source" position={Position.Bottom} id="out"
          style={{ background: meta.color, width: 10, height: 10, border: '2px solid #fff', bottom: -5 }}
        />
      )}
    </div>
  );
});

// ─── Custom Node: ConditionNode ────────────────────────────────────
const ConditionNode = memo(({ data, selected }) => {
  const meta = STEP_META.condition;
  const condText = data.condition
    ? `${data.condition} ${data.condition_op} "${data.condition_val}"`
    : 'Click to configure';

  return (
    <div
      onClick={data.onSelect}
      style={{
        background: '#fff',
        borderRadius: 10,
        width: 210,
        boxShadow: selected
          ? `0 0 0 2px ${meta.color}, 0 4px 16px rgba(0,0,0,0.13)`
          : '0 2px 10px rgba(0,0,0,0.08)',
        borderTop: `3px solid ${meta.color}`,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <Handle
        type="target" position={Position.Top} id="in"
        style={{ background: '#94a3b8', width: 10, height: 10, border: '2px solid #fff', top: -5 }}
      />

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 8px 8px 12px',
        borderBottom: '1px solid #f1f5f9',
      }}>
        <span style={{
          width: 28, height: 28, borderRadius: 6,
          background: meta.color + '1a', color: meta.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, flexShrink: 0,
        }}>
          <i className={`bi bi-${meta.icon}`} />
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: '#1e293b' }}>Condition</span>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); data.onDelete(); }}
          style={{ background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer', color: '#cbd5e1', fontSize: 11, lineHeight: 1 }}
        >
          <i className="bi bi-x-lg" />
        </button>
      </div>

      <div style={{ padding: '8px 12px 14px' }}>
        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {condText}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#15803d', background: '#d1fae5', padding: '2px 8px', borderRadius: 4 }}>YES ↓</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#b91c1c', background: '#fee2e2', padding: '2px 8px', borderRadius: 4 }}>NO ↓</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="yes"
        style={{ left: '28%', background: '#22c55e', width: 10, height: 10, border: '2px solid #fff', bottom: -5 }} />
      <Handle type="source" position={Position.Bottom} id="no"
        style={{ left: '72%', background: '#ef4444', width: 10, height: 10, border: '2px solid #fff', bottom: -5 }} />
    </div>
  );
});

const NODE_TYPES = { stepNode: StepNode, conditionNode: ConditionNode };

// ─── Node Config Panel ─────────────────────────────────────────────
function NodeConfigPanel({ node, onClose, onChange, msgTemplates, setMsgTemplates, agents, stages }) {
  const data = node.data;
  const meta = STEP_META[data.stepType] ?? { label: data.stepType, icon: 'circle', color: '#6b7280' };
  const isComm = ['email', 'whatsapp', 'sms', 'rcs'].includes(data.stepType);
  const isMultiSend = data.stepType === 'multi_send';
  const isWaRcs = ['whatsapp', 'rcs'].includes(data.stepType);
  const filteredTpls = msgTemplates.filter(t => t.channel === data.stepType);
  const selectedTpl = filteredTpls.find(t => String(t.id) === String(data.template_id));
  const [syncing, setSyncing] = useState(false);

  const syncAnantya = async () => {
    setSyncing(true);
    try {
      const r = await api.get('/api/templates/wa-sync?save=1');
      const fresh = await api.get('/api/templates?channel=' + data.stepType);
      setMsgTemplates(prev => {
        const other = prev.filter(t => t.channel !== 'whatsapp' && t.channel !== 'rcs');
        return [...other, ...(fresh.templates ?? [])];
      });
      alert(`Synced ${r.imported ?? r.total ?? '?'} templates from Anantya.`);
    } catch (e) {
      alert('Sync failed: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={{
      width: 272, flexShrink: 0,
      background: '#fff', borderRadius: 10,
      boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
      border: '1px solid #e2e8f0',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '11px 14px',
        borderBottom: '1px solid #e2e8f0',
        background: '#f8fafc',
        flexShrink: 0,
      }}>
        <span style={{
          width: 26, height: 26, borderRadius: 6,
          background: meta.color + '1a', color: meta.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, flexShrink: 0,
        }}>
          <i className={`bi bi-${meta.icon}`} />
        </span>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', flex: 1 }}>{meta.label}</span>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, fontSize: 13 }}>
          <i className="bi bi-x-lg" />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: 14, overflowY: 'auto', flex: 1 }}>
        <p style={{ fontSize: 11, color: '#64748b', marginBottom: 14, lineHeight: 1.5 }}>
          {STEP_INFO[data.stepType]}
        </p>

        {/* Label */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Step Label</label>
          <input className="form-control form-control-sm" value={data.label}
            onChange={e => onChange('label', e.target.value)} placeholder="Name this step" />
        </div>

        {/* Delay */}
        {!['condition', 'exit'].includes(data.stepType) && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
              {data.stepType === 'wait' ? 'Wait Duration' : 'Delay Before This Step'}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" className="form-control form-control-sm"
                value={data.delay_value} min={0}
                onChange={e => onChange('delay_value', Number(e.target.value))}
                style={{ width: 72, flexShrink: 0 }} />
              <select className="form-select form-select-sm"
                value={data.delay_unit} onChange={e => onChange('delay_unit', e.target.value)}>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
            {data.stepType !== 'wait' && data.delay_value > 0 && (
              <div style={{ fontSize: 10, color: '#6366f1', marginTop: 4 }}>
                ⏱ This step will run {data.delay_value} {data.delay_unit} after the previous step
              </div>
            )}
          </div>
        )}

        {/* Template */}
        {isComm && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4, gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', flex: 1, marginBottom: 0 }}>Template</label>
              {isWaRcs && (
                <button
                  onClick={syncAnantya}
                  disabled={syncing}
                  style={{ fontSize: 10, color: '#7c3aed', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600 }}
                >
                  <i className="bi bi-arrow-repeat me-1" />
                  {syncing ? 'Syncing…' : 'Sync from Anantya'}
                </button>
              )}
            </div>
            <select className="form-select form-select-sm" value={data.template_id}
              onChange={e => onChange('template_id', e.target.value)}>
              <option value="">— Select Template —</option>
              {filteredTpls.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {filteredTpls.length === 0 && (
              <div style={{ fontSize: 10, color: '#b45309', marginTop: 4 }}>
                <i className="bi bi-exclamation-triangle me-1" />
                No {data.stepType} templates.{isWaRcs ? ' Click "Sync from Anantya" above.' : ' Create in Settings → Templates.'}
              </div>
            )}
            {/* Body preview */}
            {selectedTpl?.body && (
              <div style={{
                marginTop: 8, padding: '8px 10px', borderRadius: 6,
                background: '#f8fafc', border: '1px solid #e2e8f0',
                fontSize: 11, color: '#374151', lineHeight: 1.6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  Preview
                </div>
                {selectedTpl.body}
              </div>
            )}
          </div>
        )}

        {/* Multi-Send: pick template per channel */}
        {isMultiSend && (() => {
          const tplByChannel = (ch) => msgTemplates.filter(t => t.channel === ch);
          const row = (ch, label, field, icon, color) => (
            <div key={ch} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4, gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <i className={`bi bi-${icon} me-1`} />{label}
                </span>
                {['whatsapp','rcs'].includes(ch) && (
                  <button
                    onClick={syncAnantya} disabled={syncing}
                    style={{ fontSize: 10, color: '#7c3aed', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600, marginLeft: 'auto' }}
                  >
                    <i className="bi bi-arrow-repeat me-1" />{syncing ? 'Syncing…' : 'Sync'}
                  </button>
                )}
              </div>
              <select className="form-select form-select-sm" value={data[field]}
                onChange={e => onChange(field, e.target.value)}>
                <option value="">— Skip this channel —</option>
                {tplByChannel(ch).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {tplByChannel(ch).length === 0 && (
                <div style={{ fontSize: 10, color: '#b45309', marginTop: 3 }}>
                  No {label} templates yet.{['whatsapp','rcs'].includes(ch) ? ' Sync from Anantya.' : ''}
                </div>
              )}
              {(() => { const t = tplByChannel(ch).find(x => String(x.id) === String(data[field])); return t?.body ? (
                <div style={{ marginTop: 5, padding: '6px 8px', borderRadius: 5, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 10, color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {t.body.slice(0, 120)}{t.body.length > 120 ? '…' : ''}
                </div>
              ) : null; })()}
            </div>
          );
          return (
            <div style={{ padding: '10px 12px', borderRadius: 7, background: '#f0f9ff', border: '1px solid #bae6fd', marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#0369a1', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                <i className="bi bi-broadcast me-1" />Send to all channels at once
              </div>
              {row('email',    'Email',    'email_template_id',    'envelope',      '#3b82f6')}
              {row('whatsapp', 'WhatsApp', 'whatsapp_template_id', 'whatsapp',      '#25d366')}
              {row('rcs',      'RCS',      'rcs_template_id',      'phone-vibrate', '#8b5cf6')}
              {row('sms',      'SMS',      'sms_template_id',      'chat-dots',     '#f59e0b')}
              <div style={{ fontSize: 10, color: '#0369a1', marginTop: 4 }}>
                Leave a channel blank to skip it.
              </div>
            </div>
          );
        })()}

        {/* Condition */}
        {data.stepType === 'condition' && (
          <>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Check Field</label>
              <select className="form-select form-select-sm" value={data.condition}
                onChange={e => onChange('condition', e.target.value)}>
                <option value="">— Select —</option>
                <option value="tag">Has Tag</option>
                <option value="score">Lead Score</option>
                <option value="stage">Pipeline Stage</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Operator</label>
                <select className="form-select form-select-sm" value={data.condition_op}
                  onChange={e => onChange('condition_op', e.target.value)}>
                  <option value="eq">equals</option>
                  <option value="neq">not equals</option>
                  <option value="gte">≥</option>
                  <option value="lte">≤</option>
                  <option value="contains">contains</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Value</label>
                <input className="form-control form-control-sm" value={data.condition_val}
                  onChange={e => onChange('condition_val', e.target.value)}
                  placeholder="e.g. contract_signed" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#15803d', background: '#d1fae5', padding: '3px 8px', borderRadius: 4 }}>
                YES → continues
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#b91c1c', background: '#fee2e2', padding: '3px 8px', borderRadius: 4 }}>
                NO → branch
              </span>
            </div>
          </>
        )}

        {/* Assign Agent */}
        {data.stepType === 'assign_agent' && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Assign To</label>
            <select className="form-select form-select-sm" value={data.agent_id}
              onChange={e => onChange('agent_id', e.target.value)}>
              <option value="">Auto-assign (round robin)</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        {/* Task */}
        {data.stepType === 'task' && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Task Title</label>
            <input className="form-control form-control-sm" value={data.task_title}
              onChange={e => onChange('task_title', e.target.value)}
              placeholder="e.g. Call the lead" />
          </div>
        )}

        {/* Move Pipeline */}
        {data.stepType === 'move_pipeline' && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Move to Stage</label>
            <select className="form-select form-select-sm" value={data.pipeline_stage}
              onChange={e => onChange('pipeline_stage', e.target.value)}>
              <option value="">— Select Stage —</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Builder Canvas (inner — must be inside ReactFlowProvider) ─────
function BuilderCanvas({ initialNodes, initialEdges, msgTemplates, setMsgTemplates, agents, stages, onBack, onSave }) {
  const wrapperRef = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedId, setSelectedId] = useState(null);
  const [activateNow, setActivateNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const { screenToFlowPosition } = useReactFlow();

  const selectedNode = useMemo(
    () => nodes.find(n => n.id === selectedId) || null,
    [nodes, selectedId]
  );

  const deleteNode = useCallback((id) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
    setSelectedId(prev => prev === id ? null : prev);
  }, [setNodes, setEdges]);

  const updateNodeData = useCallback((id, field, value) => {
    setNodes(prev => prev.map(n =>
      n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n
    ));
  }, [setNodes]);

  const nodesWithCb = useMemo(() => nodes.map(n => ({
    ...n,
    data: {
      ...n.data,
      onSelect: () => setSelectedId(n.id),
      onDelete: () => deleteNode(n.id),
    },
  })), [nodes, deleteNode]);

  const onConnect = useCallback((params) => {
    const sh = params.sourceHandle;
    setEdges(prev => addEdge({
      ...params,
      type: 'smoothstep',
      animated: sh === 'yes',
      style: {
        stroke: sh === 'yes' ? '#22c55e' : sh === 'no' ? '#ef4444' : '#94a3b8',
        strokeWidth: 2,
      },
      label: sh === 'yes' ? 'YES' : sh === 'no' ? 'NO' : '',
      labelStyle: { fontSize: 10, fontWeight: 700 },
      labelBgStyle: { fill: sh === 'yes' ? '#d1fae5' : sh === 'no' ? '#fee2e2' : '#f8fafc', fillOpacity: 1 },
    }, prev));
  }, [setEdges]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/wfstep');
    if (!type) return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const id = uid();
    setNodes(prev => [...prev, {
      id,
      type: type === 'condition' ? 'conditionNode' : 'stepNode',
      position,
      data: makeNodeData(type),
    }]);
    setSelectedId(id);
  }, [screenToFlowPosition, setNodes]);

  const addNode = useCallback((type) => {
    const id = uid();
    setNodes(prev => [...prev, {
      id,
      type: type === 'condition' ? 'conditionNode' : 'stepNode',
      position: { x: 220, y: 20 + prev.length * 160 },
      data: makeNodeData(type),
    }]);
    setSelectedId(id);
  }, [setNodes]);

  const handleSave = async () => {
    if (!nodes.length) { alert('Add at least one step before saving.'); return; }
    setSaving(true);
    try {
      const steps = nodes.map((n, i) => {
        const d = n.data;
        const base = {
          id: n.id,
          type: d.stepType,
          label: d.label,
          template_id: d.template_id ? Number(d.template_id) : null,
          delay_value: Number(d.delay_value || 0),
          delay_unit: d.delay_unit || 'days',
          condition: d.condition || '',
          condition_op: d.condition_op || 'eq',
          condition_val: d.condition_val || '',
          agent_id: d.agent_id ? Number(d.agent_id) : null,
          task_title: d.task_title || '',
          pipeline_stage: d.pipeline_stage ? Number(d.pipeline_stage) : null,
          x: Math.round(n.position.x),
          y: Math.round(n.position.y),
          step_order: i + 1,
        };
        if (d.stepType === 'multi_send') {
          base.action_data = {
            email_template_id:    d.email_template_id    ? Number(d.email_template_id)    : null,
            whatsapp_template_id: d.whatsapp_template_id ? Number(d.whatsapp_template_id) : null,
            rcs_template_id:      d.rcs_template_id      ? Number(d.rcs_template_id)      : null,
            sms_template_id:      d.sms_template_id      ? Number(d.sms_template_id)      : null,
          };
        }
        return base;
      });
      const connections = edges.map(e => ({
        from: e.source,
        to: e.target,
        label: e.sourceHandle === 'yes' ? 'yes' : e.sourceHandle === 'no' ? 'no' : '',
      }));
      await onSave(steps, connections, activateNow);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Stats bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn btn-link text-muted p-0" onClick={onBack} title="Browse templates">
          <i className="bi bi-grid me-1" />Templates
        </button>
        <span style={{ color: '#e2e8f0' }}>|</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          {nodes.length} node{nodes.length !== 1 ? 's' : ''} · {edges.length} edge{edges.length !== 1 ? 's' : ''}
        </span>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-outline-danger btn-sm"
          style={{ fontSize: 11 }}
          onClick={() => { if (window.confirm('Clear all nodes?')) { setNodes([]); setEdges([]); setSelectedId(null); } }}
        >
          <i className="bi bi-trash me-1" />Clear
        </button>
      </div>

      {/* Main area */}
      <div style={{ display: 'flex', gap: 10 }}>

        {/* Palette */}
        <div style={{
          width: 164, flexShrink: 0,
          background: '#fff', borderRadius: 10,
          boxShadow: '0 1px 8px rgba(0,0,0,0.07)',
          border: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '9px 12px 7px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Drag to canvas
            </div>
          </div>
          <div style={{ padding: '6px 7px', overflowY: 'auto', flex: 1 }}>
            {PALETTE.map(({ type, label, icon, color }) => (
              <div
                key={type}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('application/wfstep', type);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => addNode(type)}
                role="button"
                tabIndex={0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '5px 6px', borderRadius: 6, marginBottom: 2,
                  cursor: 'grab', border: '1px solid transparent',
                  transition: 'background 0.1s, border-color 0.1s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.borderColor = '#e2e8f0';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                }}
              >
                <span style={{
                  width: 24, height: 24, borderRadius: 5,
                  background: color + '1a', color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, flexShrink: 0,
                }}>
                  <i className={`bi bi-${icon}`} />
                </span>
                <span style={{ fontSize: 11, color: '#374151', fontWeight: 500, lineHeight: 1.2 }}>{label}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: '8px 10px', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.4 }}>
              Drag nodes onto canvas, then connect them by dragging from the circle handles.
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div
          ref={wrapperRef}
          style={{
            flex: 1,
            height: 'calc(100vh - 270px)',
            minHeight: 420,
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            background: '#fafbfc',
          }}
        >
          <ReactFlow
            nodes={nodesWithCb}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={NODE_TYPES}
            onPaneClick={() => setSelectedId(null)}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
            minZoom={0.25}
            maxZoom={2}
            deleteKeyCode="Delete"
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#e2e8f0" gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {/* Config panel */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onClose={() => setSelectedId(null)}
            onChange={(field, val) => updateNodeData(selectedId, field, val)}
            msgTemplates={msgTemplates}
            setMsgTemplates={setMsgTemplates}
            agents={agents}
            stages={stages}
          />
        )}
      </div>

      {/* Save bar */}
      <div style={{
        background: '#fff', borderRadius: 10,
        boxShadow: '0 1px 8px rgba(0,0,0,0.07)',
        border: '1px solid #e2e8f0',
        padding: '11px 18px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div className="form-check mb-0 me-auto">
          <input type="checkbox" className="form-check-input crm-checkbox" id="activateNow"
            checked={activateNow} onChange={e => setActivateNow(e.target.checked)} />
          <label className="form-check-label text-13" htmlFor="activateNow">
            <strong>Activate campaign</strong> immediately after saving
          </label>
        </div>
        <button className="btn btn-crm btn-crm-sm" onClick={handleSave} disabled={saving}>
          <i className={`bi bi-${activateNow ? 'lightning-fill' : 'floppy'} me-1`} />
          {saving ? 'Saving…' : activateNow ? 'Save & Activate' : 'Save Workflow'}
        </button>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────
export default function WorkflowBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [campaign, setCampaign] = useState(null);
  const [msgTemplates, setMsgTemplates] = useState([]);
  const [agents, setAgents] = useState([]);
  const [stages, setStages] = useState([]);
  const [view, setView] = useState('templates');
  const [loading, setLoading] = useState(true);
  const [previewTpl, setPreviewTpl] = useState(null);
  const [previewSteps, setPreviewSteps] = useState([]);
  const [initialNodes, setInitialNodes] = useState([]);
  const [initialEdges, setInitialEdges] = useState([]);
  const [canvasKey, setCanvasKey] = useState(0);

  useEffect(() => {
    api.get(`/api/campaigns/${id}/builder`)
      .then((d) => {
        setCampaign(d.campaign);
        setMsgTemplates(d.templates ?? []);
        setAgents(d.agents ?? []);
        setStages(d.stages ?? []);
        const ws = d.workflowSteps ?? [];
        if (ws.length > 0) {
          setInitialNodes(dbToFlowNodes(ws));
          setInitialEdges(dbToFlowEdges(ws));
          setView('builder');
        }
      })
      .catch(() => navigate('/campaigns'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const applyTemplate = (tplSteps) => {
    const { nodes, edges } = templateToFlow(tplSteps);
    setInitialNodes(nodes);
    setInitialEdges(edges);
    setCanvasKey(k => k + 1);
    setView('builder');
    setPreviewTpl(null);
  };

  const selectTemplate = (tpl) => {
    setPreviewTpl(tpl);
    setPreviewSteps(tpl.steps.map(s => ({ ...s })));
  };

  const updatePreviewStep = (idx, field, value) =>
    setPreviewSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));

  const handleSave = async (steps, connections, activateNow) => {
    await api.post(`/api/campaigns/${id}/steps`, { steps, connections });
    if (activateNow) {
      await api.post(`/api/campaigns/${id}/activate`, {});
      toast('Workflow saved & campaign activated!', 'success');
    } else {
      toast('Workflow saved successfully.', 'success');
    }
  };

  if (loading) return <LoadingBox />;

  const Header = ({ rightSlot }) => (
    <div className="d-flex align-items-center mb-4 gap-2">
      <button className="btn btn-link text-muted p-0 me-1" onClick={() => navigate('/campaigns')}>
        <i className="bi bi-arrow-left fs-5" />
      </button>
      <div className="me-auto">
        <div className="text-muted text-11 fw-semibold text-uppercase" style={{ letterSpacing: '0.05em' }}>
          Workflow Builder
        </div>
        <h5 className="fw-bold mb-0">{campaign?.name}</h5>
      </div>
      {rightSlot}
    </div>
  );

  // ── Template preview ─────────────────────────────────────────────
  if (view === 'templates' && previewTpl) {
    return (
      <>
        <Header rightSlot={
          <button className="btn btn-outline-secondary btn-sm" onClick={() => setPreviewTpl(null)}>
            <i className="bi bi-arrow-left me-1" />All Templates
          </button>
        } />

        <div className="d-flex align-items-center gap-3 mb-4 p-4 rounded-3"
          style={{ background: previewTpl.color + '10', border: `1px solid ${previewTpl.color}25` }}>
          <span className="d-flex align-items-center justify-content-center rounded-3 flex-shrink-0"
            style={{ width: 52, height: 52, background: previewTpl.color + '20', color: previewTpl.color, fontSize: 24 }}>
            <i className={`bi bi-${previewTpl.icon}`} />
          </span>
          <div className="flex-grow-1">
            <h5 className="fw-bold mb-1">{previewTpl.name}</h5>
            <p className="text-muted text-13 mb-0">{previewTpl.description}</p>
          </div>
          <span className="badge rounded-pill text-13 fw-semibold px-3 py-2"
            style={{ background: previewTpl.color, color: '#fff' }}>
            {previewSteps.length} steps
          </span>
        </div>

        <div className="row g-4">
          <div className="col-lg-7">
            <div className="text-uppercase text-muted text-10 fw-semibold mb-3" style={{ letterSpacing: '0.07em' }}>
              Workflow Steps — Edit timing below
            </div>
            <div className="d-flex flex-column">
              {previewSteps.map((step, idx) => {
                const meta = STEP_META[step.type] ?? { label: step.type, icon: 'circle', color: '#6b7280' };
                const isWait = step.type === 'wait';
                return (
                  <div key={idx}>
                    {idx > 0 && (
                      <div className="d-flex flex-column align-items-center" style={{ height: 24 }}>
                        <div style={{ width: 2, flex: 1, background: '#e2e8f0' }} />
                        <i className="bi bi-chevron-down" style={{ fontSize: 9, color: '#94a3b8' }} />
                      </div>
                    )}
                    <div className="rounded-3 p-3"
                      style={{
                        background: isWait ? '#f8fafc' : '#fff',
                        border: `1px solid ${isWait ? '#e2e8f0' : meta.color + '35'}`,
                        borderLeft: `4px solid ${meta.color}`,
                      }}>
                      <div className="d-flex align-items-start gap-3">
                        <div className="d-flex flex-column align-items-center gap-1 flex-shrink-0">
                          <span className="text-10 text-muted fw-semibold">#{idx + 1}</span>
                          <span className="d-flex align-items-center justify-content-center rounded-2"
                            style={{ width: 34, height: 34, background: meta.color + '15', color: meta.color, fontSize: 16 }}>
                            <i className={`bi bi-${meta.icon}`} />
                          </span>
                        </div>
                        <div className="flex-grow-1 min-w-0">
                          <input
                            className="form-control form-control-sm mb-1 fw-semibold"
                            style={{ border: 'none', background: 'transparent', padding: '2px 4px', fontSize: 13 }}
                            value={step.label}
                            onChange={e => updatePreviewStep(idx, 'label', e.target.value)}
                          />
                          <p className="text-muted text-12 mb-0 lh-sm">{STEP_INFO[step.type]}</p>
                          {(!['condition', 'exit'].includes(step.type)) && (
                            <div className="d-flex align-items-center gap-2 mt-2">
                              <span className="text-11 text-muted flex-shrink-0">
                                {isWait ? 'Wait for:' : 'Send after:'}
                              </span>
                              <input type="number" className="form-control form-control-sm text-center"
                                value={step.delay_value} min={0}
                                onChange={e => updatePreviewStep(idx, 'delay_value', Number(e.target.value))}
                                style={{ width: 56, fontSize: 13 }} />
                              <select className="form-select form-select-sm"
                                value={step.delay_unit}
                                onChange={e => updatePreviewStep(idx, 'delay_unit', e.target.value)}
                                style={{ maxWidth: 100, fontSize: 12 }}>
                                <option value="minutes">Minutes</option>
                                <option value="hours">Hours</option>
                                <option value="days">Days</option>
                              </select>
                            </div>
                          )}
                          {step.type === 'condition' && (
                            <div className="mt-2 d-flex gap-2">
                              <span className="badge text-11 fw-normal px-2 py-1"
                                style={{ background: '#d1fae5', color: '#065f46' }}>YES → continues</span>
                              <span className="badge text-11 fw-normal px-2 py-1"
                                style={{ background: '#fee2e2', color: '#991b1b' }}>NO → branches</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="col-lg-5">
            <div className="card border-0 shadow-sm position-sticky" style={{ top: 16 }}>
              <div className="card-body p-4">
                <h6 className="fw-bold mb-3">How this works</h6>
                <div className="d-flex flex-column gap-2 mb-4">
                  {previewSteps.map((s, i) => {
                    const m = STEP_META[s.type] ?? {};
                    return (
                      <div key={i} className="d-flex align-items-center gap-2 text-13">
                        <span className="d-flex align-items-center justify-content-center rounded-1 flex-shrink-0"
                          style={{ width: 22, height: 22, background: m.color + '18', color: m.color, fontSize: 11 }}>
                          <i className={`bi bi-${m.icon}`} />
                        </span>
                        <span className="text-truncate flex-grow-1">{s.label}</span>
                        {s.delay_value > 0 && (
                          <span className="text-muted text-11 flex-shrink-0">
                            {s.delay_value}{s.delay_unit === 'hours' ? 'h' : 'd'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="alert py-2 px-3 text-12 mb-4"
                  style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
                  <i className="bi bi-lightbulb me-1" />
                  You can change templates and settings after applying.
                </div>
                <button
                  className="btn w-100 fw-semibold mb-2 text-white"
                  style={{ background: previewTpl.color, border: 'none' }}
                  onClick={() => applyTemplate(previewSteps)}
                >
                  <i className="bi bi-lightning-fill me-1" />Apply This Template
                </button>
                <button className="btn btn-outline-secondary btn-sm w-100"
                  onClick={() => setPreviewTpl(null)}>
                  ← Back to Templates
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Template gallery ─────────────────────────────────────────────
  if (view === 'templates') {
    return (
      <>
        <Header rightSlot={
          <button className="btn btn-outline-secondary btn-sm"
            onClick={() => { setInitialNodes([]); setInitialEdges([]); setCanvasKey(k => k + 1); setView('builder'); }}>
            <i className="bi bi-tools me-1" />Start from Scratch
          </button>
        } />

        <div className="text-center mb-4">
          <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
            style={{ width: 56, height: 56, background: '#eff6ff' }}>
            <i className="bi bi-grid-1x2 text-primary fs-4" />
          </div>
          <h5 className="fw-bold mb-1">Choose a starting template</h5>
          <p className="text-muted text-13 mb-0">Pre-built automations ready in one click — edit everything on the canvas</p>
        </div>

        <div className="row g-3 mb-4">
          {WORKFLOW_TEMPLATES.map((tpl) => (
            <div key={tpl.id} className="col-md-4 col-sm-6">
              <div className="crm-wb-tpl-card card border h-100" onClick={() => selectTemplate(tpl)}>
                <div className="card-body p-3">
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <span className="d-flex align-items-center justify-content-center rounded-2 flex-shrink-0"
                      style={{ width: 38, height: 38, background: tpl.color + '15', color: tpl.color, fontSize: 19 }}>
                      <i className={`bi bi-${tpl.icon}`} />
                    </span>
                    <strong className="text-14 lh-sm">{tpl.name}</strong>
                  </div>
                  <p className="text-muted text-12 mb-3">{tpl.description}</p>
                  <div className="d-flex flex-wrap gap-1">
                    {tpl.steps.map((s, i) => {
                      const m = STEP_META[s.type] ?? {};
                      return (
                        <span key={i} className="badge text-10 fw-normal rounded-pill"
                          style={{ background: m.color + '15', color: m.color, border: `1px solid ${m.color}30` }}>
                          <i className={`bi bi-${m.icon} me-1`} />{m.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="card-footer bg-transparent border-0 pt-0 pb-3 px-3">
                  <button className="btn btn-sm w-100 fw-semibold text-white"
                    style={{ background: tpl.color, border: 'none' }}>
                    <i className="bi bi-lightning-fill me-1" />Use This Template
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <button className="btn btn-link text-muted text-13 text-decoration-none"
            onClick={() => { setInitialNodes([]); setInitialEdges([]); setCanvasKey(k => k + 1); setView('builder'); }}>
            <i className="bi bi-pencil-square me-1" />Build a custom workflow from scratch
          </button>
        </div>
      </>
    );
  }

  // ── Visual canvas builder ────────────────────────────────────────
  return (
    <>
      <Header rightSlot={null} />
      <ReactFlowProvider>
        <BuilderCanvas
          key={canvasKey}
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          msgTemplates={msgTemplates}
          setMsgTemplates={setMsgTemplates}
          agents={agents}
          stages={stages}
          onBack={() => setView('templates')}
          onSave={handleSave}
        />
      </ReactFlowProvider>
    </>
  );
}
