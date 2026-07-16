import { useContext } from 'react';
import { ConfirmContext } from '../context/ConfirmContext.jsx';

export function usePrompt() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('usePrompt must be used within ConfirmProvider');
  return ctx.promptText;
}
