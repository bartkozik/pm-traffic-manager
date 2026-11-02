import { useState } from 'react';
import { AccessManagementDialog } from './AccessManagementDialog';
import { useOptionalAuth } from './AuthContext';

export function AuthAccount() {
  const auth = useOptionalAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const [isAccessManagementOpen, setIsAccessManagementOpen] = useState(false);

  if (!auth?.authEnabled || !auth.user) return null;
  const { logout, user } = auth;

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutFailed(false);
    try {
      await logout();
    } catch {
      setLogoutFailed(true);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <>
      <div className="traffic-header-account" aria-label={`Konto użytkownika ${user.email}`}>
        <span className="traffic-account-avatar" aria-hidden="true">{getInitials(user.name)}</span>
        <span className="traffic-account-copy">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </span>
        {user.role === 'admin' ? (
          <button
            aria-expanded={isAccessManagementOpen}
            aria-haspopup="dialog"
            className="traffic-button traffic-account-access"
            type="button"
            onClick={() => setIsAccessManagementOpen(true)}
          >
            Administracja
          </button>
        ) : null}
        <button
          className="traffic-button traffic-account-logout"
          disabled={isLoggingOut}
          title={logoutFailed ? 'Nie udało się wylogować. Spróbuj ponownie.' : undefined}
          type="button"
          onClick={handleLogout}
        >
          {isLoggingOut ? 'Wylogowanie…' : logoutFailed ? 'Ponów wylogowanie' : 'Wyloguj'}
        </button>
      </div>
      {isAccessManagementOpen ? (
        <AccessManagementDialog onClose={() => setIsAccessManagementOpen(false)} />
      ) : null}
    </>
  );
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
