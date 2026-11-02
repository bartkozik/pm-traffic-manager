import type { AuthConfig } from '../config.js';
import type {
  SamlAuthenticationResult,
  SamlIdentity,
  SamlIdentityProvider,
} from './samlIdentity.provider.js';

export const testSamlIdentity: SamlIdentity = {
  email: 'anna@example.test',
  name: "Avery Kowalska",
  nameId: 'anna@example.test',
};

export const TEST_IDP_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDTjCCAjagAwIBAgIUPYIntzBLgR6nYStKVuttNq0HwzkwDQYJKoZIhvcNAQEL
BQAwRzEkMCIGA1UEAwwbUHVibGljIFNuYXBzaG90IFRlc3QgSXNzdWVyMR8wHQYD
VQQKDBZFeGFtcGxlIFRlc3QgV29ya3NwYWNlMB4XDTI2MTEwMjA5NTYyM1oXDTM2
MTAzMDA5NTYyM1owRzEkMCIGA1UEAwwbUHVibGljIFNuYXBzaG90IFRlc3QgSXNz
dWVyMR8wHQYDVQQKDBZFeGFtcGxlIFRlc3QgV29ya3NwYWNlMIIBIjANBgkqhkiG
9w0BAQEFAAOCAQ8AMIIBCgKCAQEAl/Bh5u7/IKNlxWPDJ52+phhBoF0PXg35bS4u
2PQb22A4iZLsVforzYPe+YETKzFCA7z5EfInYPuxNANgvfjd01PerP6GMn1wPvSr
5HQT5Ryvprbq98Xw0jGco26MhFG92V7GOSn2PL73SA9S24mZdU+BeiXWJ8NGNF++
bA1fncWbNc51szW8109Y1fxNUpu0Owk3or6FbsL85oXnzq2Li8ShwQC7wiPqGJ5S
oAMHnUzo65J0rSQr13vD3zI+k5pqMEKs4tmvCMpZWC7zRwN9bWicfAvlI69vbmVZ
1pt4YlOFUmd6V2Iwtrdb47A4DpT6Ro5qih3lgNiCz45XH+10GwIDAQABozIwMDAd
BgNVHQ4EFgQUFw0MfKWBr/G765JwcIKBnwzSTpIwDwYDVR0TAQH/BAUwAwEB/zAN
BgkqhkiG9w0BAQsFAAOCAQEAHdS3jN/wejvBeRIqDomGTHL9sjq82puxdJ+CUcj7
/ozN75Dm9BkWdO3Ok3Hg7jW6LZ62OHwirA/cvEfYWBVdow388tGJnDe2W1y9Gi7g
QnypuA6ThDGVrdV+2B8lnaKrKkeVxBFJ0uF8xnn7SmdkMlkpgF0xd5t2JtRu6gFL
SNI5QMhZiRDLNt+RQAMdesLjXWoC7xmZy1Yd7BDb007eFcOGv34lP/EcH8yBL652
faOFNF5V6vx6UkXl6lJ7Ex7mFyoHhLzY0hpXBEaVEWfdSnYyUFhH5HBMIxFV7G3W
gaVR4GN5fpaOXNbxhWR8LjVkaL0kptrawvLL0QFxJInhnQ==
-----END CERTIFICATE-----`;

export class FakeSamlIdentityProvider implements SamlIdentityProvider {
  requestedReturnTo = '';

  constructor(
    private readonly identity: SamlIdentity = testSamlIdentity,
    private readonly failure?: Error
  ) {}

  async createAuthenticationRequest(returnTo: string) {
    if (this.failure) throw this.failure;
    this.requestedReturnTo = returnTo;
    return {
      relayState: returnTo,
      samlRequest: 'base64-saml-request',
      ssoUrl: 'https://accounts.google.test/saml',
    };
  }

  getServiceProviderMetadata() {
    return '<EntityDescriptor entityID="ptm-test" />';
  }

  async validateAuthenticationResponse(input: {
    relayState?: string;
    samlResponse: string;
  }): Promise<SamlAuthenticationResult> {
    if (this.failure) throw this.failure;
    return {
      identity: { ...this.identity },
      returnTo: input.relayState || '/',
    };
  }
}

export function createTestAuthConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    allowedEmails: ['anna@example.test'],
    cookieSecure: false,
    enabled: true,
    samlAcsUrl: 'http://localhost:4000/api/auth/saml/acs',
    samlMetadataUrl: 'http://localhost:4000/api/auth/saml/metadata.xml',
    samlSpCertificate: 'test-sp-certificate',
    samlSpEntityId: 'http://localhost:4000/api/auth/saml/metadata.xml',
    samlSpPrivateKey: 'test-sp-private-key',
    sessionSecret: 'a-secure-session-secret-with-32-characters',
    sessionTtlHours: 8,
    webAppUrl: 'http://localhost:5173',
    workspaceDomain: 'example.test',
    ...overrides,
  };
}

export const testSamlConfiguration = {
  idpCertificate: TEST_IDP_CERTIFICATE,
  idpEntityId: 'https://accounts.google.test/saml/metadata',
  idpSsoUrl: 'https://accounts.google.test/saml',
  requestTtlMinutes: 5,
  samlEnabled: true,
};
