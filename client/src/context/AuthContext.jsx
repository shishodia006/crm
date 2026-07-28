import { createContext, useState, useEffect, useCallback } from 'react';
import { api, clearCsrf } from '../services/api.js';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [company, setCompany] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  const fetchMe = useCallback(async () => {
    try {
      const data = await api.get('/api/auth/me');
      setUser(data.user ?? null);
      setCompany(data.company ?? null);
      setCompanies(data.companies ?? []);
    } catch {
      setUser(null);
      setCompany(null);
      setCompanies([]);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = async (email, password) => {
    const data = await api.post('/api/auth/login', { email, password });
    setUser(data.user);
    setCompany(data.company ?? null);
    setCompanies(data.companies ?? []);
    setJustLoggedIn(true);
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
    setCompany(null);
    setCompanies([]);
  };

  const switchCompany = async (companyId) => {
    const data = await api.post('/api/companies/select', { company_id: companyId });
    setCompany(data.company);
    return data.company;
  };

  return (
    <AuthContext.Provider value={{
      user, company, companies, login, register, logout, switchCompany, reload: fetchMe,
      justLoggedIn, clearJustLoggedIn: () => setJustLoggedIn(false),
    }}>
      {children}
    </AuthContext.Provider>
  );
}
