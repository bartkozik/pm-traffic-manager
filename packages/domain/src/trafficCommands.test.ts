import { describe, expect, it } from 'vitest';
import { createSeedTrafficSnapshot } from './seed.js';
import { createPersonPairPlanningRule } from './planningRules.js';
import { applyTrafficBoardCommand, createNextMonthCommand } from './trafficCommands.js';
import { getPersonPeriodCostK, getPersonPeriodCostTileCount, getPersonPeriodHoursPerTile, getPersonPeriodProfile } from './personPeriod.js';

describe('traffic board commands', () => {
  it('moves allocations through the shared command applier', () => {
    const snapshot = createSeedTrafficSnapshot();
    const allocation = snapshot.allocations[0];
    const project = snapshot.projects[0];

    const updated = applyTrafficBoardCommand(snapshot, {
      type: 'allocations.move',
      periodId: snapshot.activePeriodId,
      moves: [{ tileId: allocation.id, target: project.id }],
    });

    expect(updated.allocations.find((item) => item.id === allocation.id)?.target).toBe(project.id);
    expect(snapshot.allocations.find((item) => item.id === allocation.id)?.target).toBe('bench');
  });

  it('keeps person capacity when a project is deleted', () => {
    const snapshot = createSeedTrafficSnapshot();
    const allocation = snapshot.allocations[0];
    const project = snapshot.projects[0];
    const assigned = applyTrafficBoardCommand(snapshot, {
      type: 'allocations.move',
      periodId: snapshot.activePeriodId,
      moves: [{ tileId: allocation.id, target: project.id }],
    });

    const updated = applyTrafficBoardCommand(assigned, {
      type: 'project.delete',
      projectId: project.id,
    });

    expect(updated.projects.some((item) => item.id === project.id)).toBe(false);
    expect(updated.allocations.find((item) => item.id === allocation.id)?.target).toBe('bench');
    expect(updated.allocations).toHaveLength(assigned.allocations.length);
  });

  it('restores archived people and fills missing month capacity', () => {
    const snapshot = createSeedTrafficSnapshot();
    const person = snapshot.people[0];
    const targetPeriodId = snapshot.periods.find((period) => (
      period.granularity === 'month' && period.id !== snapshot.activePeriodId
    ))?.id || snapshot.activePeriodId;
    const archived = {
      ...snapshot,
      people: snapshot.people.map((item) => (
        item.id === person.id ? { ...item, archivedAt: '2026-06-20T08:00:00.000Z' } : item
      )),
      allocations: snapshot.allocations.filter((allocation) => !(
        allocation.personId === person.id && allocation.periodId === targetPeriodId
      )),
    };

    const restored = applyTrafficBoardCommand(archived, {
      type: 'person.restore',
      personId: person.id,
      periodIds: [targetPeriodId],
    });

    expect(restored.people.find((item) => item.id === person.id)?.archivedAt).toBeUndefined();
    expect(restored.allocations.some((allocation) => (
      allocation.personId === person.id && allocation.periodId === targetPeriodId
    ))).toBe(true);
    expect(archived.people.find((item) => item.id === person.id)?.archivedAt).toBeDefined();
  });

  it('creates the next month command from the current snapshot', () => {
    const snapshot = createSeedTrafficSnapshot();
    const command = createNextMonthCommand(snapshot);

    expect(command).toEqual({
      type: 'period.createMonth',
      periodId: '2026-08',
      activate: true,
    });
  });

  it('applies person profile edits from the active month forward without rewriting previous months', () => {
    const snapshot = createSeedTrafficSnapshot();
    const withJulyCapacity = applyTrafficBoardCommand(snapshot, {
      type: 'period.ensureCapacity',
      periodId: '2026-07',
    });
    const withAugust = applyTrafficBoardCommand(withJulyCapacity, {
      type: 'period.createMonth',
      periodId: '2026-08',
      activate: false,
    });
    const marek = withAugust.people.find((person) => person.id === 'marek');
    if (!marek) throw new Error("Seed data is missing Morgan.");

    const updated = applyTrafficBoardCommand(withAugust, {
      type: 'person.update',
      activePeriodId: '2026-07',
      person: {
        ...marek,
        role: 'Delivery Lead',
        monthlyCostK: 11,
        hoursPerTile: 5,
        costModel: { ...marek.costModel, fixedMonthlyCostK: 11 },
        layers: { workK: 8, adminK: 10, salesK: 11, targetK: 15 },
      },
    });
    const updatedMarek = updated.people.find((person) => person.id === 'marek');
    if (!updatedMarek) throw new Error("Updated snapshot is missing Morgan.");

    expect(getPersonPeriodCostK(updatedMarek, '2026-06')).toBe(20);
    expect(getPersonPeriodCostTileCount(updatedMarek, '2026-06')).toBe(20);
    expect(getPersonPeriodHoursPerTile(updatedMarek, '2026-06')).toBe(6);
    expect(getPersonPeriodProfile(updatedMarek, '2026-06').role).toBe('Project Manager');
    expect(getPersonPeriodCostK(updatedMarek, '2026-07')).toBe(11);
    expect(getPersonPeriodCostTileCount(updatedMarek, '2026-07')).toBe(11);
    expect(getPersonPeriodHoursPerTile(updatedMarek, '2026-07')).toBe(5);
    expect(getPersonPeriodProfile(updatedMarek, '2026-07').role).toBe('Delivery Lead');
    expect(getPersonPeriodCostTileCount(updatedMarek, '2026-08')).toBe(11);

    expect(getPersonAllocationCount(updated, 'marek', '2026-06')).toBe(20);
    expect(getPersonAllocationCount(updated, 'marek', '2026-07')).toBe(11);
    expect(getPersonAllocationCount(updated, 'marek', '2026-08')).toBe(11);
    expect(updated.allocations.find((allocation) => allocation.id === '2026-06-marek-0')?.hours).toBe(6);
    expect(updated.allocations.find((allocation) => allocation.id === '2026-07-marek-0')?.hours).toBe(5);
    expect(updated.allocations.find((allocation) => allocation.id === '2026-08-marek-10')?.hours).toBe(5);
  });

  it('upserts permanent person-pair planning rules and validates matching allocations', () => {
    const snapshot = createSeedTrafficSnapshot();
    const beta = snapshot.projects.find((project) => project.id === 'beta')!;
    const tomaszAllocation = snapshot.allocations.find((allocation) => allocation.personId === 'tomasz')!;
    const annaAllocation = snapshot.allocations.find((allocation) => allocation.personId === 'anna')!;
    const withoutLegacyBlocks = {
      ...snapshot,
      people: snapshot.people.map((person) => ({ ...person, blockedCollaborationPersonIds: [] })),
      planningRules: [],
    };
    const rule = createPersonPairPlanningRule({
      timeScope: 'permanent',
      personAId: 'anna',
      personBId: 'tomasz',
      projectId: beta.id,
      reason: 'Testowy konflikt wspolpracy.',
      now: '2026-06-01T00:00:00.000Z',
    });

    const withRule = applyTrafficBoardCommand(withoutLegacyBlocks, {
      type: 'planningRules.upsertMany',
      planningRules: [rule],
    });
    const assigned = applyTrafficBoardCommand(withRule, {
      type: 'allocations.move',
      periodId: snapshot.activePeriodId,
      moves: [
        { tileId: tomaszAllocation.id, target: beta.id },
        { tileId: annaAllocation.id, target: beta.id },
      ],
    });

    expect(assigned.planningRules).toHaveLength(1);
    expect(assigned.planningRules?.[0]).toMatchObject({ timeScope: 'permanent', periodId: undefined });
    expect(assigned.allocations.find((allocation) => allocation.id === annaAllocation.id)?.validation?.map((validation) => validation.code))
      .toContain('person_collaboration_conflict');
  });

  it('pastes people without allocations while leaving target-month projects active', () => {
    const snapshot = createSeedTrafficSnapshot();
    const targetPeriodId = '2026-07';
    const sourcePeriodId = snapshot.activePeriodId;
    const sourceAllocations = snapshot.allocations.filter((allocation) => allocation.periodId === sourcePeriodId);
    const snapshotWithOverrides = {
      ...snapshot,
      people: snapshot.people.map((person, index) => index === 0
        ? {
          ...person,
          monthlyOverrides: [
            {
              periodId: sourcePeriodId,
              fixedMonthlyCostK: 6,
              availableHours: 80,
              status: 'partial_availability' as const,
            },
          ],
        }
        : person),
    };

    const pasted = applyTrafficBoardCommand(snapshotWithOverrides, {
      type: 'period.pasteMonthPlan',
      sourcePeriodId,
      targetPeriodId,
      mode: 'people_without_allocations',
      people: snapshotWithOverrides.people.map((person) => ({
        personId: person.id,
        monthlyOverride: person.monthlyOverrides?.find((override) => override.periodId === sourcePeriodId),
      })),
      projects: [],
      allocations: sourceAllocations.map((allocation) => ({
        personId: allocation.personId,
        tileIndex: allocation.tileIndex,
        target: allocation.target,
        mode: allocation.mode,
        revenueK: allocation.revenueK,
        hours: allocation.hours,
        skillId: allocation.skillId,
        requirementId: allocation.requirementId,
        projectSlotIndex: allocation.projectSlotIndex,
        hoursOverridden: allocation.hoursOverridden,
        revenueOverridden: allocation.revenueOverridden,
        meetingState: allocation.meetingState,
      })),
    });

    expect(pasted.projects.find((project) => project.id === 'beta')?.archivedPeriodIds || [])
      .not.toContain(targetPeriodId);
    expect(pasted.projects.find((project) => project.id === 'beta')?.revenuePlan.some((plan) => plan.periodId === targetPeriodId))
      .toBe(true);
    expect(pasted.allocations.filter((allocation) => allocation.periodId === targetPeriodId))
      .toHaveLength(sourceAllocations.length - snapshot.allocations.filter((allocation) => allocation.periodId === sourcePeriodId && allocation.personId === 'tomasz').length + 6);
    expect(pasted.allocations.filter((allocation) => allocation.periodId === targetPeriodId).every((allocation) => allocation.target === 'bench'))
      .toBe(true);
    expect(pasted.people[0].monthlyOverrides?.find((override) => override.periodId === targetPeriodId))
      .toMatchObject({ fixedMonthlyCostK: 6, availableHours: 80 });
  });

  it('clears a month plan without archiving or deleting durable people and projects', () => {
    const snapshot = createSeedTrafficSnapshot();
    const periodId = snapshot.activePeriodId;
    const alfa = snapshot.projects.find((project) => project.id === 'alfa')!;
    const tomaszAllocation = snapshot.allocations.find((allocation) => (
      allocation.periodId === periodId && allocation.personId === 'tomasz'
    ))!;
    const assigned = applyTrafficBoardCommand(snapshot, {
      type: 'allocations.move',
      periodId,
      moves: [{ tileId: tomaszAllocation.id, target: alfa.id }],
    });

    const cleared = applyTrafficBoardCommand(assigned, {
      type: 'period.clearMonthPlan',
      periodId,
    });

    expect(cleared.people).toHaveLength(assigned.people.length);
    expect(cleared.projects).toHaveLength(assigned.projects.length);
    expect(cleared.people.find((person) => person.id === 'tomasz')?.archivedAt).toBeUndefined();
    expect(cleared.people.every((person) => person.archivedAt || person.hiddenPeriodIds?.includes(periodId))).toBe(true);
    expect(cleared.projects.find((project) => project.id === alfa.id)?.archivedAt).toBeUndefined();
    expect(cleared.projects.find((project) => project.id === alfa.id)?.archivedPeriodIds)
      .toContain(periodId);
    expect(cleared.allocations.some((allocation) => allocation.periodId === periodId)).toBe(false);

    const ensured = applyTrafficBoardCommand(cleared, {
      type: 'period.ensureCapacity',
      periodId,
    });
    expect(ensured.allocations.some((allocation) => allocation.periodId === periodId)).toBe(false);

    const pastedPeople = applyTrafficBoardCommand(cleared, {
      type: 'period.pasteMonthPlan',
      sourcePeriodId: '2026-07',
      targetPeriodId: periodId,
      mode: 'people_without_allocations',
      people: [{ personId: 'tomasz' }],
      projects: [],
      allocations: [],
    });
    expect(pastedPeople.people.find((person) => person.id === 'tomasz')?.hiddenPeriodIds || [])
      .not.toContain(periodId);
    expect(pastedPeople.allocations.filter((allocation) => (
      allocation.periodId === periodId && allocation.personId === 'tomasz'
    ))).toHaveLength(getPersonPeriodCostTileCount(snapshot.people.find((person) => person.id === 'tomasz')!, periodId));
  });

  it('pastes people, projects, and allocations as a full month replacement', () => {
    const snapshot = createSeedTrafficSnapshot();
    const sourcePeriodId = snapshot.activePeriodId;
    const targetPeriodId = '2026-07';
    const alfa = snapshot.projects.find((project) => project.id === 'alfa')!;
    const tomaszAllocation = snapshot.allocations.find((allocation) => (
      allocation.periodId === sourcePeriodId && allocation.personId === 'tomasz'
    ))!;
    const assigned = applyTrafficBoardCommand(snapshot, {
      type: 'allocations.move',
      periodId: sourcePeriodId,
      moves: [{ tileId: tomaszAllocation.id, target: alfa.id, projectSlotIndex: 2 }],
    });
    const sourceAllocations = assigned.allocations.filter((allocation) => allocation.periodId === sourcePeriodId);

    const pasted = applyTrafficBoardCommand(assigned, {
      type: 'period.pasteMonthPlan',
      sourcePeriodId,
      targetPeriodId,
      mode: 'people_with_allocations',
      people: assigned.people.map((person) => ({ personId: person.id })),
      projects: [{
        projectId: alfa.id,
        revenuePlan: alfa.revenuePlan.find((plan) => plan.periodId === sourcePeriodId),
      }],
      allocations: sourceAllocations.map((allocation) => ({
        personId: allocation.personId,
        tileIndex: allocation.tileIndex,
        target: allocation.target,
        mode: allocation.mode,
        revenueK: allocation.revenueK,
        hours: allocation.hours,
        skillId: allocation.skillId,
        requirementId: allocation.requirementId,
        projectSlotIndex: allocation.projectSlotIndex,
        hoursOverridden: allocation.hoursOverridden,
        revenueOverridden: allocation.revenueOverridden,
        meetingState: allocation.meetingState,
      })),
    });

    expect(pasted.projects.find((project) => project.id === 'alfa')?.revenuePlan)
      .toContainEqual(expect.objectContaining({ periodId: targetPeriodId, revenueK: 40 }));
    expect(pasted.projects.find((project) => project.id === 'beta')?.archivedPeriodIds)
      .toContain(targetPeriodId);
    expect(pasted.allocations.find((allocation) => allocation.id === `${targetPeriodId}-tomasz-0`))
      .toMatchObject({ target: alfa.id, projectSlotIndex: 2 });
  });

  it('pastes project frames without allocations', () => {
    const snapshot = createSeedTrafficSnapshot();
    const sourcePeriodId = snapshot.activePeriodId;
    const targetPeriodId = '2026-07';
    const alfa = snapshot.projects.find((project) => project.id === 'alfa')!;
    const targetAllocation = snapshot.allocations.find((allocation) => allocation.periodId === targetPeriodId) || {
      ...snapshot.allocations[0],
      id: `${targetPeriodId}-${snapshot.people[0].id}-0`,
      periodId: targetPeriodId,
      target: 'beta',
    };
    const snapshotWithTargetAllocation = {
      ...snapshot,
      allocations: [
        ...snapshot.allocations.filter((allocation) => allocation.id !== targetAllocation.id),
        { ...targetAllocation, target: 'beta' },
      ],
    };

    const pasted = applyTrafficBoardCommand(snapshotWithTargetAllocation, {
      type: 'period.pasteMonthPlan',
      sourcePeriodId,
      targetPeriodId,
      mode: 'projects_without_allocations',
      people: [],
      projects: [{
        projectId: alfa.id,
        revenuePlan: alfa.revenuePlan.find((plan) => plan.periodId === sourcePeriodId),
      }],
      allocations: [],
    });

    expect(pasted.projects.find((project) => project.id === 'alfa')?.revenuePlan)
      .toContainEqual(expect.objectContaining({ periodId: targetPeriodId, revenueK: 40 }));
    expect(pasted.projects.find((project) => project.id === 'beta')?.archivedPeriodIds)
      .toContain(targetPeriodId);
    expect(pasted.allocations.filter((allocation) => allocation.periodId === targetPeriodId).every((allocation) => allocation.target === 'bench'))
      .toBe(true);
  });
});

function getPersonAllocationCount(
  snapshot: ReturnType<typeof createSeedTrafficSnapshot>,
  personId: string,
  periodId: string
) {
  return snapshot.allocations.filter((allocation) => (
    allocation.personId === personId && allocation.periodId === periodId
  )).length;
}
