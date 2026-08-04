import { createContext, useState, useEffect, useRef, useCallback } from 'react';
import { Device } from '@twilio/voice-sdk';
import { api } from '../services/api.js';
import { useAuth } from '../hooks/useAuth.js';

export const VoiceContext = createContext(null);

// Owns the single shared Twilio Voice SDK Device for the whole app — one
// browser tab, one WebRTC connection, shared between the Lead Detail "Call"
// button and the persistent VoiceWidget (incoming-call/active-call UI).
// Silently does nothing if the company hasn't configured Voice calling yet
// (getVoiceAccessToken() on the server returns configured:false) — most
// companies won't have this set up, so no error should ever surface here.
export function VoiceProvider({ children }) {
  const { user } = useAuth();
  const deviceRef = useRef(null);
  const activeCallRef = useRef(null);
  const timerRef = useRef(null);

  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | incoming | connecting | in-call
  const [callerInfo, setCallerInfo] = useState(null); // { leadId, leadName }
  const [muted, setMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const startTimer = () => {
    setElapsedSeconds(0);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
  };
  const stopTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const resetCallState = useCallback(() => {
    stopTimer();
    activeCallRef.current = null;
    setStatus('idle');
    setCallerInfo(null);
    setMuted(false);
  }, []);

  const wireCallEvents = useCallback((call) => {
    call.on('accept', () => { setStatus('in-call'); startTimer(); });
    call.on('disconnect', resetCallState);
    call.on('cancel', resetCallState);
    call.on('reject', resetCallState);
    call.on('error', resetCallState);
  }, [resetCallState]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    api.get('/api/voice/token').then((data) => {
      if (cancelled || !data?.configured) return;
      setConfigured(true);

      const device = new Device(data.token, { logLevel: 'error' });
      deviceRef.current = device;

      device.on('tokenWillExpire', async () => {
        try {
          const fresh = await api.get('/api/voice/token');
          if (fresh?.configured) device.updateToken(fresh.token);
        } catch { /* next expiry cycle will retry */ }
      });

      device.on('incoming', (call) => {
        // Only one call at a time — a second incoming call while already busy
        // just rings out unanswered on Twilio's side (matches normal phone behavior).
        if (activeCallRef.current) return;
        activeCallRef.current = call;
        setCallerInfo({
          leadId: call.customParameters?.get('leadId') || null,
          leadName: call.customParameters?.get('leadName') || 'Unknown caller',
        });
        setStatus('incoming');
        wireCallEvents(call);
      });

      device.register();
    }).catch(() => {});

    return () => {
      cancelled = true;
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, [user, wireCallEvents]);

  const callLead = useCallback(async (leadId, leadName) => {
    if (!deviceRef.current) throw new Error('Voice calling is not set up for your company yet — ask an admin to configure it in Settings → Channels → Voice.');
    if (status !== 'idle') throw new Error('You are already on a call.');
    const { comm_id: commId } = await api.post(`/api/leads/${leadId}/call`);
    setCallerInfo({ leadId: String(leadId), leadName: leadName || 'Lead' });
    setStatus('connecting');
    const call = await deviceRef.current.connect({ params: { commId: String(commId) } });
    activeCallRef.current = call;
    wireCallEvents(call);
  }, [status, wireCallEvents]);

  const answer = useCallback(() => activeCallRef.current?.accept(), []);
  const reject = useCallback(() => {
    activeCallRef.current?.reject();
    resetCallState();
  }, [resetCallState]);
  const hangup = useCallback(() => activeCallRef.current?.disconnect(), []);
  const toggleMute = useCallback(() => {
    const call = activeCallRef.current;
    if (!call) return;
    const next = !muted;
    call.mute(next);
    setMuted(next);
  }, [muted]);

  return (
    <VoiceContext.Provider value={{
      configured, status, callerInfo, muted, elapsedSeconds,
      callLead, answer, reject, hangup, toggleMute,
    }}>
      {children}
    </VoiceContext.Provider>
  );
}
