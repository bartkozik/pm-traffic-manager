import type { PropsWithChildren } from 'react';
import { useAuth } from './AuthContext';
import { LoginScreen } from './LoginScreen';

export function AuthGate({ children }: PropsWithChildren) {
  const auth = useAuth();

  if (!auth.expected && !auth.authEnabled) return children;
  if (auth.status === 'loading') {
    return <LoginScreen mode="loading" workspaceDomain={auth.workspaceDomain} />;
  }
  if (auth.status === 'configuration_error') {
    return <LoginScreen mode="configuration_error" onRetry={auth.refresh} />;
  }
  if (auth.status === 'error') {
    return <LoginScreen mode="error" onRetry={auth.refresh} />;
  }
  if (!auth.user) {
    return <LoginScreen mode="login" workspaceDomain={auth.workspaceDomain} />;
  }

  return children;
}
