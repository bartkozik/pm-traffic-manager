import { describe, expect, it } from 'vitest';
import { isSamlAuthExpected } from './authRuntimeConfig';

describe('isSamlAuthExpected', () => {
  it('enables the frontend gate only for an explicit true value', () => {
    expect(isSamlAuthExpected('true')).toBe(true);
    expect(isSamlAuthExpected('false')).toBe(false);
    expect(isSamlAuthExpected(undefined)).toBe(false);
  });
});
