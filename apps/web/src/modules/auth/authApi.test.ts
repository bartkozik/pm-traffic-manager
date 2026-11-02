import { afterEach, describe, expect, it, vi } from 'vitest';
import { startSamlWorkspaceLogin } from './authApi';

describe('startSamlWorkspaceLogin', () => {
  afterEach(() => {
    document.querySelectorAll('form').forEach((form) => form.remove());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('posts the signed AuthnRequest and RelayState directly to the IdP', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      relayState: '/diablo-board/ptm-mvp',
      samlRequest: 'base64-signed-request',
      ssoUrl: 'https://accounts.google.test/saml',
    }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await startSamlWorkspaceLogin('/diablo-board/ptm-mvp');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/saml/authn?returnTo=%2Fdiablo-board%2Fptm-mvp'),
      expect.objectContaining({ credentials: 'include' })
    );
    const form = document.querySelector('form');
    expect(form).toHaveAttribute('action', 'https://accounts.google.test/saml');
    expect(form).toHaveAttribute('method', 'POST');
    expect(form?.querySelector<HTMLInputElement>('input[name="SAMLRequest"]')?.value)
      .toBe('base64-signed-request');
    expect(form?.querySelector<HTMLInputElement>('input[name="RelayState"]')?.value)
      .toBe('/diablo-board/ptm-mvp');
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
