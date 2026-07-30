import { useState, useEffect, useRef, useCallback } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { useToast } from '../../hooks/useToast.js';
import { api } from '../../services/api.js';
import { initials, timeAgo, money } from '../../utils/formatters.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { playNotificationSound } from '../../utils/sound.js';

const FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'email',      label: 'Email' },
  { key: 'whatsapp',   label: 'WhatsApp' },
  { key: 'sms',        label: 'SMS' },
  { key: 'rcs',        label: 'RCS' },
  { key: 'unassigned', label: 'Unassigned' },
];

const CHANNEL_ICON = { email: 'envelope-fill', whatsapp: 'whatsapp', sms: 'chat-dots-fill', rcs: 'phone-vibrate-fill', call: 'telephone-fill' };

function buildListQuery(filter, search) {
  const params = new URLSearchParams();
  if (filter !== 'all' && filter !== 'unassigned') params.set('channel', filter);
  if (filter === 'unassigned') params.set('assigned', 'unassigned');
  if (search.trim()) params.set('search', search.trim());
  return `/api/conversations?${params.toString()}`;
}

// Starting a brand-new conversation on WhatsApp/RCS must use an approved
// template (WhatsApp policy — you can't cold-message someone free-text).
const TEMPLATE_ONLY_CHANNELS = ['whatsapp', 'rcs'];
// Replying within an already-open thread is different: WhatsApp allows free-text
// "session messages" for 24h after the lead's last message (Anantya's
// /api/Messages/sendtext); RCS has no such allowance, still template-only.
const REPLY_TEMPLATE_ONLY_CHANNELS = ['rcs'];

/* ── New Message modal ─────────────────────────────────────── */
function NewMessageModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const wrapRef = useRef(null);
  const timerRef = useRef(null);
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [lead, setLead]       = useState(null);
  const [channel, setChannel] = useState('email');
  const [templates, setTemplates] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving]   = useState(false);
  const [waLabel, setWaLabel] = useState('');

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); setLead(null); setChannel('email'); setTemplateId(''); setAccountId(''); setMessage(''); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    api.get('/api/meta').then((d) => setTemplates(d?.templates ?? [])).catch(() => {});
    api.get('/api/settings/integration-accounts').then((d) => setAccounts(d?.accounts ?? [])).catch(() => {});
    api.get('/api/settings/integrations').then((d) => setWaLabel(d?.settings?.wa_anantya_waba_id || '')).catch(() => {});
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (!term || lead) { setResults([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const d = await api.get(`/api/leads?search=${encodeURIComponent(term)}&page=1`);
        setResults((d?.leads ?? []).slice(0, 8));
      } catch { setResults([]); }
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [query, lead]);

  const templateOnly = TEMPLATE_ONLY_CHANNELS.includes(channel);
  const accountsForChannel = accounts.filter((a) => a.channel === channel && a.is_active);
  // Once a named account is picked, only show templates synced for that account —
  // otherwise show the company-default (unassigned) templates for this channel.
  const templatesForChannel = templates.filter((t) => t.channel === channel
    && (accountId ? String(t.integration_account_id) === String(accountId) : !t.integration_account_id));

  const pickChannel = (value) => { setChannel(value); setTemplateId(''); setAccountId(''); setMessage(''); };

  const pickAccount = (id) => { setAccountId(id); setTemplateId(''); setMessage(''); };

  const pickTemplate = (id) => {
    setTemplateId(id);
    const t = templatesForChannel.find((x) => String(x.id) === String(id));
    setMessage(t?.body || '');
  };

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!lead) return toast('Pick a lead first.', 'danger');
    if (templateOnly && !templateId) return toast('Pick an approved template first.', 'danger');
    setSaving(true);
    try {
      const res = await api.post('/api/conversations', {
        lead_id: lead.id, channel,
        message: templateOnly ? '' : message,
        // Non-template-only channels treat the (possibly template-prefilled) message box as
        // freeform text — send exactly what's in the box rather than re-fetching the template
        // server-side, so edits the user made after picking a template aren't silently dropped.
        template_id: templateOnly ? (templateId || null) : null,
        integration_account_id: accountId || null,
      });
      if (res?.delivered === false) {
        toast('Conversation started, but the message could not be delivered — check channel settings.', 'danger');
      } else {
        toast('Conversation ready.', 'success');
      }
      onCreated?.(res?.id);
      onClose();
    } catch (err) { toast(err.message || 'Failed to start conversation.', 'danger'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="crm-drawer-backdrop" onClick={onClose} />
      <div className="crm-drawer open" ref={wrapRef}>
        <div className="crm-drawer-header">
          <div className="crm-drawer-title"><i className="bi bi-chat-square-text-fill" />New Message</div>
          <button className="crm-drawer-close" onClick={onClose}><i className="bi bi-x-lg text-13" /></button>
        </div>
        <form onSubmit={submit} className="crm-drawer-body">
          <div className="mb-3">
            <label className="crm-label">Lead <span className="req">*</span></label>
            {lead ? (
              <div className="d-flex align-items-center justify-content-between crm-input">
                <span className="text-truncate">{lead.name}{lead.company ? ` · ${lead.company}` : ''}</span>
                <button type="button" className="btn btn-sm btn-link text-danger p-0" onClick={() => setLead(null)}>
                  <i className="bi bi-x-lg" />
                </button>
              </div>
            ) : (
              <>
                <input className="crm-input" placeholder="Search leads by name, email, mobile…"
                  value={query} onChange={(e) => setQuery(e.target.value)} />
                {results.length > 0 && (
                  <div className="crm-lead-pick-results">
                    {results.map((l) => (
                      <button key={l.id} type="button" className="crm-lead-pick-item" onClick={() => { setLead(l); setQuery(''); setResults([]); }}>
                        <span className="crm-search-item-avatar">{initials(l.name)}</span>
                        <div className="overflow-hidden text-start">
                          <div className="crm-search-item-name text-truncate">{l.name}</div>
                          <div className="crm-search-item-sub text-truncate">{l.email || l.mobile || '—'}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="mb-3">
            <label className="crm-label">Channel</label>
            <select className="crm-select w-100" value={channel} onChange={(e) => pickChannel(e.target.value)}>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
              <option value="rcs">RCS</option>
            </select>
          </div>
          {(accountsForChannel.length > 0 || (channel === 'whatsapp' && waLabel)) && (
            <div className="mb-3">
              <label className="crm-label">Send from account</label>
              <select className="crm-select w-100" value={accountId} onChange={(e) => pickAccount(e.target.value)} disabled={accountsForChannel.length === 0}>
                <option value="">{channel === 'whatsapp' && waLabel ? `Company default account (${waLabel})` : 'Company default account'}</option>
                {accountsForChannel.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.provider}</option>)}
              </select>
            </div>
          )}
          {templateOnly ? (
            <>
              <div className="mb-3">
                <label className="crm-label">Template <span className="req">*</span></label>
                <select className="crm-select w-100" value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
                  <option value="">— Select an approved template —</option>
                  {templatesForChannel.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {templatesForChannel.length === 0 && (
                  <div className="text-11 text-muted-3 mt-1">No approved {channel} templates yet — create one in Templates first.</div>
                )}
              </div>
              {templateId && (
                <div className="mb-3">
                  <label className="crm-label">Preview</label>
                  <div className="crm-input" style={{ background: '#f8fafc', color: '#374151', whiteSpace: 'pre-wrap' }}>
                    {message || <span className="text-muted-3">No preview available for this template.</span>}
                  </div>
                  <div className="text-11 text-muted-3 mt-1">
                    <i className="bi bi-info-circle me-1" />WhatsApp/RCS only send via approved templates — the exact wording above is what gets delivered.
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {templatesForChannel.length > 0 && (
                <div className="mb-3">
                  <label className="crm-label">Template (optional)</label>
                  <select className="crm-select w-100" value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
                    <option value="">— None, write your own message —</option>
                    {templatesForChannel.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <div className="text-11 text-muted-3 mt-1">Picking a template fills the message below — edit it freely before sending.</div>
                </div>
              )}
              <div className="mb-3">
                <label className="crm-label">Message (optional)</label>
                <textarea className="crm-input no-resize" rows={4} placeholder="Type a message to send now, or leave blank to just open the thread…"
                  value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
            </>
          )}
        </form>
        <div className="crm-drawer-footer">
          <button className="btn-crm btn-crm-lg flex-grow-1" disabled={saving} onClick={submit}>
            {saving ? <><span className="spinner-border spinner-border-sm me-2" />Starting…</> : <><i className="bi bi-send-fill" />Start Conversation</>}
          </button>
          <button className="btn btn-outline-secondary rounded-crm-btn fw-semibold text-13 min-w-90" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}

/* ── Main page ──────────────────────────────────────────────── */
export default function ConversationsPage() {
  const toast = useToast();
  const [filter, setFilter]       = useState('all');
  const [search, setSearch]       = useState('');
  // Deep-link support: a notification for a new reply points at ?id=<conversationId>.
  const [selectedId, setSelectedId] = useState(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    return id ? Number(id) : null;
  });
  const [reply, setReply]         = useState('');
  const [sending, setSending]     = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const scrollRef = useRef(null);

  // Polled (not just loaded once) so a new inbound WhatsApp/email message — or a
  // brand-new lead auto-created from an unrecognized WhatsApp number — shows up
  // here without the user having to manually refresh the page.
  const { data: listData, loading: listLoading, reload: reloadList } = useResource(buildListQuery(filter, search), [filter, search], 8000);
  const conversations = listData?.conversations ?? [];
  const counts = listData?.counts ?? { all: 0, email: 0, whatsapp: 0, sms: 0, rcs: 0, unassigned: 0 };

  const { data: threadData, loading: threadLoading, reload: reloadThread } = useResource(
    selectedId ? `/api/conversations/${selectedId}/messages` : null,
    [selectedId],
    8000
  );

  useEffect(() => {
    if (!selectedId && conversations.length > 0) setSelectedId(conversations[0].id);
  }, [conversations, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    api.post(`/api/conversations/${selectedId}/read`, {}).then(reloadList).catch(() => {});
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [threadData]);

  const sendReply = useCallback(async (e) => {
    e.preventDefault();
    const body = reply.trim();
    if (!body || !selectedId) return;
    setSending(true);
    try {
      const res = await api.post(`/api/conversations/${selectedId}/messages`, { body });
      setReply('');
      reloadThread();
      reloadList();
      if (res?.delivered === false) toast('Saved, but delivery failed — check channel settings.', 'danger');
    } catch (err) { toast(err.message || 'Failed to send message.', 'danger'); }
    finally { setSending(false); }
  }, [reply, selectedId, reloadThread, reloadList, toast]);

  const conversation = threadData?.conversation;
  const deal = threadData?.deal;
  const messages = threadData?.messages ?? [];

  // WhatsApp free-text replies only work inside the 24h customer-care window
  // that opens after the lead's last inbound message — once it's been more
  // than 24h (or the lead has never messaged in at all), Anantya will reject
  // a free-text send, so surface that in the UI before the user tries.
  const lastInbound = [...messages].reverse().find((m) => m.direction === 'in');
  const waWindowClosed = conversation?.channel === 'whatsapp'
    && (!lastInbound || (Date.now() - new Date(lastInbound.created_at).getTime()) > 24 * 3600 * 1000);

  // Ding when a new inbound reply lands in the thread that's currently open —
  // the notification bell already covers replies on threads you're not looking at.
  const lastInboundIdRef = useRef(null);

  // Switching to a different conversation must not itself trigger a ding —
  // reset the baseline so only a genuinely new reply (while this thread stays
  // open) counts, not just clicking into a thread with an older last message.
  useEffect(() => {
    lastInboundIdRef.current = null;
  }, [selectedId]);

  useEffect(() => {
    if (!messages.length) return;
    const lastInbound = [...messages].reverse().find((m) => m.direction === 'in');
    if (!lastInbound) return;
    if (lastInboundIdRef.current !== null && Number(lastInbound.id) !== lastInboundIdRef.current) {
      playNotificationSound();
    }
    lastInboundIdRef.current = Number(lastInbound.id);
  }, [messages]);

  return (
    <div className="crm-conv-page">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="text-12 text-muted-2">Every email, WhatsApp, SMS, and call in one inbox</div>
        <button className="btn-crm" onClick={() => setModalOpen(true)}>
          <i className="bi bi-plus-lg" />New Message
        </button>
      </div>

      {/* Filter tabs */}
      <div className="crm-conv-tabs mb-3">
        {FILTERS.map((f) => (
          <button key={f.key} className={`crm-conv-tab ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label} <span className="crm-conv-tab-count">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="crm-conv-body">
        {/* List */}
        <div className="crm-conv-list">
          <div className="crm-conv-search">
            <i className="bi bi-search crm-search-icon" />
            <input className="crm-search-input" placeholder="Search conversations…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="crm-conv-list-scroll">
            {listLoading ? <LoadingBox height="120px" /> : conversations.length === 0 ? (
              <div className="crm-empty py-5">
                <i className="bi bi-chat-square-dots crm-empty-icon" />
                <div className="crm-empty-title">No conversations</div>
              </div>
            ) : conversations.map((c) => (
              <button key={c.id} className={`crm-conv-item ${Number(selectedId) === Number(c.id) ? 'active' : ''}`} onClick={() => setSelectedId(c.id)}>
                <div className="d-flex align-items-center justify-content-between">
                  <span className="crm-conv-item-name text-truncate">
                    {c.lead_company ? `${c.lead_company} · ` : ''}{c.lead_name}
                  </span>
                  <span className="crm-conv-item-time flex-shrink-0">{timeAgo(c.last_message_at || c.created_at)}</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <div className="crm-conv-item-preview text-truncate">
                    {c.last_message_preview || 'No messages yet'}
                  </div>
                  {Number(c.unread_count) > 0 && <span className="crm-conv-unread">{c.unread_count}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Thread */}
        <div className="crm-conv-thread">
          {!selectedId || threadLoading ? (
            <LoadingBox height="100%" text={selectedId ? 'Loading…' : 'Select a conversation'} />
          ) : !conversation ? (
            <div className="crm-empty py-5"><div className="crm-empty-title">Conversation not found</div></div>
          ) : (
            <>
              <div className="crm-conv-thread-header">
                <div className="min-w-0">
                  <div className="crm-conv-thread-title text-truncate">
                    {conversation.lead_company ? `${conversation.lead_company} — ` : ''}{conversation.lead_name}
                  </div>
                  <div className="crm-conv-thread-sub text-truncate">
                    {conversation.lead_email || conversation.lead_mobile || '—'}
                    {deal?.value ? ` · Deal ${money(deal.value, deal.currency)}` : ''}
                    {deal?.stage_name ? ` · ${deal.stage_name}` : ''}
                  </div>
                </div>
                <span className="badge badge-crm badge-purple text-capitalize flex-shrink-0">
                  <i className={`bi bi-${CHANNEL_ICON[conversation.channel] || 'chat-dots-fill'} me-1`} />{conversation.channel}
                </span>
              </div>

              <div className="crm-conv-messages" ref={scrollRef}>
                {messages.length === 0 ? (
                  <div className="crm-empty py-5">
                    <i className="bi bi-chat-dots crm-empty-icon" />
                    <div className="crm-empty-title">No messages yet — say hello</div>
                  </div>
                ) : messages.map((m) => (
                  <div key={m.id} className={`crm-msg-row ${m.direction === 'out' ? 'out' : 'in'}`}>
                    <div className={`crm-msg-bubble ${m.direction === 'out' ? 'out' : 'in'}`}>
                      {m.body}
                      {m.status === 'failed' && <div className="crm-msg-failed"><i className="bi bi-exclamation-triangle-fill me-1" />Delivery failed</div>}
                    </div>
                    <div className={`crm-msg-time ${m.direction === 'out' ? 'out' : 'in'}`}>
                      <i className={`bi bi-${CHANNEL_ICON[m.channel] || 'chat-dots-fill'} me-1`} title={m.channel} />
                      {m.sender_name ? `${m.sender_name} · ` : ''}{timeAgo(m.created_at)}
                    </div>
                  </div>
                ))}
              </div>

              {REPLY_TEMPLATE_ONLY_CHANNELS.includes(conversation.channel) ? (
                <div className="text-11 text-muted-3 p-2 text-center border-top">
                  <i className="bi bi-info-circle me-1" />
                  RCS only sends approved templates — open <strong>New Message</strong> to pick one for this lead.
                </div>
              ) : waWindowClosed ? (
                <div className="text-11 text-muted-3 p-2 text-center border-top bg-light">
                  <i className="bi bi-clock-history me-1" />
                  24-hour reply window closed — this lead hasn't messaged in recently, so free-text replies aren't allowed.
                  Open <strong>New Message</strong> and send an approved template to restart the conversation.
                </div>
              ) : (
                <form className="crm-conv-reply" onSubmit={sendReply}>
                  <input className="crm-conv-reply-input" placeholder="Type a reply…"
                    value={reply} onChange={(e) => setReply(e.target.value)} disabled={sending} />
                  <button className="crm-conv-reply-send" disabled={sending || !reply.trim()}>
                    {sending ? <span className="spinner-border spinner-border-sm" /> : <i className="bi bi-arrow-right" />}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      <NewMessageModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={(id) => { reloadList(); setSelectedId(id); }} />
    </div>
  );
}
