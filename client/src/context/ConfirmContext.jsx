import { createContext, useState, useCallback, useRef } from 'react';

export const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setState({
        message,
        title: options.title || 'Please confirm',
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        danger: options.danger !== false,
      });
    });
  }, []);

  const close = useCallback((result) => {
    resolver.current?.(result);
    resolver.current = null;
    setState(null);
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => close(false)}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)' }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative', zIndex: 1, width: '100%', maxWidth: 380,
              background: '#fff', borderRadius: 14,
              boxShadow: '0 24px 60px rgba(0,0,0,0.25)', padding: 20,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>{state.title}</div>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 20, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{state.message}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => close(false)}>{state.cancelLabel}</button>
              <button type="button" className={`btn btn-sm ${state.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>{state.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
