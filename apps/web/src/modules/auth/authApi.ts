import {
  appAccessUserSchema,
  appAccessUsersResponseSchema,
  appSamlConfigurationSchema,
  authSessionResponseSchema,
  samlAuthenticationRequestSchema,
  type AppAccessRole,
  type AppAccessStatus,
  type AppAccessUser,
  type AppAccessUsersResponse,
  type AppSamlConfiguration,
  type AuthSessionResponse,
  type UpdateAppSamlConfigurationRequest,
} from '@ptm/contracts';
import { apiBaseUrl, apiFetch } from '@/core/api/apiClient';

export async function loadAuthSession(): Promise<AuthSessionResponse> {
  const response = await apiFetch(`${apiBaseUrl}/auth/session`);
  if (!response.ok) {
    throw new Error(`Nie udało się sprawdzić sesji: ${response.status}`);
  }
  return authSessionResponseSchema.parse(await response.json());
}

export async function startSamlWorkspaceLogin(returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  const response = await apiFetch(`${apiBaseUrl}/auth/saml/authn?${params.toString()}`);
  if (!response.ok) throw await createAccessApiError(response);
  const authenticationRequest = samlAuthenticationRequestSchema.parse(await response.json());
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = authenticationRequest.ssoUrl;
  form.hidden = true;
  form.append(
    createHiddenInput('SAMLRequest', authenticationRequest.samlRequest),
    createHiddenInput('RelayState', authenticationRequest.relayState)
  );
  document.body.appendChild(form);
  form.submit();
}

export async function logoutFromPtm() {
  const response = await apiFetch(`${apiBaseUrl}/auth/logout`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Nie udało się wylogować: ${response.status}`);
  }
}

export async function loadAccessOverview(): Promise<AppAccessUsersResponse> {
  const response = await apiFetch(`${apiBaseUrl}/access/users`);
  if (!response.ok) throw await createAccessApiError(response);
  return appAccessUsersResponseSchema.parse(await response.json());
}

export async function createAccessUser(input: {
  email: string;
  role: AppAccessRole;
}): Promise<AppAccessUser> {
  const response = await apiFetch(`${apiBaseUrl}/access/users`, {
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  if (!response.ok) throw await createAccessApiError(response);
  return appAccessUserSchema.parse(await response.json());
}

export async function updateAccessUser(
  email: string,
  patch: { role?: AppAccessRole; status?: AppAccessStatus }
): Promise<AppAccessUser> {
  const response = await apiFetch(`${apiBaseUrl}/access/users/${encodeURIComponent(email)}`, {
    body: JSON.stringify(patch),
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
  });
  if (!response.ok) throw await createAccessApiError(response);
  return appAccessUserSchema.parse(await response.json());
}

export async function updateSamlConfiguration(
  input: UpdateAppSamlConfigurationRequest
): Promise<AppSamlConfiguration> {
  const response = await apiFetch(`${apiBaseUrl}/access/saml-configuration`, {
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
  if (!response.ok) throw await createAccessApiError(response);
  return appSamlConfigurationSchema.parse(await response.json());
}

export class AccessApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'AccessApiError';
  }
}

async function createAccessApiError(response: Response) {
  try {
    const body = await response.json() as { code?: string; message?: string };
    return new AccessApiError(
      body.code || 'ACCESS_REQUEST_FAILED',
      body.message || `Access request failed with status ${response.status}.`
    );
  } catch {
    return new AccessApiError('ACCESS_REQUEST_FAILED', `Access request failed with status ${response.status}.`);
  }
}

function createHiddenInput(name: string, value: string) {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = value;
  return input;
}
