import { describe, expect, it } from 'vitest';
import { TEST_IDP_CERTIFICATE } from './auth/saml.testSupport.js';
import { getConfig } from './config.js';

describe('getConfig', () => {
  it('isolates demo authentication and AI from ordinary environment credentials', () => {
    const config = getConfig({ PTM_DEMO_ENABLED: 'true', PTM_AUTH_ENABLED: 'true', OPENAI_API_KEY: 'ambient-key', PTM_OPENAI_API_KEY: 'ordinary-key' });
    expect(config.demo?.enabled).toBe(true);
    expect(config.demo?.openAiApiKey).toBeUndefined();
    expect(config.auth.enabled).toBe(false);
    expect(getConfig({ PTM_DEMO_ENABLED: 'true', PTM_DEMO_OPENAI_API_KEY: 'dedicated-key' }).demo?.openAiApiKey).toBe('dedicated-key');
  });

  it('ignores SAML bootstrap and ordinary AI credentials in demo mode', () => {
    const config = getConfig({ PTM_DEMO_ENABLED: 'true', PTM_SAML_SP_PRIVATE_KEY_BASE64: 'invalid!', PTM_SAML_IDP_ENTITY_ID: 'partial', PTM_AI_PROVIDER: 'unsupported', OPENAI_API_KEY: 'ambient', PTM_OPENAI_API_KEY: 'ordinary' });
    expect(config.openAiApiKey).toBeUndefined();
    expect(config.auth.samlSpPrivateKey).toBe('');
    expect(config.auth.cookieSecure).toBe(true);
  });

  it('requires an exact HTTPS demo browser origin in production', () => {
    expect(() => getConfig({ PTM_DEMO_ENABLED: 'true', NODE_ENV: 'production', CORS_ORIGIN: 'http://demo.test' })).toThrow('HTTPS');
    expect(() => getConfig({ PTM_DEMO_ENABLED: 'true', CORS_ORIGIN: 'https://demo.test/path' })).toThrow('origin');
    expect(getConfig({ PTM_DEMO_ENABLED: 'true', NODE_ENV: 'production', CORS_ORIGIN: 'https://demo.test' }).demo?.enabled).toBe(true);
  });

  it('defaults AI Check to OpenAI with the OpenAI model default', () => {
    const config = getConfig({});

    expect(config.aiProvider).toBe('openai');
    expect(config.aiModel).toBe('gpt-4o-mini');
    expect(config.databaseUrl).toBe('postgres://ptm:ptm@127.0.0.1:5432/ptm');
  });

  it('uses PTM-specific database URL before generic DATABASE_URL', () => {
    const config = getConfig({
      DATABASE_URL: 'postgres://generic:generic@127.0.0.1:5432/generic',
      PTM_DATABASE_URL: 'postgres://ptm:ptm@127.0.0.1:5432/ptm',
    });

    expect(config.databaseUrl).toBe('postgres://ptm:ptm@127.0.0.1:5432/ptm');
  });

  it('uses Anthropic defaults when Anthropic is selected', () => {
    const config = getConfig({
      PTM_AI_PROVIDER: 'anthropic',
      PTM_ANTHROPIC_API_KEY: 'test-key',
    });

    expect(config.aiProvider).toBe('anthropic');
    expect(config.aiModel).toBe('claude-sonnet-4-20250514');
    expect(config.anthropicApiKey).toBe('test-key');
  });

  it('prefers PTM-specific AI keys over global provider keys', () => {
    const config = getConfig({
      ANTHROPIC_API_KEY: 'global-anthropic-key',
      OPENAI_API_KEY: 'global-openai-key',
      PTM_ANTHROPIC_API_KEY: 'ptm-anthropic-key',
      PTM_OPENAI_API_KEY: 'ptm-openai-key',
    });

    expect(config.anthropicApiKey).toBe('ptm-anthropic-key');
    expect(config.openAiApiKey).toBe('ptm-openai-key');
  });

  it('fails loudly for unsupported AI providers', () => {
    expect(() => getConfig({ PTM_AI_PROVIDER: 'claude-code' })).toThrow(
      'Unsupported PTM_AI_PROVIDER "claude-code". Use "openai" or "anthropic".'
    );
  });

  it('parses and normalizes Google Workspace SAML configuration', () => {
    const config = getConfig({
      PTM_AUTH_ENABLED: 'true',
      PTM_AUTH_SESSION_SECRET: 'a-secure-session-secret-with-32-characters',
      PTM_ALLOWED_EMAILS: " ADMIN-1@EXAMPLE.TEST,admin-2@example.test,admin-1@example.test ",
      PTM_SAML_IDP_CERTIFICATE: TEST_IDP_CERTIFICATE.replace(/\n/g, '\\n'),
      PTM_SAML_IDP_ENTITY_ID: 'https://accounts.google.com/samlrp/test',
      PTM_SAML_IDP_SSO_URL: 'https://accounts.google.com/o/saml2/idp?idpid=test',
      PTM_SAML_SP_CERTIFICATE: 'sp-certificate',
      PTM_SAML_SP_PRIVATE_KEY: 'sp-private-key',
      PTM_WORKSPACE_DOMAIN: '@example.test',
    });

    expect(config.auth).toMatchObject({
      allowedEmails: ['admin-1@example.test', 'admin-2@example.test'],
      enabled: true,
      samlBootstrap: {
        idpCertificate: TEST_IDP_CERTIFICATE,
        idpEntityId: 'https://accounts.google.com/samlrp/test',
        idpSsoUrl: 'https://accounts.google.com/o/saml2/idp?idpid=test',
        requestTtlMinutes: 5,
        samlEnabled: true,
      },
      workspaceDomain: 'example.test',
    });
  });

  it('allows database-backed access without an environment allowlist', () => {
    const config = getConfig({
      PTM_AUTH_ENABLED: 'true',
      PTM_AUTH_SESSION_SECRET: 'a-secure-session-secret-with-32-characters',
      PTM_SAML_SP_CERTIFICATE: 'sp-certificate',
      PTM_SAML_SP_PRIVATE_KEY: 'sp-private-key',
      PTM_WORKSPACE_DOMAIN: 'example.test',
    });

    expect(config.auth.allowedEmails).toEqual([]);
    expect(config.auth.samlBootstrap).toBeUndefined();
  });

  it('rejects allowed accounts from outside the configured Workspace', () => {
    expect(() => getConfig({
      PTM_AUTH_ENABLED: 'true',
      PTM_AUTH_SESSION_SECRET: 'a-secure-session-secret-with-32-characters',
      PTM_ALLOWED_EMAILS: 'anna@gmail.com',
      PTM_SAML_SP_CERTIFICATE: 'sp-certificate',
      PTM_SAML_SP_PRIVATE_KEY: 'sp-private-key',
      PTM_WORKSPACE_DOMAIN: 'example.test',
    })).toThrow('outside the configured Workspace domain');
  });

  it('requires all IdP bootstrap values to be provided together', () => {
    expect(() => getConfig({
      PTM_SAML_IDP_ENTITY_ID: 'https://accounts.google.com/samlrp/test',
    })).toThrow('must be provided together');
  });

  it('rejects invalid IdP certificates and non-HTTPS SSO endpoints', () => {
    const baseEnv = {
      PTM_SAML_IDP_CERTIFICATE: TEST_IDP_CERTIFICATE,
      PTM_SAML_IDP_ENTITY_ID: 'https://accounts.google.com/samlrp/test',
      PTM_SAML_IDP_SSO_URL: 'https://accounts.google.com/o/saml2/idp?idpid=test',
    };

    expect(() => getConfig({
      ...baseEnv,
      PTM_SAML_IDP_CERTIFICATE: 'not-a-certificate',
    })).toThrow('one or more complete PEM certificates');
    expect(() => getConfig({
      ...baseEnv,
      PTM_SAML_IDP_SSO_URL: 'http://accounts.google.com/o/saml2/idp?idpid=test',
    })).toThrow('must use HTTPS');
  });

  it('accepts base64-encoded certificates and keys for deployment variables', () => {
    const encode = (value: string) => Buffer.from(value).toString('base64');
    const config = getConfig({
      PTM_AUTH_ENABLED: 'true',
      PTM_AUTH_SESSION_SECRET: 'a-secure-session-secret-with-32-characters',
      PTM_SAML_SP_CERTIFICATE_BASE64: encode('sp-certificate'),
      PTM_SAML_SP_PRIVATE_KEY_BASE64: encode('sp-private-key'),
      PTM_WORKSPACE_DOMAIN: 'example.test',
    });

    expect(config.auth.samlSpCertificate).toBe('sp-certificate');
    expect(config.auth.samlSpPrivateKey).toBe('sp-private-key');
  });

  it('requires explicit HTTPS callback and web URLs in production', () => {
    const baseEnv = {
      NODE_ENV: 'production',
      PTM_AUTH_ENABLED: 'true',
      PTM_AUTH_SESSION_SECRET: 'a-secure-session-secret-with-32-characters',
      PTM_ALLOWED_EMAILS: 'anna@example.test',
      PTM_SAML_SP_CERTIFICATE: 'sp-certificate',
      PTM_SAML_SP_PRIVATE_KEY: 'sp-private-key',
      PTM_WORKSPACE_DOMAIN: 'example.test',
    };

    expect(() => getConfig(baseEnv)).toThrow('PTM_SAML_ACS_URL');
    expect(() => getConfig({
      ...baseEnv,
      PTM_SAML_ACS_URL: 'http://ptm.example.com/api/auth/saml/acs',
      PTM_SAML_METADATA_URL: 'https://ptm.example.com/api/auth/saml/metadata.xml',
      PTM_SAML_SP_ENTITY_ID: 'https://ptm.example.com/api/auth/saml/metadata.xml',
      PTM_WEB_APP_URL: 'https://ptm.example.com',
    })).toThrow('must use HTTPS in production');
  });

  it('limits session lifetime to seven days', () => {
    expect(() => getConfig({ PTM_AUTH_SESSION_TTL_HOURS: '169' })).toThrow('no greater than 168');
  });

  it('rejects a short service token when authentication is enabled', () => {
    expect(() => getConfig({
      PTM_AUTH_ENABLED: 'true',
      PTM_AUTH_SERVICE_TOKEN: 'short-token',
      PTM_AUTH_SESSION_SECRET: 'a-secure-session-secret-with-32-characters',
      PTM_SAML_SP_CERTIFICATE: 'sp-certificate',
      PTM_SAML_SP_PRIVATE_KEY: 'sp-private-key',
      PTM_WORKSPACE_DOMAIN: 'example.test',
    })).toThrow('PTM_AUTH_SERVICE_TOKEN must contain at least 32 characters');
  });
});
