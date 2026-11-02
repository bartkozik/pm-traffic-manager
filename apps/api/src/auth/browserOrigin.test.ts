import { describe, expect, it } from 'vitest';
import { isAllowedBrowserOrigin } from './browserOrigin.js';

describe('browser origin validation', () => {
  it('allows localhost and 127.0.0.1 variants only for local configuration', () => {
    expect(isAllowedBrowserOrigin(
      'http://127.0.0.1:5180',
      'http://localhost:5173'
    )).toBe(true);
    expect(isAllowedBrowserOrigin(
      'http://localhost:5173',
      'https://ptm.example.com'
    )).toBe(false);
  });

  it('allows the exact configured production origin', () => {
    expect(isAllowedBrowserOrigin(
      'https://ptm.example.com',
      'https://ptm.example.com'
    )).toBe(true);
  });
});
