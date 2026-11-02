import { X509Certificate } from 'node:crypto';

interface SamlIdentityProviderConfiguration {
  idpCertificate: string;
  idpSsoUrl: string;
}

export class InvalidSamlConfigurationError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = 'InvalidSamlConfigurationError';
  }
}

export function assertValidSamlIdentityProviderConfiguration(
  configuration: SamlIdentityProviderConfiguration
) {
  assertHttpsSsoUrl(configuration.idpSsoUrl);
  parseIdpCertificates(configuration.idpCertificate);
}

export function parseIdpCertificates(value: string) {
  const normalized = value.trim().replace(/\r\n/g, '\n');
  const certificates = normalized.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g
  )?.map((certificate) => certificate.trim()) ?? [];
  const remainder = normalized.replace(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
    ''
  ).trim();

  if (certificates.length === 0 || remainder) {
    throw new InvalidSamlConfigurationError(
      'IdP certificate must contain one or more complete PEM certificates.'
    );
  }

  try {
    certificates.forEach((certificate) => new X509Certificate(certificate));
  } catch (error) {
    throw new InvalidSamlConfigurationError('IdP certificate is not a valid X.509 certificate.', {
      cause: error,
    });
  }

  return certificates;
}

function assertHttpsSsoUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new InvalidSamlConfigurationError('IdP SSO URL must be a valid HTTPS URL.', {
      cause: error,
    });
  }

  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new InvalidSamlConfigurationError(
      'IdP SSO URL must use HTTPS and cannot contain embedded credentials.'
    );
  }
}
