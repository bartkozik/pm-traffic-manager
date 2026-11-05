import { describe, expect, it } from 'vitest';
import { PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { calculateProjectPressure } from './projectPressure';

const project = {
  id: 'project-1',
  name: 'Phase',
  client: 'Client',
  contractType: 'fixed_phase',
  stage: 'signed',
  budgetK: 30,
  probability: 1,
  startMonth: 'March 2026',
  startPeriodId: '2026-03',
  endPeriodId: '2026-04',
  rateConfig: { companyTargetRatePlnH: 250 },
  requirements: [],
  revenuePlan: [
    { periodId: '2026-03', revenueK: 12, committedRevenueK: 12, probability: 1 },
    { periodId: '2026-04', revenueK: 18, committedRevenueK: 18, probability: 1 },
  ],
  invoices: [],
  notes: '',
} satisfies ProjectFrame;

const allocation = {
  id: 'allocation-1',
  personId: 'person-1',
  tileIndex: 0,
  target: project.id,
  periodId: '2026-03',
  mode: 'revenue_first',
  revenueK: 8,
  hours: 32,
} satisfies PersonTileAllocation;

describe('project pressure', () => {
  it('separates active-month pressure from total fixed scope pressure', () => {
    const pressure = calculateProjectPressure(project, '2026-03', [
      allocation,
      { ...allocation, id: 'allocation-2', periodId: '2026-04', revenueK: 10 },
    ]);

    expect(pressure).toMatchObject({
      monthlyAllocatedK: 8,
      monthlyGapK: 4,
      monthlyPlannedK: 12,
      totalAllocatedK: 18,
      totalGapK: 12,
      totalPlannedK: 30,
    });
  });

  it('does not calculate fixed-scope pressure for non-manual split contracts', () => {
    const pressure = calculateProjectPressure({
      ...project,
      contractType: 'hourly',
    }, '2026-03', [allocation]);

    expect(pressure).toBeNull();
  });
});
