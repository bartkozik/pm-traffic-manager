import { describe, expect, it } from 'vitest';
import { stripQueryString } from './app.js';

describe('stripQueryString', () => {
  it('keeps callback paths while removing SAML form values from logged URLs', () => {
    expect(stripQueryString('/api/auth/saml/acs?SAMLResponse=sensitive')).toBe(
      '/api/auth/saml/acs'
    );
  });
});
