import { describe, expect, it } from 'vitest';
import {
  createManualFxSnapshot,
  deriveNativeMoneyK,
  derivePlnMoneyK,
  getProjectRatePlnH,
  normalizeCurrencyCode,
} from './currency.js';
import type { ProjectFrame } from './traffic.model.js';

describe('currency helpers', () => {
  it('normalizes billing currency codes and falls back to PLN for invalid values', () => {
    expect(normalizeCurrencyCode('usd')).toBe('USD');
    expect(normalizeCurrencyCode(' nok ')).toBe('NOK');
    expect(normalizeCurrencyCode('US')).toBe('PLN');
  });

  it('derives PLN planning values from native revenue and FX snapshot', () => {
    const fx = createManualFxSnapshot('USD', 3.95, '2026-06-15');

    expect(derivePlnMoneyK(10, 'USD', fx)).toBe(39.5);
    expect(deriveNativeMoneyK(39.5, 'USD', fx)).toBe(10);
  });

  it('derives project client rate in PLN from native project rate and period FX', () => {
    const project: ProjectFrame = {
      id: 'usd-project',
      name: 'USD project',
      client: 'Client',
      contractType: 'time_materials_capped',
      stage: 'signed',
      budgetK: 39.5,
      probability: 1,
      startMonth: 'Czerwiec 2026',
      startPeriodId: '2026-06',
      currencyProfile: {
        billingCurrency: 'USD',
        fxMode: 'provider_daily_mid',
      },
      rateConfig: {
        projectRateNativeH: 100,
        projectRateCurrency: 'USD',
        companyTargetRatePlnH: 250,
      },
      requirements: [],
      revenuePlan: [{
        periodId: '2026-06',
        nativeRevenueK: 10,
        currency: 'USD',
        fx: createManualFxSnapshot('USD', 3.95, '2026-06-15'),
        revenueK: 39.5,
        probability: 1,
      }],
      invoices: [],
      notes: '',
    };

    expect(getProjectRatePlnH(project, '2026-06')).toBe(395);
  });
});
