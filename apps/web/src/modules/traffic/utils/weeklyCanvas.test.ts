import { describe, expect, it } from 'vitest';
import type { Period, Person, ProjectFrame, TrafficSnapshot, WeeklyAllocation } from '../models/traffic.model';
import {
  buildWeeklyCanvasState,
  getEffectiveWeeklyAllocations,
  getWeeklyFreeSlotId,
  parseWeeklyTileId,
} from './weeklyCanvas';

const month: Period = {
  id: '2026-06',
  label: 'June 2026',
  granularity: 'month',
  startsOn: '2026-06-01',
  endsOn: '2026-06-30',
};

const weekPeriod: Period = {
  id: '2026-06-w1',
  label: '1-5 Jun',
  granularity: 'week',
  startsOn: '2026-06-01',
  endsOn: '2026-06-05',
  parentPeriodId: month.id,
};

const week = {
  id: '2026-06-w1',
  workingDays: 5,
};

const person: Person = {
  id: 'person-a',
  name: "Avery",
  role: 'Developer',
  initials: 'AN',
  color: '#2563eb',
  skillIds: ['backend'],
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
  rateConfig: { companyTargetRatePlnH: 260 },
  requirements: [{ id: 'backend', skillId: 'backend', estimatedHours: 80, required: true }],
  revenuePlan: [{ periodId: month.id, revenueK: 40, probability: 1 }],
  invoices: [],
  notes: '',
};

describe('weekly canvas helpers', () => {
  it('builds monthly free day slots and active-week project allocations', () => {
    const assignedAllocation: WeeklyAllocation = {
      id: 'weekly:2026-06:person-a:0',
      monthPeriodId: month.id,
      weekPeriodId: week.id,
      personId: person.id,
      slotIndex: 0,
      target: project.id,
      mode: 'hours_first',
      costK: 0.8,
      revenueK: 2,
      hours: 8,
      skillId: 'backend',
    };

    const state = buildWeeklyCanvasState({
      activePeople: [person],
      activePeriod: month,
      activeWeek: week,
      monthWorkingDays: 20,
      visibleProjects: [project],
      weeklyAllocations: [assignedAllocation],
    });

    expect(state.benchAllocations).toHaveLength(19);
    expect(state.benchAllocations[0]).toMatchObject({
      id: getWeeklyFreeSlotId(month.id, person.id, 1),
      target: 'bench',
      revenueK: 0.8,
      hours: 8,
    });
    expect(state.periodAllocations).toContainEqual(expect.objectContaining({
      id: assignedAllocation.id,
      target: project.id,
      revenueK: 2,
    }));
    expect(state.projects[0].revenuePlan.find((plan) => plan.periodId === month.id)?.revenueK).toBe(10);
    expect(state.projects[0].requirements[0].estimatedHours).toBe(20);
  });

  it('can derive weekly project capacity from the monthly frame footprint', () => {
    const state = buildWeeklyCanvasState({
      activePeople: [person],
      activePeriod: month,
      activeWeek: week,
      monthWorkingDays: 20,
      visibleProjects: [project],
      weeklyAllocations: [],
      weeklyProjectCapacityKById: new Map([[project.id, 7]]),
    });

    expect(state.projects[0].revenuePlan.find((plan) => plan.periodId === month.id)?.revenueK).toBe(7);
  });

  it('shows manual weekly bench markers as free person slots', () => {
    const manualBenchAllocation: WeeklyAllocation = {
      id: 'weekly:2026-06:person-a:0',
      monthPeriodId: month.id,
      weekPeriodId: week.id,
      personId: person.id,
      slotIndex: 0,
      source: 'manual',
      target: 'bench',
      mode: 'hours_first',
      costK: 0.8,
      revenueK: 0,
      hours: 8,
    };

    const state = buildWeeklyCanvasState({
      activePeople: [person],
      activePeriod: month,
      activeWeek: week,
      monthWorkingDays: 20,
      visibleProjects: [project],
      weeklyAllocations: [manualBenchAllocation],
    });

    expect(state.benchAllocations).toContainEqual(expect.objectContaining({
      id: getWeeklyFreeSlotId(month.id, person.id, 0),
      target: 'bench',
    }));
    expect(state.periodAllocations.some((allocation) => allocation.id === manualBenchAllocation.id)).toBe(false);
  });

  it('parses free and assigned weekly tile ids', () => {
    expect(parseWeeklyTileId('weekly-free:2026-06:person-a:3')).toEqual({
      monthPeriodId: '2026-06',
      personId: 'person-a',
      slotIndex: 3,
    });
    expect(parseWeeklyTileId('weekly:2026-06:person-a:3')).toEqual({
      monthPeriodId: '2026-06',
      personId: 'person-a',
      slotIndex: 3,
    });
    expect(parseWeeklyTileId('2026-06-person-a-3')).toBeNull();
  });

  it('derives effective weekly allocations from monthly allocations for display', () => {
    const snapshot: TrafficSnapshot = {
      schemaVersion: 1,
      activePeriodId: month.id,
      activeTileUnitId: 'money-1k',
      skills: [{ id: 'backend', label: 'Backend', defaultTargetRatePlnH: 260 }],
      periods: [month, weekPeriod],
      tileUnits: [{ id: 'money-1k', kind: 'money', label: '1k PLN', value: 1, currency: 'PLN' }],
      people: [person],
      projects: [project],
      allocations: Array.from({ length: 16 }, (_, tileIndex) => ({
        id: `${month.id}-${person.id}-${tileIndex}`,
        personId: person.id,
        tileIndex,
        target: tileIndex === 0 ? project.id : 'bench',
        periodId: month.id,
        mode: 'revenue_first' as const,
        revenueK: 1,
        hours: 8,
      })),
      weeklyAllocations: [],
      planningRules: [],
    };

    const effectiveWeeklyAllocations = getEffectiveWeeklyAllocations(snapshot, month.id);

    expect(effectiveWeeklyAllocations).toHaveLength(1);
    expect(effectiveWeeklyAllocations.every((allocation) => allocation.target === project.id)).toBe(true);
    expect(snapshot.weeklyAllocations).toHaveLength(0);
  });
});
