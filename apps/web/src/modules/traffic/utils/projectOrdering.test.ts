import { describe, expect, it } from 'vitest';
import { Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { getProjectProfitPotentialK, sortProjectsForPlanningBoard } from './projectOrdering';

function project(id: string, overrides: Partial<ProjectFrame> = {}) {
  return {
    id,
    name: id,
    client: id,
    contractType: 'hourly',
    stage: 'signed',
    budgetK: 1,
    probability: 1,
    startMonth: 'Marzec 2026',
    startPeriodId: '2026-03',
    rateConfig: { companyTargetRatePlnH: 200 },
    requirements: [],
    revenuePlan: [],
    invoices: [],
    notes: '',
    ...overrides,
  } satisfies ProjectFrame;
}

const person = {
  id: 'person-1',
  name: "Avery",
  role: 'Developer',
  initials: "AK",
  color: '#000000',
  skillIds: ['frontend'],
  seniority: 'mid',
  costModel: { type: 'fixed_monthly', defaultMonthlyHours: 100 },
  monthlyCostK: 10,
  hoursPerTile: 5,
  layers: { workK: 8, adminK: 10, salesK: 12, targetK: 18 },
} satisfies Person;

function allocation(id: string, target: string, overrides: Partial<PersonTileAllocation> = {}) {
  return {
    id,
    personId: person.id,
    tileIndex: 0,
    target,
    periodId: '2026-03',
    mode: 'revenue_first',
    revenueK: 10,
    hours: 40,
    ...overrides,
  } satisfies PersonTileAllocation;
}

describe('sortProjectsForPlanningBoard', () => {
  it('keeps projects with the same commercial type next to each other', () => {
    const sorted = sortProjectsForPlanningBoard([
      project("Client 1", { contractType: 'fixed_monthly' }),
      project("Client 2", { contractType: 'fixed_phase', planningStatus: 'ghost', stage: 'likely', probability: 0.65 }),
      project("Client 3", { contractType: 'hourly', stage: 'defensive', probability: 0.9 }),
      project("Internal Team", { contractType: 'fixed_monthly' }),
    ]);

    expect(sorted.map((item) => item.client)).toEqual(['Client 1', 'Internal Team', 'Client 2', 'Client 3']);
  });

  it('sorts by probability-adjusted profit potential when requested', () => {
    const stableButCostly = project('Stable Costly', {
      probability: 1,
      revenuePlan: [{ periodId: '2026-03', revenueK: 20, probability: 1 }],
    });
    const likelyHighUpside = project('Likely Upside', {
      probability: 0.75,
      revenuePlan: [{ periodId: '2026-03', revenueK: 40, probability: 0.75 }],
    });
    const allocationsByTarget = new Map([
      [stableButCostly.id, [allocation('a1', stableButCostly.id, { revenueK: 20, hours: 120 })]],
      [likelyHighUpside.id, [allocation('a2', likelyHighUpside.id, { revenueK: 40, hours: 30 })]],
    ]);

    const sorted = sortProjectsForPlanningBoard([stableButCostly, likelyHighUpside], {
      allocationsByTarget,
      peopleById: new Map([[person.id, person]]),
      periodId: '2026-03',
      sortMode: 'profit_potential',
    });

    expect(getProjectProfitPotentialK(likelyHighUpside, { allocationsByTarget, peopleById: new Map([[person.id, person]]), periodId: '2026-03' }))
      .toBeGreaterThan(getProjectProfitPotentialK(stableButCostly, { allocationsByTarget, peopleById: new Map([[person.id, person]]), periodId: '2026-03' }));
    expect(sorted.map((item) => item.client)).toEqual(['Likely Upside', 'Stable Costly']);
  });
});
