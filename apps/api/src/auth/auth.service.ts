import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuthSessionResponse, AuthUser } from '@ptm/contracts';
import type { AuthConfig } from '../config.js';
import type { AccessUserRepository } from './access.repository.js';
import {
  SamlConfigurationMissingError,
  SamlDisabledError,
  type SamlIdentity,
  type SamlIdentityProvider,
} from './samlIdentity.provider.js';

const SESSION_COOKIE = 'ptm_session';

interface SignedSession extends AuthUser {
  exp: number;
  iat: number;
}

export type AuthErrorCode =
  | 'auth_not_configured'
  | 'invalid_response'
  | 'saml_disabled'
  | 'saml_failed'
  | 'unauthorized_email'
  | 'wrong_workspace';

export class AuthFlowError extends Error {
  constructor(readonly code: AuthErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message, options);
    this.name = 'AuthFlowError';
  }
}

export interface AuthServiceOptions {
  now?: () => number;
}

export class AuthService {
  private readonly now: () => number;

  constructor(
    private readonly config: AuthConfig,
    private readonly accessRepository: AccessUserRepository,
    private readonly provider: SamlIdentityProvider,
    options: AuthServiceOptions = {}
  ) {
    this.now = options.now || Date.now;
  }

  get enabled() {
    return this.config.enabled;
  }

  async createAuthenticationRequest(returnTo?: string) {
    this.assertEnabled();
    try {
      return await this.provider.createAuthenticationRequest(sanitizeReturnTo(returnTo));
    } catch (error) {
      throw mapProviderError(error, 'Unable to create a SAML authentication request.');
    }
  }

  async completeLogin(input: { relayState?: string; samlResponse?: string }) {
    this.assertEnabled();
    if (!input.samlResponse) {
      throw new AuthFlowError('invalid_response', 'SAML callback is missing SAMLResponse.');
    }

    let identity: SamlIdentity;
    let returnTo: string;
    try {
      const result = await this.provider.validateAuthenticationResponse({
        relayState: input.relayState,
        samlResponse: input.samlResponse,
      });
      identity = result.identity;
      returnTo = sanitizeReturnTo(result.returnTo);
    } catch (error) {
      throw mapProviderError(error, 'SAML identity could not be verified.');
    }

    const user = await this.validateIdentity(identity);
    const issuedAt = this.nowSeconds();
    const maxAgeSeconds = Math.round(this.config.sessionTtlHours * 60 * 60);
    const session: SignedSession = {
      ...user,
      exp: issuedAt + maxAgeSeconds,
      iat: issuedAt,
    };

    return {
      returnTo,
      sessionCookie: this.serializeCookie(SESSION_COOKIE, this.sign(session), maxAgeSeconds),
      user,
    };
  }

  getServiceProviderMetadata() {
    this.assertEnabled();
    return this.provider.getServiceProviderMetadata();
  }

  async getSession(cookieHeader?: string): Promise<AuthUser | undefined> {
    const session = await this.getValidSession(cookieHeader);
    if (!session) return undefined;

    return {
      email: session.email,
      name: session.name,
      organizationDomain: session.organizationDomain,
      role: session.role,
      subject: session.subject,
    };
  }

  getSessionExpiresAt(cookieHeader?: string) {
    const session = this.getSignedSession(cookieHeader);
    return session ? session.exp * 1000 : undefined;
  }

  async getSessionResponse(cookieHeader?: string): Promise<AuthSessionResponse> {
    const user = await this.getSession(cookieHeader);
    return {
      authenticated: Boolean(user),
      authEnabled: this.enabled,
      user,
      workspaceDomain: this.enabled ? this.config.workspaceDomain : undefined,
    };
  }

  async getRequestActor(cookieHeader?: string, authorizationHeader?: string) {
    if (!this.enabled) return undefined;
    if (this.matchesServiceToken(authorizationHeader)) return 'ptm-mcp-agent';
    return (await this.getSession(cookieHeader))?.email;
  }

  async isRequestAuthorized(cookieHeader?: string, authorizationHeader?: string) {
    return !this.enabled || Boolean(await this.getRequestActor(cookieHeader, authorizationHeader));
  }

  getLogoutCookie() {
    return this.clearCookie(SESSION_COOKIE);
  }

  getWebAppRedirect(returnTo = '/', errorCode?: AuthErrorCode) {
    const target = errorCode ? '/login' : sanitizeReturnTo(returnTo);
    const url = new URL(target, `${this.config.webAppUrl}/`);
    if (errorCode) url.searchParams.set('auth_error', errorCode);
    return url.toString();
  }

  private assertEnabled() {
    if (!this.enabled) {
      throw new AuthFlowError('auth_not_configured', 'SAML authentication is not enabled.');
    }
  }

  private async validateIdentity(identity: SamlIdentity): Promise<AuthUser> {
    const email = normalizeEmail(identity.email);
    const subject = identity.nameId.trim();
    if (!email || !subject) {
      throw new AuthFlowError('invalid_response', 'SAML identity is missing required fields.');
    }
    const organizationDomain = getEmailDomain(email);
    if (organizationDomain !== this.config.workspaceDomain) {
      throw new AuthFlowError('wrong_workspace', 'SAML account does not belong to the configured Workspace.');
    }
    const name = identity.name.trim() || email.split('@')[0];
    const access = await this.accessRepository.recordSuccessfulLogin({
      email,
      name,
      samlNameId: subject,
    });
    if (!access) {
      throw new AuthFlowError('unauthorized_email', 'SAML account is not allowed to access PTM.');
    }

    return {
      email,
      name,
      organizationDomain,
      role: access.role,
      subject,
    };
  }

  private matchesServiceToken(authorizationHeader?: string) {
    if (!this.config.serviceToken || !authorizationHeader?.startsWith('Bearer ')) return false;
    return safeEqual(authorizationHeader.slice('Bearer '.length), this.config.serviceToken);
  }

  private async getValidSession(cookieHeader?: string) {
    if (!this.enabled) return undefined;
    const session = this.getSignedSession(cookieHeader);
    if (!session) return undefined;
    if (session.organizationDomain !== this.config.workspaceDomain) return undefined;

    const access = await this.accessRepository.findActiveUser(session.email);
    if (!access || (access.samlNameId && access.samlNameId !== session.subject)) return undefined;
    return {
      ...session,
      name: access.name || session.name,
      role: access.role,
    };
  }

  private getSignedSession(cookieHeader?: string) {
    if (!this.enabled) return undefined;
    const token = readCookie(cookieHeader, SESSION_COOKIE);
    return token ? this.verifySignedPayload<SignedSession>(token) : undefined;
  }

  private sign(payload: object) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.config.sessionSecret)
      .update(encodedPayload)
      .digest('base64url');
    return `${encodedPayload}.${signature}`;
  }

  private verifySignedPayload<T extends { exp: number }>(token: string): T | undefined {
    const [encodedPayload, signature, ...rest] = token.split('.');
    if (!encodedPayload || !signature || rest.length > 0) return undefined;
    const expectedSignature = createHmac('sha256', this.config.sessionSecret)
      .update(encodedPayload)
      .digest('base64url');
    if (!safeEqual(signature, expectedSignature)) return undefined;

    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as T;
      if (!Number.isFinite(payload.exp) || payload.exp <= this.nowSeconds()) return undefined;
      return payload;
    } catch {
      return undefined;
    }
  }

  private serializeCookie(name: string, value: string, maxAgeSeconds: number) {
    const secure = this.config.cookieSecure ? '; Secure' : '';
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
  }

  private clearCookie(name: string) {
    const secure = this.config.cookieSecure ? '; Secure' : '';
    return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
  }

  private nowSeconds() {
    return Math.floor(this.now() / 1000);
  }
}

function mapProviderError(error: unknown, fallbackMessage: string) {
  if (error instanceof AuthFlowError) return error;
  if (error instanceof SamlConfigurationMissingError) {
    return new AuthFlowError('auth_not_configured', error.message);
  }
  if (error instanceof SamlDisabledError) {
    return new AuthFlowError('saml_disabled', error.message);
  }
  return new AuthFlowError('saml_failed', fallbackMessage, { cause: error });
}

function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;
  for (const item of cookieHeader.split(';')) {
    const separatorIndex = item.indexOf('=');
    if (separatorIndex === -1) continue;
    const cookieName = item.slice(0, separatorIndex).trim();
    if (cookieName === name) return item.slice(separatorIndex + 1).trim();
  }
  return undefined;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getEmailDomain(email: string) {
  const separatorIndex = email.lastIndexOf('@');
  return separatorIndex > 0 ? email.slice(separatorIndex + 1) : '';
}

function sanitizeReturnTo(value: string | undefined) {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, 'http://ptm.local');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
