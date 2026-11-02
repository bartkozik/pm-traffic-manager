import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { AuthSessionResponse } from '@ptm/contracts';
import { AUTH_REQUIRED_EVENT } from '@/core/api/apiClient';
import { AuthContext, type AuthStatus } from './AuthContext';
import { loadAuthSession, logoutFromPtm } from './authApi';
import { isSamlAuthExpected } from './authRuntimeConfig';

const expected = isSamlAuthExpected();

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSessionResponse>({
    authenticated: false,
    authEnabled: false,
  });
  const [status, setStatus] = useState<AuthStatus>('loading');

  const refresh = useCallback(async () => {
    setStatus('loading');
    try {
      const nextSession = await loadAuthSession();
      setSession(nextSession);
      setStatus(expected && !nextSession.authEnabled ? 'configuration_error' : 'ready');
    } catch {
      setSession({ authenticated: false, authEnabled: expected });
      setStatus(expected ? 'error' : 'ready');
    }
  }, []);

  const logout = useCallback(async () => {
    await logoutFromPtm();
    setSession((current) => ({
      authenticated: false,
      authEnabled: current.authEnabled,
      workspaceDomain: current.workspaceDomain,
    }));
  }, []);

  const verifyActiveSession = useCallback(async () => {
    try {
      const nextSession = await loadAuthSession();
      setSession(nextSession);
      setStatus(expected && !nextSession.authEnabled ? 'configuration_error' : 'ready');
    } catch {
      // A temporary background verification failure should not hide an already loaded board.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleAuthRequired = () => {
      setSession((current) => ({
        authenticated: false,
        authEnabled: current.authEnabled,
        workspaceDomain: current.workspaceDomain,
      }));
      setStatus('ready');
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
  }, []);

  useEffect(() => {
    if (!session.authEnabled || !session.authenticated) return;
    const interval = window.setInterval(() => void verifyActiveSession(), 60_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void verifyActiveSession();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session.authEnabled, session.authenticated, verifyActiveSession]);

  const value = useMemo(() => ({
    authEnabled: session.authEnabled,
    expected,
    logout,
    refresh,
    status,
    user: session.user,
    workspaceDomain: session.workspaceDomain,
  }), [logout, refresh, session, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
