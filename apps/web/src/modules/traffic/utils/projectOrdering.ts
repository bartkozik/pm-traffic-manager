import { ContractType, Person, PersonTileAllocation, ProjectFrame, ProjectStage } from '../models/traffic.model';
import { getPersonPeriodAvailableHours, getPersonPeriodCostK } from './personPeriod';

export type ProjectSortMode = 'type' | 'profit_potential';

const contractTypeRank: Record<ContractType, number> = {
  time_materials_capped: 0,
  fixed_monthly: 1,
  multi_month_fixed: 2,
  fixed_phase: 3,
  hourly: 4,
};

const stageRank: Record<ProjectStage, number> = {
  signed: 0,
  likely: 1,
  possible: 2,
  defensive: 3,
};

interface SortProjectsForPlanningBoardInput {
  allocationsByTarget?: Map<string, PersonTileAllocation[]>;
  peopleById?: Map<string, Person>;
  periodId?: string;
  sortMode?: ProjectSortMode;
}

export function sortProjectsForPlanningBoard(projects: ProjectFrame[], input: SortProjectsForPlanningBoardInput = {}) {
  if (input.sortMode === 'profit_potential') {
    return [...projects].sort((a, b) => (
      getProjectProfitPotentialK(b, input) - getProjectProfitPotentialK(a, input) ||
      getTypeSortValue(a, b)
    ));
  }

  return [...projects].sort((a, b) => (
    getTypeSortValue(a, b)
  ));
}

function getPlanningStatusRank(project: ProjectFrame) {
  return project.planningStatus === 'ghost' ? 1 : 0;
}

function getTypeSortValue(a: ProjectFrame, b: ProjectFrame) {
  return contractTypeRank[a.contractType] - contractTypeRank[b.contractType] ||
    getPlanningStatusRank(a) - getPlanningStatusRank(b) ||
    stageRank[a.stage] - stageRank[b.stage] ||
    b.probability - a.probability ||
    a.client.localeCompare(b.client, 'en-GB') ||
    a.name.localeCompare(b.name, 'en-GB');
}

export function getProjectProfitPotentialK(
  project: ProjectFrame,
  {
    allocationsByTarget = new Map(),
    peopleById = new Map(),
    periodId = project.startPeriodId,
  }: SortProjectsForPlanningBoardInput = {}
) {
  const plan = project.revenuePlan.find((entry) => entry.periodId === periodId);
  const plannedRevenueK = plan?.revenueK ?? project.budgetK;
  const probability = plan?.probability ?? project.probability;
  const projectAllocations = allocationsByTarget.get(project.id) || [];
  const allocatedRevenueK = projectAllocations.reduce((sum, allocation) => sum + allocation.revenueK, 0);
  const revenueBaseK = allocatedRevenueK || plannedRevenueK;
  const expectedRevenueK = revenueBaseK * probability;
  const costK = projectAllocations.reduce((sum, allocation) => {
    const person = peopleById.get(allocation.personId);
    if (!person) return sum;
    const availableHours = getPersonPeriodAvailableHours(person, periodId);
    const hourlyCostK = availableHours > 0 ? getPersonPeriodCostK(person, periodId) / availableHours : 0;
    return sum + (hourlyCostK * allocation.hours);
  }, 0);

  return Math.round((expectedRevenueK - costK) * 10) / 10;
}
