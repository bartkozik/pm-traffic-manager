import { describe, expect, it } from 'vitest';
import type { ProjectFrame } from '../models/traffic.model';
import { isProjectActiveInPeriod } from './projectPeriod';

const baseProject: ProjectFrame = {
  id: 'project-alpha',
  name: 'Core team',
  client: "Client 1",
  contractType: 'fixed_monthly',
  stage: 'signed',
  planningStatus: 'active',
  budgetK: 20,
  probability: 1,
  startMonth: 'March 2026',
  startPeriodId: '2026-03',
  endPeriodId: '2026-03',
  rateConfig: {
    projectRatePlnH: 220,
    companyTargetRatePlnH: 260,
    skillRatesPlnH: {},
  },
  requirements: [],
  preferredPersonIds: [],
  blockedPersonIds: [],
  revenuePlan: [{ periodId: '2026-03', revenueK: 20, probability: 1 }],
  invoices: [],
  notes: '',
};

describe('isProjectActiveInPeriod', () => {
  it('does not carry a monthly project into future months by date range alone', () => {
    expect(isProjectActiveInPeriod(baseProject, '2026-03')).toBe(true);
    expect(isProjectActiveInPeriod(baseProject, '2026-04')).toBe(false);
  });

  it('shows a project in another month only when that month has revenue plan or allocations', () => {
    const allocationsByTarget = new Map([
      ['project-alpha', [{
        id: 'tile-1',
        personId: 'person-1',
        target: 'project-alpha',
        periodId: '2026-04',
        tileIndex: 0,
        revenueK: 1,
        hours: 5,
        mode: 'revenue_first' as const,
      }]],
    ]);

    expect(isProjectActiveInPeriod({
      ...baseProject,
      revenuePlan: [...baseProject.revenuePlan, { periodId: '2026-04', revenueK: 8, probability: 1 }],
    }, '2026-04')).toBe(true);

    expect(isProjectActiveInPeriod(baseProject, '2026-04', allocationsByTarget)).toBe(true);
  });
});
