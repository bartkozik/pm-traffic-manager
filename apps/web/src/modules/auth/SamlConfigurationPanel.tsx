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
          <h3 id="ptm-saml-configuration-title">Uwierzytelnianie SAML</h3>
          <p>Skonfiguruj logowanie Google Workspace dla użytkowników PTM.</p>
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
              <strong>Włącz logowanie SAML</strong>
              <small>
                Wyłączenie zatrzymuje nowe logowania. Ochrona API pozostaje aktywna,
                a istniejące sesje działają do wygaśnięcia lub wylogowania.
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
            Ważność żądania
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
            Certyfikat(y) Google IdP (PEM)
            <textarea
              required
              rows={7}
              spellCheck={false}
              value={form.idpCertificate}
              onChange={(event) => setForm((current) => ({ ...current, idpCertificate: event.target.value }))}
            />
            <small>
              Możesz wkleić kolejne pełne certyfikaty PEM jeden pod drugim podczas rotacji klucza Google.
            </small>
          </label>
        </div>

        <div className="ptm-saml-public-urls">
          <dl>
            <PublicUrl
              copyLabel={copiedTarget === 'metadata' ? 'Skopiowano' : 'Kopiuj'}
              label="Metadata URL"
              onCopy={() => void handleCopy('metadata', configuration.metadataUrl)}
              value={configuration.metadataUrl}
            />
            <PublicUrl
              copyLabel={copiedTarget === 'acs' ? 'Skopiowano' : 'Kopiuj'}
              label="ACS URL"
              onCopy={() => void handleCopy('acs', configuration.acsUrl)}
              value={configuration.acsUrl}
            />
          </dl>
          {copyFailed ? <small role="alert">Nie udało się skopiować. Zaznacz adres ręcznie.</small> : null}
        </div>

        <dl className="ptm-sso-configuration-grid">
          <ConfigItem
            label="Ochrona aplikacji"
            value={configuration.authEnabled ? 'Włączona przez konfigurację serwera' : 'Wyłączona'}
            status={configuration.authEnabled ? 'ready' : 'warning'}
          />
          <ConfigItem label="Domena Workspace" value={configuration.workspaceDomain} />
          <ConfigItem label="SP Entity ID" value={configuration.spEntityId} />
          <ConfigItem
            label="Klucz prywatny SP"
            value={configuration.spPrivateKeyConfigured ? 'Skonfigurowany · wartość ukryta' : 'Brak'}
            status={configuration.spPrivateKeyConfigured ? 'ready' : 'warning'}
          />
          <ConfigItem
            label="Certyfikat SP"
            value={configuration.spCertificateConfigured ? 'Skonfigurowany' : 'Brak'}
            status={configuration.spCertificateConfigured ? 'ready' : 'warning'}
          />
          <ConfigItem
            label="Sekret sesji"
            value={configuration.sessionSecretConfigured ? 'Skonfigurowany · wartość ukryta' : 'Brak'}
            status={configuration.sessionSecretConfigured ? 'ready' : 'warning'}
          />
          <ConfigItem label="Czas sesji" value={`${configuration.sessionTtlHours} h`} />
        </dl>

        <div className="ptm-saml-form-actions">
          <p>
            Klucz prywatny SP i sekret sesji pozostają w chronionej konfiguracji serwera.
            Zapisane tutaj dane IdP są używane od następnego logowania.
          </p>
          <button disabled={isSaving} type="submit">
            {isSaving ? 'Zapisywanie…' : 'Zapisz konfigurację SAML'}
          </button>
        </div>
      </form>
    </section>
  );
}

function getSamlStatus(configuration: AppSamlConfiguration) {
  if (!configuration.authEnabled) {
    return { className: 'is-warning', label: 'Ochrona serwera wyłączona' };
  }
  if (!configuration.configured) {
    return { className: 'is-warning', label: 'SAML wymaga konfiguracji' };
  }
  if (!configuration.samlEnabled) {
    return { className: 'is-warning', label: 'Nowe logowania wyłączone' };
  }
  return { className: 'is-ready', label: 'Logowanie aktywne' };
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
