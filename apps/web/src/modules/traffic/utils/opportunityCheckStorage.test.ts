import type { OpportunityCheckResponse } from '@ptm/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { getStoredOpportunityChecks, setStoredOpportunityChecks } from './opportunityCheckStorage';

const check = {
  boardId: 'room',
  periodId: '2026-06',
  mode: 'mock',
  analysis: {
    monthSummary: {},
    projects: [],
  },
  result: {
    verdict: 'pursue',
    confidence: 'medium',
    topReasons: [],
    projectActions: [],
    allocationSuggestions: [],
    bottlenecks: [],
    financialRisks: [],
    deliveryHrRisks: [],
    assumptionsToVerify: [],
    nextScenarioToTry: 'Keep current plan.',
  },
  updatedAt: '2026-06-01T00:00:00.000Z',
} as unknown as OpportunityCheckResponse;

describe('opportunityCheckStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores saved AI checks per room', () => {
    setStoredOpportunityChecks('room-a', { '2026-06': check });

    expect(getStoredOpportunityChecks('room-a')).toEqual({ '2026-06': check });
    expect(getStoredOpportunityChecks('room-b')).toEqual({});
  });

  it('removes the room key when no checks remain', () => {
    setStoredOpportunityChecks('room-a', { '2026-06': check });
    setStoredOpportunityChecks('room-a', {});

    expect(window.localStorage.getItem('ptm-ai-checks:room-a')).toBeNull();
    expect(getStoredOpportunityChecks('room-a')).toEqual({});
  });

  it('falls back to an empty record when storage payload is invalid', () => {
    window.localStorage.setItem('ptm-ai-checks:room-a', 'not-json');

    expect(getStoredOpportunityChecks('room-a')).toEqual({});
  });
});
