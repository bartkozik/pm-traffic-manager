import { describe, expect, it } from 'vitest';
import { Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { generateBoardRisks } from './boardRisks';

const person = {
  id: 'person-1',
  name: "Avery",
  role: 'Developer',
  initials: "AK",
  color: '#000000',
  skillIds: ['frontend'],
  seniority: 'mid',
  costModel: { type: 'fixed_monthly', defaultMonthlyHours: 120 },
  monthlyCostK: 12,
  hoursPerTile: 7,
  layers: { workK: 8, adminK: 10, salesK: 12, targetK: 18 },
} satisfies Person;

const project = {
  id: 'project-1',
  name: 'Product discovery',
  client: "Client 2",
  contractType: 'fixed_phase',
  stage: 'likely',
  planningStatus: 'active',
  budgetK: 24,
  probability: 0.65,
  startMonth: 'March 2026',
  startPeriodId: '2026-03',
  rateConfig: { companyTargetRatePlnH: 240 },
  requirements: [],
  revenuePlan: [{ periodId: '2026-03', revenueK: 24, probability: 0.65 }],
  invoices: [],
  notes: '',
} satisfies ProjectFrame;

describe('generateBoardRisks', () => {
  it('shows a resource gap when project plan is not covered by allocated tiles', () => {
    const allocations = [{
      id: 'allocation-1',
      personId: person.id,
      tileIndex: 0,
      target: project.id,
      periodId: '2026-03',
      mode: 'revenue_first',
      revenueK: 8,
      hours: 40,
    } satisfies PersonTileAllocation];

    const risks = generateBoardRisks({
      activePeriodId: '2026-03',
      allocations,
      peopleById: new Map([[person.id, person]]),
      pressureToTargetK: 0,
      projects: [project],
    });

    expect(risks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'project-1-resource-gap',
        title: "Client 2: staffing gap",
        detail: 'The project has 24k PLN planned but 8k PLN staffed. Resources/tiles are short by 16k PLN.',
        items: [expect.objectContaining({
          primary: "Client 2: Product discovery",
          secondary: 'Plan: 24k PLN · staffing: 8k PLN',
          detail: 'Assigned tiles are 16k PLN short of covering the planned project scope.',
        })],
      }),
    ]));
  });
});
