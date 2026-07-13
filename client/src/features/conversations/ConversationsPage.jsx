import { useState, useEffect, useRef, useCallback } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { useToast } from '../../hooks/useToast.js';
import { api } from '../../services/api.js';
import { initials, timeAgo, money } from '../../utils/formatters.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';

const FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'email',      label: 'Email' },
  { key: 'whatsapp',   label: 'WhatsApp' },
  { key: 'sms',        label: 'SMS' },
  { key: 'unassigned', label: 'Unassigned' },
];

const CHANNEL_ICON = { email: 'envelope-fill', whatsapp: 'whatsapp', sms: 'chat-dots-fill', call: 'telephone-fill' };

function buildListQuery(filter, search) {
  const params = new URLSearchParams();
  if (filter !== 'all' && filter !== 'unassigned') params.set('channel', filter);
  if (filter === 'unassigned') params.set('assigned', 'unassigned');
  if (search.trim()) params.set('search', search.trim());
  return `/api/conversations?${params.toString()}`;
}

/* ── New Message modal ─────────────────────────────────────── */
function NewMessageModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const wrapRef = useRef(null);
  const timerRef = useRef(null);
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [lead, setLead]       = useState(null);
  const [channel, setChannel] = useState('email');
  const [message, setMessage] = useState('');
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); setLead(null); setChannel('email'); setMessage(''); }
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

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!lead) return toast('Pick a lead first.', 'danger');
    setSaving(true);
    try {
      const res = await api.post('/api/conversations', { lead_id: lead.id, channel, message });
      toast('Conversation ready.', 'success');
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
            <select className="crm-select w-100" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </select>
          </div>
          <div className="mb-3">
            <label className="crm-label">Message (optional)</label>
            <textarea className="crm-input no-resize" rows={4} placeholder="Type a message to send now, or leave blank to just open the thread…"
              value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
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
  const [selectedId, setSelectedId] = useState(null);
  const [reply, setReply]         = useState('');
  const [sending, setSending]     = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const scrollRef = useRef(null);

  const { data: listData, loading: listLoading, reload: reloadList } = useResource(buildListQuery(filter, search), [filter, search]);
  const conversations = listData?.conversations ?? [];
  const counts = listData?.counts ?? { all: 0, email: 0, whatsapp: 0, sms: 0, unassigned: 0 };

  const { data: threadData, loading: threadLoading, reload: reloadThread } = useResource(
    selectedId ? `/api/conversations/${selectedId}/messages` : null,
    [selectedId]
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

  return (
    <div className="crm-conv-page">
      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-3">
        <div>
          <h5 className="fw-bold mb-0 text-brand">Conversations</h5>
          <div className="text-12 text-muted-2">Every email, WhatsApp, SMS, and call in one inbox</div>
        </div>
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
                      {m.sender_name ? `${m.sender_name} · ` : ''}{timeAgo(m.created_at)}
                    </div>
                  </div>
                ))}
              </div>

              <form className="crm-conv-reply" onSubmit={sendReply}>
                <input className="crm-conv-reply-input" placeholder="Type a reply…"
                  value={reply} onChange={(e) => setReply(e.target.value)} disabled={sending} />
                <button className="crm-conv-reply-send" disabled={sending || !reply.trim()}>
                  {sending ? <span className="spinner-border spinner-border-sm" /> : <i className="bi bi-arrow-right" />}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <NewMessageModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={(id) => { reloadList(); setSelectedId(id); }} />
    </div>
  );
}
