import { createContext, useState, useEffect, useCallback } from 'react';
import { api, clearCsrf } from '../services/api.js';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  const fetchMe = useCallback(async () => {
    try {
      const data = await api.get('/api/auth/me');
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = async (email, password) => {
    const data = await api.post('/api/auth/login', { email, password });
    setUser(data.user);
    return data;
  };

  const register = async (payload) => {
    await api.post('/api/auth/register', payload);
    await fetchMe();
  };

  const logout = async () => {
    await api.post('/api/auth/logout', {});
    clearCsrf();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, reload: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}
