import {
  getPersonPeriodProfile,
  getPersonWeeklySlotCostK,
  getPersonWeeklySlotCount,
  getPersonWeeklySlotHours,
  getProjectWeekRevenueK,
  getWeeklyAllocationId,
  ensureWeeklyAllocationsFromMonthly,
  weeklyAllocationToPersonTileAllocation,
  type Period,
  type Person,
  type PersonTileAllocation,
  type ProjectFrame,
  type TrafficSnapshot,
  type WeeklyAllocation,
} from '../models/traffic.model';

export const WEEKLY_FREE_SLOT_PREFIX = 'weekly-free:';

export interface WeeklyCanvasWeek {
  id: string;
  workingDays: number;
}

export interface WeeklyCanvasState {
  benchAllocations: PersonTileAllocation[];
  periodAllocations: PersonTileAllocation[];
  projects: ProjectFrame[];
  projectsById: Map<string, ProjectFrame>;
}

export interface ParsedWeeklyTileId {
  monthPeriodId: string;
  personId: string;
  slotIndex: number;
}

export function buildWeeklyCanvasState({
  activePeople,
  activePeriod,
  activeWeek,
  monthWorkingDays,
  visibleProjects,
  weeklyAllocations,
  weeklyProjectCapacityKById,
}: {
  activePeople: Person[];
  activePeriod: Period;
  activeWeek: WeeklyCanvasWeek;
  monthWorkingDays: number;
  visibleProjects: ProjectFrame[];
  weeklyAllocations: WeeklyAllocation[];
  weeklyProjectCapacityKById?: Map<string, number>;
}): WeeklyCanvasState {
  const assignedSlotIds = new Set(
    weeklyAllocations
      .filter((allocation) => (
        allocation.monthPeriodId === activePeriod.id &&
        allocation.target !== 'bench'
      ))
      .map((allocation) => allocation.id)
  );
  const scheduledAllocations = weeklyAllocations
    .filter((allocation) => (
      allocation.monthPeriodId === activePeriod.id &&
      allocation.weekPeriodId === activeWeek.id &&
      allocation.target !== 'bench'
    ))
    .map(weeklyAllocationToPersonTileAllocation);
  const benchSlotAllocations = activePeople.flatMap((person) => (
    createPersonWeeklyBenchSlots(person, activePeriod, assignedSlotIds)
  ));
  const weekShare = monthWorkingDays > 0 ? activeWeek.workingDays / monthWorkingDays : 0;
  const weeklyProjects = visibleProjects.map((project) => createWeeklyProjectView(
    project,
    activePeriod,
    activeWeek,
    monthWorkingDays,
    weekShare,
    weeklyProjectCapacityKById
  ));
  const periodAllocations = [...benchSlotAllocations, ...scheduledAllocations];

  return {
    benchAllocations: benchSlotAllocations,
    periodAllocations,
    projects: weeklyProjects,
    projectsById: new Map(weeklyProjects.map((project) => [project.id, project])),
  };
}

export function getEffectiveWeeklyAllocations(snapshot: TrafficSnapshot, monthPeriodId: string) {
  return ensureWeeklyAllocationsFromMonthly(snapshot, monthPeriodId).weeklyAllocations || [];
}

export function getWeeklyFreeSlotId(monthPeriodId: string, personId: string, slotIndex: number) {
  return `${WEEKLY_FREE_SLOT_PREFIX}${monthPeriodId}:${personId}:${slotIndex}`;
}

export function parseWeeklyTileId(tileId: string): ParsedWeeklyTileId | null {
  const isFreeSlot = tileId.startsWith(WEEKLY_FREE_SLOT_PREFIX);
  const normalizedTileId = isFreeSlot
    ? tileId.slice(WEEKLY_FREE_SLOT_PREFIX.length)
    : tileId.startsWith('weekly:')
      ? tileId.slice('weekly:'.length)
      : null;
  if (!normalizedTileId) return null;

  const [monthPeriodId, personId, rawSlotIndex] = normalizedTileId.split(':');
  const slotIndex = Number(rawSlotIndex);
  if (!monthPeriodId || !personId || !Number.isInteger(slotIndex) || slotIndex < 0) return null;

  return { monthPeriodId, personId, slotIndex };
}

function createPersonWeeklyBenchSlots(
  person: Person,
  activePeriod: Period,
  assignedSlotIds: Set<string>
): PersonTileAllocation[] {
  const periodPerson = getPersonPeriodProfile(person, activePeriod.id);
  const slotCostK = getPersonWeeklySlotCostK(periodPerson, activePeriod.id);
  const slotCount = getPersonWeeklySlotCount(periodPerson, activePeriod.id);
  const personSlots: PersonTileAllocation[] = [];

  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    const allocationId = getWeeklyAllocationId(activePeriod.id, periodPerson.id, slotIndex);
    if (assignedSlotIds.has(allocationId)) continue;
    const hours = getPersonWeeklySlotHours(periodPerson, activePeriod.id, slotIndex);
    if (hours <= 0) continue;

    personSlots.push({
      id: getWeeklyFreeSlotId(activePeriod.id, periodPerson.id, slotIndex),
      personId: periodPerson.id,
      tileIndex: slotIndex,
      target: 'bench',
      periodId: activePeriod.id,
      mode: 'hours_first',
      revenueK: slotCostK,
      hours,
    });
  }

  return personSlots;
}

function createWeeklyProjectView(
  project: ProjectFrame,
  activePeriod: Period,
  activeWeek: WeeklyCanvasWeek,
  monthWorkingDays: number,
  weekShare: number,
  weeklyProjectCapacityKById?: Map<string, number>
): ProjectFrame {
  const weeklyOverride = project.weeklyRevenuePlan?.find((entry) => (
    entry.monthPeriodId === activePeriod.id &&
    entry.weekPeriodId === activeWeek.id
  ));
  const weeklyRevenueK = weeklyOverride?.revenueK
    ?? weeklyProjectCapacityKById?.get(project.id)
    ?? getProjectWeekRevenueK(project, activePeriod, activeWeek, monthWorkingDays);
  const currentMonthPlan = project.revenuePlan.find((plan) => plan.periodId === activePeriod.id);

  return {
    ...project,
    requirements: project.requirements.map((requirement) => ({
      ...requirement,
      estimatedHours: Math.round(requirement.estimatedHours * weekShare * 10) / 10,
    })),
    revenuePlan: [
      ...project.revenuePlan.filter((plan) => plan.periodId !== activePeriod.id),
      {
        ...currentMonthPlan,
        periodId: activePeriod.id,
        revenueK: weeklyRevenueK,
        nativeRevenueK: weeklyRevenueK,
      },
    ],
    weeklyRevenuePlan: undefined,
  };
}
