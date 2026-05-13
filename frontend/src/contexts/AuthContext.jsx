import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from '@/services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await authService.me();
      if (res.success) setUser(res.data);
      else setUser(null);
    } catch {
      setUser(null);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = useCallback(async (email, password) => {
    const res = await authService.login({ email, password });
    if (!res.success) throw new Error(res.message || 'Login gagal');
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    const u = res.data.user;
    if (u?.role_slug === 'kasir' || u?.role_slug === 'karyawan') {
      try {
        sessionStorage.setItem('promo_popup_after_login_v1', '1');
      } catch {
        /* */
      }
    }
    return res.data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      refresh: loadMe,
      isRole: (...roles) => roles.includes(user?.role_slug) || user?.role_slug === 'super_admin',
    }),
    [user, loading, login, logout, loadMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus di dalam AuthProvider');
  return ctx;
}
