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
  auth_not_configured: 'Company sign-in is currently unavailable. Contact your PTM administrator.',
  invalid_response: 'The sign-in response was incomplete or expired. Please try again.',
  saml_disabled: 'Company sign-in is currently disabled by your administrator.',
  saml_failed: 'Could not verify your Google Workspace sign-in. Try again or contact your administrator.',
  unauthorized_email: 'This account belongs to the organization but does not have access to PTM.',
  wrong_workspace: 'Use an account from the correct Google Workspace organization.',
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
          <p className="ptm-login-eyebrow">Internal planning board</p>
          <h1 id="ptm-login-title">Sign in to PTM</h1>
          <p className="ptm-login-intro">
            Use your company Google Workspace account.
            {workspaceDomain ? ` Your account must belong to the domain @${workspaceDomain}.` : ''}
          </p>

          {mode === 'loading' ? (
            <div className="ptm-login-status" role="status">
              <span className="ptm-login-spinner" />
              Checking your secure session…
            </div>
          ) : null}

          {mode === 'login' ? (
            <>
              {authError || startError ? (
                <div className="ptm-login-alert" role="alert">
                  {startError
                    ? 'Could not start sign-in. Please try again.'
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
                {isStarting ? 'Redirecting…' : 'Sign in with Google Workspace'}
              </button>
              <p className="ptm-login-note">
                If you do not have access, contact your PTM administrator.
              </p>
            </>
          ) : null}

          {mode === 'error' || mode === 'configuration_error' ? (
            <>
              <div className="ptm-login-alert" role="alert">
                {mode === 'configuration_error'
                  ? 'Company sign-in is currently unavailable. Contact your PTM administrator.'
                  : 'Could not connect to the PTM sign-in service.'}
              </div>
              <button className="ptm-login-retry" type="button" onClick={onRetry}>
                Try again
              </button>
            </>
          ) : null}
        </div>

        <p className="ptm-login-footer">Access is limited to approved organization members.</p>
      </section>

      <aside className="ptm-login-preview" aria-hidden="true">
        <div className="ptm-login-preview-copy">
          <span>Weekly plan</span>
          <h2>A shared view of people, projects and risk.</h2>
          <p>One secure space for operational capacity and revenue planning.</p>
        </div>
        <div className="ptm-login-board-preview">
          <div className="ptm-login-frame ptm-login-frame-people">
            <span>People</span>
            <div className="ptm-login-person-row"><i>AK</i><b /><b /><b /></div>
            <div className="ptm-login-person-row"><i>MK</i><b /><b /></div>
          </div>
          <div className="ptm-login-frame ptm-login-frame-project">
            <span>Project / Delivery</span>
            <div className="ptm-login-tile-grid">
              <i>AK</i><i>AK</i><i>MK</i><i>MK</i><i /><i />
            </div>
          </div>
          <div className="ptm-login-signal"><strong>A reliable plan</strong><span>Revenue and capacity under control</span></div>
        </div>
      </aside>
    </main>
  );
}

function getReturnTo() {
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return window.location.pathname === '/login' ? '/' : path;
}
