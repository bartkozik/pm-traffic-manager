import { isTimeOffProject, Period, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { getPersonPeriodLayers } from './personPeriod';
import { isProjectActiveInPeriod } from './projectPeriod';

export interface PeriodRevenueComparison {
  periodId: string;
  label: string;
  targetRevenueK: number;
  committedRevenueK: number;
  expectedRevenueK: number;
  committedGapK: number;
  expectedGapK: number;
}

interface CalculatePeriodRevenueComparisonInput {
  allocations: PersonTileAllocation[];
  people: Person[];
  period: Period;
  projects: ProjectFrame[];
}

function roundK(value: number) {
  return Math.round(value * 10) / 10;
}

export function calculatePeriodRevenueComparison({
  allocations,
  people,
  period,
  projects,
}: CalculatePeriodRevenueComparisonInput): PeriodRevenueComparison {
  const periodAllocations = allocations.filter((allocation) => allocation.periodId === period.id);
  const allocationsByTarget = periodAllocations.reduce((result, allocation) => {
    const current = result.get(allocation.target) || [];
    current.push(allocation);
    result.set(allocation.target, current);
    return result;
  }, new Map<string, PersonTileAllocation[]>());
  const targetRevenueK = people.reduce((sum, person) => sum + getPersonPeriodLayers(person, period.id).targetK, 0);

  const { committedRevenueK, expectedRevenueK } = projects
    .filter((project) => isProjectActiveInPeriod(project, period.id, allocationsByTarget) && !isTimeOffProject(project))
    .reduce((result, project) => {
      const plan = project.revenuePlan.find((entry) => entry.periodId === period.id);
      const plannedRevenueK = plan?.revenueK ?? project.budgetK;
      const probability = plan?.probability ?? project.probability;
      const allocatedRevenueK = (allocationsByTarget.get(project.id) || [])
        .reduce((sum, allocation) => sum + allocation.revenueK, 0);
      const forecastBaseK = Math.min(allocatedRevenueK || plannedRevenueK, plannedRevenueK);

      return {
        committedRevenueK: result.committedRevenueK + Math.min(plan?.committedRevenueK || 0, allocatedRevenueK),
        expectedRevenueK: result.expectedRevenueK + forecastBaseK * probability,
      };
    }, { committedRevenueK: 0, expectedRevenueK: 0 });

  return {
    periodId: period.id,
    label: period.label,
    targetRevenueK: roundK(targetRevenueK),
    committedRevenueK: roundK(committedRevenueK),
    expectedRevenueK: roundK(expectedRevenueK),
    committedGapK: roundK(Math.max(0, targetRevenueK - committedRevenueK)),
    expectedGapK: roundK(Math.max(0, targetRevenueK - expectedRevenueK)),
  };
}
