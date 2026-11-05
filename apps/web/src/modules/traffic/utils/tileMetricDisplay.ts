import {
  getPersonPeriodAvailableHours,
  getPersonPeriodCostK,
  getPersonPeriodCostTileCount,
  type Person,
  type PersonTileAllocation,
} from '../models/traffic.model';
import { calculateHoursToInternalCostK } from './allocationCalculations';

export type TileMetricDisplayMode = 'hours' | 'cost';
export type TileMetricCostBasis = 'cost-capacity' | 'internal-hours';

export interface AllocationMetricDisplay {
  ariaDetail: string;
  shortLabel: string;
  titleLabel: string;
}

interface AllocationMetricDisplayOptions {
  costBasis?: TileMetricCostBasis;
  hoursOverride?: number;
}

export interface ProjectFinancialMetricSummary {
  hours: number;
  internalCostK: number;
  marginK: number;
  revenueK: number;
}

export function getAllocationMetricDisplay(
  allocation: Pick<PersonTileAllocation, 'hours' | 'periodId' | 'revenueK'>,
  person: Person | undefined,
  mode: TileMetricDisplayMode,
  options: AllocationMetricDisplayOptions = {}
): AllocationMetricDisplay {
  if (mode === 'cost') {
    const internalCostK = getAllocationCostMetricK(allocation, person, options.costBasis || 'internal-hours');
    const label = `${formatMetricNumber(internalCostK)}k`;

    return {
      ariaDetail: `internal cost ${label}`,
      shortLabel: label,
      titleLabel: `${label} cost`,
    };
  }

  const displayHours = options.hoursOverride ?? allocation.hours;
  const label = formatHoursMetricLabel(displayHours);

  return {
    ariaDetail: `${label} of work`,
    shortLabel: label,
    titleLabel: label,
  };
}

export function getPersonFreeMetricLabel({
  allocations,
  isWeekly,
  mode,
  person,
  costBasis = 'internal-hours',
  totalHoursOverride,
}: {
  allocations: Array<Pick<PersonTileAllocation, 'hours' | 'periodId' | 'revenueK'>>;
  costBasis?: TileMetricCostBasis;
  isWeekly: boolean;
  mode: TileMetricDisplayMode;
  person: Person;
  totalHoursOverride?: number;
}) {
  if (!allocations.length) return isWeekly ? 'no free days' : 'no free tiles';

  const totalHours = roundMetric(totalHoursOverride ?? allocations.reduce((sum, allocation) => sum + allocation.hours, 0));
  const daySuffix = isWeekly ? ` · ${allocations.length} ${getDayCountLabel(allocations.length)}` : '';

  if (mode === 'cost') {
    const totalCostK = roundMetric(allocations.reduce((sum, allocation) => (
      sum + getAllocationCostMetricK(allocation, person, costBasis)
    ), 0));

    return `${formatMetricNumber(totalCostK)}k unallocated cost${daySuffix}`;
  }

  return `${formatHoursMetricLabel(totalHours)} free${daySuffix}`;
}

export function getProjectFinancialMetricSummary(
  allocations: Array<Pick<PersonTileAllocation, 'hours' | 'periodId' | 'revenueK' | 'personId'>>,
  peopleById: Map<string, Person>,
  options: { costBasis?: TileMetricCostBasis } = {}
): ProjectFinancialMetricSummary {
  const summary = allocations.reduce((current, allocation) => {
    const person = peopleById.get(allocation.personId);

    return {
      hours: current.hours + allocation.hours,
      internalCostK: current.internalCostK + getAllocationCostMetricK(allocation, person, options.costBasis || 'internal-hours'),
      revenueK: current.revenueK + allocation.revenueK,
    };
  }, { hours: 0, internalCostK: 0, revenueK: 0 });

  return {
    hours: roundMetric(summary.hours),
    internalCostK: roundMetric(summary.internalCostK),
    marginK: roundMetric(summary.revenueK - summary.internalCostK),
    revenueK: roundMetric(summary.revenueK),
  };
}

export function formatProjectCostMetricLabel(summary: Pick<ProjectFinancialMetricSummary, 'internalCostK' | 'marginK'>) {
  const marginLabel = summary.marginK >= 0
    ? `margin +${formatMetricNumber(summary.marginK)}k`
    : `gap ${formatMetricNumber(Math.abs(summary.marginK))}k`;

  return `cost ${formatMetricNumber(summary.internalCostK)}k · ${marginLabel}`;
}

export function formatMetricNumber(value: number) {
  const rounded = roundMetric(value);
  return `${rounded}`;
}

export function formatHoursMetricLabel(hours: number) {
  return `${formatMetricNumber(hours)}h`;
}

export function getAllocationInternalCostK(
  allocation: Pick<PersonTileAllocation, 'hours' | 'periodId'>,
  person: Person | undefined
) {
  return roundMetric(calculateHoursToInternalCostK(person, allocation.periodId, allocation.hours) || 0);
}

export function getAllocationCostCapacityK(
  allocation: Pick<PersonTileAllocation, 'periodId' | 'revenueK'>,
  person: Person | undefined
) {
  if (!person) return 0;

  const costTileCount = getPersonPeriodCostTileCount(person, allocation.periodId);
  if (costTileCount <= 0) return 0;

  const allocationCapacityK = Math.max(1, allocation.revenueK || 1);
  return roundMetric((getPersonPeriodCostK(person, allocation.periodId) / costTileCount) * allocationCapacityK);
}

export function getAllocationCostCapacityHours(
  allocation: Pick<PersonTileAllocation, 'periodId' | 'revenueK'>,
  person: Person | undefined
) {
  if (!person) return 0;

  const costTileCount = getPersonPeriodCostTileCount(person, allocation.periodId);
  if (costTileCount <= 0) return 0;

  const allocationCapacityK = Math.max(1, allocation.revenueK || 1);
  return roundMetric((getPersonPeriodAvailableHours(person, allocation.periodId) / costTileCount) * allocationCapacityK);
}

export function getPersonFreeCostCapacityHours(
  allocations: Array<Pick<PersonTileAllocation, 'periodId' | 'revenueK'>>,
  person: Person
) {
  const firstAllocation = allocations[0];
  if (!firstAllocation) return 0;

  const costTileCount = getPersonPeriodCostTileCount(person, firstAllocation.periodId);
  if (costTileCount <= 0) return 0;

  const freeCapacityK = allocations.reduce((sum, allocation) => (
    sum + Math.max(1, allocation.revenueK || 1)
  ), 0);

  return roundMetric((getPersonPeriodAvailableHours(person, firstAllocation.periodId) / costTileCount) * freeCapacityK);
}

function getAllocationCostMetricK(
  allocation: Pick<PersonTileAllocation, 'hours' | 'periodId' | 'revenueK'>,
  person: Person | undefined,
  costBasis: TileMetricCostBasis
) {
  return costBasis === 'cost-capacity'
    ? getAllocationCostCapacityK(allocation, person)
    : getAllocationInternalCostK(allocation, person);
}

function roundMetric(value: number) {
  return Math.round(value * 10) / 10;
}

function getDayCountLabel(dayCount: number) {
  return dayCount === 1 ? 'day' : 'days';
}
