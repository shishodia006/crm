import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api.js';

export function useResource(path, deps = [], refreshInterval = 0) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!path) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api.get(path);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load');
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
