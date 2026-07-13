import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../services/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';
import { timeAgo, initials } from '../../utils/formatters.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';

const SUGGESTIONS = [
  'Why did our lead-to-close rate drop this month?',
  'Which deals are most likely to close this week?',
  'Compare WhatsApp vs Email reply rates',
  'Summarize the Negotiation stage bottleneck',
  'Draft a follow-up plan for stalled deals',
  "Forecast next month's revenue",
];

/* Minimal safe markdown: **bold** + "- " bullets. Never dangerouslySetInnerHTML — this text comes from an LLM. */
function renderMessageContent(text) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let currentList = null;
  for (const line of lines) {
    const trimmed = line.trim();
    const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ');
    if (isBullet) {
      if (!currentList) { currentList = []; blocks.push({ type: 'ul', items: currentList }); }
      currentList.push(trimmed.slice(2));
    } else {
      currentList = null;
      blocks.push({ type: trimmed ? 'p' : 'br', text: line });
    }
  }
  const renderInline = (str, keyPrefix) => str.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
      : <span key={`${keyPrefix}-${i}`}>{part}</span>
  ));
  return blocks.map((b, i) => {
    if (b.type === 'ul') return <ul key={i} className="mb-2 ps-3">{b.items.map((item, j) => <li key={j}>{renderInline(item, `${i}-${j}`)}</li>)}</ul>;
    if (b.type === 'br') return <div key={i} style={{ height: 6 }} />;
    return <p key={i} className="mb-2">{renderInline(b.text, `${i}`)}</p>;
  });
}

export default function AnalystPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  const loadSessions = useCallback(async () => {
    const d = await api.get('/api/analyst/sessions');
    const list = d?.sessions ?? [];
    setSessions(list);
    return list;
  }, []);

  const openSession = useCallback(async (id) => {
    setLoading(true);
    try {
      const d = await api.get(`/api/analyst/sessions/${id}/messages`);
      setSessionId(id);
      setMessages(d?.messages ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const list = await loadSessions();
      if (list.length) await openSession(list[0].id);
      else setLoading(false);
    })();
  }, [loadSessions, openSession]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const ensureSession = async () => {
    if (sessionId) return sessionId;
    const d = await api.post('/api/analyst/sessions', {});
    setSessionId(d.id);
    return d.id;
  };

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || sending) return;
    setInput('');
    setSending(true);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', content: question, created_at: new Date() }]);
    try {
      const id = await ensureSession();
      const reply = await api.post(`/api/analyst/sessions/${id}/messages`, { message: question });
      setMessages((prev) => [...prev, reply]);
      loadSessions();
    } catch (err) {
      toast(err.message || 'Failed to reach My Analyst.', 'danger');
    } finally {
      setSending(false);
    }
  };

  const handleNewChat = () => {
    setShowHistory(false);
    setSessionId(null);
    setMessages([]);
  };

  const handleSubmit = (e) => { e.preventDefault(); send(); };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-1">
        <div>
          <h5 className="fw-bold mb-0 text-brand"><i className="bi bi-stars me-2 text-purple" />My Analyst</h5>
          <div className="text-muted text-12">Ask anything about your pipeline, leads, or campaigns — plain English in, answers out.</div>
        </div>
        <div className="position-relative">
          <button className="btn btn-outline-secondary rounded-crm-xs text-13" onClick={() => setShowHistory((v) => !v)}>
            <i className="bi bi-clock-history me-1" />History
          </button>
          {showHistory && (
            <div className="crm-analyst-history-dropdown shadow-sm">
              <button className="crm-analyst-history-item fw-semibold" onClick={handleNewChat}>
                <i className="bi bi-plus-lg me-2" />New chat
              </button>
              <hr className="my-1" />
              {sessions.length === 0 && <div className="text-muted text-12 px-3 py-2">No past conversations yet.</div>}
              {sessions.map((s) => (
                <button key={s.id} className={`crm-analyst-history-item ${s.id === sessionId ? 'active' : ''}`}
                  onClick={() => { openSession(s.id); setShowHistory(false); }}>
                  <div className="text-truncate">{s.title || s.first_message || 'New chat'}</div>
                  <div className="text-11 text-muted-3">{timeAgo(s.updated_at)} ago</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="row g-3 mt-3">
        <div className="col-lg-3">
          <div className="card crm-card h-100">
            <div className="card-body p-3">
              <div className="text-11 fw-bold text-uppercase ls-wide text-muted-3 mb-2">Try asking</div>
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="crm-analyst-suggestion" onClick={() => send(s)} disabled={sending}>{s}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="col-lg-9">
          <div className="card crm-card d-flex flex-column crm-analyst-chat">
            <div className="flex-grow-1 overflow-auto p-4" ref={scrollRef}>
              {loading ? <LoadingBox /> : messages.length === 0 ? (
                <div className="text-center text-muted py-5">
                  <i className="bi bi-stars fs-2 mb-2 d-block text-purple" />
                  Ask a question to get started, or pick one from the left.
                </div>
              ) : messages.map((m) => (
                <div key={m.id} className={`crm-msg-row ${m.role === 'user' ? 'out' : 'in'}`}>
                  <div className={`d-flex align-items-start gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <span className={m.role === 'user' ? 'crm-topbar-avatar flex-shrink-0' : 'crm-analyst-avatar flex-shrink-0'}>
                      {m.role === 'user' ? initials(user?.name) : <i className="bi bi-stars" />}
                    </span>
                    <div className={`crm-msg-bubble ${m.role === 'user' ? 'out' : 'in'}`}>
                      {m.role === 'assistant' ? renderMessageContent(m.content) : m.content}
                    </div>
                  </div>
                  <div className={`crm-msg-time ${m.role === 'user' ? 'out' : 'in'}`}>{timeAgo(m.created_at)}</div>
                </div>
              ))}
              {sending && (
                <div className="crm-msg-row in">
                  <div className="d-flex align-items-start gap-2">
                    <span className="crm-analyst-avatar flex-shrink-0"><i className="bi bi-stars" /></span>
                    <div className="crm-msg-bubble in"><span className="spinner-border spinner-border-sm me-2" />Thinking…</div>
                  </div>
                </div>
              )}
            </div>
            <form className="crm-conv-reply" onSubmit={handleSubmit}>
              <input className="crm-conv-reply-input" placeholder="Ask your analyst anything…"
                value={input} onChange={(e) => setInput(e.target.value)} disabled={sending} />
              <button className="crm-conv-reply-send" disabled={sending || !input.trim()}>
                <i className="bi bi-arrow-right" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
