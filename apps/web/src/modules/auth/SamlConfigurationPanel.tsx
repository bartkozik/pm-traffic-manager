import { useEffect, useState, type FormEvent } from 'react';
import type {
  AppSamlConfiguration,
  UpdateAppSamlConfigurationRequest,
} from '@ptm/contracts';

interface SamlConfigurationPanelProps {
  configuration: AppSamlConfiguration;
  isSaving: boolean;
  onSave: (input: UpdateAppSamlConfigurationRequest) => Promise<void>;
}

type CopyTarget = 'acs' | 'metadata';

export function SamlConfigurationPanel({
  configuration,
  isSaving,
  onSave,
}: SamlConfigurationPanelProps) {
  const [form, setForm] = useState(() => toForm(configuration));
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget>();
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    setForm(toForm(configuration));
  }, [configuration]);

  const handleCopy = async (target: CopyTarget, value: string) => {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(target);
    } catch {
      setCopyFailed(true);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave(form);
  };
  const status = getSamlStatus(configuration);

  return (
    <section className="ptm-sso-configuration" aria-labelledby="ptm-saml-configuration-title">
      <header className="ptm-sso-configuration-header">
        <div>
          <h3 id="ptm-saml-configuration-title">SAML authentication</h3>
          <p>Configure Google Workspace sign-in for PTM users.</p>
        </div>
        <span className="ptm-sso-summary-actions">
          <span className={`ptm-sso-overall-status ${status.className}`}>
            {status.label}
          </span>
        </span>
      </header>

      <form className="ptm-saml-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="ptm-saml-form-grid">
          <label className="ptm-saml-enabled-field">
            <input
              checked={form.samlEnabled}
              type="checkbox"
              onChange={(event) => setForm((current) => ({ ...current, samlEnabled: event.target.checked }))}
            />
            <span>
              <strong>Enable SAML sign-in</strong>
              <small>
                Disabling this prevents new sign-ins. API protection remains active,
                and existing sessions remain valid until they expire or the user signs out.
              </small>
            </span>
          </label>
          <label>
            Google IdP SSO URL
            <input
              pattern="https://.*"
              required
              type="url"
              value={form.idpSsoUrl}
              onChange={(event) => setForm((current) => ({ ...current, idpSsoUrl: event.target.value }))}
            />
          </label>
          <label>
            Google IdP Entity ID
            <input
              required
              type="text"
              value={form.idpEntityId}
              onChange={(event) => setForm((current) => ({ ...current, idpEntityId: event.target.value }))}
            />
          </label>
          <label>
            Request validity
            <span className="ptm-saml-number-field">
              <input
                max={60}
                min={1}
                required
                type="number"
                value={form.requestTtlMinutes}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  requestTtlMinutes: Number(event.target.value),
                }))}
              />
              min
            </span>
          </label>
          <label className="is-wide">
            Google IdP certificate(s) (PEM)
            <textarea
              required
              rows={7}
              spellCheck={false}
              value={form.idpCertificate}
              onChange={(event) => setForm((current) => ({ ...current, idpCertificate: event.target.value }))}
            />
            <small>
              You can paste multiple complete PEM certificates one after another during Google key rotation.
            </small>
          </label>
        </div>

        <div className="ptm-saml-public-urls">
          <dl>
            <PublicUrl
              copyLabel={copiedTarget === 'metadata' ? 'Copied' : 'Copy'}
              label="Metadata URL"
              onCopy={() => void handleCopy('metadata', configuration.metadataUrl)}
              value={configuration.metadataUrl}
            />
            <PublicUrl
              copyLabel={copiedTarget === 'acs' ? 'Copied' : 'Copy'}
              label="ACS URL"
              onCopy={() => void handleCopy('acs', configuration.acsUrl)}
              value={configuration.acsUrl}
            />
          </dl>
          {copyFailed ? <small role="alert">Could not copy the URL. Select it manually.</small> : null}
        </div>

        <dl className="ptm-sso-configuration-grid">
          <ConfigItem
            label="Application protection"
            value={configuration.authEnabled ? 'Enabled in server configuration' : 'Disabled'}
            status={configuration.authEnabled ? 'ready' : 'warning'}
          />
          <ConfigItem label="Workspace domain" value={configuration.workspaceDomain} />
          <ConfigItem label="SP Entity ID" value={configuration.spEntityId} />
          <ConfigItem
            label="SP private key"
            value={configuration.spPrivateKeyConfigured ? 'Configured · value hidden' : 'Not configured'}
            status={configuration.spPrivateKeyConfigured ? 'ready' : 'warning'}
          />
          <ConfigItem
            label="SP certificate"
            value={configuration.spCertificateConfigured ? 'Configured' : 'Not configured'}
            status={configuration.spCertificateConfigured ? 'ready' : 'warning'}
          />
          <ConfigItem
            label="Session secret"
            value={configuration.sessionSecretConfigured ? 'Configured · value hidden' : 'Not configured'}
            status={configuration.sessionSecretConfigured ? 'ready' : 'warning'}
          />
          <ConfigItem label="Session duration" value={`${configuration.sessionTtlHours} h`} />
        </dl>

        <div className="ptm-saml-form-actions">
          <p>
            The SP private key and session secret remain in protected server configuration.
            IdP settings saved here apply from the next sign-in.
          </p>
          <button disabled={isSaving} type="submit">
            {isSaving ? 'Saving…' : 'Save SAML configuration'}
          </button>
        </div>
      </form>
    </section>
  );
}

function getSamlStatus(configuration: AppSamlConfiguration) {
  if (!configuration.authEnabled) {
    return { className: 'is-warning', label: 'Server protection disabled' };
  }
  if (!configuration.configured) {
    return { className: 'is-warning', label: 'SAML configuration required' };
  }
  if (!configuration.samlEnabled) {
    return { className: 'is-warning', label: 'New sign-ins disabled' };
  }
  return { className: 'is-ready', label: 'Sign-in enabled' };
}

function PublicUrl({
  copyLabel,
  label,
  onCopy,
  value,
}: {
  copyLabel: string;
  label: string;
  onCopy: () => void;
  value: string;
}) {
  return (
    <div className="ptm-sso-config-item is-wide">
      <dt>{label}</dt>
      <dd>
        <code>{value}</code>
        <button type="button" onClick={onCopy}>{copyLabel}</button>
      </dd>
    </div>
  );
}

function ConfigItem({
  label,
  status,
  value,
}: {
  label: string;
  status?: 'ready' | 'warning';
  value: string;
}) {
  return (
    <div className="ptm-sso-config-item">
      <dt>{label}</dt>
      <dd className={status ? `is-${status}` : undefined}>{value}</dd>
    </div>
  );
}

function toForm(configuration: AppSamlConfiguration): UpdateAppSamlConfigurationRequest {
  return {
    idpCertificate: configuration.idpCertificate,
    idpEntityId: configuration.idpEntityId,
    idpSsoUrl: configuration.idpSsoUrl,
    requestTtlMinutes: configuration.requestTtlMinutes,
    samlEnabled: configuration.samlEnabled,
  };
}
