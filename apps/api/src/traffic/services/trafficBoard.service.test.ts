import { describe, expect, it } from 'vitest';
import { ensureWeeklyAllocationsFromMonthly } from '@ptm/domain';
import type { TrafficBoardCommand, TrafficSnapshot } from '@ptm/domain';
import { executeTrafficBoardCommandRequestSchema } from '@ptm/contracts';
import { InMemoryTrafficBoardRepository } from '../repositories/inMemoryTrafficBoard.repository.testSupport.js';
import { TrafficBoardConflictError, TrafficBoardService } from './trafficBoard.service.js';

describe('TrafficBoardService', () => {
  it('creates and persists a seeded board in normalized tables', async () => {
    const repository = new InMemoryTrafficBoardRepository();
    const service = new TrafficBoardService(repository);

    const created = await service.getOrCreate('ptm-mvp');
    const loaded = await service.getOrCreate('ptm-mvp');

    expect(created.snapshot.people.length).toBeGreaterThan(0);
    expect(created.version).toBe(1);
    expect(loaded.boardId).toBe('ptm-mvp');
    expect(loaded.version).toBe(1);
    expect(loaded.snapshot.projects.some((project) => project.id === 'alfa')).toBe(true);
    expect(await repository.countEntityRows('traffic_people', 'ptm-mvp')).toBe(created.snapshot.people.length);
    expect(await repository.countEntityRows('traffic_projects', 'ptm-mvp')).toBe(created.snapshot.projects.length);
    expect(await repository.countEntityRows('traffic_allocations', 'ptm-mvp')).toBe(created.snapshot.allocations.length);
    expect(await repository.listAuditLog('ptm-mvp')).toHaveLength(1);
  });

  it('updates normalized entity rows and writes audit entries', async () => {
    const repository = new InMemoryTrafficBoardRepository();
    const service = new TrafficBoardService(repository);
    const initial = await service.getOrCreate('ptm-mvp');
    const nextSnapshot: TrafficSnapshot = {
      ...initial.snapshot,
      people: initial.snapshot.people.slice(0, 2),
    };

    await service.save('ptm-mvp', nextSnapshot, {
      baseUpdatedAt: initial.updatedAt,
    });
    const loaded = await service.getOrCreate('ptm-mvp');

    expect(loaded.snapshot.people).toHaveLength(2);
    expect(loaded.version).toBe(2);
    expect(await repository.countEntityRows('traffic_people', 'ptm-mvp')).toBe(2);
    expect((await repository.listAuditLog('ptm-mvp')).map((entry) => entry.action)).toEqual([
      'board_snapshot_saved',
      'board_snapshot_saved',
    ]);
  });

  it('moves allocations through the backend domain command', async () => {
    const repository = new InMemoryTrafficBoardRepository();
    const service = new TrafficBoardService(repository);
    const initial = await service.getOrCreate('ptm-mvp');
    const allocation = initial.snapshot.allocations[0];
    const project = initial.snapshot.projects[0];

    const moved = await service.moveAllocations('ptm-mvp', initial.snapshot.activePeriodId, [{
      tileId: allocation.id,
      target: project.id,
    }]);

    expect(moved.snapshot.allocations.find((item) => item.id === allocation.id)?.target).toBe(project.id);
    expect(moved.version).toBe(2);
    expect((await repository.listAuditLog('ptm-mvp')).map((entry) => entry.action)).toEqual([
      'board_snapshot_saved',
      'allocations_moved',
    ]);
  });

  it('persists manual project slot placement through the backend move command', async () => {
    const repository = new InMemoryTrafficBoardRepository();
    const service = new TrafficBoardService(repository);
    const initial = await service.getOrCreate('ptm-mvp');
    const project = initial.snapshot.projects.find((item) => item.id === 'beta');
    const allocation = initial.snapshot.allocations.find((item) => item.personId === 'marek');

    if (!project || !allocation) throw new Error('Seed data is missing expected project or allocation.');

    const moved = await service.moveAllocations('ptm-mvp', initial.snapshot.activePeriodId, [{
      tileId: allocation.id,
      target: project.id,
      requirementId: 'beta-frontend',
      projectSlotIndex: 5,
    }]);
    const movedAllocation = moved.snapshot.allocations.find((item) => item.id === allocation.id);

    expect(movedAllocation?.target).toBe(project.id);
    expect(movedAllocation?.requirementId).toBe('beta-frontend');
    expect(movedAllocation?.projectSlotIndex).toBe(5);

    const loaded = await service.getOrCreate('ptm-mvp');
    expect(loaded.snapshot.allocations.find((item) => item.id === allocation.id)?.projectSlotIndex).toBe(5);
  });

  it('executes typed board commands against the latest snapshot', async () => {
    const repository = new InMemoryTrafficBoardRepository();
    const service = new TrafficBoardService(repository);
    const initial = await service.getOrCreate('ptm-mvp');

    const updated = await service.executeCommand('ptm-mvp', {
      type: 'settings.setActiveTileUnit',
      tileUnitId: 'money-5k',
    });

    expect(updated.snapshot.activeTileUnitId).toBe('money-5k');
    expect(updated.version).toBe(initial.version + 1);
    expect((await repository.listAuditLog('ptm-mvp')).map((entry) => entry.action)).toEqual([
      'board_snapshot_saved',
      'active_tile_unit_changed',
    ]);
  });

  it('serializes concurrent commands from independent service instances', async () => {
    const repository = new InMemoryTrafficBoardRepository();
    const firstService = new TrafficBoardService(repository);
    const secondService = new TrafficBoardService(repository);
    const initial = await firstService.getOrCreate('ptm-mvp');
    const nextPeriod = initial.snapshot.periods.find((period) => (
      period.granularity === 'month' && period.id !== initial.snapshot.activePeriodId
    ));

    if (!nextPeriod) throw new Error('Seed data is missing a second month period.');

    await Promise.all([
      firstService.executeCommand('ptm-mvp', {
        type: 'settings.setActiveTileUnit',
        tileUnitId: 'money-5k',
      }),
      secondService.executeCommand('ptm-mvp', {
        type: 'settings.setActivePeriod',
        periodId: nextPeriod.id,
      }),
    ]);

    const loaded = await firstService.getOrCreate('ptm-mvp');
    expect(loaded.snapshot.activeTileUnitId).toBe('money-5k');
    expect(loaded.snapshot.activePeriodId).toBe(nextPeriod.id);
    expect(loaded.version).toBe(initial.version + 2);
  });

  it('persists weekly allocation reset without clearing other weeks', async () => {
    const repository = new InMemoryTrafficBoardRepository();
    const service = new TrafficBoardService(repository);
    const initial = await service.getOrCreate('ptm-mvp');
    const monthPeriodId = initial.snapshot.activePeriodId;
    const weekPeriods = initial.snapshot.periods
      .filter((period) => period.granularity === 'week' && period.parentPeriodId === monthPeriodId)
      .sort((first, second) => first.startsOn.localeCompare(second.startsOn));
    const weekOne = weekPeriods[0];
    const weekTwo = weekPeriods[1];
    const monthlyTiles = initial.snapshot.allocations
      .filter((allocation) => allocation.periodId === monthPeriodId && allocation.personId === 'tomasz')
      .sort((first, second) => first.tileIndex - second.tileIndex)
      .slice(0, 9);

    if (!weekOne || !weekTwo || monthlyTiles.length < 9) {
      throw new Error('Seed data is missing expected weekly reset inputs.');
    }

    const monthlyAssigned = await service.executeCommand('ptm-mvp', {
      type: 'allocations.move',
      periodId: monthPeriodId,
      moves: monthlyTiles.map((allocation) => ({
        tileId: allocation.id,
        target: 'alfa',
      })),
    });
    const seededWeekly = ensureWeeklyAllocationsFromMonthly(monthlyAssigned.snapshot, monthPeriodId, ['tomasz']);
    const weekOneProjectSlots = seededWeekly.weeklyAllocations
      ?.filter((allocation) => (
        allocation.weekPeriodId === weekOne.id &&
        allocation.target === 'alfa'
      ))
      .map((allocation) => allocation.slotIndex) || [];

    expect(weekOneProjectSlots.length).toBeGreaterThan(0);
    expect(seededWeekly.weeklyAllocations?.some((allocation) => (
      allocation.weekPeriodId === weekTwo.id &&
      allocation.target === 'alfa'
    ))).toBe(true);

    await service.executeCommand('ptm-mvp', {
      type: 'weeklyAllocations.move',
      monthPeriodId,
      weekPeriodId: weekOne.id,
      moves: weekOneProjectSlots.map((slotIndex) => ({
        personId: 'tomasz',
        slotIndex,
        target: 'bench',
      })),
    });
    const loaded = await service.getOrCreate('ptm-mvp');

    expect(loaded.snapshot.weeklyAllocations?.some((allocation) => (
      allocation.weekPeriodId === weekOne.id &&
      allocation.target === 'alfa'
    ))).toBe(false);
    expect(loaded.snapshot.weeklyAllocations?.some((allocation) => (
      allocation.weekPeriodId === weekTwo.id &&
      allocation.target === 'alfa'
    ))).toBe(true);
    expect(loaded.snapshot.allocations.filter((allocation) => allocation.target === 'alfa').length).toBeGreaterThan(0);
    expect((await repository.listAuditLog('ptm-mvp')).at(-1)?.action).toBe('weekly_allocations_moved');
  });

  it('persists month paste commands through reload', async () => {
    const repository = new InMemoryTrafficBoardRepository();
    const service = new TrafficBoardService(repository);
    const initial = await service.getOrCreate('ptm-mvp');
    const sourcePeriodId = initial.snapshot.activePeriodId;
    const targetPeriodId = '2026-07';
    const alfa = initial.snapshot.projects.find((project) => project.id === 'alfa');
    const tomaszAllocation = initial.snapshot.allocations.find((allocation) => (
      allocation.periodId === sourcePeriodId && allocation.personId === 'tomasz'
    ));

    if (!alfa || !tomaszAllocation) throw new Error('Seed data is missing expected paste inputs.');

    const assigned = await service.executeCommand('ptm-mvp', {
      type: 'allocations.move',
      periodId: sourcePeriodId,
      moves: [{ tileId: tomaszAllocation.id, target: alfa.id, projectSlotIndex: 2 }],
    });
    const sourceAllocations = assigned.snapshot.allocations.filter((allocation) => allocation.periodId === sourcePeriodId);
    const pasteCommand = {
      type: 'period.pasteMonthPlan',
      sourcePeriodId,
      targetPeriodId,
      mode: 'people_with_allocations',
      people: assigned.snapshot.people.map((person) => ({ personId: person.id })),
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
    } satisfies TrafficBoardCommand;
    expect(() => executeTrafficBoardCommandRequestSchema.parse({
      commandId: 'paste-month-plan-regression',
      command: pasteCommand,
    })).not.toThrow();

    const pasted = await service.executeCommand('ptm-mvp', pasteCommand);
    const reloaded = await service.getOrCreate('ptm-mvp');

    expect(pasted.version).toBe(initial.version + 2);
    expect(reloaded.snapshot.projects.find((project) => project.id === 'alfa')?.revenuePlan)
      .toContainEqual(expect.objectContaining({ periodId: targetPeriodId, revenueK: 40 }));
    expect(reloaded.snapshot.projects.find((project) => project.id === 'beta')?.archivedPeriodIds)
      .toContain(targetPeriodId);
    expect(reloaded.snapshot.allocations.find((allocation) => allocation.id === `${targetPeriodId}-tomasz-0`))
      .toMatchObject({ target: alfa.id, projectSlotIndex: 2 });
    expect((await repository.listAuditLog('ptm-mvp')).at(-1)?.action).toBe('period_month_plan_pasted');
  });

  it('persists month clear commands without deleting people or project records', async () => {
    const repository = new InMemoryTrafficBoardRepository();
    const service = new TrafficBoardService(repository);
    const initial = await service.getOrCreate('ptm-mvp');
    const periodId = initial.snapshot.activePeriodId;
    const command = {
      type: 'period.clearMonthPlan',
      periodId,
    } satisfies TrafficBoardCommand;
    expect(() => executeTrafficBoardCommandRequestSchema.parse({
      commandId: 'clear-month-plan-regression',
      command,
    })).not.toThrow();

    const cleared = await service.executeCommand('ptm-mvp', command);
    const reloaded = await service.getOrCreate('ptm-mvp');

    expect(cleared.version).toBe(initial.version + 1);
    expect(reloaded.snapshot.people).toHaveLength(initial.snapshot.people.length);
    expect(reloaded.snapshot.projects).toHaveLength(initial.snapshot.projects.length);
    expect(reloaded.snapshot.people.every((person) => person.archivedAt || person.hiddenPeriodIds?.includes(periodId)))
      .toBe(true);
    expect(reloaded.snapshot.projects.find((project) => project.id === 'alfa')?.archivedPeriodIds)
      .toContain(periodId);
    expect(reloaded.snapshot.allocations.some((allocation) => allocation.periodId === periodId)).toBe(false);
    expect((await repository.listAuditLog('ptm-mvp')).at(-1)?.action).toBe('period_month_plan_cleared');
  });

  it('stores command metadata in audit entries for import and retry tracing', async () => {
    const repository = new InMemoryTrafficBoardRepository();
    const service = new TrafficBoardService(repository);
    await service.getOrCreate('ptm-mvp');

    await service.executeCommand('ptm-mvp', {
      type: 'settings.setActiveTileUnit',
      tileUnitId: 'money-5k',
    }, {
      actorId: 'agent:importer',
      commandId: 'cmd-123',
      sourceSystem: 'legacy-pm',
      sourceRecordId: 'board-settings',
      idempotencyKey: 'legacy-pm:settings:board-settings',
      diffSummary: 'Import active tile unit',
    });

    expect((await repository.listAuditLog('ptm-mvp')).at(-1)).toMatchObject({
      action: 'active_tile_unit_changed',
      actorId: 'agent:importer',
      commandId: 'cmd-123',
      sourceSystem: 'legacy-pm',
      sourceRecordId: 'board-settings',
      idempotencyKey: 'legacy-pm:settings:board-settings',
      diffSummary: 'Import active tile unit',
    });
  });

  it('rejects stale snapshot saves instead of overwriting newer backend state', async () => {
    const repository = new InMemoryTrafficBoardRepository();
    const service = new TrafficBoardService(repository);
    const initial = await service.getOrCreate('ptm-mvp');
    const newer = await service.moveAllocations('ptm-mvp', initial.snapshot.activePeriodId, [{
      tileId: initial.snapshot.allocations[0].id,
      target: initial.snapshot.projects[0].id,
    }]);

    await expect(service.save('ptm-mvp', initial.snapshot, {
      baseUpdatedAt: '2026-06-11T00:00:00.000Z',
    })).rejects.toBeInstanceOf(TrafficBoardConflictError);

    const loaded = await service.getOrCreate('ptm-mvp');
    expect(loaded.updatedAt).toBe(newer.updatedAt);
    expect(loaded.snapshot.allocations[0].target).toBe(initial.snapshot.projects[0].id);
  });

  it('rejects blind snapshot saves for an existing board', async () => {
    const repository = new InMemoryTrafficBoardRepository();
    const service = new TrafficBoardService(repository);
    const initial = await service.getOrCreate('ptm-mvp');

    await expect(service.save('ptm-mvp', {
      ...initial.snapshot,
      activeTileUnitId: 'money-5k',
    })).rejects.toBeInstanceOf(TrafficBoardConflictError);

    const loaded = await service.getOrCreate('ptm-mvp');
    expect(loaded.snapshot.activeTileUnitId).toBe(initial.snapshot.activeTileUnitId);
  });
});
