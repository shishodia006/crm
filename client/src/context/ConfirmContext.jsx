import { createContext, useState, useCallback, useRef } from 'react';

export const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setState({
        kind: 'confirm',
        message,
        title: options.title || 'Please confirm',
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        danger: options.danger !== false,
      });
    });
  }, []);

  const promptText = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setState({
        kind: 'prompt',
        message,
        title: options.title || 'Please provide details',
        confirmLabel: options.confirmLabel || 'Submit',
        cancelLabel: options.cancelLabel || 'Cancel',
        placeholder: options.placeholder || '',
        inputValue: options.defaultValue || '',
        required: options.required !== false,
      });
    });
  }, []);

  const close = useCallback((result) => {
    resolver.current?.(result);
    resolver.current = null;
    setState(null);
  }, []);

  const setInputValue = (value) => setState((prev) => (prev ? { ...prev, inputValue: value } : prev));

  const cancelValue = state?.kind === 'prompt' ? null : false;
  const canSubmit = state?.kind !== 'prompt' || !state.required || state.inputValue.trim().length > 0;

  return (
    <ConfirmContext.Provider value={{ confirm, promptText }}>
      {children}
      {state && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => close(cancelValue)}
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
            <div style={{ fontSize: 13, color: '#475569', marginBottom: state.kind === 'prompt' ? 10 : 20, lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: '50vh', overflowY: 'auto' }}>{state.message}</div>
            {state.kind === 'prompt' && (
              <input
                type="text"
                autoFocus
                className="form-control form-control-sm"
                style={{ marginBottom: 20 }}
                value={state.inputValue}
                placeholder={state.placeholder}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) close(state.inputValue); }}
              />
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => close(cancelValue)}>{state.cancelLabel}</button>
              <button
                type="button"
                className={state.kind === 'confirm' && state.danger ? 'btn btn-danger btn-sm' : 'btn-crm btn-crm-sm'}
                disabled={!canSubmit}
                onClick={() => close(state.kind === 'prompt' ? state.inputValue : true)}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
