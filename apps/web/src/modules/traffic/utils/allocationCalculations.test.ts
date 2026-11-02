import { describe, expect, it } from 'vitest';
import { Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import {
  calculateAllocationInternalMarginGapK,
  calculateAllocationTargetGapK,
} from './allocationCalculations';

const allocation = {
  id: 'allocation-1',
  personId: 'person-1',
  tileIndex: 0,
  target: 'project-1',
  periodId: '2026-03',
  mode: 'hours_first',
  revenueK: 8,
  hours: 50,
  skillId: 'backend',
} satisfies PersonTileAllocation;

const person = {
  id: 'person-1',
  name: 'Senior Backend',
  role: 'Developer',
  initials: 'SB',
  color: '#000000',
  skillIds: ['backend'],
  costModel: {
    type: 'hourly',
    defaultMonthlyHours: 100,
    internalHourlyCostPln: 240,
  },
  monthlyCostK: 24,
  hoursPerTile: 5,
  layers: { workK: 10, adminK: 12, salesK: 15, targetK: 20 },
} satisfies Person;

const project = {
  id: 'project-1',
  name: 'Cheap Backend Deal',
  client: 'Client',
  contractType: 'hourly',
  stage: 'signed',
  budgetK: 10,
  probability: 1,
  startMonth: 'Marzec 2026',
  startPeriodId: '2026-03',
  rateConfig: {
    projectRatePlnH: 160,
    companyTargetRatePlnH: 260,
    skillRatesPlnH: { backend: 260 },
  },
  requirements: [],
  revenuePlan: [{ periodId: '2026-03', revenueK: 10, committedRevenueK: 10, probability: 1 }],
  invoices: [],
  notes: '',
} satisfies ProjectFrame;

describe('allocation margin calculations', () => {
  it('calculates target revenue gap when hours need more revenue than the deal pays', () => {
    expect(calculateAllocationTargetGapK(allocation, project)).toBe(5);
  });

  it('calculates internal margin gap when person cost is higher than allocation revenue', () => {
    expect(calculateAllocationInternalMarginGapK(allocation, person)).toBe(4);
  });

  it('does not report margin gaps for bench allocations', () => {
    const benchAllocation = { ...allocation, target: 'bench' } satisfies PersonTileAllocation;

    expect(calculateAllocationTargetGapK(benchAllocation, project)).toBe(0);
    expect(calculateAllocationInternalMarginGapK(benchAllocation, person)).toBe(0);
  });
});
