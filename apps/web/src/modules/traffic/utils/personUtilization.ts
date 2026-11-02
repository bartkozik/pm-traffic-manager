import { isProductiveAllocationTarget, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { getPersonPeriodAvailableHours, getPersonPeriodCostK, getPersonPeriodLayers } from './personPeriod';

export interface PersonPeriodUtilization {
  allocatedHours: number;
  allocatedRevenueK: number;
  availableHours: number;
  costK: number;
  targetK: number;
  utilizationPercent: number;
  targetCoveragePercent: number;
  status: 'unavailable' | 'under' | 'healthy' | 'over';
}

export function getPersonPeriodUtilization(
  person: Person,
  periodId: string,
  allocations: PersonTileAllocation[],
  projectsById = new Map<string, ProjectFrame>()
): PersonPeriodUtilization {
  const productiveAllocations = allocations.filter((allocation) => (
    allocation.periodId === periodId &&
    allocation.personId === person.id &&
    isProductiveAllocationTarget(allocation, projectsById)
  ));
  const allocatedHours = productiveAllocations.reduce((sum, allocation) => sum + allocation.hours, 0);
  const allocatedRevenueK = productiveAllocations.reduce((sum, allocation) => sum + allocation.revenueK, 0);
  const availableHours = getPersonPeriodAvailableHours(person, periodId);
  const targetK = getPersonPeriodLayers(person, periodId).targetK;
  const utilizationPercent = availableHours > 0 ? Math.round((allocatedHours / availableHours) * 100) : allocatedHours > 0 ? 100 : 0;
  const targetCoveragePercent = targetK > 0 ? Math.round((allocatedRevenueK / targetK) * 100) : 0;

  return {
    allocatedHours,
    allocatedRevenueK,
    availableHours,
    costK: getPersonPeriodCostK(person, periodId),
    targetK,
    utilizationPercent,
    targetCoveragePercent,
    status: getUtilizationStatus(availableHours, allocatedHours, utilizationPercent),
  };
}

function getUtilizationStatus(
  availableHours: number,
  allocatedHours: number,
  utilizationPercent: number
): PersonPeriodUtilization['status'] {
  if (availableHours === 0 && allocatedHours > 0) return 'over';
  if (availableHours === 0) return 'unavailable';
  if (utilizationPercent > 105) return 'over';
  if (utilizationPercent < 65) return 'under';
  return 'healthy';
}
