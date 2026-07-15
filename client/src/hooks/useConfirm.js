import { useContext } from 'react';
import { ConfirmContext } from '../context/ConfirmContext.jsx';

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx.confirm;
}
