import { describe, expect, it } from 'vitest';
import { createManualFxSnapshot, Period, ProjectFrame } from '../models/traffic.model';
import {
  getProjectCommittedRevenueK,
  getProjectPlannedRevenueK,
  getRevenueSplitPeriods,
  removeMonthlyRevenuePlan,
  upsertMonthlyRevenuePlan,
} from './projectRevenuePlan';

const project = {
  id: 'project-1',
  name: 'Phase',
  client: 'Client',
  contractType: 'fixed_phase',
  stage: 'signed',
  budgetK: 30,
  probability: 0.8,
  startMonth: 'March 2026',
  startPeriodId: '2026-03',
  endPeriodId: '2026-04',
  rateConfig: { companyTargetRatePlnH: 250 },
  requirements: [],
  revenuePlan: [
    { periodId: '2026-03', revenueK: 12, committedRevenueK: 8, probability: 0.8 },
    { periodId: '2026-04', revenueK: 18, committedRevenueK: 10, probability: 0.8 },
  ],
  invoices: [],
  notes: '',
} satisfies ProjectFrame;

const periods = [
  { id: '2026-03', label: 'March 2026', granularity: 'month', startsOn: '2026-03-01', endsOn: '2026-03-31' },
  { id: '2026-04', label: 'Kwiecien 2026', granularity: 'month', startsOn: '2026-04-01', endsOn: '2026-04-30' },
  { id: '2026-05', label: 'Maj 2026', granularity: 'month', startsOn: '2026-05-01', endsOn: '2026-05-31' },
] satisfies Period[];

describe('project revenue plan', () => {
  it('sums planned and committed revenue across monthly split', () => {
    expect(getProjectPlannedRevenueK(project)).toBe(30);
    expect(getProjectCommittedRevenueK(project)).toBe(18);
  });

  it('updates fixed scope budget from manual monthly split', () => {
    const updated = upsertMonthlyRevenuePlan(project, '2026-05', {
      revenueK: 10,
      committedRevenueK: 2,
      probability: 0.5,
    });

    expect(updated.budgetK).toBe(40);
    expect(updated.endPeriodId).toBe('2026-05');
    expect(updated.revenuePlan.at(-1)).toMatchObject({
      periodId: '2026-05',
      revenueK: 10,
      committedRevenueK: 2,
      probability: 0.5,
    });
  });

  it('does not rewrite fixed monthly budget as a total project budget', () => {
    const fixedMonthly = { ...project, contractType: 'fixed_monthly' as const, budgetK: 30 };
    const updated = upsertMonthlyRevenuePlan(fixedMonthly, '2026-05', { revenueK: 10 });

    expect(updated.budgetK).toBe(30);
  });

  it('returns split periods from project range and planned months', () => {
    const splitPeriods = getRevenueSplitPeriods(periods, project, '2026-05');

    expect(splitPeriods.map((period) => period.id)).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('removes planned month and recalculates fixed scope total', () => {
    const updated = removeMonthlyRevenuePlan(project, '2026-04');

    expect(updated.budgetK).toBe(12);
    expect(updated.endPeriodId).toBe('2026-03');
    expect(updated.revenuePlan.map((entry) => entry.periodId)).toEqual(['2026-03']);
  });

  it('keeps native currency values while deriving PLN board revenue', () => {
    const fx = createManualFxSnapshot('USD', 4, '2026-03-01');
    const usdProject = {
      ...project,
      currencyProfile: { billingCurrency: 'USD', fxMode: 'manual', defaultFx: fx },
      rateConfig: { ...project.rateConfig, projectRateCurrency: 'USD' },
      revenuePlan: [
        { periodId: '2026-03', currency: 'USD', fx, nativeRevenueK: 10, revenueK: 40, probability: 0.8 },
      ],
      budgetK: 40,
      endPeriodId: '2026-03',
    } satisfies ProjectFrame;

    const updated = upsertMonthlyRevenuePlan(usdProject, '2026-04', {
      currency: 'USD',
      fx,
      nativeRevenueK: 5,
      nativeCommittedRevenueK: 2,
      probability: 0.9,
    });

    expect(updated.budgetK).toBe(60);
    expect(updated.revenuePlan.at(-1)).toMatchObject({
      periodId: '2026-04',
      currency: 'USD',
      nativeRevenueK: 5,
      nativeCommittedRevenueK: 2,
      revenueK: 20,
      committedRevenueK: 8,
      probability: 0.9,
    });
  });

  it('derives native revenue when the PLN board value is edited for a foreign-currency project', () => {
    const fx = createManualFxSnapshot('USD', 4, '2026-03-01');
    const usdProject = {
      ...project,
      currencyProfile: { billingCurrency: 'USD', fxMode: 'manual', defaultFx: fx },
      rateConfig: { ...project.rateConfig, projectRateCurrency: 'USD' },
      revenuePlan: [
        { periodId: '2026-03', currency: 'USD', fx, nativeRevenueK: 10, revenueK: 40, probability: 0.8 },
      ],
      budgetK: 40,
      endPeriodId: '2026-03',
    } satisfies ProjectFrame;

    const updated = upsertMonthlyRevenuePlan(usdProject, '2026-03', {
      currency: 'USD',
      fx,
      revenueK: 80,
    });

    expect(updated.revenuePlan[0]).toMatchObject({
      currency: 'USD',
      nativeRevenueK: 20,
      revenueK: 80,
    });
  });
});
