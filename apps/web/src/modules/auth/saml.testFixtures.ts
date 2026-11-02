import type { AppSamlConfiguration } from '@ptm/contracts';

export const samlConfigurationFixture: AppSamlConfiguration = {
  acsUrl: 'http://127.0.0.1:4000/api/auth/saml/acs',
  authEnabled: true,
  configured: true,
  configurationSource: 'database',
  cookieSecure: false,
  idpCertificate: '-----BEGIN CERTIFICATE-----\nGOOGLE\n-----END CERTIFICATE-----',
  idpEntityId: 'https://accounts.google.com/samlrp/test',
  idpSsoUrl: 'https://accounts.google.com/o/saml2/idp?idpid=test',
  metadataUrl: 'http://127.0.0.1:4000/api/auth/saml/metadata.xml',
  requestTtlMinutes: 5,
  samlEnabled: true,
  sessionSecretConfigured: true,
  sessionTtlHours: 12,
  spCertificateConfigured: true,
  spEntityId: 'http://127.0.0.1:4000/api/auth/saml/metadata.xml',
  spPrivateKeyConfigured: true,
  webAppUrl: 'http://127.0.0.1:5173',
  workspaceDomain: 'example.test',
};
