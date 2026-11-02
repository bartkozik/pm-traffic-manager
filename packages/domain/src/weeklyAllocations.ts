import { getSuggestedAllocationRequirement } from './allocationSkills.js';
import { moveTrafficAllocations, type MoveTrafficAllocation } from './allocationMutations.js';
import {
  AllocationTarget,
  MoneyK,
  Period,
  Person,
  PersonTileAllocation,
  ProjectFrame,
  SkillId,
  TrafficSnapshot,
  WeeklyAllocation,
} from './traffic.model.js';
import {
  getPersonPeriodAvailableHours,
  getPersonPeriodCostK,
  getPersonPeriodProfile,
} from './personPeriod.js';

export const WEEKLY_SLOT_HOURS = 8;

export interface BusinessWeekSlice {
  id: string;
  workingDays: number;
}

export interface MoveWeeklyAllocation {
  personId: string;
  slotIndex: number;
  target: AllocationTarget;
  projectSlotIndex?: number;
  requirementId?: string;
  skipRequirementSuggestion?: boolean;
}

export interface SyncWeeklyAllocationsFromMonthlyOptions {
  preserveManual?: boolean;
}

export function getWeeklyAllocationId(monthPeriodId: string, personId: string, slotIndex: number) {
  return `weekly:${monthPeriodId}:${personId}:${slotIndex}`;
}

export function getWeeklySlotWeekId(weekSlices: BusinessWeekSlice[], slotCount: number, slotIndex: number) {
  return getWeekIdBySlotIndex(weekSlices, slotCount)[slotIndex] || null;
}

export function getPersonWeeklySlotCount(person: Person, monthPeriodId: string) {
  const availableHours = Math.max(0, getPersonPeriodAvailableHours(person, monthPeriodId));
  return availableHours > 0 ? Math.ceil(availableHours / WEEKLY_SLOT_HOURS) : 0;
}

export function getPersonWeeklySlotHours(person: Person, monthPeriodId: string, slotIndex: number) {
  const availableHours = Math.max(0, getPersonPeriodAvailableHours(person, monthPeriodId));
  const usedBeforeSlot = Math.max(0, slotIndex) * WEEKLY_SLOT_HOURS;
  return Math.max(0, Math.min(WEEKLY_SLOT_HOURS, availableHours - usedBeforeSlot));
}

export function getPersonWeeklySlotCostK(person: Person, monthPeriodId: string) {
  const slotCount = getPersonWeeklySlotCount(person, monthPeriodId);
  if (slotCount <= 0) return 0;
  return roundMoneyK(getPersonPeriodCostK(person, monthPeriodId) / slotCount);
}

export function getProjectMonthPlannedRevenueK(project: ProjectFrame, monthPeriodId: string) {
  return project.revenuePlan.find((entry) => entry.periodId === monthPeriodId)?.revenueK ?? project.budgetK;
}

export function getProjectMonthRevenueKWithWeeklyPlan(project: ProjectFrame, monthPeriodId: string) {
  const monthRevenueK = getProjectMonthPlannedRevenueK(project, monthPeriodId);
  const weeklyRevenueK = (project.weeklyRevenuePlan || [])
    .filter((entry) => entry.monthPeriodId === monthPeriodId)
    .reduce((sum, entry) => sum + entry.revenueK, 0);

  return weeklyRevenueK > monthRevenueK ? roundMoneyK(weeklyRevenueK) : monthRevenueK;
}

export function getProjectWeekRevenueK(
  project: ProjectFrame,
  monthPeriod: Pick<Period, 'id' | 'startsOn' | 'endsOn'>,
  week: BusinessWeekSlice,
  monthWorkingDays = getBusinessDayCount(monthPeriod.startsOn, monthPeriod.endsOn)
) {
  const weeklyOverride = project.weeklyRevenuePlan?.find((entry) => (
    entry.monthPeriodId === monthPeriod.id &&
    entry.weekPeriodId === week.id
  ));
  if (weeklyOverride) return weeklyOverride.revenueK;
  if (monthWorkingDays <= 0) return 0;

  return roundMoneyK(getProjectMonthPlannedRevenueK(project, monthPeriod.id) * (week.workingDays / monthWorkingDays));
}

export function getWeeklyAllocationRevenueK(
  project: ProjectFrame | undefined,
  hours: number,
  skillId?: SkillId
) {
  if (!project || hours <= 0) return 0;
  const ratePlnH = getProjectRevenueRatePlnH(project, skillId);
  return roundMoneyK((hours * ratePlnH) / 1000);
}

export function moveWeeklyAllocations(
  snapshot: TrafficSnapshot,
  monthPeriodId: string,
  weekPeriodId: string,
  moves: MoveWeeklyAllocation[]
): TrafficSnapshot {
  if (!moves.length) return cloneSnapshot(snapshot);

  const affectedPersonIds = new Set(moves.map((move) => move.personId));
  const seededSnapshot = ensureWeeklyAllocationsFromMonthly(snapshot, monthPeriodId, affectedPersonIds);
  const peopleById = new Map(seededSnapshot.people.map((person) => [person.id, getPersonPeriodProfile(person, monthPeriodId)]));
  const projectsById = new Map(seededSnapshot.projects.map((project) => [project.id, project]));
  const weeklyAllocations = (seededSnapshot.weeklyAllocations || []).map((allocation) => ({ ...allocation }));
  const weeklyAllocationsById = new Map(weeklyAllocations.map((allocation) => [allocation.id, allocation]));

  moves.forEach((move) => {
    const allocationId = getWeeklyAllocationId(monthPeriodId, move.personId, move.slotIndex);

    const person = peopleById.get(move.personId);
    if (!person) return;

    const slotHours = getPersonWeeklySlotHours(person, monthPeriodId, move.slotIndex);
    if (slotHours <= 0) return;

    if (move.target === 'bench') {
      weeklyAllocationsById.set(allocationId, {
        id: allocationId,
        monthPeriodId,
        weekPeriodId,
        personId: move.personId,
        slotIndex: move.slotIndex,
        source: 'manual',
        target: 'bench',
        mode: 'hours_first',
        costK: getPersonWeeklySlotCostK(person, monthPeriodId),
        revenueK: 0,
        hours: slotHours,
        validation: [],
      });
      return;
    }

    const project = projectsById.get(move.target);
    const projectAllocations = Array.from(weeklyAllocationsById.values())
      .filter((allocation) => (
        allocation.id !== allocationId &&
        allocation.monthPeriodId === monthPeriodId &&
        allocation.weekPeriodId === weekPeriodId &&
        allocation.target === move.target
      ))
      .map(weeklyAllocationToPersonTileAllocation);
    const draftAllocation = {
      id: allocationId,
      personId: move.personId,
      tileIndex: move.slotIndex,
      target: move.target,
      periodId: monthPeriodId,
      mode: 'hours_first',
      revenueK: 0,
      hours: slotHours,
      projectSlotIndex: move.projectSlotIndex,
    } satisfies PersonTileAllocation;
    const explicitRequirement = project?.requirements.find((requirement) => requirement.id === move.requirementId);
    const suggestedRequirement = explicitRequirement || (
      move.skipRequirementSuggestion
        ? undefined
        : getSuggestedAllocationRequirement(draftAllocation, project, person, projectAllocations, peopleById)
    );
    const skillId = suggestedRequirement?.skillId || weeklyAllocationsById.get(allocationId)?.skillId || person.skillIds[0];

    clearConflictingWeeklyProjectSlot(
      weeklyAllocationsById,
      allocationId,
      monthPeriodId,
      weekPeriodId,
      move.target,
      move.projectSlotIndex
    );

    weeklyAllocationsById.set(allocationId, {
      id: allocationId,
      monthPeriodId,
      weekPeriodId,
      personId: move.personId,
      slotIndex: move.slotIndex,
      source: 'manual',
      target: move.target,
      mode: 'hours_first',
      costK: getPersonWeeklySlotCostK(person, monthPeriodId),
      revenueK: getWeeklyAllocationRevenueK(project, slotHours, skillId),
      hours: slotHours,
      skillId,
      requirementId: suggestedRequirement?.id,
      projectSlotIndex: move.projectSlotIndex,
      validation: [],
    });
  });

  const nextSnapshot = {
    ...cloneSnapshot(seededSnapshot),
    weeklyAllocations: Array.from(weeklyAllocationsById.values())
      .sort((first, second) => (
        first.monthPeriodId.localeCompare(second.monthPeriodId) ||
        first.personId.localeCompare(second.personId) ||
        first.slotIndex - second.slotIndex
      )),
  };

  return syncMonthlyAllocationsFromWeekly(nextSnapshot, monthPeriodId, affectedPersonIds);
}

export function updateProjectWeeklyRevenuePlan(
  snapshot: TrafficSnapshot,
  projectId: string,
  monthPeriodId: string,
  weekPeriodId: string,
  revenueK: MoneyK
): TrafficSnapshot {
  const monthPeriod = snapshot.periods.find((period) => period.id === monthPeriodId && period.granularity === 'month');
  const weekSlices = monthPeriod ? getBusinessWeekSlices(snapshot, monthPeriod) : [];
  const projects = snapshot.projects.map((project) => {
    if (project.id !== projectId) return project;

    return {
      ...project,
      weeklyRevenuePlan: rebalanceProjectWeeklyRevenuePlan(project, monthPeriodId, weekPeriodId, revenueK, weekSlices),
    };
  });

  return {
    ...cloneSnapshot(snapshot),
    projects,
  };
}

function rebalanceProjectWeeklyRevenuePlan(
  project: ProjectFrame,
  monthPeriodId: string,
  editedWeekPeriodId: string,
  editedRevenueK: MoneyK,
  weekSlices: BusinessWeekSlice[]
) {
  const weeklyPlansOutsideMonth = (project.weeklyRevenuePlan || []).filter((entry) => (
    entry.monthPeriodId !== monthPeriodId
  ));
  if (!weekSlices.length || !weekSlices.some((week) => week.id === editedWeekPeriodId)) {
    return [
      ...weeklyPlansOutsideMonth,
      {
        monthPeriodId,
        weekPeriodId: editedWeekPeriodId,
        revenueK: roundMoneyK(Math.max(0, editedRevenueK)),
        source: 'manual' as const,
      },
    ].sort(compareWeeklyRevenuePlans);
  }

  const weekIds = new Set(weekSlices.map((week) => week.id));
  const manualEntries = new Map<string, { monthPeriodId: string; weekPeriodId: string; revenueK: MoneyK; source: 'manual' }>();
  (project.weeklyRevenuePlan || [])
    .filter((entry) => (
      entry.monthPeriodId === monthPeriodId &&
      weekIds.has(entry.weekPeriodId) &&
      entry.weekPeriodId !== editedWeekPeriodId &&
      entry.source !== 'balanced'
    ))
    .forEach((entry) => {
      manualEntries.set(entry.weekPeriodId, {
        monthPeriodId,
        weekPeriodId: entry.weekPeriodId,
        revenueK: roundMoneyK(Math.max(0, entry.revenueK)),
        source: 'manual',
      });
    });

  manualEntries.set(editedWeekPeriodId, {
    monthPeriodId,
    weekPeriodId: editedWeekPeriodId,
    revenueK: roundMoneyK(Math.max(0, editedRevenueK)),
    source: 'manual',
  });

  const monthlyRevenueK = getProjectMonthPlannedRevenueK(project, monthPeriodId);
  const manualRevenueK = Array.from(manualEntries.values()).reduce((sum, entry) => sum + entry.revenueK, 0);
  const balancedWeeks = weekSlices.filter((week) => !manualEntries.has(week.id));
  const balancedRevenueK = apportionMoneyK(
    Math.max(0, monthlyRevenueK - manualRevenueK),
    balancedWeeks.map((week) => week.workingDays)
  );
  const balancedEntries = balancedWeeks.map((week, index) => ({
    monthPeriodId,
    weekPeriodId: week.id,
    revenueK: balancedRevenueK[index] || 0,
    source: 'balanced' as const,
  }));

  return [
    ...weeklyPlansOutsideMonth,
    ...Array.from(manualEntries.values()),
    ...balancedEntries,
  ].sort(compareWeeklyRevenuePlans);
}

export function ensureWeeklyAllocationsFromMonthly(
  snapshot: TrafficSnapshot,
  monthPeriodId: string,
  personIds?: Iterable<string>
): TrafficSnapshot {
  const requestedPersonIds = personIds ? new Set(personIds) : undefined;
  const existingWeeklyPersonIds = new Set(
    (snapshot.weeklyAllocations || [])
      .filter((allocation) => (
        allocation.monthPeriodId === monthPeriodId &&
        (!requestedPersonIds || requestedPersonIds.has(allocation.personId))
      ))
      .map((allocation) => allocation.personId)
  );
  const monthlyAllocatedPersonIds = new Set(
    snapshot.allocations
      .filter((allocation) => (
        allocation.periodId === monthPeriodId &&
        allocation.target !== 'bench' &&
        (!requestedPersonIds || requestedPersonIds.has(allocation.personId))
      ))
      .map((allocation) => allocation.personId)
  );
  const personIdsToSeed = Array.from(monthlyAllocatedPersonIds)
    .filter((personId) => !existingWeeklyPersonIds.has(personId));

  if (!personIdsToSeed.length) return cloneSnapshot(snapshot);
  return syncWeeklyAllocationsFromMonthly(snapshot, monthPeriodId, personIdsToSeed);
}

export function syncWeeklyAllocationsFromMonthly(
  snapshot: TrafficSnapshot,
  monthPeriodId: string,
  personIds?: Iterable<string>,
  options: SyncWeeklyAllocationsFromMonthlyOptions = {}
): TrafficSnapshot {
  const monthPeriod = snapshot.periods.find((period) => period.id === monthPeriodId && period.granularity === 'month');
  if (!monthPeriod) return cloneSnapshot(snapshot);

  const affectedPersonIds = new Set(personIds || snapshot.allocations
    .filter((allocation) => allocation.periodId === monthPeriodId)
    .map((allocation) => allocation.personId));
  if (!affectedPersonIds.size) return cloneSnapshot(snapshot);

  const weekSlices = getBusinessWeekSlices(snapshot, monthPeriod);
  if (!weekSlices.length) return cloneSnapshot(snapshot);

  const peopleById = new Map(snapshot.people.map((person) => [person.id, getPersonPeriodProfile(person, monthPeriodId)]));
  const projectsById = new Map(snapshot.projects.map((project) => [project.id, project]));
  const preserveManual = options.preserveManual !== false;
  const preservedWeeklyAllocations = (snapshot.weeklyAllocations || []).filter((allocation) => (
    allocation.monthPeriodId !== monthPeriodId ||
    !affectedPersonIds.has(allocation.personId) ||
    (preserveManual && allocation.source === 'manual')
  ));
  const manualWeeklyAllocationIds = new Set(
    preservedWeeklyAllocations
      .filter((allocation) => (
        preserveManual &&
        allocation.monthPeriodId === monthPeriodId &&
        affectedPersonIds.has(allocation.personId) &&
        allocation.source === 'manual'
      ))
      .map((allocation) => allocation.id)
  );
  const weeklyAllocationsById = new Map(preservedWeeklyAllocations.map((allocation) => [allocation.id, { ...allocation }]));
  const nextProjectSlotIndexByTarget = getNextProjectSlotIndexByTarget(preservedWeeklyAllocations, monthPeriodId);

  Array.from(affectedPersonIds).sort().forEach((personId) => {
    const person = peopleById.get(personId);
    if (!person) return;

    const personMonthlyAllocations = snapshot.allocations
      .filter((allocation) => allocation.periodId === monthPeriodId && allocation.personId === personId)
      .sort((first, second) => first.tileIndex - second.tileIndex);
    const monthlyTileCount = personMonthlyAllocations.length;
    const weeklySlotCount = getPersonWeeklySlotCount(person, monthPeriodId);
    const weekIdBySlotIndex = getWeekIdBySlotIndex(weekSlices, weeklySlotCount);
    if (!monthlyTileCount || !weeklySlotCount || !weekIdBySlotIndex.length) return;

    const monthlyBuckets = getMonthlyAllocationBuckets(personMonthlyAllocations);
    if (!monthlyBuckets.length) return;

    const totalAssignedMonthlyTiles = monthlyBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
    const desiredAssignedSlotCount = Math.min(
      weeklySlotCount,
      Math.round((totalAssignedMonthlyTiles / monthlyTileCount) * weeklySlotCount)
    );
    if (desiredAssignedSlotCount <= 0) return;

    const manualAssignedCountByBucket = getManualAssignedCountByBucket(
      preservedWeeklyAllocations,
      monthPeriodId,
      personId
    );
    const availableSlotIndexes = Array.from({ length: weeklySlotCount }, (_, slotIndex) => slotIndex)
      .filter((slotIndex) => !manualWeeklyAllocationIds.has(getWeeklyAllocationId(monthPeriodId, personId, slotIndex)));
    if (!availableSlotIndexes.length) return;

    let remainingBucketCounts = apportionInteger(
      desiredAssignedSlotCount,
      monthlyBuckets.map((bucket) => bucket.count)
    ).map((desiredCount, index) => Math.max(
      0,
      desiredCount - (manualAssignedCountByBucket.get(monthlyBuckets[index].key) || 0)
    ));
    const totalRemainingCount = remainingBucketCounts.reduce((sum, count) => sum + count, 0);
    if (totalRemainingCount > availableSlotIndexes.length) {
      remainingBucketCounts = apportionInteger(availableSlotIndexes.length, remainingBucketCounts);
    }

    const baselineBuckets = interleaveMonthlyBuckets(monthlyBuckets, remainingBucketCounts);
    const baselineSlotIndexes = pickEvenlyDistributedSlotIndexes(availableSlotIndexes, baselineBuckets.length);

    baselineSlotIndexes.forEach((slotIndex, index) => {
      const monthlyAllocation = baselineBuckets[index]?.allocation;
      if (!monthlyAllocation) return;
      const slotHours = getPersonWeeklySlotHours(person, monthPeriodId, slotIndex);
      if (slotHours <= 0) return;

      const target = monthlyAllocation.target;
      const weekPeriodId = weekIdBySlotIndex[slotIndex] || weekSlices[0].id;
      const project = projectsById.get(target);
      const allocationId = getWeeklyAllocationId(monthPeriodId, personId, slotIndex);
      if (manualWeeklyAllocationIds.has(allocationId)) return;

      const explicitRequirement = project?.requirements.find((requirement) => requirement.id === monthlyAllocation.requirementId);
      const suggestedRequirement = explicitRequirement || getSuggestedAllocationRequirement(
        {
          ...monthlyAllocation,
          id: allocationId,
          tileIndex: slotIndex,
          mode: 'hours_first',
          hours: slotHours,
          revenueK: 0,
        },
        project,
        person,
        Array.from(weeklyAllocationsById.values())
          .filter((allocation) => allocation.weekPeriodId === weekPeriodId && allocation.target === target)
          .map(weeklyAllocationToPersonTileAllocation),
        peopleById
      );
      const skillId = suggestedRequirement?.skillId || monthlyAllocation.skillId || person.skillIds[0];

      weeklyAllocationsById.set(allocationId, {
        id: allocationId,
        monthPeriodId,
        weekPeriodId,
        personId,
        slotIndex,
        source: 'baseline',
        target,
        mode: 'hours_first',
        costK: getPersonWeeklySlotCostK(person, monthPeriodId),
        revenueK: getWeeklyAllocationRevenueK(project, slotHours, skillId),
        hours: slotHours,
        skillId,
        requirementId: suggestedRequirement?.id || monthlyAllocation.requirementId,
        projectSlotIndex: getNextProjectSlotIndex(nextProjectSlotIndexByTarget, monthPeriodId, weekPeriodId, target),
        validation: [],
      });
    });
  });

  return {
    ...cloneSnapshot(snapshot),
    weeklyAllocations: sortWeeklyAllocations(Array.from(weeklyAllocationsById.values())),
  };
}

export function syncMonthlyAllocationsFromWeekly(
  snapshot: TrafficSnapshot,
  monthPeriodId: string,
  personIds?: Iterable<string>
): TrafficSnapshot {
  const affectedPersonIds = new Set(personIds || (snapshot.weeklyAllocations || [])
    .filter((allocation) => allocation.monthPeriodId === monthPeriodId)
    .map((allocation) => allocation.personId));
  if (!affectedPersonIds.size) return cloneSnapshot(snapshot);

  const peopleById = new Map(snapshot.people.map((person) => [person.id, getPersonPeriodProfile(person, monthPeriodId)]));
  let nextSnapshot = cloneSnapshot(snapshot);

  Array.from(affectedPersonIds).sort().forEach((personId) => {
    const person = peopleById.get(personId);
    if (!person) return;

    const personMonthlyAllocations = nextSnapshot.allocations
      .filter((allocation) => allocation.periodId === monthPeriodId && allocation.personId === personId)
      .sort((first, second) => first.tileIndex - second.tileIndex);
    const monthlyTileCount = personMonthlyAllocations.length;
    const weeklySlotCount = getPersonWeeklySlotCount(person, monthPeriodId);
    if (!monthlyTileCount || !weeklySlotCount) return;

    const weeklyBuckets = new Map<string, WeeklyMonthlyBucket>();
    (nextSnapshot.weeklyAllocations || [])
      .filter((allocation) => (
        allocation.monthPeriodId === monthPeriodId &&
        allocation.personId === personId &&
        allocation.target !== 'bench'
      ))
      .forEach((allocation) => {
        const bucketKey = `${allocation.target}:${allocation.requirementId || ''}`;
        const existingBucket = weeklyBuckets.get(bucketKey);
        if (existingBucket) {
          existingBucket.costK += allocation.costK || 0;
          existingBucket.hours += allocation.hours || 0;
          existingBucket.firstSlotIndex = Math.min(existingBucket.firstSlotIndex, allocation.slotIndex);
          return;
        }
        weeklyBuckets.set(bucketKey, {
          target: allocation.target,
          requirementId: allocation.requirementId,
          costK: allocation.costK || 0,
          hours: allocation.hours || 0,
          firstSlotIndex: allocation.slotIndex,
        });
      });

    const targetBuckets = Array.from(weeklyBuckets.values())
      .filter((bucket) => bucket.costK > 0 || bucket.hours > 0)
      .sort((first, second) => (
        first.firstSlotIndex - second.firstSlotIndex ||
        first.target.localeCompare(second.target)
      ));
    const totalAssignedCostK = targetBuckets.reduce((sum, bucket) => sum + bucket.costK, 0);
    const monthlyTileCostK = monthlyTileCount > 0
      ? Math.max(0.1, getPersonPeriodCostK(person, monthPeriodId) / monthlyTileCount)
      : 1;
    const assignedMonthlyTileCount = totalAssignedCostK > 0
      ? Math.min(monthlyTileCount, Math.max(1, Math.round(totalAssignedCostK / monthlyTileCostK)))
      : 0;
    const monthlyTargetBuckets = apportionInteger(
      assignedMonthlyTileCount,
      targetBuckets.map((bucket) => bucket.costK || bucket.hours)
    )
      .flatMap((count, index) => Array.from({ length: count }, () => targetBuckets[index]))
      .filter((bucket): bucket is WeeklyMonthlyBucket => Boolean(bucket));

    const moves: MoveTrafficAllocation[] = personMonthlyAllocations.map((allocation) => {
      const selectedBucket = monthlyTargetBuckets[allocation.tileIndex];
      return {
        tileId: allocation.id,
        target: selectedBucket?.target || 'bench',
        ...(selectedBucket?.requirementId ? { requirementId: selectedBucket.requirementId } : {}),
      };
    });

    nextSnapshot = moveTrafficAllocations(nextSnapshot, moves, monthPeriodId);
  });

  return nextSnapshot;
}

export function weeklyAllocationToPersonTileAllocation(allocation: WeeklyAllocation): PersonTileAllocation {
  return {
    id: allocation.id,
    personId: allocation.personId,
    tileIndex: allocation.slotIndex,
    target: allocation.target,
    periodId: allocation.monthPeriodId,
    mode: allocation.mode,
    revenueK: allocation.revenueK,
    hours: allocation.hours,
    skillId: allocation.skillId,
    requirementId: allocation.requirementId,
    projectSlotIndex: allocation.projectSlotIndex,
    validation: allocation.validation,
  };
}

interface WeeklyMonthlyBucket {
  target: string;
  requirementId?: string;
  costK: number;
  hours: number;
  firstSlotIndex: number;
}

interface MonthlyAllocationBucket {
  key: string;
  target: string;
  requirementId?: string;
  count: number;
  allocation: PersonTileAllocation;
}

function getMonthlyAllocationBuckets(monthlyAllocations: PersonTileAllocation[]): MonthlyAllocationBucket[] {
  const buckets = new Map<string, MonthlyAllocationBucket>();

  monthlyAllocations
    .filter((allocation) => allocation.target !== 'bench')
    .forEach((allocation) => {
      const key = getMonthlyAllocationBucketKey(allocation.target, allocation.requirementId);
      const existingBucket = buckets.get(key);
      if (existingBucket) {
        existingBucket.count += 1;
        return;
      }
      buckets.set(key, {
        key,
        target: allocation.target,
        requirementId: allocation.requirementId,
        count: 1,
        allocation,
      });
    });

  return Array.from(buckets.values());
}

function getManualAssignedCountByBucket(
  weeklyAllocations: WeeklyAllocation[],
  monthPeriodId: string,
  personId: string
) {
  const result = new Map<string, number>();

  weeklyAllocations
    .filter((allocation) => (
      allocation.monthPeriodId === monthPeriodId &&
      allocation.personId === personId &&
      allocation.source === 'manual' &&
      allocation.target !== 'bench'
    ))
    .forEach((allocation) => {
      const key = getMonthlyAllocationBucketKey(allocation.target, allocation.requirementId);
      result.set(key, (result.get(key) || 0) + 1);
    });

  return result;
}

function getMonthlyAllocationBucketKey(target: string, requirementId?: string) {
  return `${target}:${requirementId || ''}`;
}

function interleaveMonthlyBuckets(
  buckets: MonthlyAllocationBucket[],
  counts: number[]
): MonthlyAllocationBucket[] {
  return buckets
    .flatMap((bucket, bucketIndex) => (
      Array.from({ length: counts[bucketIndex] || 0 }, (_, itemIndex) => ({
        bucket,
        bucketIndex,
        order: ((itemIndex + 0.5) / Math.max(1, counts[bucketIndex] || 1)),
      }))
    ))
    .sort((first, second) => first.order - second.order || first.bucketIndex - second.bucketIndex)
    .map((item) => item.bucket);
}

function pickEvenlyDistributedSlotIndexes(availableSlotIndexes: number[], count: number) {
  if (count <= 0) return [];
  if (count >= availableSlotIndexes.length) return availableSlotIndexes;
  if (count === 1) return [availableSlotIndexes[0]];

  return Array.from({ length: count }, (_, index) => {
    const availableIndex = Math.round((index * (availableSlotIndexes.length - 1)) / (count - 1));
    return availableSlotIndexes[availableIndex];
  });
}

export function getBusinessDayCount(startsOn: string, endsOn: string) {
  const start = new Date(`${startsOn}T00:00:00.000Z`);
  const end = new Date(`${endsOn}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const weekday = cursor.getUTCDay();
    if (weekday >= 1 && weekday <= 5) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function getBusinessWeekSlices(snapshot: TrafficSnapshot, monthPeriod: Period): BusinessWeekSlice[] {
  const monthWeeks = snapshot.periods
    .filter((period) => period.granularity === 'week' && period.parentPeriodId === monthPeriod.id)
    .sort((first, second) => first.startsOn.localeCompare(second.startsOn))
    .map((period) => ({
      id: period.id,
      workingDays: getBusinessDayCount(
        period.startsOn < monthPeriod.startsOn ? monthPeriod.startsOn : period.startsOn,
        period.endsOn > monthPeriod.endsOn ? monthPeriod.endsOn : period.endsOn
      ),
    }))
    .filter((week) => week.workingDays > 0);

  if (monthWeeks.length) return monthWeeks;

  return [{
    id: `${monthPeriod.id}-w1`,
    workingDays: getBusinessDayCount(monthPeriod.startsOn, monthPeriod.endsOn),
  }].filter((week) => week.workingDays > 0);
}

function getWeekIdBySlotIndex(weekSlices: BusinessWeekSlice[], slotCount: number) {
  const slotCounts = apportionInteger(slotCount, weekSlices.map((week) => week.workingDays));
  return weekSlices.flatMap((week, index) => Array.from({ length: slotCounts[index] }, () => week.id));
}

function apportionInteger(total: number, weights: number[]) {
  if (total <= 0) return weights.map(() => 0);
  const weightSum = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (weightSum <= 0) {
    return weights.map((_, index) => (index === 0 ? total : 0));
  }

  const rawShares = weights.map((weight) => (Math.max(0, weight) / weightSum) * total);
  const counts = rawShares.map(Math.floor);
  let remaining = total - counts.reduce((sum, count) => sum + count, 0);
  const remainders = rawShares
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((first, second) => second.remainder - first.remainder || first.index - second.index);

  remainders.forEach(({ index }) => {
    if (remaining <= 0) return;
    counts[index] += 1;
    remaining -= 1;
  });

  return counts;
}

function apportionMoneyK(totalK: MoneyK, weights: number[]) {
  return apportionInteger(Math.round(Math.max(0, totalK) * 10), weights).map((tenths) => tenths / 10);
}

function compareWeeklyRevenuePlans(
  first: { monthPeriodId: string; weekPeriodId: string },
  second: { monthPeriodId: string; weekPeriodId: string }
) {
  return (
    first.monthPeriodId.localeCompare(second.monthPeriodId) ||
    first.weekPeriodId.localeCompare(second.weekPeriodId)
  );
}

function getNextProjectSlotIndexByTarget(weeklyAllocations: WeeklyAllocation[], monthPeriodId: string) {
  const result = new Map<string, number>();
  weeklyAllocations.forEach((allocation) => {
    if (
      allocation.monthPeriodId !== monthPeriodId ||
      allocation.target === 'bench' ||
      typeof allocation.projectSlotIndex !== 'number'
    ) {
      return;
    }
    const key = getProjectSlotIndexKey(monthPeriodId, allocation.weekPeriodId, allocation.target);
    result.set(key, Math.max(result.get(key) || 0, allocation.projectSlotIndex + 1));
  });
  return result;
}

function getNextProjectSlotIndex(
  nextProjectSlotIndexByTarget: Map<string, number>,
  monthPeriodId: string,
  weekPeriodId: string,
  target: string
) {
  const key = getProjectSlotIndexKey(monthPeriodId, weekPeriodId, target);
  const nextIndex = nextProjectSlotIndexByTarget.get(key) || 0;
  nextProjectSlotIndexByTarget.set(key, nextIndex + 1);
  return nextIndex;
}

function getProjectSlotIndexKey(monthPeriodId: string, weekPeriodId: string, target: string) {
  return `${monthPeriodId}:${weekPeriodId}:${target}`;
}

function sortWeeklyAllocations(weeklyAllocations: WeeklyAllocation[]) {
  return weeklyAllocations.sort((first, second) => (
    first.monthPeriodId.localeCompare(second.monthPeriodId) ||
    first.weekPeriodId.localeCompare(second.weekPeriodId) ||
    first.personId.localeCompare(second.personId) ||
    first.slotIndex - second.slotIndex
  ));
}

function clearConflictingWeeklyProjectSlot(
  allocationsById: Map<string, WeeklyAllocation>,
  movedAllocationId: string,
  monthPeriodId: string,
  weekPeriodId: string,
  target: string,
  projectSlotIndex: number | undefined
) {
  if (typeof projectSlotIndex !== 'number') return;

  allocationsById.forEach((allocation, allocationId) => {
    if (
      allocationId === movedAllocationId ||
      allocation.monthPeriodId !== monthPeriodId ||
      allocation.weekPeriodId !== weekPeriodId ||
      allocation.target !== target ||
      allocation.projectSlotIndex !== projectSlotIndex
    ) {
      return;
    }

    allocationsById.set(allocationId, {
      ...allocation,
      projectSlotIndex: undefined,
    });
  });
}

function getProjectRevenueRatePlnH(project: ProjectFrame, skillId?: SkillId) {
  if (skillId && typeof project.rateConfig.skillRatesPlnH?.[skillId] === 'number') {
    return project.rateConfig.skillRatesPlnH[skillId] as number;
  }
  return project.rateConfig.projectRatePlnH || project.rateConfig.companyTargetRatePlnH;
}

function roundMoneyK(value: number) {
  return Math.round(value * 10) / 10;
}

function cloneSnapshot(snapshot: TrafficSnapshot): TrafficSnapshot {
  return structuredClone(snapshot) as TrafficSnapshot;
}
