import { describe, expect, it } from 'vitest';
import { applyTrafficBoardCommand } from './trafficCommands.js';
import {
  ensureWeeklyAllocationsFromMonthly,
  getPersonWeeklySlotCostK,
  getPersonWeeklySlotCount,
  getProjectMonthRevenueKWithWeeklyPlan,
  getWeeklyAllocationId,
  getWeeklyAllocationRevenueK,
  getWeeklySlotWeekId,
  syncWeeklyAllocationsFromMonthly,
} from './weeklyAllocations.js';
import type { Period, Person, ProjectFrame, TrafficSnapshot } from './traffic.model.js';

const month: Period = {
  id: '2026-06',
  label: 'Czerwiec 2026',
  granularity: 'month',
  startsOn: '2026-06-01',
  endsOn: '2026-06-30',
};

const week1: Period = {
  id: '2026-06-w1',
  label: '1-5 cze',
  granularity: 'week',
  startsOn: '2026-06-01',
  endsOn: '2026-06-05',
  parentPeriodId: month.id,
};

const week2: Period = {
  id: '2026-06-w2',
  label: '8-12 cze',
  granularity: 'week',
  startsOn: '2026-06-08',
  endsOn: '2026-06-12',
  parentPeriodId: month.id,
};

const week3: Period = {
  id: '2026-06-w3',
  label: '15-19 cze',
  granularity: 'week',
  startsOn: '2026-06-15',
  endsOn: '2026-06-19',
  parentPeriodId: month.id,
};

const week4: Period = {
  id: '2026-06-w4',
  label: '22-26 cze',
  granularity: 'week',
  startsOn: '2026-06-22',
  endsOn: '2026-06-26',
  parentPeriodId: month.id,
};

const person: Person = {
  id: 'person-a',
  name: "Avery",
  role: 'Backend Developer',
  initials: 'AN',
  color: '#2563eb',
  skillIds: ['backend'],
  seniority: 'mid',
  costModel: {
    type: 'fixed_monthly',
    defaultMonthlyHours: 160,
    fixedMonthlyCostK: 16,
  },
  monthlyCostK: 16,
  hoursPerTile: 8,
  layers: { workK: 10, adminK: 13, salesK: 16, targetK: 22 },
};

const project: ProjectFrame = {
  id: 'project-a',
  name: 'Delivery',
  client: "Client 1",
  contractType: 'time_materials_capped',
  stage: 'signed',
  workType: 'commercial',
  budgetK: 40,
  probability: 1,
  startMonth: month.label,
  startPeriodId: month.id,
  endPeriodId: month.id,
  rateConfig: {
    projectRatePlnH: 250,
    skillRatesPlnH: { backend: 300 },
    companyTargetRatePlnH: 260,
  },
  requirements: [
    {
      id: 'backend',
      skillId: 'backend',
      estimatedHours: 64,
      required: true,
    },
  ],
  revenuePlan: [{ periodId: month.id, revenueK: 40, probability: 1 }],
  invoices: [],
  notes: '',
};

const secondaryProject: ProjectFrame = {
  ...project,
  id: 'project-b',
  name: 'Support',
  client: "Client 2",
  revenuePlan: [{ periodId: month.id, revenueK: 20, probability: 1 }],
};

function createSnapshot(projects: ProjectFrame[] = [project]): TrafficSnapshot {
  return {
    schemaVersion: 1,
    activePeriodId: month.id,
    activeTileUnitId: 'money-1k',
    skills: [{ id: 'backend', label: 'Backend', defaultTargetRatePlnH: 260 }],
    periods: [month, week1, week2],
    tileUnits: [{ id: 'money-1k', kind: 'money', label: '1k PLN', value: 1, currency: 'PLN' }],
    people: [person],
    projects,
    allocations: Array.from({ length: 16 }, (_, tileIndex) => ({
      id: `${month.id}-${person.id}-${tileIndex}`,
      personId: person.id,
      tileIndex,
      target: 'bench',
      periodId: month.id,
      mode: 'revenue_first' as const,
      revenueK: 1,
      hours: 8,
    })),
    weeklyAllocations: [],
    planningRules: [],
  };
}

function getAssignedWeeklySlotCount(snapshot: TrafficSnapshot, target: string) {
  return (snapshot.weeklyAllocations || [])
    .filter((allocation) => allocation.monthPeriodId === month.id && allocation.target === target)
    .length;
}

function getFreeWeeklySlotCount(snapshot: TrafficSnapshot) {
  const assignedSlotIds = new Set(
    (snapshot.weeklyAllocations || [])
      .filter((allocation) => allocation.monthPeriodId === month.id && allocation.target !== 'bench')
      .map((allocation) => allocation.id)
  );

  return getPersonWeeklySlotCount(person, month.id) - assignedSlotIds.size;
}

describe('weekly allocations', () => {
  it('splits monthly person capacity into 8h day slots', () => {
    expect(getPersonWeeklySlotCount(person, month.id)).toBe(20);
    expect(getPersonWeeklySlotCostK(person, month.id)).toBe(0.8);
  });

  it('maps weekly day slots to the matching business week', () => {
    expect(getWeeklySlotWeekId([
      { id: week1.id, workingDays: 5 },
      { id: week2.id, workingDays: 5 },
    ], 20, 0)).toBe(week1.id);
    expect(getWeeklySlotWeekId([
      { id: week1.id, workingDays: 5 },
      { id: week2.id, workingDays: 5 },
    ], 20, 10)).toBe(week2.id);
  });

  it('moves a weekly day slot and reflects it in the monthly overview', () => {
    const snapshot = createSnapshot();
    const nextSnapshot = applyTrafficBoardCommand(snapshot, {
      type: 'weeklyAllocations.move',
      monthPeriodId: month.id,
      weekPeriodId: week1.id,
      moves: [
        {
          personId: person.id,
          slotIndex: 1,
          target: project.id,
        },
      ],
    });

    expect(nextSnapshot.allocations.find((allocation) => allocation.tileIndex === 0)).toMatchObject({
      target: project.id,
      skillId: 'backend',
      requirementId: 'backend',
    });
    expect(nextSnapshot.allocations.filter((allocation) => allocation.target === project.id)).toHaveLength(1);
    expect(nextSnapshot.weeklyAllocations).toHaveLength(1);
    expect(nextSnapshot.weeklyAllocations?.[0]).toMatchObject({
      id: getWeeklyAllocationId(month.id, person.id, 1),
      monthPeriodId: month.id,
      weekPeriodId: week1.id,
      personId: person.id,
      slotIndex: 1,
      target: project.id,
      source: 'manual',
      hours: 8,
      costK: 0.8,
      revenueK: getWeeklyAllocationRevenueK(project, 8, 'backend'),
      skillId: 'backend',
      requirementId: 'backend',
    });
  });

  it('creates an editable weekly baseline from monthly allocation moves', () => {
    const snapshot = createSnapshot();
    const nextSnapshot = applyTrafficBoardCommand(snapshot, {
      type: 'allocations.move',
      periodId: month.id,
      moves: [
        {
          tileId: `${month.id}-${person.id}-0`,
          target: project.id,
        },
      ],
    });

    expect(nextSnapshot.allocations.find((allocation) => allocation.tileIndex === 0)?.target).toBe(project.id);
    expect(nextSnapshot.weeklyAllocations).toHaveLength(1);
    expect(nextSnapshot.weeklyAllocations?.map((allocation) => allocation.weekPeriodId)).toEqual([week1.id]);
    expect(nextSnapshot.weeklyAllocations?.every((allocation) => allocation.target === project.id)).toBe(true);
    expect(nextSnapshot.weeklyAllocations?.every((allocation) => allocation.source === 'baseline')).toBe(true);
  });

  it('spreads larger monthly allocation baselines across available weeks', () => {
    const snapshot = createSnapshot();
    const nextSnapshot = applyTrafficBoardCommand(snapshot, {
      type: 'allocations.move',
      periodId: month.id,
      moves: Array.from({ length: 9 }, (_, tileIndex) => ({
        tileId: `${month.id}-${person.id}-${tileIndex}`,
        target: project.id,
      })),
    });

    expect(new Set(nextSnapshot.weeklyAllocations?.map((allocation) => allocation.weekPeriodId))).toEqual(new Set([
      week1.id,
      week2.id,
    ]));
  });

  it('derives missing weekly display data from existing monthly allocations without mutating input', () => {
    const snapshot = applyTrafficBoardCommand(createSnapshot(), {
      type: 'allocations.move',
      periodId: month.id,
      moves: [
        {
          tileId: `${month.id}-${person.id}-0`,
          target: project.id,
        },
      ],
    });
    const legacySnapshot = { ...snapshot, weeklyAllocations: [] };
    const displaySnapshot = ensureWeeklyAllocationsFromMonthly(legacySnapshot, month.id);

    expect(legacySnapshot.weeklyAllocations).toHaveLength(0);
    expect(displaySnapshot.weeklyAllocations).toHaveLength(1);
  });

  it('lets weekly revenue plans raise the monthly project overview total', () => {
    const snapshot = createSnapshot();
    const nextSnapshot = [week1.id, week2.id].reduce((current, weekPeriodId) => (
      applyTrafficBoardCommand(current, {
        type: 'project.updateWeeklyRevenuePlan',
        projectId: project.id,
        monthPeriodId: month.id,
        weekPeriodId,
        revenueK: 21,
      })
    ), snapshot);

    expect(getProjectMonthRevenueKWithWeeklyPlan(nextSnapshot.projects[0], month.id)).toBe(42);
  });

  it('rebalances untouched project weeks after editing a weekly project frame', () => {
    const monthly28Project = {
      ...project,
      budgetK: 28,
      revenuePlan: [{ periodId: month.id, revenueK: 28, probability: 1 }],
    };
    const snapshot = {
      ...createSnapshot([monthly28Project]),
      periods: [month, week1, week2, week3, week4],
    };

    const weekOneEdited = applyTrafficBoardCommand(snapshot, {
      type: 'project.updateWeeklyRevenuePlan',
      projectId: project.id,
      monthPeriodId: month.id,
      weekPeriodId: week1.id,
      revenueK: 9,
    });

    const weeklyPlans = weekOneEdited.projects[0].weeklyRevenuePlan || [];
    expect(weeklyPlans.map((plan) => ({
      weekPeriodId: plan.weekPeriodId,
      revenueK: plan.revenueK,
      source: plan.source,
    }))).toEqual([
      { weekPeriodId: week1.id, revenueK: 9, source: 'manual' },
      { weekPeriodId: week2.id, revenueK: 6.4, source: 'balanced' },
      { weekPeriodId: week3.id, revenueK: 6.3, source: 'balanced' },
      { weekPeriodId: week4.id, revenueK: 6.3, source: 'balanced' },
    ]);
    expect(getProjectMonthRevenueKWithWeeklyPlan(weekOneEdited.projects[0], month.id)).toBe(28);

    const weekTwoEdited = applyTrafficBoardCommand(weekOneEdited, {
      type: 'project.updateWeeklyRevenuePlan',
      projectId: project.id,
      monthPeriodId: month.id,
      weekPeriodId: week2.id,
      revenueK: 10,
    });

    expect((weekTwoEdited.projects[0].weeklyRevenuePlan || []).map((plan) => ({
      weekPeriodId: plan.weekPeriodId,
      revenueK: plan.revenueK,
      source: plan.source,
    }))).toEqual([
      { weekPeriodId: week1.id, revenueK: 9, source: 'manual' },
      { weekPeriodId: week2.id, revenueK: 10, source: 'manual' },
      { weekPeriodId: week3.id, revenueK: 4.5, source: 'balanced' },
      { weekPeriodId: week4.id, revenueK: 4.5, source: 'balanced' },
    ]);
    expect(getProjectMonthRevenueKWithWeeklyPlan(weekTwoEdited.projects[0], month.id)).toBe(28);
  });

  it('preserves manual weekly project moves when a monthly baseline is rebuilt', () => {
    const weeklyEdited = applyTrafficBoardCommand(createSnapshot([project, secondaryProject]), {
      type: 'weeklyAllocations.move',
      monthPeriodId: month.id,
      weekPeriodId: week1.id,
      moves: [
        {
          personId: person.id,
          slotIndex: 0,
          target: secondaryProject.id,
        },
      ],
    });

    const monthlyChanged = applyTrafficBoardCommand(weeklyEdited, {
      type: 'allocations.move',
      periodId: month.id,
      moves: [
        {
          tileId: `${month.id}-${person.id}-0`,
          target: project.id,
        },
        {
          tileId: `${month.id}-${person.id}-1`,
          target: project.id,
        },
      ],
    });

    expect(monthlyChanged.weeklyAllocations?.find((allocation) => allocation.id === getWeeklyAllocationId(month.id, person.id, 0))).toMatchObject({
      target: secondaryProject.id,
      source: 'manual',
    });
    expect(monthlyChanged.weeklyAllocations).toContainEqual(expect.objectContaining({
      slotIndex: 1,
      target: project.id,
      source: 'baseline',
    }));
    expect(monthlyChanged.allocations.filter((allocation) => allocation.target === secondaryProject.id)).toHaveLength(1);
    expect(monthlyChanged.allocations.filter((allocation) => allocation.target === project.id)).toHaveLength(2);
  });

  it('keeps manual weekly bench removals visible after monthly baseline regeneration', () => {
    const monthlyAssigned = applyTrafficBoardCommand(createSnapshot(), {
      type: 'allocations.move',
      periodId: month.id,
      moves: [
        {
          tileId: `${month.id}-${person.id}-0`,
          target: project.id,
        },
        {
          tileId: `${month.id}-${person.id}-1`,
          target: project.id,
        },
      ],
    });
    const weeklyCleared = applyTrafficBoardCommand(monthlyAssigned, {
      type: 'weeklyAllocations.move',
      monthPeriodId: month.id,
      weekPeriodId: week1.id,
      moves: [
        {
          personId: person.id,
          slotIndex: 0,
          target: 'bench',
        },
        {
          personId: person.id,
          slotIndex: 1,
          target: 'bench',
        },
      ],
    });
    const rebuilt = syncWeeklyAllocationsFromMonthly(weeklyCleared, month.id, [person.id]);

    expect(rebuilt.weeklyAllocations?.filter((allocation) => allocation.target === 'bench' && allocation.source === 'manual')).toHaveLength(2);
    expect(rebuilt.weeklyAllocations?.some((allocation) => allocation.target === project.id)).toBe(true);
    expect(rebuilt.allocations.filter((allocation) => allocation.target === project.id)).toHaveLength(2);
  });

  it('returns exactly one weekly day slot to the person when one project slot is cleared', () => {
    const monthlyAssigned = applyTrafficBoardCommand(createSnapshot(), {
      type: 'allocations.move',
      periodId: month.id,
      moves: [
        {
          tileId: `${month.id}-${person.id}-0`,
          target: project.id,
        },
        {
          tileId: `${month.id}-${person.id}-1`,
          target: project.id,
        },
      ],
    });
    const weeklyCleared = applyTrafficBoardCommand(monthlyAssigned, {
      type: 'weeklyAllocations.move',
      monthPeriodId: month.id,
      weekPeriodId: week1.id,
      moves: [
        {
          personId: person.id,
          slotIndex: 0,
          target: 'bench',
        },
      ],
    });

    expect(weeklyCleared.weeklyAllocations?.filter((allocation) => allocation.target === 'bench' && allocation.source === 'manual')).toHaveLength(1);
    expect(weeklyCleared.weeklyAllocations?.filter((allocation) => allocation.target === project.id)).toHaveLength(2);
    expect(weeklyCleared.allocations.filter((allocation) => allocation.target === project.id)).toHaveLength(2);
  });

  it('keeps a weekly manual removal as an exact day-slot delta after the display baseline is ensured again', () => {
    const monthlyAssigned = applyTrafficBoardCommand(createSnapshot(), {
      type: 'allocations.move',
      periodId: month.id,
      moves: Array.from({ length: 9 }, (_, tileIndex) => ({
        tileId: `${month.id}-${person.id}-${tileIndex}`,
        target: project.id,
      })),
    });
    const seededWeekly = ensureWeeklyAllocationsFromMonthly(monthlyAssigned, month.id);
    const initialAssignedSlots = getAssignedWeeklySlotCount(seededWeekly, project.id);
    const initialFreeSlots = getFreeWeeklySlotCount(seededWeekly);
    const weekOneProjectSlots = seededWeekly.weeklyAllocations
      ?.filter((allocation) => (
        allocation.weekPeriodId === week1.id &&
        allocation.target === project.id
      ))
      .map((allocation) => allocation.slotIndex)
      .slice(0, 4) || [];

    expect(initialAssignedSlots).toBe(11);
    expect(initialFreeSlots).toBe(9);
    expect(weekOneProjectSlots).toHaveLength(4);

    const weeklyCleared = applyTrafficBoardCommand(seededWeekly, {
      type: 'weeklyAllocations.move',
      monthPeriodId: month.id,
      weekPeriodId: week1.id,
      moves: weekOneProjectSlots.map((slotIndex) => ({
        personId: person.id,
        slotIndex,
        target: 'bench',
      })),
    });
    const displaySnapshot = ensureWeeklyAllocationsFromMonthly(weeklyCleared, month.id);

    expect(displaySnapshot.weeklyAllocations?.filter((allocation) => (
      allocation.target === 'bench' &&
      allocation.source === 'manual'
    ))).toHaveLength(4);
    expect(getAssignedWeeklySlotCount(displaySnapshot, project.id)).toBe(initialAssignedSlots - 4);
    expect(getFreeWeeklySlotCount(displaySnapshot)).toBe(initialFreeSlots + 4);
  });

  it('resets only the selected week while preserving project allocations in other weeks', () => {
    const monthlyAssigned = applyTrafficBoardCommand(createSnapshot(), {
      type: 'allocations.move',
      periodId: month.id,
      moves: Array.from({ length: 9 }, (_, tileIndex) => ({
        tileId: `${month.id}-${person.id}-${tileIndex}`,
        target: project.id,
      })),
    });
    const seededWeekly = ensureWeeklyAllocationsFromMonthly(monthlyAssigned, month.id);
    const weekOneProjectSlots = seededWeekly.weeklyAllocations
      ?.filter((allocation) => (
        allocation.weekPeriodId === week1.id &&
        allocation.target === project.id
      ))
      .map((allocation) => allocation.slotIndex) || [];

    expect(weekOneProjectSlots.length).toBeGreaterThan(0);
    expect(seededWeekly.weeklyAllocations?.some((allocation) => (
      allocation.weekPeriodId === week2.id &&
      allocation.target === project.id
    ))).toBe(true);

    const weeklyReset = applyTrafficBoardCommand(monthlyAssigned, {
      type: 'weeklyAllocations.move',
      monthPeriodId: month.id,
      weekPeriodId: week1.id,
      moves: weekOneProjectSlots.map((slotIndex) => ({
        personId: person.id,
        slotIndex,
        target: 'bench',
      })),
    });

    expect(weeklyReset.weeklyAllocations?.some((allocation) => (
      allocation.weekPeriodId === week1.id &&
      allocation.target === project.id
    ))).toBe(false);
    expect(weeklyReset.weeklyAllocations?.some((allocation) => (
      allocation.weekPeriodId === week2.id &&
      allocation.target === project.id
    ))).toBe(true);
    expect(weeklyReset.allocations.filter((allocation) => allocation.target === project.id).length).toBeGreaterThan(0);
  });
});
