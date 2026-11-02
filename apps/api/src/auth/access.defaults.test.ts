import { describe, expect, it } from 'vitest';
import { createBootstrapAccessUsers, DEFAULT_ADMIN_EMAILS } from './access.defaults.js';

describe('default application administrators', () => {
  it('bootstraps all three default administrators and keeps configured members', () => {
    const users = createBootstrapAccessUsers([
      'member@example.test',
      'admin-1@example.test',
    ]);

    expect(users).toEqual(expect.arrayContaining([
      { email: 'member@example.test', role: 'member' },
      ...DEFAULT_ADMIN_EMAILS.map((email) => ({ email, role: 'admin' as const })),
    ]));
    expect(users).toHaveLength(4);
  });
});
