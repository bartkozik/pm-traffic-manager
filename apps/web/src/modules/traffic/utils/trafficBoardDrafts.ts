import type { Period, Person, ProjectFrame, TrafficSnapshot } from '../models/traffic.model';
import type { TileMetricDisplayMode } from './tileMetricDisplay';
import { getPersonInitialsFromName } from './personInitials';

export type TrafficTheme = 'day' | 'night';

export function getStoredTheme(): TrafficTheme {
  if (typeof window === 'undefined') return 'night';
  return window.localStorage.getItem('ptm-traffic-theme') === 'day' ? 'day' : 'night';
}

export function getStoredTileMetricMode(): TileMetricDisplayMode {
  if (typeof window === 'undefined') return 'hours';
  return window.localStorage.getItem('ptm-tile-metric-mode') === 'cost' ? 'cost' : 'hours';
}

export function getCurrentTrafficSnapshot({
  activePeriodId,
  activeTileUnitId,
  allocations,
  people,
  periods,
  projects,
  skills,
  tileUnits,
}: Pick<TrafficSnapshot, 'activePeriodId' | 'activeTileUnitId' | 'allocations' | 'people' | 'periods' | 'projects' | 'skills' | 'tileUnits'>): TrafficSnapshot {
  return {
    schemaVersion: 1,
    skills,
    periods,
    tileUnits,
    activePeriodId,
    activeTileUnitId,
    people,
    projects,
    allocations,
  };
}

export function sanitizeRoomName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function createProjectDraft(periodId: string, periods: Period[], nextNumber: number): ProjectFrame {
  const targetPeriod = periods.find((period) => period.id === periodId);

  return {
    id: `project-${Date.now()}`,
    name: `New project ${nextNumber}`,
    client: `Client ${nextNumber}`,
    contractType: 'time_materials_capped',
    stage: 'possible',
    planningStatus: 'ghost',
    sourceStatus: 'synced',
    workType: 'commercial',
    currencyProfile: {
      billingCurrency: 'PLN',
      fxMode: 'pln',
    },
    budgetK: 10,
    probability: 0.5,
    startMonth: targetPeriod?.label || 'New month',
    startPeriodId: periodId,
    endPeriodId: periodId,
    rateConfig: {
      projectRatePlnH: 220,
      companyTargetRatePlnH: 260,
      skillRatesPlnH: {},
    },
    requirements: [],
    preferredPersonIds: [],
    blockedPersonIds: [],
    revenuePlan: [
      {
        periodId,
        nativeRevenueK: 10,
        currency: 'PLN',
        revenueK: 10,
        probability: 0.5,
      },
    ],
    invoices: [],
    notes: '',
  };
}

export function createPersonDraft(nextNumber: number, options?: { monthlyCostK?: number }): Person {
  const name = `New person ${nextNumber}`;
  const monthlyCostK = Math.max(1, Math.round(options?.monthlyCostK || 16));
  const workK = Math.max(1, Math.round(monthlyCostK * 0.625));
  const adminK = Math.max(workK, Math.round(monthlyCostK * 0.8125));
  const salesK = Math.max(adminK, monthlyCostK);
  const targetK = Math.max(salesK, Math.round(monthlyCostK * 1.375));

  return {
    id: `person-${Date.now()}`,
    name,
    role: 'Developer',
    initials: getPersonInitialsFromName(name, `N${nextNumber}`),
    color: '#8b5cf6',
    skillIds: [],
    costModel: {
      type: 'fixed_monthly',
      defaultMonthlyHours: 160,
      fixedMonthlyCostK: monthlyCostK,
    },
    monthlyCostK,
    hoursPerTile: 5,
    layers: { workK, adminK, salesK, targetK },
    preferences: [],
  };
}
