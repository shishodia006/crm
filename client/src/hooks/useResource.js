import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api.js';
import { useToast } from './useToast.js';

export function useResource(path, deps = [], refreshInterval = 0) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const toast = useToast();

  const load = useCallback(async (silent = false) => {
    if (!path) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api.get(path);
      setData(res);
    } catch (err) {
      const message = err.message || 'Failed to load';
      setError(message);
      if (!silent) toast(message, 'danger');
    } finally {
      if (!silent) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => { load(false); }, [load]);

  useEffect(() => {
    if (!refreshInterval) return;
    intervalRef.current = setInterval(() => load(true), refreshInterval);
    return () => clearInterval(intervalRef.current);
  }, [load, refreshInterval]);

  return { data, loading, error, reload: () => load(false) };
}
