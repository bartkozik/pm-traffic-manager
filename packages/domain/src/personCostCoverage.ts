import { calculateHoursToInternalCostK } from './allocationCalculations.js';
import {
  getPersonPeriodAvailableHours,
  getPersonPeriodCostK,
  getPersonPeriodCostTileCount,
  getPersonPeriodLayers,
  getPersonPeriodProfile,
} from './personPeriod.js';
import { AllocationTarget, getProjectWorkType, Person, PersonTileAllocation, ProjectFrame } from './traffic.model.js';

export type PersonCostCoverageExclusionReason =
  | 'missing_project'
  | 'uncapped_time_materials'
  | 'non_commercial_work'
  | 'time_off';

export interface PersonCostCoverageProject {
  allocationIds: string[];
  costTileCount: number;
  coveredCostK: number;
  generatedRevenueK: number;
  hours: number;
  internalCostK: number;
  projectId: string;
  revenueK: number;
}

export interface PersonCostCoverageNonCoveringTarget {
  allocationIds: string[];
  costK: number;
  costTileCount: number;
  hours: number;
  reason: PersonCostCoverageExclusionReason;
  revenueK: number;
  target: AllocationTarget;
}

export interface PersonCostCoverageSummary {
  availabilityGapCostK: number;
  availableHours: number;
  billableInternalCostK: number;
  billableRevenueK: number;
  benchRevenueK: number;
  coveragePercent: number;
  coveredCostK: number;
  costTileCount: number;
  defaultAvailableHours: number;
  generatedRevenueK: number;
  netCashflowK: number;
  nonCoveringCostK: number;
  nonCoveringRevenueK: number;
  nonCoveringTargets: PersonCostCoverageNonCoveringTarget[];
  periodCostK: number;
  projectSegments: PersonCostCoverageProject[];
  targetCoveragePercent: number;
  targetRevenueK: number;
  timeOffCostK: number;
  timeOffHours: number;
  timeOffRevenueK: number;
  unavailableHours: number;
  uncoveredCostK: number;
}

export function getPersonCostCoverage(
  person: Person,
  periodId: string,
  allocations: PersonTileAllocation[],
  projectsById: Map<string, ProjectFrame>
): PersonCostCoverageSummary {
  const periodCostK = roundMoneyK(getPersonPeriodCostK(person, periodId));
  const targetRevenueK = roundMoneyK(getPersonPeriodLayers(person, periodId).targetK);
  const costTileCount = getPersonPeriodCostTileCount(person, periodId);
  const availableHours = getPersonPeriodAvailableHours(person, periodId);
  const defaultAvailableHours = getPersonPeriodProfile(person, periodId).costModel.defaultMonthlyHours;
  const unavailableHours = Math.max(0, defaultAvailableHours - availableHours);
  const availabilityGapCostK = defaultAvailableHours > 0
    ? roundMoneyK(periodCostK * (unavailableHours / defaultAvailableHours))
    : 0;
  const periodAllocations = allocations.filter((allocation) => (
    allocation.periodId === periodId &&
    allocation.personId === person.id &&
    allocation.tileIndex < costTileCount
  ));
  const costPerTileK = costTileCount > 0 ? periodCostK / costTileCount : 0;
  const projectGroups = new Map<string, PersonCostCoverageProject>();
  const nonCoveringGroups = new Map<string, PersonCostCoverageNonCoveringTarget>();
  let benchRevenueK = 0;

  periodAllocations.forEach((allocation) => {
    if (allocation.target === 'bench') {
      benchRevenueK += allocation.revenueK;
      return;
    }

    const project = projectsById.get(allocation.target);
    const exclusionReason = getProjectCostCoverageExclusionReason(project);

    if (exclusionReason) {
      const current = nonCoveringGroups.get(allocation.target) || {
        allocationIds: [],
        costK: 0,
        costTileCount: 0,
        hours: 0,
        reason: exclusionReason,
        revenueK: 0,
        target: allocation.target,
      };
      nonCoveringGroups.set(allocation.target, {
        ...current,
        allocationIds: [...current.allocationIds, allocation.id],
        costK: roundMoneyK(current.costK + costPerTileK),
        costTileCount: current.costTileCount + 1,
        hours: current.hours + allocation.hours,
        revenueK: roundMoneyK(current.revenueK + allocation.revenueK),
      });
      return;
    }

    const internalCostK = calculateHoursToInternalCostK(person, periodId, allocation.hours) || 0;
    const current = projectGroups.get(allocation.target) || {
      allocationIds: [],
      costTileCount: 0,
      coveredCostK: 0,
      generatedRevenueK: 0,
      hours: 0,
      internalCostK: 0,
      projectId: allocation.target,
      revenueK: 0,
    };
    projectGroups.set(allocation.target, {
      ...current,
      allocationIds: [...current.allocationIds, allocation.id],
      costTileCount: current.costTileCount + 1,
      hours: current.hours + allocation.hours,
      internalCostK: roundMoneyK(current.internalCostK + internalCostK),
      revenueK: roundMoneyK(current.revenueK + allocation.revenueK),
    });
  });

  const billableProjects = Array.from(projectGroups.values())
    .map((project) => ({
      ...project,
      hours: roundHours(project.hours),
      internalCostK: roundMoneyK(project.internalCostK),
      revenueK: roundMoneyK(project.revenueK),
    }))
    .sort((a, b) => b.internalCostK - a.internalCostK || b.revenueK - a.revenueK || a.projectId.localeCompare(b.projectId));
  const billableRevenueK = roundMoneyK(billableProjects.reduce((sum, project) => sum + project.revenueK, 0));
  const billableCostTileCount = billableProjects.reduce((sum, project) => sum + project.costTileCount, 0);
  const totalCoveredCostK = getAllocatedCostCoveredK(billableCostTileCount, costTileCount, periodCostK);
  const coveredCostByProjectId = getCoveredCostByProjectId(billableProjects, totalCoveredCostK);
  const projectSegments = billableProjects.map((project) => {
    const coveredCostK = coveredCostByProjectId.get(project.projectId) || 0;
    return {
      ...project,
      coveredCostK,
      generatedRevenueK: getGeneratedRevenueK(coveredCostK, periodCostK, targetRevenueK),
    };
  }).filter((project) => project.coveredCostK > 0 || project.revenueK > 0);
  const coveredCostK = roundMoneyK(Math.min(periodCostK, projectSegments.reduce((sum, project) => sum + project.coveredCostK, 0)));
  const generatedRevenueK = getGeneratedRevenueK(coveredCostK, periodCostK, targetRevenueK);
  const billableInternalCostK = roundMoneyK(billableProjects.reduce((sum, project) => sum + project.internalCostK, 0));
  const nonCoveringTargets = Array.from(nonCoveringGroups.values())
    .map((target) => ({
      ...target,
      costK: roundMoneyK(target.costK),
      hours: roundHours(target.hours),
      revenueK: roundMoneyK(target.revenueK),
    }))
    .sort((a, b) => b.revenueK - a.revenueK || String(a.target).localeCompare(String(b.target)));
  const nonCoveringCostK = roundMoneyK(nonCoveringTargets.reduce((sum, target) => sum + target.costK, 0));
  const nonCoveringRevenueK = roundMoneyK(nonCoveringTargets.reduce((sum, target) => sum + target.revenueK, 0));
  const timeOffTargets = nonCoveringTargets.filter((target) => target.reason === 'time_off');

  return {
    availabilityGapCostK,
    availableHours,
    benchRevenueK: roundMoneyK(benchRevenueK),
    billableInternalCostK,
    billableRevenueK,
    coveragePercent: getPercent(coveredCostK, periodCostK),
    coveredCostK,
    costTileCount,
    defaultAvailableHours,
    generatedRevenueK,
    netCashflowK: roundMoneyK(generatedRevenueK - periodCostK),
    nonCoveringCostK,
    nonCoveringRevenueK,
    nonCoveringTargets,
    periodCostK,
    projectSegments,
    targetCoveragePercent: getPercent(generatedRevenueK, targetRevenueK),
    targetRevenueK,
    timeOffCostK: roundMoneyK(timeOffTargets.reduce((sum, target) => sum + target.costK, 0)),
    timeOffHours: roundHours(timeOffTargets.reduce((sum, target) => sum + target.hours, 0)),
    timeOffRevenueK: roundMoneyK(timeOffTargets.reduce((sum, target) => sum + target.revenueK, 0)),
    unavailableHours: roundHours(unavailableHours),
    uncoveredCostK: roundMoneyK(Math.max(0, periodCostK - coveredCostK)),
  };
}

export function projectCountsForPersonCostCoverage(project: ProjectFrame | undefined) {
  return !getProjectCostCoverageExclusionReason(project);
}

export function getProjectCostCoverageExclusionReason(
  project: ProjectFrame | undefined
): PersonCostCoverageExclusionReason | null {
  if (!project) return 'missing_project';
  if (getProjectWorkType(project) === 'time_off') return 'time_off';
  if (getProjectWorkType(project) === 'research_development' || getProjectWorkType(project) === 'waiting_room') {
    return 'non_commercial_work';
  }
  if (project.contractType === 'hourly') return 'uncapped_time_materials';
  return null;
}

function getPercent(value: number, total: number) {
  if (total <= 0) return value > 0 ? 100 : 0;
  return Math.round((value / total) * 100);
}

function roundMoneyK(value: number) {
  return Math.round(value * 10) / 10;
}

function roundHours(value: number) {
  return Math.round(value * 10) / 10;
}

function getAllocatedCostCoveredK(
  billableCostTileCount: number,
  costTileCount: number,
  periodCostK: number
) {
  if (periodCostK <= 0) return 0;
  if (costTileCount <= 0) return 0;
  return roundMoneyK(Math.min(periodCostK, billableCostTileCount * (periodCostK / costTileCount)));
}

function getGeneratedRevenueK(
  coveredCostK: number,
  periodCostK: number,
  targetRevenueK: number
) {
  if (periodCostK <= 0) return coveredCostK > 0 ? targetRevenueK : 0;
  return roundMoneyK(targetRevenueK * (coveredCostK / periodCostK));
}

function getCoveredCostByProjectId(
  projects: Array<Pick<PersonCostCoverageProject, 'costTileCount' | 'projectId'>>,
  coveredCostK: number
) {
  const totalCostTileCount = projects.reduce((sum, project) => sum + project.costTileCount, 0);
  if (coveredCostK <= 0 || totalCostTileCount <= 0) return new Map<string, number>();

  const totalTenths = Math.round(roundMoneyK(coveredCostK) * 10);
  const weighted = projects.map((project) => {
    const rawTenths = (project.costTileCount / totalCostTileCount) * totalTenths;
    return {
      baseTenths: Math.floor(rawTenths),
      projectId: project.projectId,
      remainder: rawTenths - Math.floor(rawTenths),
    };
  });
  let assignedTenths = weighted.reduce((sum, project) => sum + project.baseTenths, 0);
  const sortedByRemainder = [...weighted].sort((a, b) => b.remainder - a.remainder || a.projectId.localeCompare(b.projectId));

  sortedByRemainder.forEach((project) => {
    if (assignedTenths >= totalTenths) return;
    project.baseTenths += 1;
    assignedTenths += 1;
  });

  return new Map(weighted.map((project) => [project.projectId, roundMoneyK(project.baseTenths / 10)]));
}
