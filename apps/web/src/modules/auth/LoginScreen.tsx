import { useState } from 'react';
import ptmLogo from '@/assets/portfolio-mark.svg';
import { startSamlWorkspaceLogin } from './authApi';
import './LoginScreen.css';

type LoginScreenMode = 'configuration_error' | 'error' | 'loading' | 'login';

interface LoginScreenProps {
  mode: LoginScreenMode;
  onRetry?: () => void;
  workspaceDomain?: string;
}

const errorMessages: Record<string, string> = {
  auth_not_configured: 'Logowanie firmowe nie jest obecnie dostępne. Skontaktuj się z administratorem PTM.',
  invalid_response: 'Odpowiedź logowania była niepełna albo wygasła. Spróbuj ponownie.',
  saml_disabled: 'Logowanie firmowe jest obecnie wyłączone przez administratora.',
  saml_failed: 'Nie udało się potwierdzić logowania w Google Workspace. Spróbuj ponownie lub skontaktuj się z administratorem.',
  unauthorized_email: 'To konto należy do organizacji, ale nie ma dostępu do PTM.',
  wrong_workspace: 'Użyj konta należącego do właściwej organizacji Google Workspace.',
};

export function LoginScreen({ mode, onRetry, workspaceDomain }: LoginScreenProps) {
  const [startError, setStartError] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const authError = new URLSearchParams(window.location.search).get('auth_error');
  const returnTo = getReturnTo();

  const handleLogin = async () => {
    setIsStarting(true);
    setStartError(false);
    try {
      await startSamlWorkspaceLogin(returnTo);
    } catch {
      setStartError(true);
      setIsStarting(false);
    }
  };

  return (
    <main className="ptm-login-shell">
      <section className="ptm-login-content" aria-labelledby="ptm-login-title">
        <div className="ptm-login-brand">
          <img src={ptmLogo} alt="" aria-hidden="true" />
          <div>
            <span>PTM</span>
            <strong>PM Traffic Management</strong>
          </div>
        </div>

        <div className="ptm-login-card">
          <p className="ptm-login-eyebrow">Wewnętrzna tablica planowania</p>
          <h1 id="ptm-login-title">Zaloguj się do PTM</h1>
          <p className="ptm-login-intro">
            Użyj firmowego konta Google Workspace.
            {workspaceDomain ? ` Konto powinno należeć do domeny @${workspaceDomain}.` : ''}
          </p>

          {mode === 'loading' ? (
            <div className="ptm-login-status" role="status">
              <span className="ptm-login-spinner" />
              Sprawdzamy bezpieczną sesję…
            </div>
          ) : null}

          {mode === 'login' ? (
            <>
              {authError || startError ? (
                <div className="ptm-login-alert" role="alert">
                  {startError
                    ? 'Nie udało się rozpocząć logowania. Spróbuj ponownie.'
                    : errorMessages[authError || ''] || errorMessages.saml_failed}
                </div>
              ) : null}
              <button
                className="ptm-saml-login-button"
                disabled={isStarting}
                type="button"
                onClick={() => void handleLogin()}
              >
                <span className="ptm-saml-login-mark" aria-hidden="true">SSO</span>
                {isStarting ? 'Przekierowujemy…' : 'Zaloguj przez Google Workspace'}
              </button>
              <p className="ptm-login-note">
                Jeśli nie masz dostępu, skontaktuj się z administratorem PTM.
              </p>
            </>
          ) : null}

          {mode === 'error' || mode === 'configuration_error' ? (
            <>
              <div className="ptm-login-alert" role="alert">
                {mode === 'configuration_error'
                  ? 'Logowanie firmowe nie jest obecnie dostępne. Skontaktuj się z administratorem PTM.'
                  : 'Nie udało się połączyć z usługą logowania PTM.'}
              </div>
              <button className="ptm-login-retry" type="button" onClick={onRetry}>
                Spróbuj ponownie
              </button>
            </>
          ) : null}
        </div>

        <p className="ptm-login-footer">Dostęp tylko dla zatwierdzonych członków organizacji.</p>
      </section>

      <aside className="ptm-login-preview" aria-hidden="true">
        <div className="ptm-login-preview-copy">
          <span>Plan tygodnia</span>
          <h2>Wspólny obraz ludzi, projektów i ryzyka.</h2>
          <p>Jedna bezpieczna przestrzeń do operacyjnego planowania capacity i przychodu.</p>
        </div>
        <div className="ptm-login-board-preview">
          <div className="ptm-login-frame ptm-login-frame-people">
            <span>Ludzie</span>
            <div className="ptm-login-person-row"><i>AK</i><b /><b /><b /></div>
            <div className="ptm-login-person-row"><i>MK</i><b /><b /></div>
          </div>
          <div className="ptm-login-frame ptm-login-frame-project">
            <span>Projekt / Delivery</span>
            <div className="ptm-login-tile-grid">
              <i>AK</i><i>AK</i><i>MK</i><i>MK</i><i /><i />
            </div>
          </div>
          <div className="ptm-login-signal"><strong>Bezpieczny plan</strong><span>Przychód i capacity pod kontrolą</span></div>
        </div>
      </aside>
    </main>
  );
}

function getReturnTo() {
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return window.location.pathname === '/login' ? '/' : path;
}
