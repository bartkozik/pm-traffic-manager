import { describe, expect, it } from 'vitest';
import { Period, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { generateLensMetrics } from './lensMetrics';

const period = {
  id: '2026-03',
  label: 'March 2026',
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
  startMonth: 'March 2026',
  startPeriodId: period.id,
  rateConfig: { companyTargetRatePlnH: 250 },
  requirements: [{ id: 'req-1', skillId: 'backend', estimatedHours: 80, required: true }],
  revenuePlan: [{ periodId: period.id, revenueK: 20, probability: 0.5 }],
  invoices: [],
  notes: '',
} satisfies ProjectFrame;

const allocation = {
  id: 'allocation-1',
  personId: person.id,
  tileIndex: 0,
  target: project.id,
  periodId: period.id,
  mode: 'revenue_first',
  revenueK: 4,
  hours: 32,
  skillId: 'backend',
} satisfies PersonTileAllocation;

const metrics = {
  totalCost: 16,
  targetRevenue: 16,
  committedRevenue: 0,
  expectedRevenue: 10,
  pressureToTarget: 6,
  loss: 0,
};

describe('lens metrics', () => {
  it('changes visible metrics for finance and sales lenses', () => {
    const finance = generateLensMetrics({
      activePeriodId: period.id,
      allocations: [allocation],
      boardRisks: [],
      lens: 'finance',
      metrics,
      people: [person],
      periods: [period],
      projects: [project],
    });
    const sales = generateLensMetrics({
      activePeriodId: period.id,
      allocations: [allocation],
      boardRisks: [],
      lens: 'sales',
      metrics,
      people: [person],
      periods: [period],
      projects: [project],
    });

    expect(finance.map((item) => item.id)).toEqual([
      'people-cost',
      'committed-revenue',
      'expected-revenue',
      'expected-margin',
      'target-gap',
    ]);
    expect(sales.map((item) => item.id)).toContain('ghost-expected');
    expect(finance.map((item) => item.id)).not.toEqual(sales.map((item) => item.id));
  });
});
