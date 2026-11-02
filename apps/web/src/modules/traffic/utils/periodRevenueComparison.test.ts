import { describe, expect, it } from 'vitest';
import { Period, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { calculatePeriodRevenueComparison } from './periodRevenueComparison';

const period = {
  id: '2026-03',
  label: 'Marzec 2026',
  granularity: 'month',
  startsOn: '2026-03-01',
  endsOn: '2026-03-31',
} satisfies Period;

const person = {
  id: 'person-1',
  name: "Oakley",
  role: 'Developer',
  initials: 'OK',
  color: '#000000',
  skillIds: ['backend'],
  costModel: {
    type: 'hourly',
    defaultMonthlyHours: 160,
    internalHourlyCostPln: 100,
  },
  monthlyCostK: 16,
  hoursPerTile: 8,
  layers: { workK: 8, adminK: 10, salesK: 12, targetK: 16 },
} satisfies Person;

const project = {
  id: 'project-1',
  name: 'Platform',
  client: 'Client',
  contractType: 'fixed_monthly',
  stage: 'likely',
  planningStatus: 'ghost',
  budgetK: 20,
  probability: 0.5,
  startMonth: 'Marzec 2026',
  startPeriodId: period.id,
  rateConfig: { companyTargetRatePlnH: 250 },
  requirements: [],
  revenuePlan: [{ periodId: period.id, revenueK: 20, committedRevenueK: 6, probability: 0.5 }],
  invoices: [],
  notes: '',
} satisfies ProjectFrame;

describe('period revenue comparison', () => {
  it('compares committed and expected revenue against period target', () => {
    const allocations = Array.from({ length: 10 }, (_, index) => ({
      id: `allocation-${index}`,
      personId: person.id,
      tileIndex: index,
      target: project.id,
      periodId: period.id,
      mode: 'revenue_first',
      revenueK: 1,
      hours: 8,
    })) satisfies PersonTileAllocation[];

    expect(calculatePeriodRevenueComparison({
      allocations,
      people: [person],
      period,
      projects: [project],
    })).toMatchObject({
      targetRevenueK: 16,
      committedRevenueK: 6,
      expectedRevenueK: 5,
      committedGapK: 10,
      expectedGapK: 11,
    });
  });
});
