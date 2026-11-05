import type { OpportunityCheckResponse } from '@ptm/contracts';
import { describe, expect, it } from 'vitest';
import { createPersonPairPlanningRule, type Person, type PersonTileAllocation, type ProjectFrame } from '../models/traffic.model';
import { buildSuggestedAllocationPlan } from './opportunityAllocationPlan';

const people: Person[] = [
  {
    id: 'senior-backend',
    name: 'Senior Backend',
    role: 'Developer',
    initials: 'SB',
    color: '#111111',
    skillIds: ['backend'],
    seniority: 'senior',
    costModel: { type: 'hourly', defaultMonthlyHours: 120, internalHourlyCostPln: 250 },
    monthlyCostK: 30,
    hoursPerTile: 8,
    layers: { workK: 30, adminK: 36, salesK: 42, targetK: 50 },
  },
  {
    id: 'frontend',
    name: 'Frontend',
    role: 'Developer',
    initials: 'FE',
    color: '#222222',
    skillIds: ['frontend'],
    seniority: 'mid',
    costModel: { type: 'fixed_monthly', defaultMonthlyHours: 120 },
    monthlyCostK: 20,
    hoursPerTile: 8,
    layers: { workK: 20, adminK: 25, salesK: 30, targetK: 38 },
  },
];

const projects: ProjectFrame[] = [
  {
    id: 'backend-project',
    name: 'Backend',
    client: 'Client A',
    contractType: 'hourly',
    stage: 'signed',
    planningStatus: 'active',
    budgetK: 30,
    probability: 1,
    startMonth: 'June 2026',
    startPeriodId: '2026-06',
    rateConfig: { projectRatePlnH: 320, companyTargetRatePlnH: 260 },
    requirements: [{ id: 'backend-req', skillId: 'backend', seniority: 'senior', estimatedHours: 80, required: true }],
    revenuePlan: [{ periodId: '2026-06', revenueK: 30, committedRevenueK: 30, probability: 1 }],
    invoices: [],
    notes: '',
  },
  {
    id: 'frontend-project',
    name: 'Frontend',
    client: 'Client B',
    contractType: 'hourly',
    stage: 'signed',
    planningStatus: 'active',
    budgetK: 24,
    probability: 1,
    startMonth: 'June 2026',
    startPeriodId: '2026-06',
    rateConfig: { projectRatePlnH: 300, companyTargetRatePlnH: 240 },
    requirements: [{ id: 'frontend-req', skillId: 'frontend', seniority: 'mid', estimatedHours: 80, required: true }],
    revenuePlan: [{ periodId: '2026-06', revenueK: 24, committedRevenueK: 24, probability: 1 }],
    invoices: [],
    notes: '',
  },
];

const allocations: PersonTileAllocation[] = [
  {
    id: 'backend-tile',
    personId: 'senior-backend',
    tileIndex: 0,
    target: 'frontend-project',
    periodId: '2026-06',
    mode: 'hours_first',
    revenueK: 12,
    hours: 40,
  },
  {
    id: 'frontend-tile',
    personId: 'frontend',
    tileIndex: 0,
    target: 'backend-project',
    periodId: '2026-06',
    mode: 'hours_first',
    revenueK: 12,
    hours: 40,
  },
];

const opportunityCheck = {
  periodId: '2026-06',
  analysis: {
    projects: [
      {
        projectId: 'backend-project',
        name: 'Backend',
        client: 'Client A',
        allocationCandidates: [{
          projectId: 'backend-project',
          requirementId: 'backend-req',
          skillId: 'backend',
          personId: 'senior-backend',
          personName: 'Senior Backend',
          sourceAllocationIds: ['backend-tile'],
          sourceTargetIds: ['frontend-project'],
          source: 'misallocated_project',
          sourceReason: 'wrong project',
          availableBenchHours: 40,
          availableBenchRevenueK: 12,
          missingHours: 80,
          estimatedRevenueK: 12,
          estimatedInternalCostK: 10,
          estimatedRequiredRevenueK: 10.4,
          estimatedGrossProfitK: 2,
          profitPerHourPln: 50,
          fitScore: 96,
          reasons: ['Backend person is wrongly assigned to frontend.'],
        }],
      },
      {
        projectId: 'frontend-project',
        name: 'Frontend',
        client: 'Client B',
        allocationCandidates: [{
          projectId: 'frontend-project',
          requirementId: 'frontend-req',
          skillId: 'frontend',
          personId: 'frontend',
          personName: 'Frontend',
          sourceAllocationIds: ['frontend-tile'],
          sourceTargetIds: ['backend-project'],
          source: 'misallocated_project',
          sourceReason: 'wrong project',
          availableBenchHours: 40,
          availableBenchRevenueK: 12,
          missingHours: 80,
          estimatedRevenueK: 12,
          estimatedInternalCostK: 6.7,
          estimatedRequiredRevenueK: 9.6,
          estimatedGrossProfitK: 5.3,
          profitPerHourPln: 132,
          fitScore: 98,
          reasons: ['Frontend person is wrongly assigned to backend.'],
        }],
      },
    ],
  },
} as unknown as OpportunityCheckResponse;

describe('buildSuggestedAllocationPlan', () => {
  it('uses ranked candidates from project allocations, not only bench allocations', () => {
    const plan = buildSuggestedAllocationPlan({
      allocations,
      opportunityCheck,
      people,
      periodId: '2026-06',
      projects,
    });

    expect(plan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        allocationId: 'backend-tile',
        projectId: 'backend-project',
        sourceLabel: 'Client B: Frontend',
      }),
      expect.objectContaining({
        allocationId: 'frontend-tile',
        projectId: 'frontend-project',
        sourceLabel: 'Client A: Backend',
      }),
    ]));
  });

  it('builds current-board project correction moves when saved AI analysis has no candidates', () => {
    const emptyOpportunityCheck = {
      ...opportunityCheck,
      analysis: {
        ...opportunityCheck.analysis,
        projects: opportunityCheck.analysis.projects.map((project) => ({
          ...project,
          allocationCandidates: [],
        })),
      },
    } as OpportunityCheckResponse;

    const plan = buildSuggestedAllocationPlan({
      allocations,
      opportunityCheck: emptyOpportunityCheck,
      people,
      periodId: '2026-06',
      projects,
    });

    expect(plan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        allocationId: 'backend-tile',
        projectId: 'backend-project',
        sourceLabel: 'Client B: Frontend',
      }),
      expect.objectContaining({
        allocationId: 'frontend-tile',
        projectId: 'frontend-project',
        sourceLabel: 'Client A: Backend',
      }),
    ]));
  });

  it('does not steal a correctly assigned project tile as a fallback correction source', () => {
    const correctlyAssignedAllocations: PersonTileAllocation[] = [
      {
        ...allocations[0],
        target: 'backend-project',
        skillId: 'backend',
        requirementId: 'backend-req',
      },
      {
        ...allocations[1],
        target: 'frontend-project',
        skillId: 'frontend',
        requirementId: 'frontend-req',
      },
    ];
    const secondBackendProject: ProjectFrame = {
      ...projects[0],
      id: 'backend-project-2',
      name: 'Backend 2',
      client: 'Client C',
      revenuePlan: [{ periodId: '2026-06', revenueK: 20, committedRevenueK: 20, probability: 1 }],
    };
    const emptyOpportunityCheck = {
      ...opportunityCheck,
      analysis: { projects: [] },
    } as unknown as OpportunityCheckResponse;

    const plan = buildSuggestedAllocationPlan({
      allocations: correctlyAssignedAllocations,
      opportunityCheck: emptyOpportunityCheck,
      people,
      periodId: '2026-06',
      projects: [...projects, secondBackendProject],
    });

    expect(plan).toEqual([]);
  });

  it('does not suggest a batch that adds people blocked by a hard pair rule', () => {
    const secondBackendPerson: Person = {
      ...people[0],
      id: 'senior-backend-2',
      name: 'Senior Backend 2',
      initials: 'S2',
    };
    const benchAllocations: PersonTileAllocation[] = [
      {
        id: 'backend-bench-1',
        personId: 'senior-backend',
        tileIndex: 0,
        target: 'bench',
        periodId: '2026-06',
        mode: 'hours_first',
        revenueK: 12,
        hours: 40,
      },
      {
        id: 'backend-bench-2',
        personId: 'senior-backend-2',
        tileIndex: 1,
        target: 'bench',
        periodId: '2026-06',
        mode: 'hours_first',
        revenueK: 12,
        hours: 40,
      },
    ];

    const plan = buildSuggestedAllocationPlan({
      allocations: benchAllocations,
      people: [people[0], secondBackendPerson],
      planningRules: [
        createPersonPairPlanningRule({
          periodId: '2026-06',
          personAId: 'senior-backend',
          personBId: 'senior-backend-2',
          reason: 'Do not plan together this month',
        }),
      ],
      periodId: '2026-06',
      projects: [projects[0]],
    });

    expect(plan).toHaveLength(1);
    expect(plan).toEqual([
      expect.objectContaining({
        allocationId: 'backend-bench-1',
        personId: 'senior-backend',
        projectId: 'backend-project',
      }),
    ]);
  });

  it('ignores stale ranked candidates that would move a tile from a time-off frame', () => {
    const timeOffProject: ProjectFrame = {
      ...projects[0],
      id: 'time-off-project',
      client: 'URLOP',
      name: 'Senior Vacation',
      workType: 'time_off',
      requirements: [],
    };
    const staleOpportunityCheck = {
      ...opportunityCheck,
      analysis: {
        projects: [{
          projectId: 'backend-project',
          name: 'Backend',
          client: 'Client A',
          allocationCandidates: [{
            projectId: 'backend-project',
            requirementId: 'backend-req',
            skillId: 'backend',
            personId: 'senior-backend',
            personName: 'Senior Backend',
            sourceAllocationIds: ['time-off-tile'],
            sourceTargetIds: ['time-off-project'],
            source: 'low_value_project',
            sourceReason: 'stale saved result',
            availableBenchHours: 40,
            availableBenchRevenueK: 12,
            missingHours: 40,
            estimatedRevenueK: 12,
            estimatedInternalCostK: 10,
            estimatedRequiredRevenueK: 10.4,
            estimatedGrossProfitK: 2,
            profitPerHourPln: 50,
            fitScore: 99,
            reasons: ['Stale candidate points at vacation.'],
          }],
        }],
      },
    } as unknown as OpportunityCheckResponse;

    const plan = buildSuggestedAllocationPlan({
      allocations: [{
        id: 'time-off-tile',
        personId: 'senior-backend',
        tileIndex: 0,
        target: 'time-off-project',
        periodId: '2026-06',
        mode: 'hours_first',
        revenueK: 12,
        hours: 40,
      }],
      opportunityCheck: staleOpportunityCheck,
      people,
      periodId: '2026-06',
      projects: [projects[0], timeOffProject],
    });

    expect(plan).toEqual([]);
  });

  it('ignores ranked candidates for people unavailable in the active month', () => {
    const unavailableSenior: Person = {
      ...people[0],
      monthlyOverrides: [{
        periodId: '2026-06',
        status: 'unavailable',
        availableHours: 0,
      }],
    };
    const plan = buildSuggestedAllocationPlan({
      allocations: [{
        id: 'backend-tile',
        personId: 'senior-backend',
        tileIndex: 0,
        target: 'bench',
        periodId: '2026-06',
        mode: 'hours_first',
        revenueK: 12,
        hours: 40,
      }],
      opportunityCheck,
      people: [unavailableSenior, people[1]],
      periodId: '2026-06',
      projects,
    });

    expect(plan).toEqual([]);
  });

  it('ignores stale ranked candidates whose requirement no longer exists', () => {
    const staleOpportunityCheck = {
      ...opportunityCheck,
      analysis: {
        projects: [{
          projectId: 'backend-project',
          name: 'Backend',
          client: 'Client A',
          allocationCandidates: [{
            ...opportunityCheck.analysis.projects[0].allocationCandidates[0],
            requirementId: 'removed-backend-req',
          }],
        }],
      },
    } as unknown as OpportunityCheckResponse;

    const plan = buildSuggestedAllocationPlan({
      allocations: [{
        id: 'backend-tile',
        personId: 'senior-backend',
        tileIndex: 0,
        target: 'bench',
        periodId: '2026-06',
        mode: 'hours_first',
        revenueK: 12,
        hours: 40,
      }],
      opportunityCheck: staleOpportunityCheck,
      people,
      periodId: '2026-06',
      projects: [{ ...projects[0], requirements: [] }, projects[1]],
    });

    expect(plan).toEqual([]);
  });
});
