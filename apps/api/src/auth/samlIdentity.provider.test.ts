import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { CacheItem, CacheProvider, Profile } from '@node-saml/node-saml';
import { describe, expect, it } from 'vitest';
import { InMemorySamlConfigurationRepository } from './inMemorySamlConfiguration.repository.testSupport.js';
import {
  SamlDisabledError,
  SamlWorkspaceIdentityProvider,
  assertTrustedProfile,
  toSamlIdentity,
} from './samlIdentity.provider.js';
import {
  createTestAuthConfig,
  testSamlConfiguration,
} from './saml.testSupport.js';

const privateKey = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  publicKeyEncoding: { format: 'pem', type: 'spki' },
}).privateKey;
const certificate = execFileSync('openssl', [
  'req', '-new', '-x509', '-key', '/dev/stdin', '-subj', '/CN=ptm-test.invalid', '-days', '1',
], { input: privateKey, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

describe('SamlWorkspaceIdentityProvider', () => {
  it('creates a signed HTTP-POST AuthnRequest and signed SP metadata', async () => {
    const cache = new MemoryCache();
    const provider = new SamlWorkspaceIdentityProvider(
      createTestAuthConfig({
        samlSpCertificate: certificate,
        samlSpPrivateKey: privateKey,
      }),
      new InMemorySamlConfigurationRepository(testSamlConfiguration),
      () => cache
    );

    const request = await provider.createAuthenticationRequest('/diablo-board/ptm-mvp');
    const xml = Buffer.from(request.samlRequest, 'base64').toString('utf8');
    const metadata = provider.getServiceProviderMetadata();

    expect(request).toMatchObject({
      relayState: '/diablo-board/ptm-mvp',
      ssoUrl: testSamlConfiguration.idpSsoUrl,
    });
    expect(xml).toContain('samlp:AuthnRequest');
    expect(xml).toContain('AssertionConsumerServiceURL="http://localhost:4000/api/auth/saml/acs"');
    expect(xml).toMatch(/<(?:ds:)?Signature[ >]/);
    expect(xml).toContain('xmlenc#sha256');
    expect(cache.size).toBe(1);
    expect(metadata).toContain('entityID="http://localhost:4000/api/auth/saml/metadata.xml"');
    expect(metadata).toMatch(/<(?:ds:)?Signature[ >]/);
  });

  it('does not start authentication when SAML is disabled in the stored IdP configuration', async () => {
    const provider = new SamlWorkspaceIdentityProvider(
      createTestAuthConfig({ samlSpCertificate: certificate, samlSpPrivateKey: privateKey }),
      new InMemorySamlConfigurationRepository({ ...testSamlConfiguration, samlEnabled: false }),
      () => new MemoryCache()
    );

    await expect(provider.createAuthenticationRequest('/')).rejects.toBeInstanceOf(SamlDisabledError);
  });

  it('accepts only the configured issuer and ACS recipient from the verified assertion', () => {
    const issuer = testSamlConfiguration.idpEntityId;
    const recipient = 'http://localhost:4000/api/auth/saml/acs';

    expect(() => assertTrustedProfile(createProfile(issuer, recipient), issuer, recipient)).not.toThrow();
    expect(() => assertTrustedProfile(createProfile('https://unexpected-idp.test', recipient), issuer, recipient))
      .toThrow('issuer does not match');
    expect(() => assertTrustedProfile(createProfile(issuer, 'https://other-sp.test/acs'), issuer, recipient))
      .toThrow('recipient does not match');
    expect(() => assertTrustedProfile(
      createProfile(issuer, recipient, 'https://other-sp.test/acs'),
      issuer,
      recipient
    )).toThrow('recipient does not match');
  });

  it('uses NameID as the account email, matching the Google primary-email configuration', () => {
    const profile = createProfile(
      testSamlConfiguration.idpEntityId,
      'http://localhost:4000/api/auth/saml/acs'
    );
    profile.email = 'different-user@example.test';
    profile.firstName = "Avery";
    profile.lastName = 'Nowak';

    expect(toSamlIdentity(profile)).toEqual({
      email: 'anna@example.test',
      name: "Avery Nowak",
      nameId: 'anna@example.test',
    });
  });

  it('accepts the existing Epoca-style Google attribute mapping without using groups for authorization', () => {
    const profile = createProfile(
      testSamlConfiguration.idpEntityId,
      'http://localhost:4000/api/auth/saml/acs'
    );
    profile.email = 'anna@example.test';
    profile.first_name = "Avery";
    profile.last_name = 'Nowak';
    profile.groups = ['Board of Boards', 'pm'];

    expect(toSamlIdentity(profile)).toEqual({
      email: 'anna@example.test',
      name: "Avery Nowak",
      nameId: 'anna@example.test',
    });
  });
});

function createProfile(issuer: string, ...recipients: string[]): Profile {
  return {
    issuer,
    nameID: 'anna@example.test',
    nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    getAssertion: () => ({
      Assertion: {
        Subject: [{
          SubjectConfirmation: recipients.map((recipient) => ({
            $: { Method: 'urn:oasis:names:tc:SAML:2.0:cm:bearer' },
            SubjectConfirmationData: [{ $: { Recipient: recipient } }],
          })),
        }],
      },
    }),
  };
}

class MemoryCache implements CacheProvider {
  private readonly values = new Map<string, CacheItem>();

  get size() {
    return this.values.size;
  }

  async getAsync(key: string) {
    return this.values.get(key)?.value || null;
  }

  async removeAsync(key: string | null) {
    if (!key) return null;
    const value = this.values.get(key)?.value || null;
    this.values.delete(key);
    return value;
  }

  async saveAsync(key: string, value: string) {
    const item = { createdAt: Date.now(), value };
    this.values.set(key, item);
    return item;
  }
}
