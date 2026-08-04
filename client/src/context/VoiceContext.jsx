import { createContext, useState, useEffect, useRef, useCallback } from 'react';
import { Device } from '@twilio/voice-sdk';
import { api } from '../services/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import { playRingtone } from '../utils/sound.js';

export const VoiceContext = createContext(null);

// Owns the single shared Twilio Voice SDK Device for the whole app — one
// browser tab, one WebRTC connection, shared between the Lead Detail "Call"
// button and the persistent VoiceWidget (incoming-call/active-call UI).
// Silently does nothing if the company hasn't configured Voice calling yet
// (getVoiceAccessToken() on the server returns configured:false) — most
// companies won't have this set up, so no error should ever surface here.
export function VoiceProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const deviceRef = useRef(null);
  const activeCallRef = useRef(null);
  const timerRef = useRef(null);
  const callAttemptRef = useRef(0);
  const ringtoneRef = useRef(null);
  const lastDeviceErrorToastRef = useRef(0);

  const stopRingtone = () => {
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
  };
  const startRingtone = (kind) => {
    stopRingtone();
    ringtoneRef.current = playRingtone(kind);
  };

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
    stopRingtone();
    activeCallRef.current = null;
    setStatus('idle');
    setCallerInfo(null);
    setMuted(false);
  }, []);

  const wireCallEvents = useCallback((call) => {
    call.on('accept', () => { stopRingtone(); setStatus('in-call'); startTimer(); });
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

      // Without this, a Device-level signaling failure (bad/mismatched Twilio
      // credentials, network block, etc.) throws as a fully uncaught exception
      // in the browser console with no visible feedback — the widget just sits
      // there ("Calling…") until our connect() timeout eventually gives up,
      // looking like nothing happened at all.
      device.on('error', (twilioError) => {
        const now = Date.now();
        if (now - lastDeviceErrorToastRef.current > 5000) {
          lastDeviceErrorToastRef.current = now;
          toast(
            `Voice calling error: ${twilioError?.message || 'could not connect to Twilio.'} Check the Account SID / API Key / API Key Secret in Settings → Channels → Voice.`,
            'danger'
          );
        }
        resetCallState();
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
        startRingtone('incoming');
        wireCallEvents(call);
      });

      device.register();
    }).catch(() => {});

    return () => {
      cancelled = true;
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, [user, wireCallEvents, resetCallState, toast]);

  // How long to wait for device.connect() to resolve before giving up. This
  // normally resolves in well under a second, but it internally waits on the
  // browser's getUserMedia() mic-permission prompt first — if that prompt is
  // ignored, dismissed, or the mic is blocked, connect() just hangs forever
  // with no error, and (before this fix) there was no Call object yet for the
  // hangup button to act on, so the widget looked permanently stuck.
  const CONNECT_TIMEOUT_MS = 20000;

  const callLead = useCallback(async (leadId, leadName) => {
    if (!deviceRef.current) throw new Error('Voice calling is not set up for your company yet — ask an admin to configure it in Settings → Channels → Voice.');
    if (status !== 'idle') throw new Error('You are already on a call.');
    const { comm_id: commId } = await api.post(`/api/leads/${leadId}/call`);
    setCallerInfo({ leadId: String(leadId), leadName: leadName || 'Lead' });
    setStatus('connecting');
    startRingtone('ringback');
    const attemptId = ++callAttemptRef.current;

    let call;
    try {
      call = await Promise.race([
        deviceRef.current.connect({ params: { commId: String(commId) } }),
        new Promise((_, reject) => setTimeout(
          () => reject(new Error('Could not start the call — check that you allowed microphone access for this site, then try again.')),
          CONNECT_TIMEOUT_MS
        )),
      ]);
    } catch (err) {
      // A stale attempt (user already hit Cancel, or a newer call started)
      // shouldn't clobber whatever state came after it.
      if (callAttemptRef.current === attemptId) resetCallState();
      throw err;
    }

    // The device.connect() call itself finally resolved after we'd already
    // given up on it (timeout fired, or the user cancelled) — hang up the
    // now-unwanted call immediately instead of silently going live.
    if (callAttemptRef.current !== attemptId) {
      call.disconnect();
      return;
    }
    activeCallRef.current = call;
    wireCallEvents(call);
  }, [status, wireCallEvents, resetCallState]);

  const answer = useCallback(() => activeCallRef.current?.accept(), []);
  const reject = useCallback(() => {
    activeCallRef.current?.reject();
    resetCallState();
  }, [resetCallState]);
  // Always resets the UI, even if there's no live Call object yet (e.g. still
  // stuck inside device.connect() waiting on mic permission) — otherwise the
  // widget has no way to be dismissed and looks permanently stuck.
  const hangup = useCallback(() => {
    callAttemptRef.current += 1;
    activeCallRef.current?.disconnect();
    resetCallState();
  }, [resetCallState]);
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
