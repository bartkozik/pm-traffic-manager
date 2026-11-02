import { describe, expect, it } from 'vitest';
import {
  allocationCoversRequirement,
  getSuggestedAllocationRequirement,
  skillCoversRequirementSkill,
} from './allocationSkills.js';
import { Person, PersonTileAllocation, ProjectFrame } from './traffic.model.js';

const anna = {
  id: 'anna',
  name: "Avery",
  role: 'UX Designer',
  initials: "AK",
  color: '#000000',
  skillIds: ['design', 'frontend'],
  seniority: 'mid',
  costModel: { type: 'fixed_monthly', defaultMonthlyHours: 120 },
  monthlyCostK: 12,
  hoursPerTile: 7,
  layers: { workK: 8, adminK: 10, salesK: 12, targetK: 18 },
} satisfies Person;

const project = {
  id: 'client-beta',
  name: 'Client Beta',
  client: 'Client Beta',
  contractType: 'fixed_phase',
  stage: 'likely',
  budgetK: 24,
  probability: 0.65,
  startMonth: 'Marzec 2026',
  startPeriodId: '2026-03',
  rateConfig: { companyTargetRatePlnH: 240 },
  requirements: [
    { id: 'design-mid', skillId: 'design', seniority: 'mid', estimatedHours: 40, required: true },
    { id: 'frontend-mid', skillId: 'frontend', seniority: 'mid', estimatedHours: 70, required: true },
  ],
  revenuePlan: [{ periodId: '2026-03', revenueK: 24, probability: 0.65 }],
  invoices: [],
  notes: '',
} satisfies ProjectFrame;

function allocation(id: string, overrides: Partial<PersonTileAllocation> = {}) {
  return {
    id,
    personId: anna.id,
    tileIndex: Number(id.replace(/\D/g, '')) || 0,
    target: project.id,
    periodId: '2026-03',
    mode: 'revenue_first',
    revenueK: 1,
    hours: 7,
    ...overrides,
  } satisfies PersonTileAllocation;
}

describe('getSuggestedAllocationRequirement', () => {
  it('spreads multi-skill person tiles across least-covered matching requirements', () => {
    const firstTile = allocation('tile-1');
    const firstRequirement = getSuggestedAllocationRequirement(firstTile, project, anna, [firstTile]);
    expect(firstRequirement?.id).toBe('design-mid');

    const assignedFirstTile = allocation('tile-1', {
      requirementId: firstRequirement?.id,
      skillId: firstRequirement?.skillId,
    });
    const secondTile = allocation('tile-2');
    const secondRequirement = getSuggestedAllocationRequirement(
      secondTile,
      project,
      anna,
      [assignedFirstTile, secondTile]
    );

    expect(secondRequirement?.id).toBe('frontend-mid');
  });

  it('treats fullstack as compatible with backend, frontend, and devops requirements', () => {
    expect(skillCoversRequirementSkill('fullstack', 'backend')).toBe(true);
    expect(skillCoversRequirementSkill('fullstack', 'frontend')).toBe(true);
    expect(skillCoversRequirementSkill('fullstack', 'devops')).toBe(true);
  });

  it('maps fullstack person tiles to separate compatible requirements instead of leaving them unmapped', () => {
    const fullstackPerson = {
      ...anna,
      id: 'fullstack-person',
      skillIds: ['fullstack'],
    } satisfies Person;
    const deliveryProject = {
      ...project,
      requirements: [
        { id: 'backend-mid', skillId: 'backend', seniority: 'mid', estimatedHours: 20, required: true },
        { id: 'frontend-mid', skillId: 'frontend', seniority: 'mid', estimatedHours: 20, required: true },
        { id: 'devops-mid', skillId: 'devops', seniority: 'mid', estimatedHours: 20, required: true },
      ],
    } satisfies ProjectFrame;
    const firstTile = allocation('tile-1', { personId: fullstackPerson.id, target: deliveryProject.id });
    const firstRequirement = getSuggestedAllocationRequirement(firstTile, deliveryProject, fullstackPerson, [firstTile]);
    const assignedFirstTile = allocation('tile-1', {
      personId: fullstackPerson.id,
      target: deliveryProject.id,
      requirementId: firstRequirement?.id,
      skillId: firstRequirement?.skillId,
    });
    const secondTile = allocation('tile-2', { personId: fullstackPerson.id, target: deliveryProject.id });
    const secondRequirement = getSuggestedAllocationRequirement(
      secondTile,
      deliveryProject,
      fullstackPerson,
      [assignedFirstTile, secondTile]
    );

    expect(firstRequirement?.id).toBe('backend-mid');
    expect(secondRequirement?.id).toBe('frontend-mid');
    expect(allocationCoversRequirement(assignedFirstTile, deliveryProject.requirements[0], deliveryProject, fullstackPerson)).toBe(true);
  });
});
