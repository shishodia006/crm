import { createContext, useState, useCallback, useRef } from 'react';

export const ToastContext = createContext(null);

let _id = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message, type = 'success', duration = 4000) => {
    const id = ++_id;
    setToasts((prev) => [...prev, { id, message, type }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="toast-container position-fixed bottom-0 end-0 p-3 z-toast"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast show align-items-center text-bg-${t.type} border-0 mb-2`}
            role="alert"
          >
            <div className="d-flex">
              <div className="toast-body">{t.message}</div>
              <button
                type="button"
                className="btn-close btn-close-white me-2 m-auto"
                onClick={() => dismiss(t.id)}
              />
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
