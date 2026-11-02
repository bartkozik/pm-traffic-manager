import {
  Person,
  PersonTileAllocation,
  ProjectFrame,
  ProjectRequirement,
  Seniority,
  SkillId,
} from './traffic.model.js';

const seniorityRank: Record<Seniority, number> = {
  junior: 1,
  mid: 2,
  senior: 3,
  lead: 4,
};

const skillCoverage: Partial<Record<SkillId, SkillId[]>> = {
  fullstack: ['backend', 'frontend', 'devops', 'fullstack'],
};

export function hasEnoughSeniority(personSeniority: Seniority | undefined, requiredSeniority: Seniority | undefined) {
  if (!requiredSeniority) return true;
  if (!personSeniority) return false;
  return seniorityRank[personSeniority] >= seniorityRank[requiredSeniority];
}

export function skillCoversRequirementSkill(skillId: SkillId, requirementSkillId: SkillId) {
  return skillId === requirementSkillId || Boolean(skillCoverage[skillId]?.includes(requirementSkillId));
}

export function personCanCoverRequirement(person: Person, requirement: ProjectRequirement) {
  return person.skillIds.some((skillId) => skillCoversRequirementSkill(skillId, requirement.skillId));
}

function getUniqueRequirement(requirements: ProjectRequirement[]): ProjectRequirement | undefined {
  return requirements.length === 1 ? requirements[0] : undefined;
}

export function getEffectiveAllocationRequirement(
  allocation: PersonTileAllocation,
  project: ProjectFrame | undefined,
  person: Person | undefined
): ProjectRequirement | undefined {
  if (!project) return undefined;

  const explicitRequirement = project.requirements.find((requirement) => requirement.id === allocation.requirementId);
  if (explicitRequirement) return explicitRequirement;

  if (allocation.skillId) {
    const matchingRequirements = project.requirements.filter((requirement) => (
      skillCoversRequirementSkill(allocation.skillId as SkillId, requirement.skillId)
    ));
    return getUniqueRequirement(matchingRequirements);
  }

  if (!person) return undefined;

  const matchingRequiredRequirements = project.requirements.filter((requirement) => (
    requirement.required && personCanCoverRequirement(person, requirement)
  ));
  return getUniqueRequirement(matchingRequiredRequirements);
}

export function getEffectiveAllocationSkillId(
  allocation: PersonTileAllocation,
  project: ProjectFrame | undefined,
  person: Person | undefined
): SkillId | undefined {
  return getEffectiveAllocationRequirement(allocation, project, person)?.skillId || allocation.skillId;
}

export function allocationCoversRequirement(
  allocation: PersonTileAllocation,
  requirement: ProjectRequirement,
  project: ProjectFrame | undefined,
  person: Person | undefined
) {
  if (allocation.requirementId === requirement.id) return true;
  return getEffectiveAllocationRequirement(allocation, project, person)?.id === requirement.id;
}

export function getSuggestedAllocationRequirement(
  allocation: PersonTileAllocation,
  project: ProjectFrame | undefined,
  person: Person | undefined,
  projectAllocations: PersonTileAllocation[],
  peopleById = new Map<string, Person>(person ? [[person.id, person]] : [])
): ProjectRequirement | undefined {
  if (!project || !person) return undefined;

  const explicitRequirement = getEffectiveAllocationRequirement(allocation, project, person);
  if (explicitRequirement) return explicitRequirement;

  const primaryRequirements = project.requirements.filter((requirement) => requirement.required);
  const requirementPool = primaryRequirements.length ? primaryRequirements : project.requirements;
  const matchingRequirements = requirementPool.filter((requirement) => personCanCoverRequirement(person, requirement));
  const seniorityMatchingRequirements = matchingRequirements.filter((requirement) => (
    hasEnoughSeniority(person.seniority, requirement.seniority)
  ));
  const candidates = seniorityMatchingRequirements.length ? seniorityMatchingRequirements : matchingRequirements;

  if (!candidates.length) return undefined;

  return candidates
    .map((requirement) => {
      const coveredHours = projectAllocations
        .filter((item) => item.id !== allocation.id)
        .filter((item) => allocationCoversRequirement(item, requirement, project, peopleById.get(item.personId)))
        .reduce((sum, item) => sum + item.hours, 0);
      const estimatedHours = Math.max(1, requirement.estimatedHours);
      return {
        requirement,
        coverageRatio: coveredHours / estimatedHours,
        missingHours: Math.max(0, requirement.estimatedHours - coveredHours),
        order: project.requirements.findIndex((item) => item.id === requirement.id),
      };
    })
    .sort((a, b) => (
      a.coverageRatio - b.coverageRatio ||
      a.order - b.order ||
      b.missingHours - a.missingHours
    ))[0]?.requirement;
}
