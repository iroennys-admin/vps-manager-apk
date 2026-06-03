// ============================================================
// VPS Manager · Root App
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppCtx, type VpsSession, type VpsStatus } from './state/store';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import VncPage from './pages/VncPage';

const TOKEN_KEY   = 'vpsm_token';
const SESSION_KEY = 'vpsm_session';

function load<T>(k: string, fb: T): T {
  try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; }
}

type Page = 'login' | 'dashboard' | 'vnc';

export default function App() {
  const [token,   setTokenState]   = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [session, setSessionState] = useState<VpsSession | null>(() => load(SESSION_KEY, null));
  const [status,  setStatus]       = useState<VpsStatus>('idle');
  const [page,    setPage]         = useState<Page>(() => localStorage.getItem(TOKEN_KEY) ? 'dashboard' : 'login');

  useEffect(() => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }, [token]);

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }, [session]);

  const setToken = useCallback((t: string | null) => {
    setTokenState(t);
    setPage(t ? 'dashboard' : 'login');
  }, []);

  const setSession = useCallback((s: VpsSession | null) => {
    setSessionState(s);
  }, []);

  const logout = useCallback(() => {
    setTokenState(null);
    setSessionState(null);
    setStatus('idle');
    setPage('login');
  }, []);

  const ctx = useMemo(() => ({
    token, session, status,
    setToken, setSession, setStatus, logout,
  }), [token, session, status, setToken, setSession, logout]);

  return (
    <AppCtx.Provider value={ctx}>
      {page === 'login'     && <LoginPage onLogin={() => setPage('dashboard')} />}
      {page === 'dashboard' && <DashboardPage onOpenVnc={() => setPage('vnc')} />}
      {page === 'vnc'       && <VncPage onBack={() => setPage('dashboard')} />}
    </AppCtx.Provider>
  );
}
