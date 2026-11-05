import { allocationCoversRequirement, isTimeOffProject, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { calculateAllocationInternalMarginGapK, calculateAllocationTargetGapK } from './allocationCalculations';
import { getPersonPeriodCostK } from './personPeriod';
import { isProjectActiveInPeriod } from './projectPeriod';

export interface BoardRisk {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  items?: BoardRiskItem[];
}

export interface BoardRiskItem {
  id: string;
  primary: string;
  secondary?: string;
  detail: string;
}

interface GenerateBoardRisksInput {
  activePeriodId: string;
  allocations: PersonTileAllocation[];
  pressureToTargetK: number;
  projects: ProjectFrame[];
  peopleById: Map<string, Person>;
}

function getSeverityForGap(gapK: number): BoardRisk['severity'] {
  if (gapK >= 20) return 'high';
  if (gapK >= 8) return 'medium';
  return 'low';
}

function formatMoneyK(value: number) {
  return `${Math.round(value)}k PLN`;
}

export function generateBoardRisks({
  activePeriodId,
  allocations,
  pressureToTargetK,
  projects,
  peopleById,
}: GenerateBoardRisksInput): BoardRisk[] {
  const periodAllocations = allocations.filter((allocation) => allocation.periodId === activePeriodId);
  const allocationsByTarget = periodAllocations.reduce((result, allocation) => {
    const current = result.get(allocation.target) || [];
    current.push(allocation);
    result.set(allocation.target, current);
    return result;
  }, new Map<string, PersonTileAllocation[]>());
  const risks: BoardRisk[] = [];
  const projectsById = new Map(projects.map((project) => [project.id, project]));

  if (pressureToTargetK > 0) {
    risks.push({
      id: 'target-pressure',
      severity: getSeverityForGap(pressureToTargetK),
      title: 'Revenue target gap',
      detail: `${formatMoneyK(pressureToTargetK)} short of the revenue target in the active month.`,
      items: [{
        id: 'target-pressure-summary',
        primary: 'Active month',
        secondary: activePeriodId,
        detail: `After adding up the plan and costs, the revenue target gap is ${formatMoneyK(pressureToTargetK)}.`,
      }],
    });
  }

  const uncoveredCostK = periodAllocations
    .filter((allocation) => allocation.target === 'bench')
    .filter((allocation) => {
      const person = peopleById.get(allocation.personId);
      return person ? allocation.tileIndex < getPersonPeriodCostK(person, activePeriodId) : false;
    }).length;

  if (uncoveredCostK > 0) {
    risks.push({
      id: 'bench-cost',
      severity: getSeverityForGap(uncoveredCostK),
      title: 'Bench people cost',
      detail: `${formatMoneyK(uncoveredCostK)} of people cost remains unassigned to projects.`,
      items: periodAllocations
        .filter((allocation) => allocation.target === 'bench')
        .filter((allocation) => {
          const person = peopleById.get(allocation.personId);
          return person ? allocation.tileIndex < getPersonPeriodCostK(person, activePeriodId) : false;
        })
        .slice(0, 30)
        .map((allocation) => {
          const person = peopleById.get(allocation.personId);
          return {
            id: allocation.id,
            primary: person?.name || allocation.personId,
            secondary: 'Bench / unassigned target',
            detail: `The ${allocation.revenueK}k PLN tile is not assigned to a project.`,
          };
        }),
    });
  }

  projects
    .filter((project) => isProjectActiveInPeriod(project, activePeriodId, allocationsByTarget) && !isTimeOffProject(project))
    .forEach((project) => {
      const plan = project.revenuePlan.find((entry) => entry.periodId === activePeriodId);
      const plannedRevenueK = plan?.revenueK ?? project.budgetK;
      const allocatedRevenueK = (allocationsByTarget.get(project.id) || []).reduce((sum, allocation) => sum + allocation.revenueK, 0);
      const resourceGapK = Math.max(0, plannedRevenueK - allocatedRevenueK);

      if (resourceGapK > 0) {
        risks.push({
          id: `${project.id}-resource-gap`,
          severity: getSeverityForGap(resourceGapK),
          title: `${project.client}: staffing gap`,
          detail: `The project has ${formatMoneyK(plannedRevenueK)} planned but ${formatMoneyK(allocatedRevenueK)} staffed. Resources/tiles are short by ${formatMoneyK(resourceGapK)}.`,
          items: [{
            id: `${project.id}-resource-gap-detail`,
            primary: `${project.client}: ${project.name}`,
            secondary: `Plan: ${formatMoneyK(plannedRevenueK)} · staffing: ${formatMoneyK(allocatedRevenueK)}`,
            detail: `Assigned tiles are ${formatMoneyK(resourceGapK)} short of covering the planned project scope.`,
          }],
        });
      }
    });

  const savedValidationCount = periodAllocations.reduce((sum, allocation) => sum + (allocation.validation?.length || 0), 0);
  if (savedValidationCount > 0) {
    const validationExamples = periodAllocations
      .flatMap((allocation) => (allocation.validation || []).map((validation) => ({ allocation, validation })))
      .slice(0, 2)
      .map(({ allocation, validation }) => {
        const person = peopleById.get(allocation.personId);
        const project = projectsById.get(allocation.target);
        const owner = person?.name || allocation.personId;
        const target = project ? project.client : 'bench';
        return `${owner} -> ${target}: ${validation.message}`;
      });
    const remaining = savedValidationCount - validationExamples.length;
    const detail = validationExamples.length
      ? `${validationExamples.join(' ')}${remaining > 0 ? ` +${remaining} similar.` : ''}`
      : `${savedValidationCount} warnings saved on allocations.`;

    risks.push({
      id: 'allocation-validation',
      severity: savedValidationCount >= 5 ? 'high' : 'medium',
      title: 'Allocation warnings',
      detail,
      items: periodAllocations
        .flatMap((allocation) => (allocation.validation || []).map((validation) => ({ allocation, validation })))
        .slice(0, 50)
        .map(({ allocation, validation }) => {
          const person = peopleById.get(allocation.personId);
          const project = projectsById.get(allocation.target);
          return {
            id: `${allocation.id}-${validation.code}`,
            primary: person?.name || allocation.personId,
            secondary: project ? `${project.client}: ${project.name}` : 'Bench / unassigned target',
            detail: validation.message,
          };
        }),
    });
  }

  const internalMarginGapK = periodAllocations.reduce((sum, allocation) => {
    return sum + calculateAllocationInternalMarginGapK(allocation, peopleById.get(allocation.personId));
  }, 0);

  if (internalMarginGapK > 0) {
    risks.push({
      id: 'internal-margin-gap',
      severity: getSeverityForGap(internalMarginGapK),
      title: 'Cost coverage gap',
      detail: `${formatMoneyK(internalMarginGapK)} short of covering people cost on allocations.`,
      items: periodAllocations
        .map((allocation) => ({
          allocation,
          gapK: calculateAllocationInternalMarginGapK(allocation, peopleById.get(allocation.personId)),
        }))
        .filter((entry) => entry.gapK > 0)
        .slice(0, 30)
        .map(({ allocation, gapK }) => {
          const person = peopleById.get(allocation.personId);
          const project = projectsById.get(allocation.target);
          return {
            id: `${allocation.id}-internal-margin`,
            primary: person?.name || allocation.personId,
            secondary: project ? `${project.client}: ${project.name}` : allocation.target,
            detail: `${formatMoneyK(gapK)} short of covering person cost on this allocation.`,
          };
        }),
    });
  }

  const targetGapK = periodAllocations.reduce((sum, allocation) => {
    return sum + calculateAllocationTargetGapK(
      allocation,
      projectsById.get(allocation.target),
      peopleById.get(allocation.personId)
    );
  }, 0);

  if (targetGapK > 0) {
    risks.push({
      id: 'target-rate-gap',
      severity: getSeverityForGap(targetGapK),
      title: 'Rate below target',
      detail: `${formatMoneyK(targetGapK)} short of the revenue target for the planned hours.`,
      items: periodAllocations
        .map((allocation) => ({
          allocation,
          gapK: calculateAllocationTargetGapK(
            allocation,
            projectsById.get(allocation.target),
            peopleById.get(allocation.personId)
          ),
        }))
        .filter((entry) => entry.gapK > 0)
        .slice(0, 30)
        .map(({ allocation, gapK }) => {
          const person = peopleById.get(allocation.personId);
          const project = projectsById.get(allocation.target);
          return {
            id: `${allocation.id}-target-rate`,
            primary: person?.name || allocation.personId,
            secondary: project ? `${project.client}: ${project.name}` : allocation.target,
            detail: `After costs and the target rate, this allocation has a ${formatMoneyK(gapK)} gap.`,
          };
        }),
    });
  }

  const preferenceWarnings = periodAllocations.filter((allocation) => {
    const project = projectsById.get(allocation.target);
    if (!project) return false;
    if (project.blockedPersonIds?.includes(allocation.personId)) return true;
    return Boolean(project.preferredPersonIds?.length && !project.preferredPersonIds.includes(allocation.personId));
  }).length;

  if (preferenceWarnings > 0) {
    risks.push({
      id: 'people-preferences',
      severity: preferenceWarnings >= 5 ? 'high' : 'medium',
      title: 'Team preference conflicts',
      detail: `${preferenceWarnings} allocations violate project people preferences or restrictions.`,
      items: periodAllocations
        .filter((allocation) => {
          const project = projectsById.get(allocation.target);
          if (!project) return false;
          if (project.blockedPersonIds?.includes(allocation.personId)) return true;
          return Boolean(project.preferredPersonIds?.length && !project.preferredPersonIds.includes(allocation.personId));
        })
        .slice(0, 30)
        .map((allocation) => {
          const person = peopleById.get(allocation.personId);
          const project = projectsById.get(allocation.target);
          const isBlocked = Boolean(project?.blockedPersonIds?.includes(allocation.personId));
          return {
            id: `${allocation.id}-preference`,
            primary: person?.name || allocation.personId,
            secondary: project ? `${project.client}: ${project.name}` : allocation.target,
            detail: isBlocked ? 'This person is blocked for this project.' : 'This person is not on the preferred people list for this project.',
          };
        }),
    });
  }

  const collaborationConflicts = periodAllocations.reduce((sum, allocation) => {
    return sum + (allocation.validation || []).filter((validation) => validation.code === 'person_collaboration_conflict').length;
  }, 0);

  if (collaborationConflicts > 0) {
    risks.push({
      id: 'people-collaboration-conflicts',
      severity: collaborationConflicts >= 3 ? 'high' : 'medium',
      title: 'People should not work together',
      detail: `${collaborationConflicts} allocations combine people flagged with a collaboration conflict.`,
      items: periodAllocations
        .flatMap((allocation) => (allocation.validation || [])
          .filter((validation) => validation.code === 'person_collaboration_conflict')
          .map((validation) => ({ allocation, validation })))
        .slice(0, 30)
        .map(({ allocation, validation }) => {
          const person = peopleById.get(allocation.personId);
          const project = projectsById.get(allocation.target);
          return {
            id: `${allocation.id}-collaboration`,
            primary: person?.name || allocation.personId,
            secondary: project ? `${project.client}: ${project.name}` : allocation.target,
            detail: validation.message,
          };
        }),
    });
  }

  projects
    .filter((project) => isProjectActiveInPeriod(project, activePeriodId, allocationsByTarget))
    .forEach((project) => {
      const projectAllocations = allocationsByTarget.get(project.id) || [];
      project.requirements
        .filter((requirement) => requirement.required)
        .forEach((requirement) => {
          const coveredHours = projectAllocations
            .filter((allocation) => allocationCoversRequirement(
              allocation,
              requirement,
              project,
              peopleById.get(allocation.personId)
            ))
            .reduce((sum, allocation) => sum + allocation.hours, 0);

          if (coveredHours < requirement.estimatedHours) {
            risks.push({
              id: `${project.id}-${requirement.id}-hours`,
              severity: requirement.estimatedHours - coveredHours >= 40 ? 'high' : 'medium',
              title: `${project.client}: missing ${requirement.skillId}`,
              detail: `${coveredHours}/${requirement.estimatedHours}h of required skill coverage.`,
              items: [{
                id: `${project.id}-${requirement.id}-hours-detail`,
                primary: `${project.client}: ${project.name}`,
                secondary: `Requirement: ${requirement.skillId}${requirement.seniority ? ` ${requirement.seniority}` : ''}`,
                detail: `Covered ${coveredHours}/${requirement.estimatedHours}h. Missing ${requirement.estimatedHours - coveredHours}h of the required skill.`,
              }],
            });
          }
        });
    });

  if (!risks.length) {
    risks.push({
      id: 'no-major-risks',
      severity: 'low',
      title: 'No major risks',
      detail: 'No major automatic warnings for the active month.',
    });
  }

  return risks.slice(0, 6);
}
