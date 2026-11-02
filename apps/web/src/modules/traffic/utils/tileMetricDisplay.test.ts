import { describe, expect, it } from 'vitest';
import type { Person, PersonTileAllocation } from '../models/traffic.model';
import {
  formatProjectCostMetricLabel,
  getAllocationCostCapacityHours,
  getAllocationMetricDisplay,
  getPersonFreeCostCapacityHours,
  getPersonFreeMetricLabel,
  getProjectFinancialMetricSummary,
} from './tileMetricDisplay';

const person: Person = {
  id: 'person-a',
  name: "Taylor",
  role: 'Senior Developer',
  initials: "TG",
  color: '#ef4444',
  skillIds: ['backend'],
  costModel: {
    type: 'fixed_monthly',
    defaultMonthlyHours: 160,
    fixedMonthlyCostK: 18,
  },
  monthlyCostK: 18,
  hoursPerTile: 8,
  layers: {
    workK: 12,
    adminK: 16,
    salesK: 20,
    targetK: 24,
  },
};

const allocation: PersonTileAllocation = {
  id: 'allocation-a',
  personId: person.id,
  tileIndex: 0,
  target: 'project-a',
  periodId: '2026-07',
  mode: 'hours_first',
  revenueK: 2,
  hours: 8,
};

describe('tileMetricDisplay', () => {
  it('formats the same allocation as hours or internal cost', () => {
    expect(getAllocationMetricDisplay(allocation, person, 'hours')).toMatchObject({
      ariaDetail: '8h pracy',
      shortLabel: '8h',
      titleLabel: '8h',
    });
    expect(getAllocationMetricDisplay(allocation, person, 'hours', { hoursOverride: 8.9 })).toMatchObject({
      ariaDetail: '8.9h pracy',
      shortLabel: '8.9h',
      titleLabel: '8.9h',
    });
    expect(getAllocationMetricDisplay(allocation, person, 'cost')).toMatchObject({
      shortLabel: '0.9k',
      titleLabel: '0.9k kosztu',
    });
    expect(getAllocationMetricDisplay(allocation, person, 'cost', { costBasis: 'cost-capacity' })).toMatchObject({
      shortLabel: '2k',
      titleLabel: '2k kosztu',
    });
  });

  it('formats free person capacity for weekly and monthly views', () => {
    const allocations = [
      allocation,
      { ...allocation, id: 'allocation-b', tileIndex: 1 },
    ];

    expect(getPersonFreeMetricLabel({ allocations, isWeekly: true, mode: 'hours', person })).toBe('16h wolne · 2 dni');
    expect(getPersonFreeMetricLabel({ allocations, isWeekly: false, mode: 'hours', person, totalHoursOverride: 160 })).toBe('160h wolne');
    expect(getPersonFreeMetricLabel({ allocations, isWeekly: false, mode: 'cost', person })).toBe('1.8k koszt wolny');
    expect(getPersonFreeMetricLabel({ allocations, costBasis: 'cost-capacity', isWeekly: false, mode: 'cost', person })).toBe('4k koszt wolny');
  });

  it('summarizes project revenue, internal cost, and margin', () => {
    const summary = getProjectFinancialMetricSummary([allocation], new Map([[person.id, person]]));

    expect(summary).toMatchObject({
      hours: 8,
      internalCostK: 0.9,
      marginK: 1.1,
      revenueK: 2,
    });
    expect(formatProjectCostMetricLabel(summary)).toBe('koszt 0.9k · marża +1.1k');

    const costCapacitySummary = getProjectFinancialMetricSummary([allocation], new Map([[person.id, person]]), {
      costBasis: 'cost-capacity',
    });

    expect(costCapacitySummary).toMatchObject({
      hours: 8,
      internalCostK: 2,
      marginK: 0,
      revenueK: 2,
    });
  });

  it('derives monthly free hours from person availability instead of stored hours per tile', () => {
    const legacyHourAllocations = Array.from({ length: 18 }, (_, index) => ({
      ...allocation,
      id: `legacy-${index}`,
      hours: 5,
      revenueK: 1,
      tileIndex: index,
    }));

    expect(getAllocationCostCapacityHours(legacyHourAllocations[0], person)).toBe(8.9);
    expect(getPersonFreeCostCapacityHours(legacyHourAllocations, person)).toBe(160);
  });
});
