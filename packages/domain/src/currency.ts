import {
  CurrencyCode,
  FxRateSnapshot,
  Money,
  MoneyK,
  MonthlyRevenuePlan,
  ProjectFrame,
} from './traffic.model.js';

export const PLN_CURRENCY: CurrencyCode = 'PLN';

export const COMMON_BILLING_CURRENCIES: CurrencyCode[] = [
  'PLN',
  'USD',
  'EUR',
  'GBP',
  'CHF',
  'NOK',
  'SEK',
  'DKK',
  'CAD',
  'AUD',
  'JPY',
];

export function normalizeCurrencyCode(value: string | undefined | null): CurrencyCode {
  const normalized = (value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : PLN_CURRENCY;
}

export function isPlnCurrency(currency: string | undefined | null) {
  return normalizeCurrencyCode(currency) === PLN_CURRENCY;
}

export function roundMoneyK(value: number): MoneyK {
  return Math.round(value * 10) / 10;
}

export function roundMoney(value: number): Money {
  return Math.round(value * 100) / 100;
}

export function getFxRateToPln(currency: CurrencyCode | undefined, fx?: FxRateSnapshot): number | undefined {
  const normalizedCurrency = normalizeCurrencyCode(currency);
  if (normalizedCurrency === PLN_CURRENCY) return 1;
  if (fx?.currency && normalizeCurrencyCode(fx.currency) !== normalizedCurrency) return undefined;
  return typeof fx?.rateToPln === 'number' && fx.rateToPln > 0 ? fx.rateToPln : undefined;
}

export function derivePlnAmount(nativeAmount: Money, currency: CurrencyCode | undefined, fx?: FxRateSnapshot) {
  const rateToPln = getFxRateToPln(currency, fx);
  if (!rateToPln) return undefined;
  return roundMoney(nativeAmount * rateToPln);
}

export function derivePlnMoneyK(nativeAmountK: MoneyK, currency: CurrencyCode | undefined, fx?: FxRateSnapshot) {
  const rateToPln = getFxRateToPln(currency, fx);
  if (!rateToPln) return undefined;
  return roundMoneyK(nativeAmountK * rateToPln);
}

export function deriveNativeMoneyK(plnAmountK: MoneyK, currency: CurrencyCode | undefined, fx?: FxRateSnapshot) {
  const rateToPln = getFxRateToPln(currency, fx);
  if (!rateToPln) return undefined;
  return roundMoneyK(plnAmountK / rateToPln);
}

export function createPlnFxSnapshot(requestedDate?: string): FxRateSnapshot {
  const effectiveDate = requestedDate || new Date().toISOString().slice(0, 10);
  return {
    currency: PLN_CURRENCY,
    rateToPln: 1,
    requestedDate,
    effectiveDate,
    source: 'pln',
  };
}

export function createManualFxSnapshot(
  currency: CurrencyCode,
  rateToPln: number,
  requestedDate?: string
): FxRateSnapshot {
  const normalizedCurrency = normalizeCurrencyCode(currency);
  return {
    currency: normalizedCurrency,
    rateToPln: normalizedCurrency === PLN_CURRENCY ? 1 : roundMoney(rateToPln),
    requestedDate,
    effectiveDate: requestedDate || new Date().toISOString().slice(0, 10),
    source: normalizedCurrency === PLN_CURRENCY ? 'pln' : 'manual',
  };
}

export function getProjectBillingCurrency(project: ProjectFrame): CurrencyCode {
  return normalizeCurrencyCode(
    project.currencyProfile?.billingCurrency ||
    project.revenuePlan.find((plan) => plan.currency)?.currency ||
    project.rateConfig.projectRateCurrency ||
    PLN_CURRENCY
  );
}

export function getRevenuePlanCurrency(project: ProjectFrame, plan?: MonthlyRevenuePlan): CurrencyCode {
  return normalizeCurrencyCode(plan?.currency || project.currencyProfile?.billingCurrency || PLN_CURRENCY);
}

export function getRevenuePlanFx(project: ProjectFrame, plan?: MonthlyRevenuePlan): FxRateSnapshot | undefined {
  const currency = getRevenuePlanCurrency(project, plan);
  if (isPlnCurrency(currency)) return plan?.fx || project.currencyProfile?.defaultFx || createPlnFxSnapshot();
  return plan?.fx || project.currencyProfile?.defaultFx;
}

export function getRevenuePlanNativeRevenueK(project: ProjectFrame, plan?: MonthlyRevenuePlan): MoneyK {
  if (!plan) return 0;
  if (typeof plan.nativeRevenueK === 'number') return roundMoneyK(plan.nativeRevenueK);
  const nativeRevenueK = deriveNativeMoneyK(plan.revenueK, getRevenuePlanCurrency(project, plan), getRevenuePlanFx(project, plan));
  return typeof nativeRevenueK === 'number' ? nativeRevenueK : plan.revenueK;
}

export function getRevenuePlanNativeCommittedRevenueK(project: ProjectFrame, plan?: MonthlyRevenuePlan): MoneyK {
  if (!plan) return 0;
  if (typeof plan.nativeCommittedRevenueK === 'number') return roundMoneyK(plan.nativeCommittedRevenueK);
  if (typeof plan.committedRevenueK !== 'number') return 0;
  const nativeCommittedRevenueK = deriveNativeMoneyK(
    plan.committedRevenueK,
    getRevenuePlanCurrency(project, plan),
    getRevenuePlanFx(project, plan)
  );
  return typeof nativeCommittedRevenueK === 'number' ? nativeCommittedRevenueK : plan.committedRevenueK;
}

export function getProjectPeriodFx(project: ProjectFrame, periodId: string): FxRateSnapshot | undefined {
  return getRevenuePlanFx(project, project.revenuePlan.find((plan) => plan.periodId === periodId));
}

export function getProjectRatePlnH(project: ProjectFrame, periodId?: string): Money | undefined {
  const nativeRate = project.rateConfig.projectRateNativeH;
  if (typeof nativeRate === 'number') {
    const currency = normalizeCurrencyCode(project.rateConfig.projectRateCurrency || getProjectBillingCurrency(project));
    const plnRate = derivePlnAmount(
      nativeRate,
      currency,
      periodId ? getProjectPeriodFx(project, periodId) : project.currencyProfile?.defaultFx
    );
    if (typeof plnRate === 'number') return plnRate;
  }

  return project.rateConfig.projectRatePlnH;
}

export function formatNativeMoneyK(valueK: number, currency: CurrencyCode) {
  const rounded = Number.isInteger(valueK) ? String(valueK) : String(roundMoneyK(valueK));
  return `${rounded}k ${normalizeCurrencyCode(currency)}`;
}
