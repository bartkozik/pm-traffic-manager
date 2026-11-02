import { describe, expect, it } from 'vitest';
import { TEST_IDP_CERTIFICATE } from './saml.testSupport.js';
import {
  InvalidSamlConfigurationError,
  assertValidSamlIdentityProviderConfiguration,
  parseIdpCertificates,
} from './samlConfiguration.validation.js';

describe('SAML identity provider configuration validation', () => {
  it('accepts a PEM certificate bundle for zero-downtime IdP certificate rotation', () => {
    expect(parseIdpCertificates(`${TEST_IDP_CERTIFICATE}\n${TEST_IDP_CERTIFICATE}`)).toHaveLength(2);
  });

  it('rejects malformed certificate bundles and insecure SSO URLs', () => {
    expect(() => parseIdpCertificates(`${TEST_IDP_CERTIFICATE}\nuntrusted-text`))
      .toThrow(InvalidSamlConfigurationError);
    expect(() => assertValidSamlIdentityProviderConfiguration({
      idpCertificate: TEST_IDP_CERTIFICATE,
      idpSsoUrl: 'http://accounts.google.test/saml',
    })).toThrow('must use HTTPS');
  });
});
