import {
  SAML,
  ValidateInResponseTo,
  generateServiceProviderMetadata,
  type CacheProvider,
  type Profile,
} from '@node-saml/node-saml';
import type { SamlAuthenticationRequest } from '@ptm/contracts';
import type { AuthConfig } from '../config.js';
import type { SamlConfigurationRecord, SamlConfigurationRepository } from './samlConfiguration.repository.js';
import { parseIdpCertificates } from './samlConfiguration.validation.js';

const EMAIL_NAME_ID_FORMAT = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';
const BEARER_SUBJECT_CONFIRMATION = 'urn:oasis:names:tc:SAML:2.0:cm:bearer';

export interface SamlIdentity {
  email: string;
  name: string;
  nameId: string;
}

export interface SamlAuthenticationResult {
  identity: SamlIdentity;
  returnTo: string;
}

export interface SamlIdentityProvider {
  createAuthenticationRequest(returnTo: string): Promise<SamlAuthenticationRequest>;
  getServiceProviderMetadata(): string;
  validateAuthenticationResponse(input: {
    relayState?: string;
    samlResponse: string;
  }): Promise<SamlAuthenticationResult>;
}

export class SamlConfigurationMissingError extends Error {
  constructor() {
    super('SAML identity provider configuration is missing.');
    this.name = 'SamlConfigurationMissingError';
  }
}

export class SamlDisabledError extends Error {
  constructor() {
    super('SAML authentication is disabled.');
    this.name = 'SamlDisabledError';
  }
}

export class SamlWorkspaceIdentityProvider implements SamlIdentityProvider {
  constructor(
    private readonly config: AuthConfig,
    private readonly configurationRepository: SamlConfigurationRepository,
    private readonly createCacheProvider: (expirationMs: number) => CacheProvider
  ) {}

  async createAuthenticationRequest(returnTo: string): Promise<SamlAuthenticationRequest> {
    const configuration = await this.getEnabledConfiguration();
    const message = await this.createClient(configuration).getAuthorizeMessageAsync(returnTo);
    const samlRequest = getMessageValue(message.SAMLRequest);
    if (!samlRequest) throw new Error('SAML authentication request could not be created.');

    return {
      relayState: getMessageValue(message.RelayState) || returnTo,
      samlRequest,
      ssoUrl: configuration.idpSsoUrl,
    };
  }

  getServiceProviderMetadata(): string {
    return generateServiceProviderMetadata({
      callbackUrl: this.config.samlAcsUrl,
      digestAlgorithm: 'sha256',
      identifierFormat: EMAIL_NAME_ID_FORMAT,
      issuer: this.config.samlSpEntityId,
      privateKey: this.config.samlSpPrivateKey,
      publicCerts: this.config.samlSpCertificate,
      signMetadata: true,
      signatureAlgorithm: 'sha256',
      wantAssertionsSigned: true,
    });
  }

  async validateAuthenticationResponse(input: {
    relayState?: string;
    samlResponse: string;
  }): Promise<SamlAuthenticationResult> {
    const configuration = await this.getEnabledConfiguration();
    const result = await this.createClient(configuration).validatePostResponseAsync({
      SAMLResponse: input.samlResponse,
    });
    if (result.loggedOut || !result.profile?.nameID) {
      throw new Error('SAML response does not contain an authenticated identity.');
    }
    assertTrustedProfile(result.profile, configuration.idpEntityId, this.config.samlAcsUrl);

    return {
      identity: toSamlIdentity(result.profile),
      returnTo: input.relayState || '/',
    };
  }

  private async getEnabledConfiguration() {
    const configuration = await this.configurationRepository.getConfiguration();
    if (!configuration) throw new SamlConfigurationMissingError();
    if (!configuration.samlEnabled) throw new SamlDisabledError();
    return configuration;
  }

  private createClient(configuration: SamlConfigurationRecord) {
    const requestExpirationMs = configuration.requestTtlMinutes * 60 * 1000;
    return new SAML({
      audience: this.config.samlSpEntityId,
      authnRequestBinding: 'HTTP-POST',
      cacheProvider: this.createCacheProvider(requestExpirationMs),
      callbackUrl: this.config.samlAcsUrl,
      disableRequestedAuthnContext: true,
      digestAlgorithm: 'sha256',
      entryPoint: configuration.idpSsoUrl,
      identifierFormat: EMAIL_NAME_ID_FORMAT,
      idpCert: parseIdpCertificates(configuration.idpCertificate),
      idpIssuer: configuration.idpEntityId,
      issuer: this.config.samlSpEntityId,
      maxAssertionAgeMs: requestExpirationMs,
      privateKey: this.config.samlSpPrivateKey,
      publicCert: this.config.samlSpCertificate,
      requestIdExpirationPeriodMs: requestExpirationMs,
      signatureAlgorithm: 'sha256',
      skipRequestCompression: true,
      validateInResponseTo: ValidateInResponseTo.always,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: false,
    });
  }
}

export function assertTrustedProfile(
  profile: Profile,
  expectedIssuer: string,
  expectedRecipient: string
) {
  if (profile.issuer !== expectedIssuer) {
    throw new Error('SAML assertion issuer does not match the configured identity provider.');
  }

  const assertion = asRecord(asRecord(profile.getAssertion?.()).Assertion);
  const subjects = asRecords(assertion.Subject);
  const bearerRecipients = subjects.flatMap((subject) => (
    asRecords(subject.SubjectConfirmation)
      .filter((confirmation) => asRecord(confirmation.$).Method === BEARER_SUBJECT_CONFIRMATION)
      .flatMap((confirmation) => asRecords(confirmation.SubjectConfirmationData))
      .map((data) => asRecord(data.$).Recipient)
      .filter((recipient): recipient is string => typeof recipient === 'string')
  ));

  if (
    bearerRecipients.length === 0 ||
    bearerRecipients.some((recipient) => recipient !== expectedRecipient)
  ) {
    throw new Error('SAML assertion recipient does not match the configured ACS URL.');
  }
}

export function toSamlIdentity(profile: Profile): SamlIdentity {
  const nameId = profile.nameID.trim();
  const email = nameId;
  const firstName = getProfileValue(profile, ['firstName', 'first_name', 'givenName', 'given_name']);
  const lastName = getProfileValue(profile, ['lastName', 'last_name', 'sn', 'surname', 'family_name']);
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  const name = fullName || getProfileValue(profile, ['displayName', 'name', 'cn']) || email.split('@')[0];

  return { email, name, nameId };
}

function getProfileValue(profile: Profile, names: string[]) {
  for (const name of names) {
    const value = profile[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const first = value.find((item): item is string => typeof item === 'string' && Boolean(item.trim()));
      if (first) return first.trim();
    }
  }
  return undefined;
}

function getMessageValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asRecords(value: unknown) {
  return Array.isArray(value)
    ? value.map(asRecord)
    : value && typeof value === 'object'
      ? [asRecord(value)]
      : [];
}
