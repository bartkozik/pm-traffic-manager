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
      title: 'Brak do celu przychodu',
      detail: `Brakuje ${formatMoneyK(pressureToTargetK)} do celu przychodu w aktywnym miesiącu.`,
      items: [{
        id: 'target-pressure-summary',
        primary: 'Aktywny miesiąc',
        secondary: activePeriodId,
        detail: `Po zsumowaniu planu i kosztów brakuje ${formatMoneyK(pressureToTargetK)} do celu przychodu.`,
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
      title: 'Koszt ludzi na ławce',
      detail: `${formatMoneyK(uncoveredCostK)} kosztu ludzi zostaje bez przypisania do projektów.`,
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
            secondary: 'Ławka / nieprzypisany cel',
            detail: `Kafelek ${allocation.revenueK}k PLN nie jest przypisany do projektu.`,
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
          title: `${project.client}: brakuje obsady`,
          detail: `Projekt ma ${formatMoneyK(plannedRevenueK)} planu, ale obsadzone jest ${formatMoneyK(allocatedRevenueK)}. Brakuje ${formatMoneyK(resourceGapK)} zasobów/kafelków.`,
          items: [{
            id: `${project.id}-resource-gap-detail`,
            primary: `${project.client}: ${project.name}`,
            secondary: `Plan: ${formatMoneyK(plannedRevenueK)} · obsada: ${formatMoneyK(allocatedRevenueK)}`,
            detail: `Brakuje ${formatMoneyK(resourceGapK)} w przypisanych kafelkach do pokrycia zaplanowanego zakresu projektu.`,
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
        const target = project ? project.client : 'ławka';
        return `${owner} -> ${target}: ${validation.message}`;
      });
    const remaining = savedValidationCount - validationExamples.length;
    const detail = validationExamples.length
      ? `${validationExamples.join(' ')}${remaining > 0 ? ` +${remaining} podobne.` : ''}`
      : `${savedValidationCount} ostrzeżeń zapisanych na alokacjach.`;

    risks.push({
      id: 'allocation-validation',
      severity: savedValidationCount >= 5 ? 'high' : 'medium',
      title: 'Ostrzeżenia w alokacjach',
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
            secondary: project ? `${project.client}: ${project.name}` : 'Ławka / nieprzypisany cel',
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
      title: 'Brak pokrycia kosztów',
      detail: `${formatMoneyK(internalMarginGapK)} brakuje do pokrycia kosztu ludzi na alokacjach.`,
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
            detail: `Brakuje ${formatMoneyK(gapK)} do pokrycia kosztu osoby na tej alokacji.`,
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
      title: 'Stawka poniżej celu',
      detail: `${formatMoneyK(targetGapK)} brakuje względem celu przychodu dla zaplanowanych godzin.`,
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
            detail: `Po kosztach i celu stawki brakuje ${formatMoneyK(gapK)} na tej alokacji.`,
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
      title: 'Konflikty preferencji zespołu',
      detail: `${preferenceWarnings} alokacji narusza preferencje albo blokady osób w projekcie.`,
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
            detail: isBlocked ? 'Osoba jest zablokowana dla tego projektu.' : 'Osoba nie jest na liście preferowanych osób dla tego projektu.',
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
      title: 'Osoby nie powinny pracować razem',
      detail: `${collaborationConflicts} alokacji łączy osoby oznaczone jako konflikt współpracy.`,
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
              title: `${project.client}: brakuje ${requirement.skillId}`,
              detail: `${coveredHours}/${requirement.estimatedHours}h pokrycia wymaganej kompetencji.`,
              items: [{
                id: `${project.id}-${requirement.id}-hours-detail`,
                primary: `${project.client}: ${project.name}`,
                secondary: `Wymaganie: ${requirement.skillId}${requirement.seniority ? ` ${requirement.seniority}` : ''}`,
                detail: `Pokryte ${coveredHours}/${requirement.estimatedHours}h. Brakuje ${requirement.estimatedHours - coveredHours}h wymaganej kompetencji.`,
              }],
            });
          }
        });
    });

  if (!risks.length) {
    risks.push({
      id: 'no-major-risks',
      severity: 'low',
      title: 'Brak istotnych ryzyk',
      detail: 'Brak istotnych automatycznych ostrzeżeń dla aktywnego miesiąca.',
    });
  }

  return risks.slice(0, 6);
}
