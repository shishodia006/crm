import { useVoice } from '../../hooks/useVoice.js';
import { initials } from '../../utils/formatters.js';

function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function Avatar({ name, size = 84, ring }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {ring && (
        <>
          <span style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '2px solid #22c55e55', animation: 'voice-ring-pulse 1.6s ease-out infinite' }} />
          <span style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '2px solid #22c55e55', animation: 'voice-ring-pulse 1.6s ease-out infinite 0.5s' }} />
        </>
      )}
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 800, fontSize: size * 0.32,
        boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
      }}>
        {initials(name) || <i className="bi bi-person-fill" />}
      </div>
    </div>
  );
}

// Full-screen "phone call" popup for ringing/connecting — matches the app's
// existing modal pattern (backdrop + centered card, see EnrollmentModal in
// LeadDetail.jsx) so an incoming/outgoing call actually feels like a call
// instead of an easy-to-miss corner toast.
function CallPopup({ children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1090, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 340,
        background: '#fff', borderRadius: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        padding: '32px 24px 24px', textAlign: 'center',
      }}>
        {children}
      </div>
      <style>{`
        @keyframes voice-ring-pulse { 0% { opacity: 0.9; transform: scale(1); } 100% { opacity: 0; transform: scale(1.35); } }
      `}</style>
    </div>
  );
}

const RoundButton = ({ color, icon, label, onClick }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
    <button
      onClick={onClick}
      style={{
        width: 56, height: 56, borderRadius: '50%', border: 'none', color: '#fff',
        background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, boxShadow: `0 6px 18px ${color}66`, cursor: 'pointer',
      }}
    >
      <i className={`bi bi-${icon}`} />
    </button>
    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{label}</span>
  </div>
);

export default function VoiceWidget() {
  const { status, callerInfo, muted, elapsedSeconds, answer, reject, hangup, toggleMute } = useVoice();

  if (status === 'idle') return null;

  if (status === 'incoming') {
    return (
      <CallPopup>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
          <i className="bi bi-telephone-inbound-fill me-1" />Incoming call
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <Avatar name={callerInfo?.leadName} ring />
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 28 }}>
          {callerInfo?.leadName || 'Unknown caller'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
          <RoundButton color="#ef4444" icon="telephone-x-fill" label="Decline" onClick={reject} />
          <RoundButton color="#22c55e" icon="telephone-fill" label="Answer" onClick={answer} />
        </div>
      </CallPopup>
    );
  }

  if (status === 'connecting') {
    return (
      <CallPopup>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
          Calling…
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <Avatar name={callerInfo?.leadName} ring />
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 28 }}>
          {callerInfo?.leadName || 'Lead'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <RoundButton color="#ef4444" icon="telephone-x-fill" label="Cancel" onClick={hangup} />
        </div>
      </CallPopup>
    );
  }

  // in-call — compact floating bar so the agent can keep working while talking
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 1080,
      minWidth: 260, borderRadius: 14, background: '#fff',
      boxShadow: '0 12px 32px rgba(15,23,42,0.22)', border: '1px solid #e2e8f0', overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={callerInfo?.leadName} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {callerInfo?.leadName || 'Lead'}
          </div>
          <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#22c55e', marginRight: 5, animation: 'voice-live-dot 1.5s infinite' }} />
            {formatElapsed(elapsedSeconds)}
          </div>
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
      <style>{'@keyframes voice-live-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }'}</style>
    </div>
  );
}
