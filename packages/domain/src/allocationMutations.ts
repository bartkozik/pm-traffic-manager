import { getSuggestedAllocationRequirement } from './allocationSkills.js';
import { validateAllocation } from './allocationValidation.js';
import { getPersonPeriodProfile } from './personPeriod.js';
import { Person, PersonTileAllocation, ProjectFrame, TrafficSnapshot } from './traffic.model.js';

export interface MoveTrafficAllocation {
  tileId: string;
  target: string;
  projectSlotIndex?: number;
  requirementId?: string;
  skipRequirementSuggestion?: boolean;
}

export function moveTrafficAllocations(
  snapshot: TrafficSnapshot,
  moves: MoveTrafficAllocation[],
  periodId: string
): TrafficSnapshot {
  if (!moves.length) return snapshot;

  const peopleById = new Map(snapshot.people.map((person) => [person.id, person]));
  const projectsById = new Map(snapshot.projects.map((project) => [project.id, project]));
  const allocations = snapshot.allocations.map((allocation) => ({ ...allocation }));
  const allocationsById = new Map(allocations.map((allocation) => [allocation.id, allocation]));
  const affectedTargetIds = new Set<string>();

  moves.forEach((move) => {
    const allocation = allocationsById.get(move.tileId);
    if (!allocation) return;
    if (allocation.target !== 'bench') affectedTargetIds.add(allocation.target);
    if (move.target !== 'bench') affectedTargetIds.add(move.target);

    clearConflictingProjectSlot(allocations, move, periodId);

    const mappedAllocation = getMappedAllocationForTarget(
      allocation,
      move,
      periodId,
      peopleById,
      projectsById,
      allocations
    );
    allocationsById.set(move.tileId, mappedAllocation);
    const index = allocations.findIndex((item) => item.id === move.tileId);
    if (index >= 0) allocations[index] = mappedAllocation;
  });

  return {
    ...snapshot,
    allocations: revalidateAllocations(allocations, peopleById, projectsById, snapshot.planningRules || [], periodId, affectedTargetIds),
  };
}

function getMappedAllocationForTarget(
  allocation: PersonTileAllocation,
  move: MoveTrafficAllocation,
  periodId: string,
  peopleById: Map<string, Person>,
  projectsById: Map<string, ProjectFrame>,
  allocations: PersonTileAllocation[]
) {
  const target = move.target;
  const previousTarget = allocation.target !== target ? allocation.target : allocation.previousTarget;
  if (target === 'bench') {
    return {
      ...allocation,
      target,
      previousTarget,
      periodId,
      skillId: undefined,
      requirementId: undefined,
      projectSlotIndex: undefined,
      validation: [],
    } satisfies PersonTileAllocation;
  }

  const project = projectsById.get(target);
  const periodPeopleById = getPeopleByIdForPeriod(Array.from(peopleById.values()), periodId);
  const person = periodPeopleById.get(allocation.personId);
  const explicitRequirement = project?.requirements.find((requirement) => requirement.id === move.requirementId);
  const projectAllocations = allocations.filter((item) => (
    item.periodId === periodId &&
    item.target === target
  ));
  const suggestedRequirement = explicitRequirement || (
    move.skipRequirementSuggestion
      ? undefined
      : getSuggestedAllocationRequirement(
        { ...allocation, target, periodId },
        project,
        person,
        projectAllocations,
        periodPeopleById
      )
  );

  return {
    ...allocation,
    target,
    previousTarget,
    periodId,
    skillId: suggestedRequirement?.skillId,
    requirementId: suggestedRequirement?.id,
    projectSlotIndex: getMappedProjectSlotIndex(allocation, move),
    validation: [],
  } satisfies PersonTileAllocation;
}

function getMappedProjectSlotIndex(allocation: PersonTileAllocation, move: MoveTrafficAllocation) {
  if (typeof move.projectSlotIndex === 'number') return move.projectSlotIndex;
  return allocation.target === move.target ? allocation.projectSlotIndex : undefined;
}

function clearConflictingProjectSlot(
  allocations: PersonTileAllocation[],
  move: MoveTrafficAllocation,
  periodId: string
) {
  if (move.target === 'bench' || typeof move.projectSlotIndex !== 'number') return;

  allocations.forEach((allocation, index) => {
    if (
      allocation.id === move.tileId ||
      allocation.periodId !== periodId ||
      allocation.target !== move.target ||
      allocation.projectSlotIndex !== move.projectSlotIndex
    ) {
      return;
    }

    allocations[index].projectSlotIndex = undefined;
  });
}

function revalidateAllocations(
  allocations: PersonTileAllocation[],
  peopleById: Map<string, Person>,
  projectsById: Map<string, ProjectFrame>,
  planningRules: TrafficSnapshot['planningRules'],
  periodId: string,
  targetIds: Set<string>
) {
  if (targetIds.size === 0) return allocations;

  const allocationsByProjectPeriod = allocations.reduce((result, allocation) => {
    if (allocation.target === 'bench') return result;
    const key = `${allocation.periodId}:${allocation.target}`;
    const current = result.get(key) || [];
    current.push(allocation);
    result.set(key, current);
    return result;
  }, new Map<string, PersonTileAllocation[]>());

  return allocations.map((allocation) => {
    if (allocation.periodId !== periodId) return allocation;
    if (!targetIds.has(allocation.target)) return allocation;

    const project = projectsById.get(allocation.target);
    const periodPeopleById = getPeopleByIdForPeriod(Array.from(peopleById.values()), allocation.periodId);
    const person = periodPeopleById.get(allocation.personId);
    const projectAllocations = allocationsByProjectPeriod.get(`${allocation.periodId}:${allocation.target}`) || [];
    const validation = validateAllocation(allocation, person, project, projectAllocations, periodPeopleById, planningRules || []);
    return { ...allocation, validation };
  });
}

function getPeopleByIdForPeriod(people: Person[], periodId: string) {
  return new Map(people.map((person) => [person.id, getPersonPeriodProfile(person, periodId)]));
}
