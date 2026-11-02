import { PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { getProjectPlannedRevenueK, usesManualMonthlySplit } from './projectRevenuePlan';

export interface ProjectPressure {
  monthlyAllocatedK: number;
  monthlyGapK: number;
  monthlyPlannedK: number;
  totalAllocatedK: number;
  totalGapK: number;
  totalPlannedK: number;
}

export function calculateProjectPressure(
  project: ProjectFrame,
  activePeriodId: string,
  allAllocations: PersonTileAllocation[]
): ProjectPressure | null {
  if (!usesManualMonthlySplit(project.contractType)) return null;

  const monthlyPlan = project.revenuePlan.find((entry) => entry.periodId === activePeriodId);
  const monthlyPlannedK = monthlyPlan?.revenueK ?? 0;
  const monthlyAllocatedK = sumRevenueK(allAllocations.filter((allocation) => (
    allocation.periodId === activePeriodId &&
    allocation.target === project.id
  )));
  const totalPlannedK = getProjectPlannedRevenueK(project);
  const totalAllocatedK = sumRevenueK(allAllocations.filter((allocation) => allocation.target === project.id));

  return {
    monthlyAllocatedK,
    monthlyGapK: roundMoneyK(monthlyPlannedK - monthlyAllocatedK),
    monthlyPlannedK,
    totalAllocatedK,
    totalGapK: roundMoneyK(totalPlannedK - totalAllocatedK),
    totalPlannedK,
  };
}

function sumRevenueK(allocations: PersonTileAllocation[]) {
  return roundMoneyK(allocations.reduce((sum, allocation) => sum + allocation.revenueK, 0));
}

function roundMoneyK(value: number) {
  return Math.round(value * 10) / 10;
}
