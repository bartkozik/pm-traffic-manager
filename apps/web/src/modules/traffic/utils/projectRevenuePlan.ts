import {
  deriveNativeMoneyK,
  derivePlnMoneyK,
  getProjectBillingCurrency,
  getRevenuePlanNativeCommittedRevenueK,
  getRevenuePlanNativeRevenueK,
  normalizeCurrencyCode,
  ContractType,
  MonthlyRevenuePlan,
  Period,
  ProjectFrame,
} from '../models/traffic.model';

export function usesManualMonthlySplit(contractType: ContractType) {
  return contractType === 'fixed_phase' || contractType === 'multi_month_fixed';
}

export function sortRevenuePlan(plan: MonthlyRevenuePlan[]) {
  return [...plan].sort((a, b) => a.periodId.localeCompare(b.periodId));
}

export function getProjectPlannedRevenueK(project: ProjectFrame) {
  return roundMoneyK(project.revenuePlan.reduce((sum, plan) => sum + plan.revenueK, 0));
}

export function getProjectCommittedRevenueK(project: ProjectFrame) {
  return roundMoneyK(project.revenuePlan.reduce((sum, plan) => sum + (plan.committedRevenueK || 0), 0));
}

export function upsertMonthlyRevenuePlan(
  project: ProjectFrame,
  periodId: string,
  patch: Partial<Omit<MonthlyRevenuePlan, 'periodId'>>
): ProjectFrame {
  const existing = project.revenuePlan.find((entry) => entry.periodId === periodId);
  const currency = normalizeCurrencyCode(
    patch.currency || existing?.currency || project.currencyProfile?.billingCurrency || getProjectBillingCurrency(project)
  );
  const fx = patch.fx ?? existing?.fx ?? project.currencyProfile?.defaultFx;
  const hasPatchRevenueK = typeof patch.revenueK === 'number';
  const nativeRevenueK = patch.nativeRevenueK ?? (
    hasPatchRevenueK ? deriveNativeMoneyK(patch.revenueK as number, currency, fx) :
      existing ? getRevenuePlanNativeRevenueK(project, existing) : undefined
  );
  const existingHasCommittedRevenue = existing
    ? typeof existing.nativeCommittedRevenueK === 'number' || typeof existing.committedRevenueK === 'number'
    : false;
  const hasPatchCommittedRevenueK = typeof patch.committedRevenueK === 'number';
  const nativeCommittedRevenueK = patch.nativeCommittedRevenueK ?? (
    hasPatchCommittedRevenueK ? deriveNativeMoneyK(patch.committedRevenueK as number, currency, fx) :
      existingHasCommittedRevenue && existing ? getRevenuePlanNativeCommittedRevenueK(project, existing) : undefined
  );
  const derivedRevenueK = typeof nativeRevenueK === 'number'
    ? derivePlnMoneyK(nativeRevenueK, currency, fx)
    : undefined;
  const derivedCommittedRevenueK = typeof nativeCommittedRevenueK === 'number'
    ? derivePlnMoneyK(nativeCommittedRevenueK, currency, fx)
    : undefined;
  const nextEntry = normalizeRevenuePlanEntry({
    periodId,
    currency,
    ...(fx ? { fx } : {}),
    ...(typeof nativeRevenueK === 'number' ? { nativeRevenueK } : {}),
    ...(typeof nativeCommittedRevenueK === 'number' ? { nativeCommittedRevenueK } : {}),
    revenueK: patch.revenueK ?? derivedRevenueK ?? existing?.revenueK ?? 0,
    committedRevenueK: patch.committedRevenueK ?? derivedCommittedRevenueK ?? existing?.committedRevenueK,
    probability: patch.probability ?? existing?.probability ?? project.probability,
  });
  const revenuePlan = sortRevenuePlan([
    ...project.revenuePlan.filter((entry) => entry.periodId !== periodId),
    nextEntry,
  ]);
  const nextProject = {
    ...project,
    revenuePlan,
  };

  if (!usesManualMonthlySplit(project.contractType)) return nextProject;

  return {
    ...nextProject,
    budgetK: getProjectPlannedRevenueK(nextProject),
    endPeriodId: getLastPlannedPeriodId(revenuePlan) || project.endPeriodId,
  };
}

export function removeMonthlyRevenuePlan(project: ProjectFrame, periodId: string): ProjectFrame {
  const revenuePlan = sortRevenuePlan(project.revenuePlan.filter((entry) => entry.periodId !== periodId));
  const nextProject = {
    ...project,
    revenuePlan,
  };

  if (!usesManualMonthlySplit(project.contractType)) return nextProject;

  return {
    ...nextProject,
    budgetK: getProjectPlannedRevenueK(nextProject),
    endPeriodId: getLastPlannedPeriodId(revenuePlan) || project.startPeriodId,
  };
}

export function getRevenueSplitPeriods(
  monthPeriods: Period[],
  project: ProjectFrame,
  activePeriodId: string
) {
  const plannedPeriodIds = new Set(project.revenuePlan.map((entry) => entry.periodId));
  plannedPeriodIds.add(activePeriodId);
  plannedPeriodIds.add(project.startPeriodId);
  if (project.endPeriodId) plannedPeriodIds.add(project.endPeriodId);

  return monthPeriods
    .filter((period) => period.granularity === 'month')
    .filter((period) => (
      plannedPeriodIds.has(period.id) ||
      (period.id >= project.startPeriodId && (!project.endPeriodId || period.id <= project.endPeriodId))
    ))
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

function normalizeRevenuePlanEntry(entry: MonthlyRevenuePlan): MonthlyRevenuePlan {
  const currency = normalizeCurrencyCode(entry.currency);
  const fx = entry.fx;
  return {
    periodId: entry.periodId,
    currency,
    ...(fx ? { fx } : {}),
    ...(typeof entry.nativeRevenueK === 'number' ? { nativeRevenueK: Math.max(0, roundMoneyK(entry.nativeRevenueK)) } : {}),
    ...(typeof entry.nativeCommittedRevenueK === 'number' ? { nativeCommittedRevenueK: Math.max(0, roundMoneyK(entry.nativeCommittedRevenueK)) } : {}),
    revenueK: Math.max(0, roundMoneyK(entry.revenueK)),
    ...(typeof entry.committedRevenueK === 'number' ? { committedRevenueK: Math.max(0, roundMoneyK(entry.committedRevenueK)) } : {}),
    ...(typeof entry.probability === 'number' ? { probability: clampProbability(entry.probability) } : {}),
  };
}

function getLastPlannedPeriodId(plan: MonthlyRevenuePlan[]) {
  return sortRevenuePlan(plan).filter((entry) => entry.revenueK > 0).at(-1)?.periodId;
}

function clampProbability(value: number) {
  return Math.min(1, Math.max(0, value));
}

function roundMoneyK(value: number) {
  return Math.round(value * 10) / 10;
}
