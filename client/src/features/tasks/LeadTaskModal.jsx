import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';

const CHANNELS = [
  { value: 'email', label: 'Email', icon: 'envelope-fill' },
  { value: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp' },
  { value: 'sms', label: 'SMS', icon: 'chat-dots-fill' },
  { value: 'rcs', label: 'RCS', icon: 'phone-vibrate-fill' },
];

// WhatsApp/RCS send through Anantya's approved-template API — there's no
// free-text send for these, so a template must be picked (Email/SMS can be freehand).
const TEMPLATE_ONLY_CHANNELS = ['whatsapp', 'rcs'];

export default function LeadTaskModal({ task, onClose }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [campaignId, setCampaignId] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [channel, setChannel] = useState('email');
  const [templateId, setTemplateId] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { api.get('/api/meta').then(setMeta).catch(() => {}); }, []);

  const templatesForChannel = (meta?.templates ?? []).filter((t) => t.channel === channel);

  const pickChannel = (value) => {
    setChannel(value);
    setTemplateId('');
    setMessage('');
  };

  const pickTemplate = (id) => {
    setTemplateId(id);
    const t = templatesForChannel.find((x) => String(x.id) === String(id));
    setMessage(t?.body || '');
  };

  const handleEnroll = async () => {
    if (!campaignId) { toast('Pick a campaign first.', 'warning'); return; }
    setEnrolling(true);
    try {
      const r = await api.post(`/api/leads/${task.lead_id}/enroll`, { campaign_id: campaignId });
      toast(r.enrolled ? 'Lead enrolled in campaign.' : 'Already enrolled or ineligible.', r.enrolled ? 'success' : 'warning');
    } catch (err) { toast(err.message, 'danger'); }
    finally { setEnrolling(false); }
  };

  const templateOnly = TEMPLATE_ONLY_CHANNELS.includes(channel);
  const canSend = templateOnly ? Boolean(templateId) : message.trim().length > 0;

  const handleSend = async () => {
    if (!canSend) {
      toast(templateOnly ? 'Pick an approved template first.' : 'Write a message before sending.', 'warning');
      return;
    }
    setSending(true);
    try {
      await api.post('/api/conversations', {
        lead_id: task.lead_id,
        channel,
        message: templateOnly ? '' : message,
        template_id: templateId || null,
      });
      toast('Message sent.', 'success');
      setMessage('');
      setTemplateId('');
    } catch (err) { toast(err.message, 'danger'); }
    finally { setSending(false); }
  };

  return (
    <div className="crm-modal-backdrop" onClick={onClose}>
      <div className="crm-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="crm-modal-header">
          <div className="min-w-0">
            <div className="fw-bold text-15 text-truncate">{task.title}</div>
            {task.lead_name && (
              <button
                type="button"
                className="btn btn-link p-0 text-13 text-muted crm-link"
                onClick={() => navigate(`/leads/${task.lead_id}`)}
              >
                <i className="bi bi-person-fill me-1" />{task.lead_name}
              </button>
            )}
          </div>
          <button className="crm-drawer-close flex-shrink-0" onClick={onClose}><i className="bi bi-x-lg text-13" /></button>
        </div>

        <div className="p-4">
          <div className="mb-4">
            <div className="text-11 fw-bold text-uppercase ls-wide text-muted-3 mb-2">Enroll in Campaign</div>
            <div className="d-flex gap-2">
              <select className="crm-select flex-grow-1" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">— Select campaign —</option>
                {(meta?.campaigns ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="btn-crm flex-shrink-0" disabled={enrolling} onClick={handleEnroll}>
                {enrolling ? <span className="spinner-border spinner-border-sm" /> : 'Enroll'}
              </button>
            </div>
          </div>

          <div>
            <div className="text-11 fw-bold text-uppercase ls-wide text-muted-3 mb-2">Send a Message</div>
            <div className="d-flex gap-2 mb-2 flex-wrap">
              {CHANNELS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={channel === c.value ? 'btn-crm btn-crm-sm' : 'btn btn-outline-secondary btn-sm'}
                  onClick={() => pickChannel(c.value)}
                >
                  <i className={`bi bi-${c.icon} me-1`} />{c.label}
                </button>
              ))}
            </div>
            <select className="crm-select w-100 mb-2" value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
              <option value="">{templateOnly ? '— Select an approved template —' : '— Write a custom message —'}</option>
              {templatesForChannel.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {templatesForChannel.length === 0 && (
              <div className="text-11 text-muted-3 mb-2">
                {templateOnly
                  ? `No approved ${channel} templates yet — create one in Templates first.`
                  : `No ${channel} templates yet — write a custom message below.`}
              </div>
            )}
            {templateOnly ? (
              templateId && (
                <div className="crm-input mb-2" style={{ background: '#f8fafc', color: '#374151', whiteSpace: 'pre-wrap' }}>
                  {message || <span className="text-muted-3">No preview available for this template.</span>}
                </div>
              )
            ) : (
              <textarea
                className="crm-input no-resize mb-2"
                rows={4}
                placeholder="Type your message…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            )}
            {templateOnly && (
              <div className="text-11 text-muted-3 mb-2">
                <i className="bi bi-info-circle me-1" />WhatsApp/RCS only send via approved templates — the exact wording above is what gets delivered.
              </div>
            )}
            <button className="btn-crm w-100 justify-content-center" disabled={sending || !canSend} onClick={handleSend}>
              {sending ? 'Sending…' : `Send via ${CHANNELS.find((c) => c.value === channel)?.label}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
