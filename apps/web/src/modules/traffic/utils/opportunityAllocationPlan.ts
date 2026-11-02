import type { OpportunityCheckResponse } from '@ptm/contracts';
import {
  allocationCoversRequirement,
  getPersonPeriodAvailableHours,
  getPersonPeriodOverride,
  hasHardPersonPairPlanningConflict,
  hasEnoughSeniority,
  isTimeOffProject,
  type Person,
  type PersonTileAllocation,
  type PlanningRule,
  type ProjectFrame,
  type ProjectRequirement,
  personCanCoverRequirement,
  skillCoversRequirementSkill,
} from '../models/traffic.model';

export interface SuggestedAllocationMove {
  allocationId: string;
  personId: string;
  personName: string;
  projectId: string;
  projectLabel: string;
  requirementLabel: string;
  sourceLabel?: string;
  hours: number;
  revenueK: number;
}

export interface SuggestedAllocationGroup {
  key: string;
  label: string;
  allocationIds: string[];
  count: number;
}

export interface AppliedSuggestionMove {
  allocationId: string;
  previousTarget: string;
}

export function formatOpportunityVerdict(verdict: OpportunityCheckResponse['result']['verdict']) {
  switch (verdict) {
    case 'pursue':
      return 'Realizować';
    case 'pursue_with_changes':
      return 'Realizować po zmianach';
    case 'renegotiate':
      return 'Renegocjować';
    case 'drop_or_delay':
      return 'Wyrzucić albo opóźnić';
  }
}

export function formatOpportunityAction(action: OpportunityCheckResponse['result']['projectActions'][number]['action']) {
  switch (action) {
    case 'keep':
      return 'Zostaw';
    case 'drop':
      return 'Usuń';
    case 'delay':
      return 'Opóźnij';
    case 'renegotiate':
      return 'Renegocjuj';
    case 'reallocate':
      return 'Przealokuj';
  }
}

export function formatRequirementLabel(requirement: ProjectRequirement) {
  return `${requirement.skillId}${requirement.seniority ? ` ${requirement.seniority}` : ''}`;
}

export function groupSuggestedAllocationMoves(moves: SuggestedAllocationMove[]): SuggestedAllocationGroup[] {
  const groups = new Map<string, SuggestedAllocationGroup>();

  moves.forEach((move) => {
    const key = [
      move.personId,
      move.projectId,
      move.sourceLabel || '',
      move.requirementLabel,
      move.hours,
      move.revenueK,
    ].join(':');
    const sourceLabel = move.sourceLabel ? `${move.sourceLabel} → ` : '';
    const label = `${sourceLabel}${move.personName} → ${move.projectLabel} · ${move.requirementLabel} · ${move.hours}h / ${move.revenueK}k`;
    const current = groups.get(key);

    if (current) {
      current.count += 1;
      current.allocationIds.push(move.allocationId);
      return;
    }

    groups.set(key, {
      key,
      label,
      allocationIds: [move.allocationId],
      count: 1,
    });
  });

  return Array.from(groups.values());
}

export function buildSuggestedAllocationPlan({
  allocations,
  opportunityCheck,
  people,
  planningRules = [],
  projects,
  periodId,
}: {
  allocations: PersonTileAllocation[];
  opportunityCheck?: OpportunityCheckResponse | null;
  people: Person[];
  planningRules?: PlanningRule[];
  projects: ProjectFrame[];
  periodId: string;
}): SuggestedAllocationMove[] {
  const rankedCandidatePlan = buildRankedCandidateAllocationPlan({ allocations, opportunityCheck, people, planningRules, periodId, projects });
  if (rankedCandidatePlan.length) return rankedCandidatePlan;

  const currentBoardCorrectionPlan = buildCurrentBoardCorrectionPlan({ allocations, people, planningRules, periodId, projects });
  if (currentBoardCorrectionPlan.length) return currentBoardCorrectionPlan;

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const usedAllocationIds = new Set<string>();
  const plannedPersonIdsByProject = new Map<string, Set<string>>();
  const periodAllocations = allocations
    .filter((allocation) => allocation.periodId === periodId)
    .sort((a, b) => a.tileIndex - b.tileIndex);

  return projects.flatMap((project) => {
    return project.requirements
      .filter((requirement) => requirement.required || project.contractType === 'hourly')
      .flatMap((requirement) => {
        const coveredHours = periodAllocations
          .filter((allocation) => allocation.target === project.id)
          .reduce((sum, allocation) => {
            const person = peopleById.get(allocation.personId);
            if (!person) return sum;
            if (isPersonUnavailableForAiPlanning(person, allocation.periodId)) return sum;
            if (project.blockedPersonIds?.includes(person.id)) return sum;
            if (project.preferredPersonIds?.length && !project.preferredPersonIds.includes(person.id)) return sum;
            if (!personCanCoverRequirement(person, requirement)) return sum;
            if (!hasEnoughSeniority(person.seniority, requirement.seniority)) return sum;
            return sum + allocation.hours;
          }, 0);
        let missingHours = Math.max(0, requirement.estimatedHours - coveredHours);

        const moves: SuggestedAllocationMove[] = [];
        const candidateAllocations = periodAllocations
          .filter((allocation) => allocation.target === 'bench')
          .sort((a, b) => a.tileIndex - b.tileIndex);

        for (const allocation of candidateAllocations) {
          if (missingHours <= 0) break;
          if (usedAllocationIds.has(allocation.id)) continue;

          const person = peopleById.get(allocation.personId);
          if (!person) continue;
          if (isPersonUnavailableForAiPlanning(person, periodId)) continue;
          if (project.blockedPersonIds?.includes(person.id)) continue;
          if (violatesHardPairRule({
            allocations: periodAllocations,
            people,
            personId: person.id,
            plannedPersonIds: getPlannedPersonIds(plannedPersonIdsByProject, project.id),
            planningRules,
            periodId,
            projectId: project.id,
          })) continue;
          if (project.preferredPersonIds?.length && !project.preferredPersonIds.includes(person.id)) continue;
          if (!personCanCoverRequirement(person, requirement)) continue;
          if (!hasEnoughSeniority(person.seniority, requirement.seniority)) continue;

          usedAllocationIds.add(allocation.id);
          addPlannedPersonId(plannedPersonIdsByProject, project.id, person.id);
          moves.push({
            allocationId: allocation.id,
            personId: person.id,
            personName: person.name,
            projectId: project.id,
            projectLabel: `${project.client}: ${project.name}`,
            requirementLabel: formatRequirementLabel(requirement),
            sourceLabel: 'Ławka',
            hours: allocation.hours,
            revenueK: allocation.revenueK,
          });
          missingHours = Math.max(0, missingHours - allocation.hours);
        }

        return moves;
      });
  });
}

function buildCurrentBoardCorrectionPlan({
  allocations,
  people,
  planningRules = [],
  periodId,
  projects,
}: {
  allocations: PersonTileAllocation[];
  people: Person[];
  planningRules?: PlanningRule[];
  periodId: string;
  projects: ProjectFrame[];
}): SuggestedAllocationMove[] {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const periodAllocations = allocations
    .filter((allocation) => allocation.periodId === periodId)
    .sort((a, b) => a.tileIndex - b.tileIndex);
  const usedAllocationIds = new Set<string>();
  const plannedPersonIdsByProject = new Map<string, Set<string>>();

  return projects.flatMap((project) => (
    project.requirements
      .filter((requirement) => requirement.required)
      .flatMap((requirement) => {
        const coveredHours = getCoveredRequirementHours(project, requirement, periodAllocations, peopleById);
        let missingHours = Math.max(0, requirement.estimatedHours - coveredHours);
        if (missingHours <= 0) return [];

        const moves: SuggestedAllocationMove[] = [];
        const candidateAllocations = periodAllocations
          .filter((allocation) => allocation.target !== 'bench')
          .filter((allocation) => allocation.target !== project.id)
          .filter((allocation) => !usedAllocationIds.has(allocation.id))
          .map((allocation) => ({
            allocation,
            sourceProject: projectById.get(allocation.target),
            person: peopleById.get(allocation.personId),
          }))
          .filter((candidate): candidate is {
            allocation: PersonTileAllocation;
            sourceProject: ProjectFrame;
            person: Person;
          } => Boolean(candidate.sourceProject && candidate.person))
          .filter(({ allocation, person, sourceProject }) => (
            !violatesHardPairRule({
              allocations: periodAllocations.filter((item) => item.id !== allocation.id),
              people,
              personId: person.id,
              planningRules,
              periodId,
              projectId: project.id,
              plannedPersonIds: getPlannedPersonIds(plannedPersonIdsByProject, project.id),
            }) &&
            !isPersonUnavailableForAiPlanning(person, periodId) &&
            personCanSafelyCoverRequirement(person, project, requirement) &&
            isUsefulCorrectionSource(allocation, sourceProject, person, project)
          ))
          .sort((a, b) => (
            getCorrectionSourcePriority(b.allocation, b.sourceProject, b.person, project) -
            getCorrectionSourcePriority(a.allocation, a.sourceProject, a.person, project) ||
            a.allocation.tileIndex - b.allocation.tileIndex
          ));

        for (const { allocation, person, sourceProject } of candidateAllocations) {
          if (missingHours <= 0) break;
          if (usedAllocationIds.has(allocation.id)) continue;

          usedAllocationIds.add(allocation.id);
          addPlannedPersonId(plannedPersonIdsByProject, project.id, person.id);
          moves.push({
            allocationId: allocation.id,
            personId: person.id,
            personName: person.name,
            projectId: project.id,
            projectLabel: `${project.client}: ${project.name}`,
            requirementLabel: formatRequirementLabel(requirement),
            sourceLabel: `${sourceProject.client}: ${sourceProject.name}`,
            hours: allocation.hours,
            revenueK: allocation.revenueK,
          });
          missingHours = Math.max(0, missingHours - allocation.hours);
        }

        return moves;
      })
  ));
}

function getCoveredRequirementHours(
  project: ProjectFrame,
  requirement: ProjectRequirement,
  periodAllocations: PersonTileAllocation[],
  peopleById: Map<string, Person>
) {
  return periodAllocations
    .filter((allocation) => allocation.target === project.id)
    .reduce((sum, allocation) => {
      const person = peopleById.get(allocation.personId);
      if (!person || isPersonUnavailableForAiPlanning(person, allocation.periodId) || !personCanSafelyCoverRequirement(person, project, requirement)) return sum;
      return allocationCoversRequirement(allocation, requirement, project, person)
        ? sum + allocation.hours
        : sum;
    }, 0);
}

function personCanSafelyCoverRequirement(
  person: Person,
  project: ProjectFrame,
  requirement: ProjectRequirement
) {
  if (project.blockedPersonIds?.includes(person.id)) return false;
  if (project.preferredPersonIds?.length && !project.preferredPersonIds.includes(person.id)) return false;
  if (!personCanCoverRequirement(person, requirement)) return false;
  return hasEnoughSeniority(person.seniority, requirement.seniority);
}

function isUsefulCorrectionSource(
  allocation: PersonTileAllocation,
  sourceProject: ProjectFrame,
  person: Person,
  targetProject: ProjectFrame
) {
  if (isTimeOffProject(sourceProject) || isTimeOffProject(targetProject)) return false;
  if (hasBlockingAllocationWarning(allocation)) return true;
  if (sourceProject.planningStatus === 'ghost' && targetProject.planningStatus !== 'ghost') return true;
  if (sourceProject.workType && sourceProject.workType !== 'commercial' && targetProject.workType !== sourceProject.workType) return true;
  return !allocationCoversAnyRequiredSourceRequirement(allocation, sourceProject, person);
}

function getCorrectionSourcePriority(
  allocation: PersonTileAllocation,
  sourceProject: ProjectFrame,
  person: Person,
  targetProject: ProjectFrame
) {
  if (isTimeOffProject(sourceProject) || isTimeOffProject(targetProject)) return 0;
  if (hasInvalidAllocationWarning(allocation)) return 40;
  if (!allocationCoversAnyRequiredSourceRequirement(allocation, sourceProject, person)) return 32;
  if (hasBlockingAllocationWarning(allocation)) return 24;
  if (sourceProject.workType && sourceProject.workType !== 'commercial' && targetProject.workType !== sourceProject.workType) return 16;
  if (sourceProject.planningStatus === 'ghost' && targetProject.planningStatus !== 'ghost') return 12;
  return 0;
}

function hasInvalidAllocationWarning(allocation: PersonTileAllocation) {
  return (allocation.validation || []).some((validation) => validation.severity === 'invalid');
}

function hasBlockingAllocationWarning(allocation: PersonTileAllocation) {
  return (allocation.validation || []).some((validation) => (
    validation.severity !== 'info' &&
    [
      'missing_required_skill',
      'insufficient_seniority',
      'role_mismatch',
      'blocked_person',
      'not_preferred_person',
      'person_collaboration_conflict',
      'internal_margin_gap',
      'target_revenue_gap',
      'over_allocated',
    ].includes(validation.code)
  ));
}

function allocationCoversAnyRequiredSourceRequirement(
  allocation: PersonTileAllocation,
  sourceProject: ProjectFrame,
  person: Person
) {
  const requiredRequirements = sourceProject.requirements.filter((requirement) => requirement.required);
  if (!requiredRequirements.length) return true;

  return requiredRequirements.some((requirement) => (
    personCanSafelyCoverRequirement(person, sourceProject, requirement) &&
    allocationCoversRequirement(allocation, requirement, sourceProject, person)
  ));
}

function buildRankedCandidateAllocationPlan({
  allocations,
  opportunityCheck,
  people,
  planningRules = [],
  periodId,
  projects,
}: {
  allocations: PersonTileAllocation[];
  opportunityCheck?: OpportunityCheckResponse | null;
  people: Person[];
  planningRules?: PlanningRule[];
  periodId: string;
  projects: ProjectFrame[];
}): SuggestedAllocationMove[] {
  if (!opportunityCheck || opportunityCheck.periodId !== periodId) return [];

  const allocationById = new Map(allocations.map((allocation) => [allocation.id, allocation]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const usedAllocationIds = new Set<string>();
  const plannedPersonIdsByProject = new Map<string, Set<string>>();
  const remainingNeedByKey = new Map<string, number>();
  const candidates = opportunityCheck.analysis.projects
    .flatMap((project) => (project.allocationCandidates || []).map((candidate) => ({
      ...candidate,
      projectName: project.name,
      projectClient: project.client,
    })))
    .sort((a, b) => (
      b.fitScore - a.fitScore ||
      b.estimatedGrossProfitK - a.estimatedGrossProfitK ||
      b.availableBenchHours - a.availableBenchHours
    ));

  return candidates.flatMap((candidate) => {
    const project = projectById.get(candidate.projectId);
    if (!project) return [];
    const person = people.find((item) => item.id === candidate.personId);
    if (!person || isPersonUnavailableForAiPlanning(person, periodId)) return [];
    const requirement = candidate.requirementId
      ? project.requirements.find((item) => item.id === candidate.requirementId)
      : undefined;
    if (candidate.requirementId && !requirement) return [];
    if (!isCandidateTargetStillSafe(project, person, requirement, candidate.skillId, allocations, periodId)) return [];
    if (violatesHardPairRule({
      allocations,
      people,
      personId: candidate.personId,
      plannedPersonIds: getPlannedPersonIds(plannedPersonIdsByProject, candidate.projectId),
      planningRules,
      periodId,
      projectId: candidate.projectId,
    })) return [];

    const needKey = `${candidate.projectId}:${candidate.requirementId || candidate.skillId || 'commercial-capacity'}`;
    const currentRemainingNeed = remainingNeedByKey.get(needKey) ?? candidate.missingHours;
    if (currentRemainingNeed <= 0) return [];

    let remainingNeed = currentRemainingNeed;
    const selectedMoves: SuggestedAllocationMove[] = [];

    for (const allocationId of candidate.sourceAllocationIds) {
      if (remainingNeed <= 0) break;
      if (usedAllocationIds.has(allocationId)) continue;

      const allocation = allocationById.get(allocationId);
      if (!allocation || allocation.periodId !== periodId || allocation.target === candidate.projectId) continue;
      if (allocation.personId !== candidate.personId) continue;
      const sourceProject = projectById.get(allocation.target);
      if (sourceProject && !isUsefulCorrectionSource(allocation, sourceProject, person, project)) continue;
      if (!sourceProject && allocation.target !== 'bench') continue;

      usedAllocationIds.add(allocation.id);
      selectedMoves.push({
        allocationId: allocation.id,
        personId: candidate.personId,
        personName: candidate.personName,
        projectId: candidate.projectId,
        projectLabel: `${candidate.projectClient}: ${candidate.projectName}`,
        requirementLabel: formatCandidateRequirementLabel(candidate, project),
        sourceLabel: getCandidateSourceLabel(candidate, projectById),
        hours: allocation.hours,
        revenueK: allocation.revenueK,
      });
      remainingNeed = Math.max(0, remainingNeed - allocation.hours);
    }

    remainingNeedByKey.set(needKey, remainingNeed);
    if (selectedMoves.length) {
      addPlannedPersonId(plannedPersonIdsByProject, candidate.projectId, candidate.personId);
    }
    return selectedMoves;
  });
}

function isCandidateTargetStillSafe(
  project: ProjectFrame,
  person: Person,
  requirement: ProjectRequirement | undefined,
  skillId: ProjectRequirement['skillId'] | undefined,
  allocations: PersonTileAllocation[],
  periodId: string
) {
  if (isTimeOffProject(project)) return false;
  if (project.workType && project.workType !== 'commercial' && project.workType !== 'defensive_maintenance') return false;
  if (requirement) return personCanSafelyCoverRequirement(person, project, requirement);
  if (project.requirements.some((item) => item.required)) return false;
  if (skillId && !person.skillIds.some((personSkillId) => skillCoversRequirementSkill(personSkillId, skillId))) {
    return false;
  }

  const plan = project.revenuePlan.find((entry) => entry.periodId === periodId);
  const plannedRevenueK = plan?.revenueK ?? project.budgetK;
  const allocatedRevenueK = allocations
    .filter((allocation) => allocation.periodId === periodId && allocation.target === project.id)
    .reduce((sum, allocation) => sum + allocation.revenueK, 0);
  return plannedRevenueK > allocatedRevenueK;
}

function isPersonUnavailableForAiPlanning(person: Person, periodId: string) {
  const override = getPersonPeriodOverride(person, periodId);
  const availableHours = getPersonPeriodAvailableHours(person, periodId);
  return availableHours <= 0 || override?.status === 'holiday' || override?.status === 'unavailable';
}

function getCandidateSourceLabel(
  candidate: OpportunityCheckResponse['analysis']['projects'][number]['allocationCandidates'][number],
  projectById: Map<string, ProjectFrame>
) {
  const sourceTargetIds = 'sourceTargetIds' in candidate && Array.isArray(candidate.sourceTargetIds)
    ? candidate.sourceTargetIds
    : [];
  if (!sourceTargetIds.length) return 'Ławka';

  return sourceTargetIds
    .slice(0, 2)
    .map((targetId) => {
      if (targetId === 'bench') return 'Ławka';
      const project = projectById.get(targetId);
      return project ? `${project.client}: ${project.name}` : targetId;
    })
    .join(', ');
}

function formatCandidateRequirementLabel(
  candidate: OpportunityCheckResponse['analysis']['projects'][number]['allocationCandidates'][number],
  project: ProjectFrame
) {
  const requirement = candidate.requirementId
    ? project.requirements.find((item) => item.id === candidate.requirementId)
    : undefined;

  return requirement
    ? formatRequirementLabel(requirement)
    : 'komercyjna pojemnosc';
}

function violatesHardPairRule({
  allocations,
  people,
  personId,
  plannedPersonIds = [],
  planningRules,
  periodId,
  projectId,
}: {
  allocations: PersonTileAllocation[];
  people: Person[];
  personId: string;
  plannedPersonIds?: string[];
  planningRules: PlanningRule[];
  periodId: string;
  projectId: string;
}) {
  return hasHardPersonPairPlanningConflict({
    candidatePersonId: personId,
    existingPersonIds: [
      ...allocations
        .filter((allocation) => allocation.periodId === periodId && allocation.target === projectId)
        .map((allocation) => allocation.personId),
      ...plannedPersonIds,
    ],
    peopleById: new Map(people.map((person) => [person.id, person])),
    periodId,
    planningRules,
    projectId,
  });
}

function getPlannedPersonIds(plannedPersonIdsByProject: Map<string, Set<string>>, projectId: string) {
  return Array.from(plannedPersonIdsByProject.get(projectId) || []);
}

function addPlannedPersonId(plannedPersonIdsByProject: Map<string, Set<string>>, projectId: string, personId: string) {
  const current = plannedPersonIdsByProject.get(projectId) || new Set<string>();
  current.add(personId);
  plannedPersonIdsByProject.set(projectId, current);
}
