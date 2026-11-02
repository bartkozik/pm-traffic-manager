import { createContext, useContext } from 'react';
import type { AuthUser } from '@ptm/contracts';

export type AuthStatus = 'configuration_error' | 'error' | 'loading' | 'ready';

export interface AuthContextValue {
  authEnabled: boolean;
  expected: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  status: AuthStatus;
  user?: AuthUser;
  workspaceDomain?: string;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}
