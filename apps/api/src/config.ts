import { assertValidSamlIdentityProviderConfiguration } from './auth/samlConfiguration.validation.js';

export interface ApiConfig {
  aiModel: string;
  aiProvider: AiProvider;
  anthropicApiKey?: string;
  auth: AuthConfig;
  corsOrigin: string;
  databaseUrl: string;
  demo?: { enabled: boolean; openAiApiKey?: string };
  fxRateProviderBaseUrl: string;
  host: string;
  openAiApiKey?: string;
  port: number;
}

export interface SamlConfigurationSeed {
  idpCertificate: string;
  idpEntityId: string;
  idpSsoUrl: string;
  requestTtlMinutes: number;
  samlEnabled: boolean;
}

export interface AuthConfig {
  allowedEmails: string[];
  cookieSecure: boolean;
  enabled: boolean;
  samlAcsUrl: string;
  samlBootstrap?: SamlConfigurationSeed;
  samlMetadataUrl: string;
  samlSpCertificate: string;
  samlSpEntityId: string;
  samlSpPrivateKey: string;
  serviceToken?: string;
  sessionSecret: string;
  sessionTtlHours: number;
  webAppUrl: string;
  workspaceDomain: string;
}

type AiProvider = 'openai' | 'anthropic';

export function getConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const demoEnabled = parseBoolean(env.PTM_DEMO_ENABLED, false);
  const aiProvider = demoEnabled ? 'openai' : parseAiProvider(env.PTM_AI_PROVIDER);
  const corsOrigin = env.CORS_ORIGIN || env.PTM_API_CORS_ORIGIN || 'http://localhost:5173';

  if (demoEnabled) {
    validateAuthUrl('Demo browser origin', corsOrigin, env.NODE_ENV === 'production');
    if (new URL(corsOrigin).origin !== corsOrigin) throw new Error('Demo browser origin must contain only scheme, hostname and port.');
  }

  return {
    aiModel: env.PTM_AI_MODEL || env.PTM_OPENAI_MODEL || (aiProvider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini'),
    aiProvider,
    anthropicApiKey: demoEnabled ? undefined : env.PTM_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY,
    auth: parseAuthConfig(demoEnabled ? { NODE_ENV: env.NODE_ENV, PTM_AUTH_ENABLED: 'false', PTM_AUTH_COOKIE_SECURE: 'true' } : env, corsOrigin),
    demo: { enabled: demoEnabled, openAiApiKey: env.PTM_DEMO_OPENAI_API_KEY?.trim() || undefined },
    corsOrigin,
    databaseUrl: env.PTM_DATABASE_URL || env.DATABASE_URL || 'postgres://ptm:ptm@127.0.0.1:5432/ptm',
    fxRateProviderBaseUrl: env.PTM_FX_RATE_PROVIDER_BASE_URL || 'https://api.nbp.pl/api',
    host: env.PTM_API_HOST || '0.0.0.0',
    openAiApiKey: demoEnabled ? undefined : env.PTM_OPENAI_API_KEY || env.OPENAI_API_KEY,
    port: Number(env.PTM_API_PORT || 4000),
  };
}

function parseAuthConfig(env: NodeJS.ProcessEnv, corsOrigin: string): AuthConfig {
  const enabled = parseBoolean(env.PTM_AUTH_ENABLED, false);
  const workspaceDomain = normalizeDomain(env.PTM_WORKSPACE_DOMAIN || '');
  const allowedEmails = parseAllowedEmails(env.PTM_ALLOWED_EMAILS);
  const sessionSecret = env.PTM_AUTH_SESSION_SECRET?.trim() || '';
  const serviceToken = env.PTM_AUTH_SERVICE_TOKEN?.trim() || undefined;
  const samlAcsUrl = env.PTM_SAML_ACS_URL?.trim() || 'http://localhost:4000/api/auth/saml/acs';
  const samlMetadataUrl = env.PTM_SAML_METADATA_URL?.trim() || 'http://localhost:4000/api/auth/saml/metadata.xml';
  const samlSpEntityId = env.PTM_SAML_SP_ENTITY_ID?.trim() || samlMetadataUrl;
  const samlSpPrivateKey = readPemValue(
    env.PTM_SAML_SP_PRIVATE_KEY,
    env.PTM_SAML_SP_PRIVATE_KEY_BASE64,
    'PTM_SAML_SP_PRIVATE_KEY_BASE64'
  );
  const samlSpCertificate = readPemValue(
    env.PTM_SAML_SP_CERTIFICATE,
    env.PTM_SAML_SP_CERTIFICATE_BASE64,
    'PTM_SAML_SP_CERTIFICATE_BASE64'
  );
  const webAppUrl = (env.PTM_WEB_APP_URL?.trim() || corsOrigin).replace(/\/$/, '');
  const samlBootstrap = parseSamlBootstrap(env);

  if (enabled) {
    requireAuthValue('PTM_WORKSPACE_DOMAIN', workspaceDomain);
    requireAuthValue('PTM_AUTH_SESSION_SECRET', sessionSecret);
    requireAuthValue('PTM_SAML_SP_PRIVATE_KEY or PTM_SAML_SP_PRIVATE_KEY_BASE64', samlSpPrivateKey);
    requireAuthValue('PTM_SAML_SP_CERTIFICATE or PTM_SAML_SP_CERTIFICATE_BASE64', samlSpCertificate);
    if (env.NODE_ENV === 'production') {
      requireAuthValue('PTM_SAML_ACS_URL', env.PTM_SAML_ACS_URL?.trim() || '');
      requireAuthValue('PTM_SAML_METADATA_URL', env.PTM_SAML_METADATA_URL?.trim() || '');
      requireAuthValue('PTM_SAML_SP_ENTITY_ID', env.PTM_SAML_SP_ENTITY_ID?.trim() || '');
      requireAuthValue('PTM_WEB_APP_URL', env.PTM_WEB_APP_URL?.trim() || '');
    }
    if (sessionSecret.length < 32) {
      throw new Error('PTM_AUTH_SESSION_SECRET must contain at least 32 characters.');
    }
    if (serviceToken && serviceToken.length < 32) {
      throw new Error('PTM_AUTH_SERVICE_TOKEN must contain at least 32 characters when configured.');
    }
    const invalidEmail = allowedEmails.find((email) => !isEmailInDomain(email, workspaceDomain));
    if (invalidEmail) {
      throw new Error(`Allowed SAML account "${invalidEmail}" is outside the configured Workspace domain.`);
    }
    validateAuthUrl('PTM_SAML_ACS_URL', samlAcsUrl, env.NODE_ENV === 'production');
    validateAuthUrl('PTM_SAML_METADATA_URL', samlMetadataUrl, env.NODE_ENV === 'production');
    validateAuthUrl('PTM_SAML_SP_ENTITY_ID', samlSpEntityId, env.NODE_ENV === 'production');
    validateAuthUrl('PTM_WEB_APP_URL', webAppUrl, env.NODE_ENV === 'production');
  }

  return {
    allowedEmails,
    cookieSecure: parseBoolean(env.PTM_AUTH_COOKIE_SECURE, env.NODE_ENV === 'production'),
    enabled,
    samlAcsUrl,
    samlBootstrap,
    samlMetadataUrl,
    samlSpCertificate,
    samlSpEntityId,
    samlSpPrivateKey,
    serviceToken,
    sessionSecret,
    sessionTtlHours: parseSessionTtlHours(env.PTM_AUTH_SESSION_TTL_HOURS),
    webAppUrl,
    workspaceDomain,
  };
}

function parseSamlBootstrap(env: NodeJS.ProcessEnv): SamlConfigurationSeed | undefined {
  const values = {
    idpCertificate: readPemValue(
      env.PTM_SAML_IDP_CERTIFICATE,
      env.PTM_SAML_IDP_CERTIFICATE_BASE64,
      'PTM_SAML_IDP_CERTIFICATE_BASE64'
    ),
    idpEntityId: env.PTM_SAML_IDP_ENTITY_ID?.trim() || '',
    idpSsoUrl: env.PTM_SAML_IDP_SSO_URL?.trim() || '',
  };
  const configuredCount = Object.values(values).filter(Boolean).length;
  if (configuredCount === 0) return undefined;
  if (configuredCount !== Object.keys(values).length) {
    throw new Error(
      'PTM_SAML_IDP_CERTIFICATE, PTM_SAML_IDP_ENTITY_ID, and PTM_SAML_IDP_SSO_URL must be provided together.'
    );
  }
  validateAuthUrl('PTM_SAML_IDP_SSO_URL', values.idpSsoUrl, env.NODE_ENV === 'production');
  assertValidSamlIdentityProviderConfiguration(values);
  return {
    ...values,
    requestTtlMinutes: parseRequestTtlMinutes(env.PTM_SAML_REQUEST_TTL_MINUTES),
    samlEnabled: parseBoolean(env.PTM_SAML_ENABLED, true),
  };
}

function parseAllowedEmails(value: string | undefined) {
  return [...new Set((value || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean))];
}

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^@/, '');
}

function normalizePem(value: string | undefined) {
  return (value || '').trim().replace(/\\n/g, '\n');
}

function readPemValue(value: string | undefined, base64Value: string | undefined, base64Name: string) {
  if (value?.trim()) return normalizePem(value);
  if (!base64Value?.trim()) return '';
  const normalized = base64Value.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error(`${base64Name} must contain valid base64.`);
  }
  const decoded = Buffer.from(normalized, 'base64').toString('utf8').trim();
  if (!decoded) throw new Error(`${base64Name} must contain a non-empty PEM value.`);
  return normalizePem(decoded);
}

function isEmailInDomain(email: string, domain: string) {
  const separatorIndex = email.lastIndexOf('@');
  return separatorIndex > 0 && email.slice(separatorIndex + 1) === domain;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === '') return fallback;
  const normalized = value.trim();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Expected a boolean value, received "${value}".`);
}

function parseRequestTtlMinutes(value: string | undefined) {
  if (!value) return 5;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 60) {
    throw new Error(`PTM_SAML_REQUEST_TTL_MINUTES must be an integer from 1 to 60, received "${value}".`);
  }
  return parsed;
}

function parseSessionTtlHours(value: string | undefined) {
  if (!value) return 8;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 168) {
    throw new Error(`PTM_AUTH_SESSION_TTL_HOURS must be greater than 0 and no greater than 168, received "${value}".`);
  }
  return parsed;
}

function requireAuthValue(name: string, value: string) {
  if (!value) throw new Error(`${name} is required when PTM_AUTH_ENABLED=true.`);
}

function validateAuthUrl(name: string, value: string, requireHttps: boolean) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must be an absolute HTTP(S) URL.`);
  }
  if (requireHttps && url.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS in production.`);
  }
}

function parseAiProvider(value: string | undefined): AiProvider {
  if (!value || value === 'openai') return 'openai';
  if (value === 'anthropic') return 'anthropic';
  throw new Error(`Unsupported PTM_AI_PROVIDER "${value}". Use "openai" or "anthropic".`);
}
