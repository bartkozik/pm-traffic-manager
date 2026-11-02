import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type {
  AppAccessRole,
  AppAccessUser,
  AppSamlConfiguration,
  UpdateAppSamlConfigurationRequest,
} from '@ptm/contracts';
import { useAccessibleDialogKeyboard } from '@/modules/traffic/hooks/useAccessibleDialogKeyboard';
import {
  AccessApiError,
  createAccessUser,
  loadAccessOverview,
  updateAccessUser,
  updateSamlConfiguration,
} from './authApi';
import { useAuth } from './AuthContext';
import { SamlConfigurationPanel } from './SamlConfigurationPanel';
import './AccessManagementDialog.css';

interface AccessManagementDialogProps {
  onClose: () => void;
}

type TeamSettingsTab = 'authentication' | 'members';

export function AccessManagementDialog({ onClose }: AccessManagementDialogProps) {
  const { user: currentUser, workspaceDomain } = useAuth();
  const dialogRef = useRef<HTMLElement>(null);
  const [users, setUsers] = useState<AppAccessUser[]>([]);
  const [samlConfiguration, setSamlConfiguration] = useState<AppSamlConfiguration>();
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<AppAccessRole>('member');
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [pendingEmail, setPendingEmail] = useState<string>();
  const [isSavingSaml, setIsSavingSaml] = useState(false);
  const [activeTab, setActiveTab] = useState<TeamSettingsTab>('members');
  const hasPendingMutation = Boolean(pendingEmail) || isSavingSaml;
  const isAdministrator = currentUser?.role === 'admin';

  const activeCount = useMemo(
    () => users.filter((user) => user.status === 'active').length,
    [users]
  );
  useAccessibleDialogKeyboard(dialogRef, onClose, {
    initialFocusSelector: 'input[type="email"]',
  });

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const overview = await loadAccessOverview();
      setUsers(overview.users);
      setSamlConfiguration(overview.samlConfiguration);
    } catch (nextError) {
      setError(getAccessErrorMessage(nextError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdministrator) void refresh();
  }, [isAdministrator, refresh]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setPendingEmail(normalizedEmail);
    setError(undefined);
    try {
      const created = await createAccessUser({ email: normalizedEmail, role: newRole });
      setUsers((current) => sortUsers([...current, created]));
      setEmail('');
      setNewRole('member');
    } catch (nextError) {
      setError(getAccessErrorMessage(nextError));
    } finally {
      setPendingEmail(undefined);
    }
  };

  const handleUpdate = async (
    target: AppAccessUser,
    patch: Parameters<typeof updateAccessUser>[1]
  ) => {
    setPendingEmail(target.email);
    setError(undefined);
    try {
      const updated = await updateAccessUser(target.email, patch);
      setUsers((current) => sortUsers(current.map((user) => (
        user.email === updated.email ? updated : user
      ))));
    } catch (nextError) {
      setError(getAccessErrorMessage(nextError));
    } finally {
      setPendingEmail(undefined);
    }
  };

  const handleSamlUpdate = async (input: UpdateAppSamlConfigurationRequest) => {
    setIsSavingSaml(true);
    setError(undefined);
    try {
      setSamlConfiguration(await updateSamlConfiguration(input));
    } catch (nextError) {
      setError(getAccessErrorMessage(nextError));
    } finally {
      setIsSavingSaml(false);
    }
  };

  if (!isAdministrator) return null;

  return (
    <div
      className="ptm-access-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="ptm-team-settings-title"
        aria-modal="true"
        className="ptm-access-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="ptm-access-header">
          <div>
            <span>Panel administratora</span>
            <h2 id="ptm-team-settings-title">Dostęp i logowanie</h2>
            <p>Zarządzaj użytkownikami i logowaniem Google Workspace.</p>
          </div>
          <button aria-label="Zamknij panel administratora" type="button" onClick={onClose}>×</button>
        </header>

        <div aria-label="Sekcje panelu administratora" className="ptm-team-settings-tabs" role="tablist">
          <SettingsTab
            activeTab={activeTab}
            label="Użytkownicy"
            tab="members"
            onSelect={setActiveTab}
          />
          <SettingsTab
            activeTab={activeTab}
            label="Uwierzytelnianie"
            tab="authentication"
            onSelect={setActiveTab}
          />
        </div>

        {error ? <div className="ptm-access-alert" role="alert">{error}</div> : null}

        <section
          aria-labelledby="ptm-team-settings-members-tab"
          className="ptm-settings-panel"
          hidden={activeTab !== 'members'}
          id="ptm-team-settings-members-panel"
          role="tabpanel"
        >
          <div className="ptm-settings-section-header">
            <div>
              <h3>Użytkownicy</h3>
              <p>{activeCount} aktywnych kont · Google Workspace {workspaceDomain}</p>
            </div>
          </div>

          <form className="ptm-access-add-form" onSubmit={handleCreate}>
            <label>
              Adres e-mail
              <input
                inputMode="email"
                placeholder={`osoba@${workspaceDomain || 'firma.pl'}`}
                required
                type="email"
                disabled={isLoading || hasPendingMutation}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Rola
              <select
                disabled={isLoading || hasPendingMutation}
                value={newRole}
                onChange={(event) => setNewRole(event.target.value as AppAccessRole)}
              >
                <option value="member">Użytkownik</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
            <button disabled={isLoading || hasPendingMutation} type="submit">Dodaj dostęp</button>
          </form>

          <div className="ptm-access-list" aria-busy={isLoading}>
            {isLoading ? <p className="ptm-access-empty">Ładowanie użytkowników…</p> : null}
            {!isLoading && users.length === 0 ? (
              <p className="ptm-access-empty">Nie ma jeszcze żadnych kont.</p>
            ) : null}
            {users.map((accessUser) => {
              const isSelf = accessUser.email === currentUser?.email;
              const isPending = pendingEmail === accessUser.email;
              return (
                <article
                  className={`ptm-access-user${accessUser.status === 'disabled' ? ' is-disabled' : ''}`}
                  key={accessUser.email}
                >
                  <span className="ptm-access-avatar" aria-hidden="true">
                    {getInitials(accessUser.name || accessUser.email)}
                  </span>
                  <span className="ptm-access-user-copy">
                    <strong>{accessUser.name || accessUser.email.split('@')[0]}</strong>
                    <span>{accessUser.email}</span>
                    <small>
                      {accessUser.lastLoginAt
                        ? `Ostatnie logowanie: ${formatDate(accessUser.lastLoginAt)}`
                        : 'Jeszcze się nie logował'}
                    </small>
                  </span>
                  <span className={`ptm-access-status is-${accessUser.status}`}>
                    {accessUser.status === 'active' ? 'Aktywny' : 'Zablokowany'}
                  </span>
                  <select
                    aria-label={`Rola ${accessUser.email}`}
                    disabled={isSelf || hasPendingMutation}
                    value={accessUser.role}
                    onChange={(event) => void handleUpdate(accessUser, {
                      role: event.target.value as AppAccessRole,
                    })}
                  >
                    <option value="member">Użytkownik</option>
                    <option value="admin">Administrator</option>
                  </select>
                  <button
                    className={accessUser.status === 'active' ? 'is-danger' : 'is-success'}
                    disabled={isSelf || hasPendingMutation}
                    type="button"
                    onClick={() => void handleUpdate(accessUser, {
                      status: accessUser.status === 'active' ? 'disabled' : 'active',
                    })}
                  >
                    {isPending
                      ? 'Zapisywanie…'
                      : accessUser.status === 'active' ? 'Zablokuj' : 'Odblokuj'}
                  </button>
                  {isSelf ? <small className="ptm-access-self">Twoje konto</small> : null}
                </article>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby="ptm-team-settings-authentication-tab"
          className="ptm-settings-panel"
          hidden={activeTab !== 'authentication'}
          id="ptm-team-settings-authentication-panel"
          role="tabpanel"
        >
          {isLoading ? <p className="ptm-access-empty">Ładowanie konfiguracji…</p> : null}
          {!isLoading && samlConfiguration ? (
            <SamlConfigurationPanel
              configuration={samlConfiguration}
              isSaving={isSavingSaml}
              onSave={handleSamlUpdate}
            />
          ) : null}
        </section>
      </section>
    </div>
  );
}

function SettingsTab({
  activeTab,
  label,
  onSelect,
  tab,
}: {
  activeTab: TeamSettingsTab;
  label: string;
  onSelect: (tab: TeamSettingsTab) => void;
  tab: TeamSettingsTab;
}) {
  const isActive = activeTab === tab;
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextTab = event.key === 'Home'
      ? 'members'
      : event.key === 'End'
        ? 'authentication'
        : tab === 'members' ? 'authentication' : 'members';
    onSelect(nextTab);
    document.getElementById(`ptm-team-settings-${nextTab}-tab`)?.focus();
  };
  return (
    <button
      aria-controls={`ptm-team-settings-${tab}-panel`}
      aria-selected={isActive}
      className={isActive ? 'is-active' : undefined}
      id={`ptm-team-settings-${tab}-tab`}
      role="tab"
      tabIndex={isActive ? 0 : -1}
      type="button"
      onClick={() => onSelect(tab)}
      onKeyDown={handleKeyDown}
    >
      {label}
    </button>
  );
}

function sortUsers(users: AppAccessUser[]) {
  return [...users].sort((left, right) => {
    if (left.status !== right.status) return left.status === 'active' ? -1 : 1;
    if (left.role !== right.role) return left.role === 'admin' ? -1 : 1;
    return left.email.localeCompare(right.email);
  });
}

function getAccessErrorMessage(error: unknown) {
  if (error instanceof AccessApiError) {
    if (error.code === 'ACCESS_ALREADY_EXISTS') return 'Ten użytkownik ma już skonfigurowany dostęp.';
    if (error.code === 'EMAIL_OUTSIDE_WORKSPACE') return 'Adres musi należeć do skonfigurowanej domeny Workspace.';
    if (error.code === 'LAST_ACTIVE_ADMIN') return 'Nie można zablokować ostatniego aktywnego administratora.';
    if (error.code === 'CANNOT_MODIFY_SELF') return 'Nie możesz odebrać dostępu własnemu kontu.';
    if (error.code === 'INVALID_ACCESS_REQUEST') return 'Sprawdź poprawność danych konfiguracji SAML.';
    if (error.code === 'INVALID_SAML_CONFIGURATION') {
      return 'URL logowania musi używać HTTPS, a certyfikat IdP musi być pełnym certyfikatem X.509 w formacie PEM.';
    }
  }
  return 'Nie udało się zapisać zmian. Spróbuj ponownie.';
}

function getInitials(value: string) {
  return value
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
