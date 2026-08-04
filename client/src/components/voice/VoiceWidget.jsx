import { useVoice } from '../../hooks/useVoice.js';

function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const CARD_STYLE = {
  position: 'fixed', bottom: 20, right: 20, zIndex: 1080,
  minWidth: 260, borderRadius: 14, background: '#fff',
  boxShadow: '0 12px 32px rgba(15,23,42,0.22)', border: '1px solid #e2e8f0',
  overflow: 'hidden',
};

export default function VoiceWidget() {
  const { status, callerInfo, muted, elapsedSeconds, answer, reject, hangup, toggleMute } = useVoice();

  if (status === 'idle') return null;

  if (status === 'incoming') {
    return (
      <div style={CARD_STYLE}>
        <div style={{ padding: '14px 16px', background: '#ecfdf5' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <i className="bi bi-telephone-inbound-fill me-1" />Incoming call
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginTop: 4 }}>
            {callerInfo?.leadName || 'Unknown caller'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: 12 }}>
          <button className="btn btn-success btn-sm flex-grow-1" onClick={answer}>
            <i className="bi bi-telephone-fill me-1" />Answer
          </button>
          <button className="btn btn-outline-danger btn-sm flex-grow-1" onClick={reject}>
            <i className="bi bi-telephone-x-fill me-1" />Decline
          </button>
        </div>
      </div>
    );
  }

  if (status === 'connecting') {
    return (
      <div style={CARD_STYLE}>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="spinner-border spinner-border-sm text-primary" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Calling…</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{callerInfo?.leadName || 'Lead'}</div>
          </div>
          <button className="btn btn-outline-danger btn-sm" onClick={hangup} title="Cancel">
            <i className="bi bi-telephone-x-fill" />
          </button>
        </div>
      </div>
    );
  }

  // in-call
  return (
    <div style={CARD_STYLE}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0, animation: 'pulse 1.5s infinite' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {callerInfo?.leadName || 'Lead'}
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{formatElapsed(elapsedSeconds)}</div>
        </div>
        <button
          className={`btn btn-sm ${muted ? 'btn-secondary' : 'btn-outline-secondary'}`}
          onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}
        >
          <i className={`bi bi-mic${muted ? '-mute-fill' : '-fill'}`} />
        </button>
        <button className="btn btn-danger btn-sm" onClick={hangup} title="Hang up">
          <i className="bi bi-telephone-x-fill" />
        </button>
      </div>
      <style>{'@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }'}</style>
    </div>
  );
}
