import type { OpportunityCheckResponse } from '@ptm/contracts';

const getStorageKey = (roomName: string) => `ptm-ai-checks:${roomName}`;

export function getStoredOpportunityChecks(roomName: string): Record<string, OpportunityCheckResponse> {
  if (typeof window === 'undefined') return {};

  try {
    const value = window.localStorage.getItem(getStorageKey(roomName));
    return value ? JSON.parse(value) as Record<string, OpportunityCheckResponse> : {};
  } catch {
    return {};
  }
}

export function setStoredOpportunityChecks(roomName: string, checks: Record<string, OpportunityCheckResponse>) {
  if (typeof window === 'undefined') return;

  const storageKey = getStorageKey(roomName);
  if (Object.keys(checks).length === 0) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(checks));
}
