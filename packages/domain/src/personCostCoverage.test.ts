import { describe, expect, it } from 'vitest';
import { getPersonCostCoverage } from './personCostCoverage.js';
import { createPersonPeriodAllocations } from './periods.js';
import { filterPersonCostCapacityAllocations } from './personPeriod.js';
import { Person, PersonTileAllocation, ProjectFrame } from './traffic.model.js';

const person = {
  id: 'anna',
  name: "Avery",
  role: 'UX Designer',
  initials: "AK",
  color: '#f59e0b',
  skillIds: ['design'],
  seniority: 'mid',
  costModel: {
    type: 'fixed_monthly',
    defaultMonthlyHours: 120,
    internalHourlyCostPln: 100,
    fixedMonthlyCostK: 12,
  },
  monthlyCostK: 12,
  hoursPerTile: 10,
  layers: { workK: 12, adminK: 14, salesK: 16, targetK: 24 },
} satisfies Person;

const cappedProject = {
  id: 'capped',
  name: 'Team extension',
  client: 'Capped Client',
  contractType: 'time_materials_capped',
  stage: 'signed',
  workType: 'commercial',
  budgetK: 24,
  probability: 1,
  startMonth: 'Czerwiec 2026',
  startPeriodId: '2026-06',
  rateConfig: { companyTargetRatePlnH: 200 },
  requirements: [],
  revenuePlan: [{ periodId: '2026-06', revenueK: 24, probability: 1 }],
  invoices: [],
  notes: '',
} satisfies ProjectFrame;

const uncappedProject = {
  ...cappedProject,
  id: 'uncapped',
  client: 'Uncapped Client',
  contractType: 'hourly',
} satisfies ProjectFrame;

const researchProject = {
  ...cappedProject,
  id: 'research',
  client: 'R&D',
  contractType: 'hourly',
  workType: 'research_development',
} satisfies ProjectFrame;

const timeOffProject = {
  ...cappedProject,
  id: 'time-off',
  client: 'URLOP',
  name: 'Urlopy',
  workType: 'time_off',
  budgetK: 4,
  revenuePlan: [{ periodId: '2026-06', revenueK: 4, probability: 1 }],
} satisfies ProjectFrame;

const secondCappedProject = {
  ...cappedProject,
  id: 'second-capped',
  client: 'Second Capped Client',
} satisfies ProjectFrame;

function allocation(patch: Partial<PersonTileAllocation>): PersonTileAllocation {
  return {
    id: patch.id || 'allocation-1',
    personId: person.id,
    tileIndex: patch.tileIndex ?? 0,
    target: patch.target || cappedProject.id,
    periodId: '2026-06',
    mode: 'revenue_first',
    revenueK: patch.revenueK ?? 1,
    hours: patch.hours ?? 10,
    ...patch,
  };
}

function allocations(count: number, patch: Partial<PersonTileAllocation> = {}): PersonTileAllocation[] {
  const tileIndexOffset = patch.tileIndex ?? 0;
  return Array.from({ length: count }, (_, index) => allocation({
    ...patch,
    id: `${patch.id || 'allocation'}-${index}`,
    tileIndex: tileIndexOffset + index,
  }));
}

describe('person cost coverage', () => {
  it('creates draggable person allocation tiles from monthly cost instead of target revenue', () => {
    const highCostPerson = {
      ...person,
      costModel: {
        ...person.costModel,
        fixedMonthlyCostK: 18,
      },
      monthlyCostK: 18,
      layers: { workK: 18, adminK: 21, salesK: 24, targetK: 24 },
    } satisfies Person;

    expect(createPersonPeriodAllocations(highCostPerson, '2026-06')).toHaveLength(18);
  });

  it('covers salary cost from billable project cost tiles and keeps generated revenue surplus separate', () => {
    const coverage = getPersonCostCoverage(
      person,
      '2026-06',
      allocations(12),
      new Map([[cappedProject.id, cappedProject]])
    );

    expect(coverage.periodCostK).toBe(12);
    expect(coverage.costTileCount).toBe(12);
    expect(coverage.coveredCostK).toBe(12);
    expect(coverage.uncoveredCostK).toBe(0);
    expect(coverage.billableRevenueK).toBe(12);
    expect(coverage.generatedRevenueK).toBe(24);
    expect(coverage.billableInternalCostK).toBe(12);
    expect(coverage.netCashflowK).toBe(12);
    expect(coverage.projectSegments).toEqual([
      expect.objectContaining({
        costTileCount: 12,
        coveredCostK: 12,
        generatedRevenueK: 24,
        internalCostK: 12,
        projectId: cappedProject.id,
        revenueK: 12,
      }),
    ]);
  });

  it('does not count T&M without CAP allocations as salary cost coverage', () => {
    const coverage = getPersonCostCoverage(
      person,
      '2026-06',
      allocations(12, { target: uncappedProject.id }),
      new Map([[uncappedProject.id, uncappedProject]])
    );

    expect(coverage.coveredCostK).toBe(0);
    expect(coverage.uncoveredCostK).toBe(12);
    expect(coverage.billableRevenueK).toBe(0);
    expect(coverage.generatedRevenueK).toBe(0);
    expect(coverage.nonCoveringRevenueK).toBe(12);
    expect(coverage.netCashflowK).toBe(-12);
    expect(coverage.nonCoveringTargets).toEqual([
      expect.objectContaining({
        costTileCount: 12,
        reason: 'uncapped_time_materials',
        revenueK: 12,
        target: uncappedProject.id,
      }),
    ]);
  });

  it('does not count R&D allocations as salary cost coverage', () => {
    const highCostPerson = {
      ...person,
      costModel: {
        ...person.costModel,
        fixedMonthlyCostK: 18,
      },
      monthlyCostK: 18,
      layers: { workK: 18, adminK: 21, salesK: 24, targetK: 24 },
    } satisfies Person;
    const coverage = getPersonCostCoverage(
      highCostPerson,
      '2026-06',
      [
        ...allocations(15, { id: 'allocation-capped', target: cappedProject.id }),
        ...allocations(3, { id: 'allocation-rd', target: researchProject.id, tileIndex: 15 }),
      ],
      new Map<string, ProjectFrame>([
        [cappedProject.id, cappedProject],
        [researchProject.id, researchProject],
      ])
    );

    expect(coverage.costTileCount).toBe(18);
    expect(coverage.coveredCostK).toBe(15);
    expect(coverage.uncoveredCostK).toBe(3);
    expect(coverage.nonCoveringRevenueK).toBe(3);
    expect(coverage.projectSegments).toEqual([
      expect.objectContaining({ costTileCount: 15, coveredCostK: 15, projectId: cappedProject.id }),
    ]);
    expect(coverage.nonCoveringTargets).toEqual([
      expect.objectContaining({
        costTileCount: 3,
        reason: 'non_commercial_work',
        revenueK: 3,
        target: researchProject.id,
      }),
    ]);
  });

  it('tracks time-off allocations as cost outside revenue coverage', () => {
    const highCostPerson = {
      ...person,
      costModel: {
        ...person.costModel,
        fixedMonthlyCostK: 18,
      },
      monthlyCostK: 18,
      layers: { workK: 18, adminK: 21, salesK: 24, targetK: 24 },
    } satisfies Person;
    const coverage = getPersonCostCoverage(
      highCostPerson,
      '2026-06',
      [
        ...allocations(14, { id: 'allocation-capped', target: cappedProject.id }),
        ...allocations(4, { id: 'allocation-time-off', target: timeOffProject.id, tileIndex: 14, hours: 8 }),
      ],
      new Map<string, ProjectFrame>([
        [cappedProject.id, cappedProject],
        [timeOffProject.id, timeOffProject],
      ])
    );

    expect(coverage.coveredCostK).toBe(14);
    expect(coverage.uncoveredCostK).toBe(4);
    expect(coverage.nonCoveringCostK).toBe(4);
    expect(coverage.timeOffCostK).toBe(4);
    expect(coverage.timeOffHours).toBe(32);
    expect(coverage.nonCoveringTargets).toEqual([
      expect.objectContaining({
        costK: 4,
        costTileCount: 4,
        reason: 'time_off',
        revenueK: 4,
        target: timeOffProject.id,
      }),
    ]);
  });

  it('ignores legacy allocation records outside the person cost tile count', () => {
    const highCostPerson = {
      ...person,
      costModel: {
        ...person.costModel,
        fixedMonthlyCostK: 18,
      },
      monthlyCostK: 18,
      layers: { workK: 18, adminK: 21, salesK: 24, targetK: 24 },
    } satisfies Person;
    const coverage = getPersonCostCoverage(
      highCostPerson,
      '2026-06',
      allocations(24),
      new Map([[cappedProject.id, cappedProject]])
    );

    expect(coverage.costTileCount).toBe(18);
    expect(coverage.coveredCostK).toBe(18);
    expect(coverage.projectSegments).toEqual([
      expect.objectContaining({
        allocationIds: expect.arrayContaining(['allocation-0', 'allocation-17']),
        costTileCount: 18,
        coveredCostK: 18,
        projectId: cappedProject.id,
      }),
    ]);
    expect(coverage.projectSegments[0]?.allocationIds).not.toContain('allocation-18');
  });

  it('filters legacy allocation records without mutating the original list', () => {
    const highCostPerson = {
      ...person,
      costModel: {
        ...person.costModel,
        fixedMonthlyCostK: 18,
      },
      monthlyCostK: 18,
      layers: { workK: 18, adminK: 21, salesK: 24, targetK: 24 },
    } satisfies Person;
    const legacyAllocations = allocations(24);

    const visibleAllocations = filterPersonCostCapacityAllocations(
      legacyAllocations,
      new Map([[highCostPerson.id, highCostPerson]])
    );

    expect(visibleAllocations).toHaveLength(18);
    expect(legacyAllocations).toHaveLength(24);
    expect(visibleAllocations.at(-1)?.tileIndex).toBe(17);
  });

  it('splits covered salary cost proportionally when billable project cost tiles over-cover the month', () => {
    const coverage = getPersonCostCoverage(
      person,
      '2026-06',
      [
        ...allocations(12, { id: 'allocation-capped-1', target: cappedProject.id }),
        ...allocations(12, { id: 'allocation-capped-2', target: secondCappedProject.id }),
      ],
      new Map([
        [cappedProject.id, cappedProject],
        [secondCappedProject.id, secondCappedProject],
      ])
    );

    expect(coverage.coveredCostK).toBe(12);
    expect(coverage.billableInternalCostK).toBe(24);
    expect(coverage.projectSegments).toEqual([
      expect.objectContaining({ costTileCount: 12, coveredCostK: 6, generatedRevenueK: 12, internalCostK: 12, projectId: cappedProject.id }),
      expect.objectContaining({ costTileCount: 12, coveredCostK: 6, generatedRevenueK: 12, internalCostK: 12, projectId: secondCappedProject.id }),
    ]);
  });

  it('maps a full monthly cost tile allocation to the full generated revenue target', () => {
    const highCostPerson = {
      ...person,
      costModel: {
        ...person.costModel,
        fixedMonthlyCostK: 18,
      },
      monthlyCostK: 18,
      layers: { workK: 18, adminK: 21, salesK: 24, targetK: 24 },
    } satisfies Person;
    const coverage = getPersonCostCoverage(
      highCostPerson,
      '2026-06',
      allocations(18),
      new Map([[cappedProject.id, cappedProject]])
    );

    expect(coverage.periodCostK).toBe(18);
    expect(coverage.costTileCount).toBe(18);
    expect(coverage.targetRevenueK).toBe(24);
    expect(coverage.generatedRevenueK).toBe(24);
    expect(coverage.coveredCostK).toBe(18);
    expect(coverage.uncoveredCostK).toBe(0);
    expect(coverage.netCashflowK).toBe(6);
    expect(coverage.projectSegments).toEqual([
      expect.objectContaining({
        coveredCostK: 18,
        generatedRevenueK: 24,
        projectId: cappedProject.id,
        revenueK: 18,
      }),
    ]);
  });

  it('keeps partial cost-tile allocation as uncovered salary cost', () => {
    const highCostPerson = {
      ...person,
      costModel: {
        ...person.costModel,
        fixedMonthlyCostK: 18,
      },
      monthlyCostK: 18,
      layers: { workK: 18, adminK: 21, salesK: 24, targetK: 24 },
    } satisfies Person;
    const coverage = getPersonCostCoverage(
      highCostPerson,
      '2026-06',
      allocations(6),
      new Map([[cappedProject.id, cappedProject]])
    );

    expect(coverage.coveredCostK).toBe(6);
    expect(coverage.uncoveredCostK).toBe(12);
    expect(coverage.coveragePercent).toBe(33);
    expect(coverage.generatedRevenueK).toBe(8);
    expect(coverage.netCashflowK).toBe(-10);
  });

  it('surfaces the fixed cost tied to reduced monthly availability', () => {
    const holidayPerson = {
      ...person,
      monthlyOverrides: [
        {
          periodId: '2026-06',
          availableHours: 84,
          status: 'holiday',
        },
      ],
    } satisfies Person;
    const coverage = getPersonCostCoverage(
      holidayPerson,
      '2026-06',
      allocations(12, { hours: 7 }),
      new Map([[cappedProject.id, cappedProject]])
    );

    expect(coverage.availableHours).toBe(84);
    expect(coverage.unavailableHours).toBe(36);
    expect(coverage.availabilityGapCostK).toBe(3.6);
    expect(coverage.coveredCostK).toBe(12);
    expect(coverage.coveragePercent).toBe(100);
  });
});
