import type { AppAccessRole } from '@ptm/contracts';

export const DEFAULT_ADMIN_EMAILS = [
  "admin-1@example.test",
  "admin-2@example.test",
  "admin-3@example.test",
] as const;

export function createBootstrapAccessUsers(allowedEmails: string[]) {
  const rolesByEmail = new Map<string, AppAccessRole>();

  for (const email of allowedEmails) rolesByEmail.set(normalizeEmail(email), 'member');
  for (const email of DEFAULT_ADMIN_EMAILS) rolesByEmail.set(normalizeEmail(email), 'admin');

  return [...rolesByEmail].map(([email, role]) => ({ email, role }));
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
