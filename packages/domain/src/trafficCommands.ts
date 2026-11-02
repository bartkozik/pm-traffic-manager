import { getSuggestedAllocationRequirement } from './allocationSkills.js';
import { moveTrafficAllocations, MoveTrafficAllocation } from './allocationMutations.js';
import { validateAllocation } from './allocationValidation.js';
import { deletePlanningRule, upsertPlanningRules } from './planningRules.js';
import {
  addUtcMonths,
  createMonthPeriod,
  createPersonPeriodAllocations,
  createWeekPeriods,
  getLatestMonth,
  getMonthDate,
  isPersonActiveInPeriod,
} from './periods.js';
import { createSeedTrafficSnapshot, DEFAULT_ACTIVE_PERIOD_ID } from './seed.js';
import {
  AllocationMeetingState,
  MonthlyPersonOverride,
  MonthlyRevenuePlan,
  Person,
  PersonTileAllocation,
  PlanningRule,
  ProjectFrame,
  TrafficSnapshot,
} from './traffic.model.js';
import {
  MoveWeeklyAllocation,
  moveWeeklyAllocations,
  syncMonthlyAllocationsFromWeekly,
  syncWeeklyAllocationsFromMonthly,
  updateProjectWeeklyRevenuePlan,
} from './weeklyAllocations.js';
import {
  applyPersonProfileUpdateFromPeriod,
  getPersonPeriodCostTileCount,
  getPersonPeriodHoursPerTile,
  getPersonPeriodProfile,
} from './personPeriod.js';

export type MonthPlanPasteMode =
  | 'people_with_allocations'
  | 'people_without_allocations'
  | 'projects_without_allocations';

export interface MonthPlanPersonCopy {
  personId: string;
  monthlyOverride?: MonthlyPersonOverride;
}

export interface MonthPlanProjectCopy {
  projectId: string;
  revenuePlan?: MonthlyRevenuePlan;
}

export type MonthPlanAllocationCopy = Pick<
  PersonTileAllocation,
  | 'personId'
  | 'tileIndex'
  | 'target'
  | 'mode'
  | 'revenueK'
  | 'hours'
  | 'skillId'
  | 'requirementId'
  | 'projectSlotIndex'
  | 'hoursOverridden'
  | 'revenueOverridden'
  | 'meetingState'
>;

export type TrafficBoardCommand =
  | { type: 'allocations.move'; periodId: string; moves: MoveTrafficAllocation[] }
  | { type: 'weeklyAllocations.move'; monthPeriodId: string; weekPeriodId: string; moves: MoveWeeklyAllocation[] }
  | { type: 'allocations.resetPerson'; personId: string; periodId: string }
  | { type: 'allocations.update'; allocation: PersonTileAllocation }
  | {
    type: 'allocations.updateGroupMeetingState';
    allocation: PersonTileAllocation;
    groupAllocationIds: string[];
    meetingState?: AllocationMeetingState;
  }
  | { type: 'person.create'; person: Person; periodId: string }
  | { type: 'person.update'; person: Person; activePeriodId: string }
  | { type: 'person.archive'; personId: string; archivedAt: string }
  | { type: 'person.restore'; personId: string; periodIds?: string[] }
  | { type: 'project.create'; project: ProjectFrame }
  | { type: 'project.update'; project: ProjectFrame }
  | {
    type: 'project.updateWeeklyRevenuePlan';
    projectId: string;
    monthPeriodId: string;
    weekPeriodId: string;
    revenueK: number;
  }
  | { type: 'project.archivePeriod'; projectId: string; periodId: string }
  | { type: 'project.restorePeriod'; projectId: string; periodId: string }
  | { type: 'project.delete'; projectId: string }
  | { type: 'planningRules.upsertMany'; planningRules: PlanningRule[] }
  | { type: 'planningRules.delete'; planningRuleId: string }
  | { type: 'period.ensureCapacity'; periodId: string }
  | { type: 'period.ensureRange'; fromPeriodId: string; monthCount: number }
  | { type: 'period.createMonth'; periodId: string; activate?: boolean }
  | { type: 'period.clearMonthPlan'; periodId: string }
  | {
    type: 'period.pasteMonthPlan';
    sourcePeriodId?: string;
    targetPeriodId: string;
    mode: MonthPlanPasteMode;
    people: MonthPlanPersonCopy[];
    projects: MonthPlanProjectCopy[];
    allocations: MonthPlanAllocationCopy[];
  }
  | { type: 'settings.setActivePeriod'; periodId: string }
  | { type: 'settings.setActiveTileUnit'; tileUnitId: string }
  | { type: 'board.reset' };

export function applyTrafficBoardCommand(snapshot: TrafficSnapshot, command: TrafficBoardCommand): TrafficSnapshot {
  switch (command.type) {
    case 'allocations.move': {
      const nextSnapshot = moveTrafficAllocations(cloneSnapshot(snapshot), command.moves, command.periodId);
      const affectedPersonIds = getAllocationMovePersonIds(snapshot, command.moves);
      const syncedSnapshot = syncWeeklyAllocationsFromMonthly(
        nextSnapshot,
        command.periodId,
        affectedPersonIds
      );
      return syncMonthlyFromWeeklyWhenManualOverrides(syncedSnapshot, command.periodId, affectedPersonIds);
    }
    case 'weeklyAllocations.move':
      return moveWeeklyAllocations(cloneSnapshot(snapshot), command.monthPeriodId, command.weekPeriodId, command.moves);
    case 'allocations.resetPerson':
      return syncWeeklyAllocationsFromMonthly(
        resetPersonAllocations(snapshot, command.personId, command.periodId),
        command.periodId,
        [command.personId],
        { preserveManual: false }
      );
    case 'allocations.update': {
      const syncedSnapshot = syncWeeklyAllocationsFromMonthly(
        updateAllocation(snapshot, command.allocation),
        command.allocation.periodId,
        [command.allocation.personId]
      );
      return syncMonthlyFromWeeklyWhenManualOverrides(syncedSnapshot, command.allocation.periodId, [command.allocation.personId]);
    }
    case 'allocations.updateGroupMeetingState':
      return updateAllocationGroupMeetingState(snapshot, command.allocation, command.groupAllocationIds, command.meetingState);
    case 'person.create':
      return createPerson(snapshot, command.person, command.periodId);
    case 'person.update':
      return updatePerson(snapshot, command.person, command.activePeriodId);
    case 'person.archive':
      return archivePerson(snapshot, command.personId, command.archivedAt);
    case 'person.restore':
      return restorePerson(snapshot, command.personId, command.periodIds);
    case 'project.create':
      return createProject(snapshot, command.project);
    case 'project.update':
      return updateProject(snapshot, command.project);
    case 'project.updateWeeklyRevenuePlan':
      return updateProjectWeeklyRevenuePlan(
        snapshot,
        command.projectId,
        command.monthPeriodId,
        command.weekPeriodId,
        command.revenueK
      );
    case 'project.archivePeriod':
      return archiveProjectPeriod(snapshot, command.projectId, command.periodId);
    case 'project.restorePeriod':
      return restoreProjectPeriod(snapshot, command.projectId, command.periodId);
    case 'project.delete':
      return deleteProject(snapshot, command.projectId);
    case 'planningRules.upsertMany':
      return upsertSnapshotPlanningRules(snapshot, command.planningRules);
    case 'planningRules.delete':
      return deleteSnapshotPlanningRule(snapshot, command.planningRuleId);
    case 'period.ensureCapacity':
      return ensurePeriodCapacity(snapshot, command.periodId);
    case 'period.ensureRange':
      return ensurePlanningRange(snapshot, command.fromPeriodId, command.monthCount);
    case 'period.createMonth':
      return createMonth(snapshot, command.periodId, command.activate !== false);
    case 'period.clearMonthPlan':
      return clearMonthPlan(snapshot, command.periodId);
    case 'period.pasteMonthPlan':
      return syncWeeklyAllocationsFromMonthly(
        pasteMonthPlan(snapshot, command),
        command.targetPeriodId,
        command.people.map((person) => person.personId),
        { preserveManual: false }
      );
    case 'settings.setActivePeriod':
      return snapshot.periods.some((period) => period.id === command.periodId)
        ? { ...cloneSnapshot(snapshot), activePeriodId: command.periodId }
        : cloneSnapshot(snapshot);
    case 'settings.setActiveTileUnit':
      return snapshot.tileUnits.some((tileUnit) => tileUnit.id === command.tileUnitId)
        ? { ...cloneSnapshot(snapshot), activeTileUnitId: command.tileUnitId }
        : cloneSnapshot(snapshot);
    case 'board.reset':
      return createSeedTrafficSnapshot();
  }
}

export function getTrafficBoardCommandAuditAction(command: TrafficBoardCommand) {
  switch (command.type) {
    case 'allocations.move':
      return 'allocations_moved';
    case 'weeklyAllocations.move':
      return 'weekly_allocations_moved';
    case 'allocations.resetPerson':
      return 'person_allocations_reset';
    case 'allocations.update':
      return 'allocation_updated';
    case 'allocations.updateGroupMeetingState':
      return 'allocation_meeting_state_updated';
    case 'person.create':
      return 'person_created';
    case 'person.update':
      return 'person_updated';
    case 'person.archive':
      return 'person_archived';
    case 'person.restore':
      return 'person_restored';
    case 'project.create':
      return 'project_created';
    case 'project.update':
      return 'project_updated';
    case 'project.updateWeeklyRevenuePlan':
      return 'project_weekly_revenue_plan_updated';
    case 'project.archivePeriod':
      return 'project_period_archived';
    case 'project.restorePeriod':
      return 'project_period_restored';
    case 'project.delete':
      return 'project_deleted';
    case 'planningRules.upsertMany':
      return 'planning_rules_upserted';
    case 'planningRules.delete':
      return 'planning_rule_deleted';
    case 'period.ensureCapacity':
      return 'period_capacity_ensured';
    case 'period.ensureRange':
      return 'period_range_ensured';
    case 'period.createMonth':
      return 'period_month_created';
    case 'period.clearMonthPlan':
      return 'period_month_plan_cleared';
    case 'period.pasteMonthPlan':
      return 'period_month_plan_pasted';
    case 'settings.setActivePeriod':
      return 'active_period_changed';
    case 'settings.setActiveTileUnit':
      return 'active_tile_unit_changed';
    case 'board.reset':
      return 'board_reset';
  }
}

function getAllocationMovePersonIds(snapshot: TrafficSnapshot, moves: MoveTrafficAllocation[]) {
  const allocationsById = new Map(snapshot.allocations.map((allocation) => [allocation.id, allocation]));
  return moves
    .map((move) => allocationsById.get(move.tileId)?.personId)
    .filter((personId): personId is string => Boolean(personId));
}

function syncMonthlyFromWeeklyWhenManualOverrides(
  snapshot: TrafficSnapshot,
  periodId: string,
  personIds: string[]
) {
  const affectedPersonIds = new Set(personIds);
  const hasManualWeeklyOverrides = (snapshot.weeklyAllocations || []).some((allocation) => (
    allocation.monthPeriodId === periodId &&
    affectedPersonIds.has(allocation.personId) &&
    allocation.source === 'manual'
  ));

  return hasManualWeeklyOverrides
    ? syncMonthlyAllocationsFromWeekly(snapshot, periodId, affectedPersonIds)
    : snapshot;
}

function resetPersonAllocations(snapshot: TrafficSnapshot, personId: string, periodId: string): TrafficSnapshot {
  const affectedTargetIds = new Set<string>();
  const allocations = snapshot.allocations.map((allocation) => {
    if (allocation.personId !== personId || allocation.periodId !== periodId) return allocation;
    if (allocation.target !== 'bench') affectedTargetIds.add(allocation.target);
    return {
      ...allocation,
      target: 'bench',
      previousTarget: allocation.target !== 'bench' ? allocation.target : allocation.previousTarget,
      skillId: undefined,
      requirementId: undefined,
      projectSlotIndex: undefined,
      validation: [],
    } satisfies PersonTileAllocation;
  });

  return revalidateTrafficSnapshotAllocations({ ...cloneSnapshot(snapshot), allocations }, periodId, affectedTargetIds);
}

function updateAllocation(snapshot: TrafficSnapshot, allocation: PersonTileAllocation): TrafficSnapshot {
  const currentAllocation = snapshot.allocations.find((item) => item.id === allocation.id);
  const affectedTargetIds = new Set(
    [currentAllocation?.target, allocation.target].filter((item): item is string => Boolean(item) && item !== 'bench')
  );
  const allocations = replaceById(snapshot.allocations, allocation);
  return revalidateTrafficSnapshotAllocations({ ...cloneSnapshot(snapshot), allocations }, allocation.periodId, affectedTargetIds);
}

function updateAllocationGroupMeetingState(
  snapshot: TrafficSnapshot,
  allocation: PersonTileAllocation,
  groupAllocationIds: string[],
  meetingState: AllocationMeetingState | undefined
): TrafficSnapshot {
  const groupIds = new Set(groupAllocationIds);
  const affectedTargetIds = new Set<string>();
  const allocations = snapshot.allocations.map((current) => {
    if (current.id === allocation.id) {
      if (allocation.target !== 'bench') affectedTargetIds.add(allocation.target);
      return { ...allocation, meetingState };
    }
    if (!groupIds.has(current.id)) return current;
    if (current.target !== 'bench') affectedTargetIds.add(current.target);
    return {
      ...current,
      meetingState,
      previousTarget: allocation.previousTarget,
    };
  });

  return revalidateTrafficSnapshotAllocations({ ...cloneSnapshot(snapshot), allocations }, allocation.periodId, affectedTargetIds);
}

function createPerson(snapshot: TrafficSnapshot, person: Person, periodId: string): TrafficSnapshot {
  const people = upsertById(snapshot.people, person);
  const existingAllocationIds = new Set(snapshot.allocations.map((allocation) => allocation.id));
  const allocations = [
    ...snapshot.allocations,
    ...createPersonPeriodAllocations(person, periodId).filter((allocation) => !existingAllocationIds.has(allocation.id)),
  ];

  return revalidateTrafficSnapshotAllocations({ ...cloneSnapshot(snapshot), people, allocations });
}

function updatePerson(snapshot: TrafficSnapshot, person: Person, activePeriodId: string): TrafficSnapshot {
  const existing = snapshot.people.find((item) => item.id === person.id);
  const nextPerson = applyPersonProfileUpdateFromPeriod(existing, person, activePeriodId, snapshot.periods, snapshot.allocations);
  const people = upsertById(snapshot.people, nextPerson);
  const periodsToSync = getCurrentAndFutureMonthPeriods(snapshot.periods, activePeriodId);
  let allocations = snapshot.allocations.map((allocation) => (
    allocation.personId === nextPerson.id
      ? {
          ...allocation,
          hours: allocation.hoursOverridden
            ? allocation.hours
            : getPersonPeriodHoursPerTile(nextPerson, allocation.periodId),
        }
      : allocation
  ));

  const existingAllocationIds = new Set(allocations.map((allocation) => allocation.id));
  const extraAllocations: PersonTileAllocation[] = [];
  const nextTileCountByPeriodId = new Map<string, number>();

  periodsToSync.forEach((period) => {
    const hasExistingAllocations = allocations.some((allocation) => (
      allocation.personId === nextPerson.id && allocation.periodId === period.id
    ));
    if (!hasExistingAllocations && period.id !== activePeriodId) return;

    const previousTileCount = existing ? getPersonPeriodCostTileCount(existing, period.id) : 0;
    const nextTileCount = getPersonPeriodCostTileCount(nextPerson, period.id);
    nextTileCountByPeriodId.set(period.id, nextTileCount);

    for (let tileIndex = previousTileCount; tileIndex < nextTileCount; tileIndex += 1) {
      const allocationId = `${period.id}-${nextPerson.id}-${tileIndex}`;
      if (existingAllocationIds.has(allocationId)) continue;
      extraAllocations.push({
        id: allocationId,
        personId: nextPerson.id,
        tileIndex,
        target: 'bench',
        periodId: period.id,
        mode: 'revenue_first',
        revenueK: 1,
        hours: getPersonPeriodHoursPerTile(nextPerson, period.id),
      } satisfies PersonTileAllocation);
      existingAllocationIds.add(allocationId);
    }
  });

  allocations = [...allocations, ...extraAllocations]
    .filter((allocation) => {
      if (allocation.personId !== nextPerson.id) return true;
      const nextTileCount = nextTileCountByPeriodId.get(allocation.periodId);
      if (typeof nextTileCount !== 'number') return true;
      return allocation.tileIndex < nextTileCount;
    });

  return normalizeAllocationSkillsAndValidation({ ...cloneSnapshot(snapshot), people, allocations });
}

function archivePerson(snapshot: TrafficSnapshot, personId: string, archivedAt: string): TrafficSnapshot {
  const people = snapshot.people.map((person) => (
    person.id === personId ? { ...person, archivedAt } : person
  ));
  const affectedTargetIds = new Set<string>();
  const allocations = snapshot.allocations.map((allocation) => {
    if (allocation.personId !== personId) return allocation;
    if (allocation.target !== 'bench') affectedTargetIds.add(allocation.target);
    return {
      ...allocation,
      target: 'bench',
      previousTarget: allocation.target !== 'bench' ? allocation.target : allocation.previousTarget,
      validation: [],
    };
  });

  return revalidateTrafficSnapshotAllocations({ ...cloneSnapshot(snapshot), people, allocations }, undefined, affectedTargetIds);
}

function restorePerson(snapshot: TrafficSnapshot, personId: string, periodIds: string[] = [snapshot.activePeriodId]): TrafficSnapshot {
  const person = snapshot.people.find((item) => item.id === personId);
  if (!person) return cloneSnapshot(snapshot);

  const restoredPerson = { ...person };
  delete restoredPerson.archivedAt;
  const targetPeriodIds = Array.from(new Set(periodIds)).filter((periodId) => (
    snapshot.periods.some((period) => period.id === periodId && period.granularity === 'month')
  ));
  const people = snapshot.people.map((item) => (
    item.id === personId
      ? {
          ...restoredPerson,
          hiddenPeriodIds: (restoredPerson.hiddenPeriodIds || [])
            .filter((periodId) => !targetPeriodIds.includes(periodId)),
        }
      : item
  ));
  const existingAllocationIds = new Set(snapshot.allocations.map((allocation) => allocation.id));
  const missingAllocations = targetPeriodIds
    .filter((periodId) => !snapshot.allocations.some((allocation) => (
      allocation.personId === personId && allocation.periodId === periodId
    )))
    .flatMap((periodId) => createPersonPeriodAllocations(restoredPerson, periodId))
    .filter((allocation) => !existingAllocationIds.has(allocation.id));

  return {
    ...cloneSnapshot(snapshot),
    people,
    allocations: [...snapshot.allocations, ...missingAllocations],
  };
}

function createProject(snapshot: TrafficSnapshot, project: ProjectFrame): TrafficSnapshot {
  return {
    ...cloneSnapshot(snapshot),
    projects: upsertById(snapshot.projects, project),
  };
}

function updateProject(snapshot: TrafficSnapshot, project: ProjectFrame): TrafficSnapshot {
  const projects = upsertById(snapshot.projects, project);
  return normalizeAllocationSkillsAndValidation(
    { ...cloneSnapshot(snapshot), projects },
    undefined,
    new Set([project.id])
  );
}

function archiveProjectPeriod(snapshot: TrafficSnapshot, projectId: string, periodId: string): TrafficSnapshot {
  const project = snapshot.projects.find((item) => item.id === projectId);
  if (!project) return cloneSnapshot(snapshot);

  const projects = snapshot.projects.map((item) => (
    item.id === projectId
      ? { ...item, archivedPeriodIds: Array.from(new Set([...(item.archivedPeriodIds || []), periodId])) }
      : item
  ));
  const allocations = snapshot.allocations.map((allocation) => (
    allocation.target === projectId && allocation.periodId === periodId
      ? {
        ...allocation,
        target: 'bench',
        previousTarget: allocation.target,
        validation: [],
      }
      : allocation
  ));

  return revalidateTrafficSnapshotAllocations({ ...cloneSnapshot(snapshot), projects, allocations }, periodId, new Set([projectId]));
}

function restoreProjectPeriod(snapshot: TrafficSnapshot, projectId: string, periodId: string): TrafficSnapshot {
  const projects = snapshot.projects.map((project) => (
    project.id === projectId
      ? {
        ...project,
        archivedPeriodIds: (project.archivedPeriodIds || []).filter((archivedPeriodId) => archivedPeriodId !== periodId),
      }
      : project
  ));
  return { ...cloneSnapshot(snapshot), projects };
}

function deleteProject(snapshot: TrafficSnapshot, projectId: string): TrafficSnapshot {
  const projects = snapshot.projects.filter((project) => project.id !== projectId);
  const planningRules = (snapshot.planningRules || []).filter((rule) => rule.projectId !== projectId);
  const allocations = snapshot.allocations.map((allocation) => (
    allocation.target === projectId
      ? {
        ...allocation,
        target: 'bench',
        previousTarget: allocation.target,
        skillId: undefined,
        requirementId: undefined,
        projectSlotIndex: undefined,
        validation: [],
      }
      : allocation
  ));
  return revalidateTrafficSnapshotAllocations({ ...cloneSnapshot(snapshot), projects, planningRules, allocations });
}

function upsertSnapshotPlanningRules(snapshot: TrafficSnapshot, planningRules: PlanningRule[]): TrafficSnapshot {
  const nextRules = upsertPlanningRules(snapshot.planningRules || [], planningRules);
  return revalidateTrafficSnapshotAllocations({ ...cloneSnapshot(snapshot), planningRules: nextRules });
}

function deleteSnapshotPlanningRule(snapshot: TrafficSnapshot, planningRuleId: string): TrafficSnapshot {
  const planningRules = deletePlanningRule(snapshot.planningRules || [], planningRuleId);
  return revalidateTrafficSnapshotAllocations({ ...cloneSnapshot(snapshot), planningRules });
}

function ensurePeriodCapacity(snapshot: TrafficSnapshot, periodId: string): TrafficSnapshot {
  const activePeople = snapshot.people.filter((person) => isPersonActiveInPeriod(person, periodId));
  const existingAllocationIds = new Set(snapshot.allocations.map((allocation) => allocation.id));
  const missingAllocations = activePeople
    .filter((person) => !snapshot.allocations.some((allocation) => (
      allocation.periodId === periodId && allocation.personId === person.id
    )))
    .flatMap((person) => createPersonPeriodAllocations(person, periodId))
    .filter((allocation) => !existingAllocationIds.has(allocation.id));

  if (!missingAllocations.length) return cloneSnapshot(snapshot);
  return revalidateTrafficSnapshotAllocations({
    ...cloneSnapshot(snapshot),
    allocations: [...snapshot.allocations, ...missingAllocations],
  }, periodId);
}

function ensurePlanningRange(snapshot: TrafficSnapshot, fromPeriodId: string, monthCount: number): TrafficSnapshot {
  const sourcePeriod = snapshot.periods.find((period) => period.id === fromPeriodId && period.granularity === 'month');
  if (!sourcePeriod || monthCount <= 0) return cloneSnapshot(snapshot);

  const existingPeriodIds = new Set(snapshot.periods.map((period) => period.id));
  const sourceDate = getMonthDate(sourcePeriod);
  let periods = [...snapshot.periods];
  let allocations = [...snapshot.allocations];

  for (let index = 0; index < monthCount; index += 1) {
    const month = createMonthPeriod(addUtcMonths(sourceDate, index));
    if (existingPeriodIds.has(month.id)) continue;
    existingPeriodIds.add(month.id);
    periods = [...periods, month, ...createWeekPeriods(month)];
    allocations = [
      ...allocations,
      ...snapshot.people
        .filter((person) => isPersonActiveInPeriod(person, month.id))
        .flatMap((person) => createPersonPeriodAllocations(person, month.id)),
    ];
  }

  return { ...cloneSnapshot(snapshot), periods, allocations };
}

function createMonth(snapshot: TrafficSnapshot, periodId: string, activate: boolean): TrafficSnapshot {
  if (snapshot.periods.some((period) => period.id === periodId)) {
    return activate ? { ...cloneSnapshot(snapshot), activePeriodId: periodId } : cloneSnapshot(snapshot);
  }

  const candidateDate = new Date(`${periodId}-01T00:00:00.000Z`);
  if (Number.isNaN(candidateDate.getTime())) return cloneSnapshot(snapshot);

  const month = createMonthPeriod(candidateDate);
  const periods = [...snapshot.periods, month, ...createWeekPeriods(month)];
  const allocations = [
    ...snapshot.allocations,
    ...snapshot.people
      .filter((person) => isPersonActiveInPeriod(person, month.id))
      .flatMap((person) => createPersonPeriodAllocations(person, month.id)),
  ];

  return {
    ...cloneSnapshot(snapshot),
    activePeriodId: activate ? month.id : snapshot.activePeriodId,
    periods,
    allocations,
  };
}

function clearMonthPlan(snapshot: TrafficSnapshot, periodId: string): TrafficSnapshot {
  const period = snapshot.periods.find((item) => item.id === periodId && item.granularity === 'month');
  if (!period) return cloneSnapshot(snapshot);

  const visibleProjectIds = getVisibleProjectIdsForPeriod(snapshot.projects, snapshot.allocations, periodId);
  const visiblePersonIds = new Set(
    snapshot.people
      .filter((person) => isPersonActiveInPeriod(person, periodId))
      .map((person) => person.id)
  );
  const people = snapshot.people.map((person) => {
    if (!visiblePersonIds.has(person.id)) return person;
    return {
      ...person,
      hiddenPeriodIds: Array.from(new Set([...(person.hiddenPeriodIds || []), periodId])),
    };
  });
  const projects = snapshot.projects.map((project) => {
    if (!visibleProjectIds.has(project.id)) return project;
    return {
      ...project,
      archivedPeriodIds: Array.from(new Set([...(project.archivedPeriodIds || []), periodId])),
      weeklyRevenuePlan: (project.weeklyRevenuePlan || []).filter((entry) => entry.monthPeriodId !== periodId),
    };
  });
  const allocations = snapshot.allocations.filter((allocation) => allocation.periodId !== periodId);
  const weeklyAllocations = (snapshot.weeklyAllocations || []).filter((allocation) => allocation.monthPeriodId !== periodId);

  return normalizeAllocationSkillsAndValidation(
    {
      ...cloneSnapshot(snapshot),
      people,
      projects,
      allocations,
      weeklyAllocations,
    },
    periodId,
    visibleProjectIds
  );
}

function pasteMonthPlan(
  snapshot: TrafficSnapshot,
  command: Extract<TrafficBoardCommand, { type: 'period.pasteMonthPlan' }>
): TrafficSnapshot {
  const targetPeriod = snapshot.periods.find((period) => (
    period.id === command.targetPeriodId && period.granularity === 'month'
  ));
  if (!targetPeriod) return cloneSnapshot(snapshot);

  const shouldPastePeople = command.mode === 'people_with_allocations' || command.mode === 'people_without_allocations';
  const shouldPasteProjects = command.mode === 'people_with_allocations' || command.mode === 'projects_without_allocations';
  const shouldPasteAllocations = command.mode === 'people_with_allocations';
  const copiedPersonIds = new Set(command.people.map((person) => person.personId));
  const copiedProjectIds = new Set(command.projects.map((project) => project.projectId));
  const personCopiesById = new Map(command.people.map((person) => [person.personId, person]));
  const projectCopiesById = new Map(command.projects.map((project) => [project.projectId, project]));
  let people = cloneSnapshot(snapshot).people;
  let projects = cloneSnapshot(snapshot).projects;
  let allocations = cloneSnapshot(snapshot).allocations;
  const affectedTargetIds = new Set<string>();

  if (shouldPastePeople && copiedPersonIds.size) {
    people = people.map((person) => {
      const personCopy = personCopiesById.get(person.id);
      if (!personCopy) return person;

      const monthlyOverrides = (person.monthlyOverrides || [])
        .filter((override) => override.periodId !== command.targetPeriodId);
      if (personCopy.monthlyOverride) {
        monthlyOverrides.push({
          ...personCopy.monthlyOverride,
          periodId: command.targetPeriodId,
        });
      }

      return {
        ...person,
        hiddenPeriodIds: (person.hiddenPeriodIds || []).filter((periodId) => periodId !== command.targetPeriodId),
        monthlyOverrides: monthlyOverrides.length
          ? monthlyOverrides.sort((first, second) => first.periodId.localeCompare(second.periodId))
          : undefined,
      };
    });
  }

  if (shouldPasteProjects) {
    const visibleTargetProjectIds = getVisibleProjectIdsForPeriod(projects, allocations, command.targetPeriodId);
    visibleTargetProjectIds.forEach((projectId) => affectedTargetIds.add(projectId));
    copiedProjectIds.forEach((projectId) => affectedTargetIds.add(projectId));

    projects = projects.map((project) => {
      const projectCopy = projectCopiesById.get(project.id);
      if (projectCopy) {
        const targetRevenuePlan = getTargetRevenuePlan(project, projectCopy, command.targetPeriodId);
        return {
          ...project,
          archivedPeriodIds: (project.archivedPeriodIds || []).filter((periodId) => periodId !== command.targetPeriodId),
          revenuePlan: [
            ...project.revenuePlan.filter((plan) => plan.periodId !== command.targetPeriodId),
            targetRevenuePlan,
          ].sort((first, second) => first.periodId.localeCompare(second.periodId)),
        };
      }

      if (!visibleTargetProjectIds.has(project.id)) return project;
      return {
        ...project,
        archivedPeriodIds: Array.from(new Set([...(project.archivedPeriodIds || []), command.targetPeriodId])),
      };
    });

    allocations = allocations.map((allocation) => {
      if (
        allocation.periodId === command.targetPeriodId &&
        allocation.target !== 'bench' &&
        affectedTargetIds.has(allocation.target)
      ) {
        return getBenchAllocation(allocation);
      }

      return allocation;
    });
  }

  if (shouldPastePeople && copiedPersonIds.size) {
    allocations.forEach((allocation) => {
      if (allocation.periodId !== command.targetPeriodId || !copiedPersonIds.has(allocation.personId)) return;
      if (allocation.target !== 'bench') affectedTargetIds.add(allocation.target);
    });

    allocations = allocations.filter((allocation) => !(
      allocation.periodId === command.targetPeriodId && copiedPersonIds.has(allocation.personId)
    ));

    const peopleById = new Map(people.map((person) => [person.id, person]));
    const copiedAllocationsByPersonId = command.allocations.reduce((result, allocation) => {
      const current = result.get(allocation.personId) || [];
      current.push(allocation);
      result.set(allocation.personId, current);
      return result;
    }, new Map<string, MonthPlanAllocationCopy[]>());

    command.people.forEach((personCopy) => {
      const person = peopleById.get(personCopy.personId);
      if (!person) return;

      const copiedAllocations = copiedAllocationsByPersonId.get(person.id) || [];
      const nextPersonAllocations = getPastedPersonAllocations({
        copiedAllocations,
        copiedProjectIds,
        includeProjectTargets: shouldPasteAllocations,
        person,
        targetPeriodId: command.targetPeriodId,
      });
      nextPersonAllocations.forEach((allocation) => {
        if (allocation.target !== 'bench') affectedTargetIds.add(allocation.target);
      });
      allocations.push(...nextPersonAllocations);
    });
  }

  return normalizeAllocationSkillsAndValidation(
    {
      ...cloneSnapshot(snapshot),
      people,
      projects,
      allocations,
    },
    command.targetPeriodId,
    affectedTargetIds
  );
}

function getTargetRevenuePlan(
  project: ProjectFrame,
  projectCopy: MonthPlanProjectCopy,
  targetPeriodId: string
): MonthlyRevenuePlan {
  if (projectCopy.revenuePlan) {
    return {
      ...projectCopy.revenuePlan,
      periodId: targetPeriodId,
    };
  }

  return {
    periodId: targetPeriodId,
    revenueK: project.budgetK,
    probability: project.probability,
  };
}

function getPastedPersonAllocations({
  copiedAllocations,
  copiedProjectIds,
  includeProjectTargets,
  person,
  targetPeriodId,
}: {
  copiedAllocations: MonthPlanAllocationCopy[];
  copiedProjectIds: Set<string>;
  includeProjectTargets: boolean;
  person: Person;
  targetPeriodId: string;
}) {
  const targetTileCount = getPersonPeriodCostTileCount(person, targetPeriodId);
  const copiedByTileIndex = new Map(copiedAllocations.map((allocation) => [allocation.tileIndex, allocation]));

  return Array.from({ length: targetTileCount }, (_, tileIndex) => {
    const copiedAllocation = copiedByTileIndex.get(tileIndex);
    if (!copiedAllocation) {
      return {
        id: `${targetPeriodId}-${person.id}-${tileIndex}`,
        personId: person.id,
        tileIndex,
        target: 'bench',
        periodId: targetPeriodId,
        mode: 'revenue_first',
        revenueK: 1,
        hours: getPersonPeriodHoursPerTile(person, targetPeriodId),
      } satisfies PersonTileAllocation;
    }

    const target = includeProjectTargets && copiedProjectIds.has(copiedAllocation.target)
      ? copiedAllocation.target
      : 'bench';

    return {
      id: `${targetPeriodId}-${person.id}-${tileIndex}`,
      personId: person.id,
      tileIndex,
      target,
      previousTarget: includeProjectTargets && target === 'bench' && copiedAllocation.target !== 'bench'
        ? copiedAllocation.target
        : undefined,
      periodId: targetPeriodId,
      mode: copiedAllocation.mode,
      revenueK: copiedAllocation.revenueK,
      hours: copiedAllocation.hours,
      skillId: target === 'bench' ? undefined : copiedAllocation.skillId,
      requirementId: target === 'bench' ? undefined : copiedAllocation.requirementId,
      projectSlotIndex: target === 'bench' ? undefined : copiedAllocation.projectSlotIndex,
      hoursOverridden: copiedAllocation.hoursOverridden,
      revenueOverridden: copiedAllocation.revenueOverridden,
      meetingState: copiedAllocation.meetingState,
      validation: [],
    } satisfies PersonTileAllocation;
  });
}

function getBenchAllocation(allocation: PersonTileAllocation): PersonTileAllocation {
  return {
    ...allocation,
    target: 'bench',
    previousTarget: allocation.target !== 'bench' ? allocation.target : allocation.previousTarget,
    skillId: undefined,
    requirementId: undefined,
    projectSlotIndex: undefined,
    validation: [],
  };
}

function getVisibleProjectIdsForPeriod(
  projects: ProjectFrame[],
  allocations: PersonTileAllocation[],
  periodId: string
) {
  const allocatedProjectIds = new Set(
    allocations
      .filter((allocation) => allocation.periodId === periodId && allocation.target !== 'bench')
      .map((allocation) => allocation.target)
  );

  return new Set(projects
    .filter((project) => !project.archivedAt)
    .filter((project) => !(project.archivedPeriodIds || []).includes(periodId))
    .filter((project) => (
      project.startPeriodId === periodId ||
      project.revenuePlan.some((plan) => plan.periodId === periodId) ||
      allocatedProjectIds.has(project.id)
    ))
    .map((project) => project.id));
}

export function createNextMonthCommand(snapshot: TrafficSnapshot, activate = true): TrafficBoardCommand {
  const latestMonth = getLatestMonth(snapshot.periods);
  const latestDate = latestMonth
    ? new Date(`${latestMonth.startsOn}T00:00:00.000Z`)
    : new Date(`${DEFAULT_ACTIVE_PERIOD_ID}-01T00:00:00.000Z`);
  return {
    type: 'period.createMonth',
    periodId: createMonthPeriod(addUtcMonths(latestDate, 1)).id,
    activate,
  };
}

function normalizeAllocationSkillsAndValidation(
  snapshot: TrafficSnapshot,
  periodId?: string,
  targetIds?: Set<string>
): TrafficSnapshot {
  return revalidateTrafficSnapshotAllocations(mapUnassignedAllocationSkills(snapshot, periodId), periodId, targetIds);
}

function mapUnassignedAllocationSkills(snapshot: TrafficSnapshot, periodId?: string): TrafficSnapshot {
  const projectsById = new Map(snapshot.projects.map((project) => [project.id, project]));
  const allocations = snapshot.allocations.map((allocation) => ({ ...allocation }));

  allocations.forEach((allocation, index) => {
    if (periodId && allocation.periodId !== periodId) return;
    if (allocation.target === 'bench' || allocation.skillId || allocation.requirementId) return;

    const project = projectsById.get(allocation.target);
    const periodPeopleById = getPeopleByIdForPeriod(snapshot.people, allocation.periodId);
    const person = periodPeopleById.get(allocation.personId);
    const projectAllocations = allocations.filter((item) => (
      item.periodId === allocation.periodId &&
      item.target === allocation.target
    ));
    const suggestedRequirement = getSuggestedAllocationRequirement(
      allocation,
      project,
      person,
      projectAllocations,
      periodPeopleById
    );
    if (!suggestedRequirement) return;
    allocations[index] = {
      ...allocation,
      skillId: suggestedRequirement.skillId,
      requirementId: suggestedRequirement.id,
    };
  });

  return { ...cloneSnapshot(snapshot), allocations };
}

function revalidateTrafficSnapshotAllocations(
  snapshot: TrafficSnapshot,
  periodId?: string,
  targetIds?: Set<string>
): TrafficSnapshot {
  if (targetIds && targetIds.size === 0) return cloneSnapshot(snapshot);

  const projectsById = new Map(snapshot.projects.map((project) => [project.id, project]));
  const allocationsByProjectPeriod = snapshot.allocations.reduce((result, allocation) => {
    if (allocation.target === 'bench') return result;
    const key = `${allocation.periodId}:${allocation.target}`;
    const current = result.get(key) || [];
    current.push(allocation);
    result.set(key, current);
    return result;
  }, new Map<string, PersonTileAllocation[]>());

  return {
    ...cloneSnapshot(snapshot),
    allocations: snapshot.allocations.map((allocation) => {
      if (periodId && allocation.periodId !== periodId) return allocation;
      if (targetIds?.size && !targetIds.has(allocation.target)) return allocation;

      const project = projectsById.get(allocation.target);
      const peopleById = getPeopleByIdForPeriod(snapshot.people, allocation.periodId);
      const person = peopleById.get(allocation.personId);
      const projectAllocations = allocationsByProjectPeriod.get(`${allocation.periodId}:${allocation.target}`) || [];
      return {
        ...allocation,
        validation: validateAllocation(allocation, person, project, projectAllocations, peopleById, snapshot.planningRules || []),
      };
    }),
  };
}

function getCurrentAndFutureMonthPeriods(periods: TrafficSnapshot['periods'], activePeriodId: string) {
  const activePeriod = periods.find((period) => period.id === activePeriodId && period.granularity === 'month');
  if (!activePeriod) return [];

  return periods.filter((period) => (
    period.granularity === 'month' &&
    period.startsOn >= activePeriod.startsOn
  ));
}

function getPeopleByIdForPeriod(people: Person[], periodId: string) {
  return new Map(people.map((person) => [person.id, getPersonPeriodProfile(person, periodId)]));
}

function replaceById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  return items.map((item) => (item.id === nextItem.id ? nextItem : item));
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  return items.some((item) => item.id === nextItem.id)
    ? replaceById(items, nextItem)
    : [...items, nextItem];
}

function cloneSnapshot(snapshot: TrafficSnapshot): TrafficSnapshot {
  return structuredClone(snapshot) as TrafficSnapshot;
}
