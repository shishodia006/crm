import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';

const DURATION_MS = 4000;

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function GreetingToast() {
  const { justLoggedIn, clearJustLoggedIn, company, user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!justLoggedIn) return undefined;
    setVisible(true);
    const timer = setTimeout(() => { setVisible(false); clearJustLoggedIn(); }, DURATION_MS);
    return () => clearTimeout(timer);
  }, [justLoggedIn, clearJustLoggedIn]);

  if (!visible) return null;

  const name = company?.name || user?.name || '';

  return (
    <div className="crm-greeting-toast">
      <button className="crm-greeting-toast-close" onClick={() => { setVisible(false); clearJustLoggedIn(); }}>
        <i className="bi bi-x-lg" />
      </button>
      <div className="crm-greeting-toast-body">
        <i className="bi bi-check-circle-fill crm-greeting-toast-icon" />
        <span><strong>{timeGreeting()} !</strong> {name}</span>
      </div>
      <div className="crm-greeting-toast-bar" style={{ animationDuration: `${DURATION_MS}ms` }} />
    </div>
  );
}
