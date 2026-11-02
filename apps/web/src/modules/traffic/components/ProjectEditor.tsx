import { FormEvent, useEffect, useRef, useState } from 'react';
import './TrafficEditors.css';
import { HelpTopicId } from '../help/helpContent';
import { useAccessibleDialogKeyboard } from '../hooks/useAccessibleDialogKeyboard';
import { useOnClickOutside } from '../hooks/useOnClickOutside';
import {
  COMMON_BILLING_CURRENCIES,
  ContractType,
  createManualFxSnapshot,
  deriveNativeMoneyK,
  derivePlnMoneyK,
  formatNativeMoneyK,
  getFxRateToPln,
  getContractTypeLabel,
  isPlanningRuleActiveInPeriod,
  getProjectBillingCurrency,
  getProjectPlanningStatusLabel,
  getProjectWorkTypeLabel,
  getRevenuePlanCurrency,
  getRevenuePlanFx,
  getRevenuePlanNativeCommittedRevenueK,
  getRevenuePlanNativeRevenueK,
  getStageLabel,
  isPlnCurrency,
  normalizeCurrencyCode,
  Period,
  Person,
  PlanningRule,
  ProjectFrame,
  ProjectPlanningStatus,
  ProjectRequirement,
  ProjectSourceStatus,
  ProjectStage,
  ProjectWorkType,
  Seniority,
  Skill,
  SkillId,
} from '../models/traffic.model';
import {
  contractTypes,
  projectPlanningStatuses,
  projectSourceStatusLabels,
  projectSourceStatuses,
  projectStages,
  seniorityLabels,
  seniorityOptions,
} from './constants';
import { HelpSectionHeader } from './HelpSectionHeader';
import {
  getProjectCommittedRevenueK,
  getProjectPlannedRevenueK,
  getRevenueSplitPeriods,
  removeMonthlyRevenuePlan,
  upsertMonthlyRevenuePlan,
  usesManualMonthlySplit,
} from '../utils/projectRevenuePlan';
import { fetchFxRateToPln } from '../services/trafficBoardApi';
import { getRequirementHoursForTileCountK, getRequirementTileCountK } from '../utils/projectSkillZones';

const CUSTOM_CURRENCY_SELECT_VALUE = '__custom_currency__';
type ProjectFrameKind = 'commercial' | 'non_commercial';

const commercialProjectWorkTypes: ProjectWorkType[] = ['commercial', 'defensive_maintenance'];
const nonCommercialProjectWorkTypes: ProjectWorkType[] = ['time_off', 'research_development', 'waiting_room'];

interface ProjectEditorProps {
  isNew?: boolean;
  project: ProjectFrame;
  periods: Period[];
  people: Person[];
  planningRules?: PlanningRule[];
  skills: Skill[];
  activePeriodId: string;
  onClose: () => void;
  onOpenHelp: (topicId: HelpTopicId) => void;
  onOpenPlanningRules?: () => void;
  onSave: (project: ProjectFrame) => void;
}

export function ProjectEditor({
  isNew = false,
  project,
  periods,
  planningRules = [],
  skills,
  activePeriodId,
  onClose,
  onOpenHelp,
  onOpenPlanningRules,
  onSave,
}: ProjectEditorProps) {
  const editorRef = useRef<HTMLFormElement | null>(null);
  const [draft, setDraft] = useState<ProjectFrame>(() => structuredClone(project));
  const [fxLookupState, setFxLookupState] = useState<{ status: 'idle' | 'loading' | 'error'; message?: string }>({ status: 'idle' });

  useOnClickOutside(editorRef, onClose, { ignoreSelectors: ['.traffic-help-overlay'] });
  useAccessibleDialogKeyboard(editorRef, onClose, {
    ignoreSelectors: ['.traffic-help-overlay'],
    initialFocusSelector: 'input, select',
  });

  useEffect(() => {
    setDraft(structuredClone(project));
  }, [project]);

  const activePlan = draft.revenuePlan.find((entry) => entry.periodId === activePeriodId);
  const activePeriod = periods.find((period) => period.id === activePeriodId);
  const monthPeriods = periods.filter((period) => period.granularity === 'month');
  const projectFrameKind = getProjectFrameKind(draft.workType);
  const isCommercialDraft = projectFrameKind === 'commercial';
  const manualSplitEnabled = isCommercialDraft && usesManualMonthlySplit(draft.contractType);
  const visibleProjectWorkTypes = isCommercialDraft ? commercialProjectWorkTypes : nonCommercialProjectWorkTypes;
  const revenueSplitPeriods = getRevenueSplitPeriods(monthPeriods, draft, activePeriodId);
  const plannedRevenueK = getProjectPlannedRevenueK(draft);
  const committedRevenueK = getProjectCommittedRevenueK(draft);
  const billingCurrency = getProjectBillingCurrency(draft);
  const billingCurrencyInput = draft.currencyProfile?.billingCurrency ?? billingCurrency;
  const isBillingCurrencyComplete = /^[A-Z]{3}$/.test(billingCurrencyInput);
  const normalizedBillingCurrencyInput = normalizeCurrencyCode(billingCurrencyInput);
  const isCommonBillingCurrency = isBillingCurrencyComplete && COMMON_BILLING_CURRENCIES.includes(normalizedBillingCurrencyInput);
  const currencySelectValue = isCommonBillingCurrency ? normalizedBillingCurrencyInput : CUSTOM_CURRENCY_SELECT_VALUE;
  const activePlanCurrency = getRevenuePlanCurrency(draft, activePlan);
  const activePlanFx = getRevenuePlanFx(draft, activePlan);
  const activeNativeRevenueK = activePlan
    ? getRevenuePlanNativeRevenueK(draft, activePlan)
    : draft.budgetK;
  const activeFxRate = getFxRateToPln(activePlanCurrency, activePlanFx);
  const activeFxDate = activePlanFx?.requestedDate || activePeriod?.startsOn || `${activePeriodId.slice(0, 7)}-01`;
  const activeBoardRevenueK = activePlan?.revenueK ?? draft.budgetK;
  const hasMissingFx = !isPlnCurrency(billingCurrency) && (
    !activeFxRate ||
    draft.revenuePlan.some((plan) => {
      const currency = getRevenuePlanCurrency(draft, plan);
      return !isPlnCurrency(currency) && !getFxRateToPln(currency, getRevenuePlanFx(draft, plan));
    })
  );
  const canSaveProject = isCommercialDraft ? isBillingCurrencyComplete && !hasMissingFx : true;
  const amountFieldLabel = !isCommercialDraft
    ? `Planowany koszt/capacity w aktywnym miesiącu (k PLN)`
    : manualSplitEnabled
      ? `Cały zakres projektu (k ${billingCurrency})`
      : `Przychód w aktywnym miesiącu (k ${activePlanCurrency})`;
  const activeProjectRules = planningRules.filter((rule) => (
    isPlanningRuleActiveInPeriod(rule, activePeriodId) &&
    rule.type === 'person_pair_block' &&
    (!rule.projectId || rule.projectId === draft.id)
  ));
  const projectScopedRuleCount = activeProjectRules.filter((rule) => rule.projectId === draft.id).length;
  const globalRuleCount = activeProjectRules.filter((rule) => !rule.projectId).length;
  const legacyPreferredCount = draft.preferredPersonIds?.length || 0;
  const legacyBlockedCount = draft.blockedPersonIds?.length || 0;
  const saveProject = () => {
    if (!canSaveProject) return;
    onSave(isCommercialDraft ? draft : normalizeNonCommercialProject(draft, activePeriodId));
    onClose();
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveProject();
  };

  const patchDraft = (patch: Partial<ProjectFrame>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const patchContractType = (contractType: ContractType) => {
    setDraft((current) => {
      const nextProject = { ...current, contractType };
      if (!usesManualMonthlySplit(contractType)) return nextProject;
      return {
        ...nextProject,
        budgetK: getProjectPlannedRevenueK(nextProject) || current.budgetK,
      };
    });
  };

  const patchProjectFrameKind = (kind: ProjectFrameKind) => {
    setDraft((current) => {
      if (kind === 'non_commercial') {
        const workType = isNonCommercialProjectWorkType(current.workType) ? current.workType : 'time_off';
        return normalizeNonCommercialProject({ ...current, workType }, activePeriodId);
      }

      const workType = isCommercialProjectWorkType(current.workType) ? current.workType : 'commercial';
      return { ...current, workType };
    });
  };

  const patchProjectWorkType = (workType: ProjectWorkType) => {
    setDraft((current) => {
      const nextProject = { ...current, workType };
      return isNonCommercialProjectWorkType(workType)
        ? normalizeNonCommercialProject(nextProject, activePeriodId)
        : nextProject;
    });
  };

  const patchStage = (stage: ProjectStage) => {
    setDraft((current) => ({
      ...current,
      stage,
      planningStatus: stage === 'signed' ? 'active' : current.planningStatus || 'ghost',
    }));
  };

  const addRequirement = () => {
    const skillId = (skills[0]?.id || 'backend') as SkillId;
    const requirement: ProjectRequirement = {
      id: `req-${Date.now()}`,
      skillId,
      seniority: 'mid',
      estimatedHours: 40,
      required: true,
      phaseLabel: 'Implementacja',
    };
    patchDraft({ requirements: [...draft.requirements, requirement] });
  };

  const updateRequirement = (id: string, patch: Partial<ProjectRequirement>) => {
    patchDraft({
      requirements: draft.requirements.map((requirement) =>
        requirement.id === id ? { ...requirement, ...patch } : requirement
      ),
    });
  };

  const updateRequirementSkill = (requirement: ProjectRequirement, skillId: SkillId) => {
    const tileCountK = getRequirementTileCountK(draft, requirement, activePeriodId);
    updateRequirement(requirement.id, {
      skillId,
      estimatedHours: getRequirementHoursForTileCountK(draft, skillId, activePeriodId, tileCountK),
    });
  };

  const updateRequirementTileCount = (requirement: ProjectRequirement, tileCountK: number) => {
    updateRequirement(requirement.id, {
      estimatedHours: getRequirementHoursForTileCountK(draft, requirement.skillId, activePeriodId, tileCountK),
    });
  };

  const removeRequirement = (id: string) => {
    patchDraft({ requirements: draft.requirements.filter((requirement) => requirement.id !== id) });
  };

  const patchBillingCurrency = (value: string) => {
    const nextValue = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    setDraft((current) => {
      if (nextValue.length !== 3) {
        return {
          ...current,
          currencyProfile: {
            billingCurrency: nextValue,
            fxMode: 'provider_daily_mid',
            ...(current.currencyProfile?.defaultFx ? { defaultFx: current.currencyProfile.defaultFx } : {}),
          },
          rateConfig: {
            ...current.rateConfig,
            projectRateCurrency: nextValue,
          },
        };
      }

      const currency = normalizeCurrencyCode(nextValue);
      const nextCurrencyProfile = {
        billingCurrency: currency,
        fxMode: isPlnCurrency(currency) ? 'pln' as const : 'provider_daily_mid' as const,
        ...(isPlnCurrency(currency) ? {} : normalizeCurrencyCode(current.currencyProfile?.defaultFx?.currency) === currency ? { defaultFx: current.currencyProfile?.defaultFx } : {}),
      };
      const revenuePlan = current.revenuePlan.map((plan) => {
        const fx = isPlnCurrency(currency)
          ? undefined
          : plan.fx?.currency === currency ? plan.fx : nextCurrencyProfile.defaultFx;
        const nativeRevenueK = isPlnCurrency(currency)
          ? plan.revenueK
          : deriveNativeMoneyK(plan.revenueK, currency, fx);
        const hasCommittedRevenue = hasPlanCommittedRevenue(plan);
        const nativeCommittedRevenueK = hasCommittedRevenue && typeof plan.committedRevenueK === 'number'
          ? isPlnCurrency(currency)
            ? plan.committedRevenueK
            : deriveNativeMoneyK(plan.committedRevenueK, currency, fx)
          : undefined;
        const nextPlan = {
          ...plan,
          currency,
          revenueK: plan.revenueK,
          ...(typeof nativeCommittedRevenueK === 'number' ? { nativeCommittedRevenueK } : {}),
        };
        if (fx) nextPlan.fx = fx;
        else delete nextPlan.fx;
        if (typeof nativeRevenueK === 'number') nextPlan.nativeRevenueK = nativeRevenueK;
        else delete nextPlan.nativeRevenueK;
        if (typeof nativeCommittedRevenueK === 'number') nextPlan.nativeCommittedRevenueK = nativeCommittedRevenueK;
        else delete nextPlan.nativeCommittedRevenueK;
        if (!hasCommittedRevenue) {
          delete nextPlan.committedRevenueK;
        }
        return nextPlan;
      });
      const nextProject = {
        ...current,
        currencyProfile: nextCurrencyProfile,
        rateConfig: {
          ...current.rateConfig,
          projectRateCurrency: currency,
        },
        revenuePlan,
      };

      return {
        ...nextProject,
        budgetK: usesManualMonthlySplit(nextProject.contractType)
          ? getProjectPlannedRevenueK(nextProject)
          : revenuePlan.find((plan) => plan.periodId === activePeriodId)?.revenueK ?? current.budgetK,
      };
    });
  };

  const patchRevenuePlanFx = (periodId: string, fxRateToPln: number, requestedDate: string) => {
    if (!Number.isFinite(fxRateToPln) || fxRateToPln <= 0) return;
    setDraft((current) => {
      const plan = current.revenuePlan.find((entry) => entry.periodId === periodId);
      const currency = getRevenuePlanCurrency(current, plan);
      const fx = createManualFxSnapshot(currency, fxRateToPln, requestedDate);
      const nativeRevenueK = getNativeRevenueForFxUpdate(current, plan, fx);
      const hasCommittedRevenue = plan ? hasPlanCommittedRevenue(plan) : false;
      const nativeCommittedRevenueK = plan ? getNativeCommittedRevenueForFxUpdate(current, plan, fx) : undefined;
      const nextProject = upsertMonthlyRevenuePlan(current, periodId, {
        currency,
        fx,
        nativeRevenueK,
        ...(hasCommittedRevenue && typeof nativeCommittedRevenueK === 'number' ? { nativeCommittedRevenueK } : {}),
      });
      return syncActivePeriodBudget(nextProject, periodId, activePeriodId);
    });
  };

  const fetchRateForPlan = async (periodId: string, requestedDate: string) => {
    const plan = draft.revenuePlan.find((entry) => entry.periodId === periodId);
    const currency = getRevenuePlanCurrency(draft, plan);
    if (isPlnCurrency(currency)) return;

    setFxLookupState({ status: 'loading' });
    try {
      const fx = await fetchFxRateToPln(currency, requestedDate);
      setDraft((current) => {
        const currentPlan = current.revenuePlan.find((entry) => entry.periodId === periodId);
        const currentCurrency = getRevenuePlanCurrency(current, currentPlan);
        if (currentCurrency !== fx.currency) return current;
        const nativeRevenueK = getNativeRevenueForFxUpdate(current, currentPlan, fx);
        const hasCommittedRevenue = currentPlan ? hasPlanCommittedRevenue(currentPlan) : false;
        const nativeCommittedRevenueK = currentPlan ? getNativeCommittedRevenueForFxUpdate(current, currentPlan, fx) : undefined;
        const nextProject = upsertMonthlyRevenuePlan(current, periodId, {
          currency,
          fx,
          nativeRevenueK,
          ...(hasCommittedRevenue && typeof nativeCommittedRevenueK === 'number' ? { nativeCommittedRevenueK } : {}),
        });
        const nextProjectWithDefaultFx = {
          ...nextProject,
          currencyProfile: {
            billingCurrency: currency,
            fxMode: 'provider_daily_mid' as const,
            defaultFx: periodId === activePeriodId ? fx : nextProject.currencyProfile?.defaultFx,
          },
        };
        const projectWithAppliedFx = periodId === activePeriodId
          ? applyDefaultFxToRevenuePlan(nextProjectWithDefaultFx, fx)
          : nextProjectWithDefaultFx;
        return syncActivePeriodBudget(projectWithAppliedFx, periodId, activePeriodId);
      });
      setFxLookupState({ status: 'idle' });
    } catch (error) {
      setFxLookupState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Nie udało się pobrać kursu.',
      });
    }
  };

  const patchRevenuePlanBoardValue = (periodId: string, revenueK: number) => {
    if (!Number.isFinite(revenueK) || revenueK < 0) return;
    setDraft((current) => {
      const plan = current.revenuePlan.find((entry) => entry.periodId === periodId);
      const nextProject = upsertMonthlyRevenuePlan(current, periodId, {
        currency: getRevenuePlanCurrency(current, plan),
        fx: getRevenuePlanFx(current, plan),
        revenueK,
      });
      if (usesManualMonthlySplit(nextProject.contractType) || periodId !== activePeriodId) return nextProject;
      return {
        ...nextProject,
        budgetK: revenueK,
      };
    });
  };

  return (
    <form
      aria-label="Edytor projektu"
      aria-modal="true"
      className="traffic-editor"
      ref={editorRef}
      role="dialog"
      tabIndex={-1}
      onSubmit={handleSubmit}
    >
      <div className="traffic-editor-header">
        <div>
          <h2>Projekt</h2>
          <p>{isCommercialDraft ? 'Przychód, waluta, wymagane kompetencje i stawki.' : 'Ramka capacity/kosztu bez kontraktu i revenue.'}</p>
        </div>
        <button aria-label="Zamknij edytor projektu" className="traffic-icon-button" type="button" onClick={onClose}>
          x
        </button>
      </div>

      <section className="traffic-editor-section is-first">
        <HelpSectionHeader
          title={isCommercialDraft ? 'Dane, przychód i stawki' : 'Dane ramki niekomercyjnej'}
          topicId="project-basic"
          onOpenHelp={onOpenHelp}
        />
        <div className="traffic-form-grid">
          <label>
            Klient
            <input value={draft.client} onChange={(event) => patchDraft({ client: event.target.value })} />
          </label>
          <label>
            Nazwa projektu
            <input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} />
          </label>
          <label>
            Typ ramki
            <select
              value={projectFrameKind}
              onChange={(event) => patchProjectFrameKind(event.target.value as ProjectFrameKind)}
            >
              <option value="commercial">Projekt komercyjny</option>
              <option value="non_commercial">Niekomercyjne / niedostępność</option>
            </select>
          </label>
          <label>
            {isCommercialDraft ? 'Charakter projektu' : 'Rodzaj ramki'}
            <select
              value={draft.workType || (isCommercialDraft ? 'commercial' : 'time_off')}
              onChange={(event) => patchProjectWorkType(event.target.value as ProjectWorkType)}
            >
              {visibleProjectWorkTypes.map((workType) => (
                <option key={workType} value={workType}>
                  {getProjectWorkTypeLabel(workType)}
                </option>
              ))}
            </select>
          </label>
          {isCommercialDraft ? (
            <>
              <label>
                Typ kontraktu
                <select
                  value={draft.contractType}
                  onChange={(event) => patchContractType(event.target.value as ContractType)}
                >
                  {contractTypes.map((type) => (
                    <option key={type} value={type}>
                      {getContractTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Etap
                <select
                  value={draft.stage}
                  onChange={(event) => patchStage(event.target.value as ProjectStage)}
                >
                  {projectStages.map((stage) => (
                    <option key={stage} value={stage}>
                      {getStageLabel(stage)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status planowania
                <select
                  value={draft.planningStatus || 'active'}
                  onChange={(event) => patchDraft({ planningStatus: event.target.value as ProjectPlanningStatus })}
                >
                  {projectPlanningStatuses.map((status) => (
                    <option key={status} value={status}>
                      {getProjectPlanningStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Spójność źródła / scope
                <select
                  value={draft.sourceStatus || 'synced'}
                  onChange={(event) => patchDraft({ sourceStatus: event.target.value as ProjectSourceStatus })}
                >
                  {projectSourceStatuses.map((status) => (
                    <option key={status} value={status}>
                      {projectSourceStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Waluta rozliczenia
                <select
                  value={currencySelectValue}
                  onChange={(event) => {
                    if (event.target.value === CUSTOM_CURRENCY_SELECT_VALUE) {
                      patchBillingCurrency(isCommonBillingCurrency ? '' : billingCurrencyInput);
                      return;
                    }
                    patchBillingCurrency(event.target.value);
                  }}
                >
                  {COMMON_BILLING_CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                  <option value={CUSTOM_CURRENCY_SELECT_VALUE}>Inna waluta...</option>
                </select>
              </label>
              {currencySelectValue === CUSTOM_CURRENCY_SELECT_VALUE ? (
                <label>
                  Kod waluty
                  <input
                    aria-label="Kod waluty"
                    maxLength={3}
                    placeholder="np. AED"
                    value={billingCurrencyInput}
                    onChange={(event) => patchBillingCurrency(event.target.value)}
                  />
                  {!isBillingCurrencyComplete ? (
                    <small>Podaj 3-literowy kod waluty.</small>
                  ) : null}
                </label>
              ) : null}
              <label>
                {amountFieldLabel}
                <input
                  disabled={manualSplitEnabled}
                  min={0}
                  step={0.5}
                  type="number"
                  value={manualSplitEnabled ? getProjectPlannedNativeRevenueK(draft) : activeNativeRevenueK}
                  onChange={(event) => {
                    const nativeRevenueK = Number(event.target.value);
                    setDraft((current) => ({
                      ...upsertMonthlyRevenuePlan(current, activePeriodId, {
                        currency: getProjectBillingCurrency(current),
                        fx: getRevenuePlanFx(current, current.revenuePlan.find((entry) => entry.periodId === activePeriodId)),
                        nativeRevenueK,
                      }),
                      budgetK: derivePlnMoneyK(
                        nativeRevenueK,
                        getProjectBillingCurrency(current),
                        getRevenuePlanFx(current, current.revenuePlan.find((entry) => entry.periodId === activePeriodId))
                      ) ?? nativeRevenueK,
                    }));
                  }}
                />
              </label>
              {!manualSplitEnabled && !isPlnCurrency(activePlanCurrency) ? (
                <label>
                  Wartość boardu (k PLN)
                  <input
                    min={0}
                    step={0.5}
                    type="number"
                    value={activeBoardRevenueK}
                    onChange={(event) => patchRevenuePlanBoardValue(activePeriodId, Number(event.target.value))}
                  />
                </label>
              ) : null}
              <label>
                Data kursu
                <input
                  disabled={isPlnCurrency(activePlanCurrency)}
                  type="date"
                  value={activeFxDate}
                  onChange={(event) => {
                    if (!activeFxRate) return;
                    patchRevenuePlanFx(activePeriodId, activeFxRate, event.target.value);
                  }}
                />
              </label>
              <label>
                Kurs do PLN
                <input
                  disabled={isPlnCurrency(activePlanCurrency)}
                  min={0.0001}
                  step={0.0001}
                  type="number"
                  value={activeFxRate ?? ''}
                  onChange={(event) => patchRevenuePlanFx(activePeriodId, Number(event.target.value), activeFxDate)}
                />
              </label>
              <div className="traffic-editor-fx-summary">
                <span>Board: {activeBoardRevenueK}k PLN</span>
                {!isPlnCurrency(activePlanCurrency) ? (
                  <>
                    <span>{formatNativeMoneyK(activeNativeRevenueK, activePlanCurrency)}</span>
                    <button
                      className="traffic-button"
                      disabled={fxLookupState.status === 'loading'}
                      type="button"
                      onClick={() => void fetchRateForPlan(activePeriodId, activeFxDate)}
                    >
                      {fxLookupState.status === 'loading' ? 'Pobieram kurs...' : 'Pobierz kurs NBP'}
                    </button>
                  </>
                ) : null}
              </div>
              {fxLookupState.status === 'error' ? (
                <p className="traffic-editor-section-note is-warning">{fxLookupState.message}</p>
              ) : null}
              {hasMissingFx ? (
                <p className="traffic-editor-section-note is-warning">
                  Waluta obca wymaga kursu FX, zanim zapisze PLN-ową wartość boardu.
                </p>
              ) : null}
              <label>
                Prawdopodobieństwo
                <input
                  max={100}
                  min={0}
                  type="number"
                  value={Math.round(draft.probability * 100)}
                  onChange={(event) => {
                    const probability = Number(event.target.value) / 100;
                    setDraft((current) => ({
                      ...upsertMonthlyRevenuePlan(current, activePeriodId, { probability }),
                      probability,
                    }));
                  }}
                />
              </label>
              <label>
                Stawka klienta/projektu {billingCurrency}/h
                <input
                  min={0}
                  step={0.01}
                  type="number"
                  value={draft.rateConfig.projectRateNativeH ?? (isPlnCurrency(billingCurrency) ? draft.rateConfig.projectRatePlnH : '') ?? ''}
                  onChange={(event) =>
                    patchDraft({
                      rateConfig: {
                        ...draft.rateConfig,
                        projectRateNativeH: event.target.value ? Number(event.target.value) : undefined,
                        projectRateCurrency: billingCurrency,
                        projectRatePlnH: event.target.value && activeFxRate
                          ? Math.round(Number(event.target.value) * activeFxRate * 100) / 100
                          : event.target.value && isPlnCurrency(billingCurrency) ? Number(event.target.value) : undefined,
                      },
                    })
                  }
                />
              </label>
              <label>
                Docelowa stawka firmy PLN/h
                <input
                  min={0}
                  type="number"
                  value={draft.rateConfig.companyTargetRatePlnH}
                  onChange={(event) =>
                    patchDraft({
                      rateConfig: {
                        ...draft.rateConfig,
                        companyTargetRatePlnH: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
            </>
          ) : (
            <>
              <label>
                {amountFieldLabel}
                <input
                  min={0}
                  step={0.5}
                  type="number"
                  value={activeBoardRevenueK}
                  onChange={(event) => patchRevenuePlanBoardValue(activePeriodId, Number(event.target.value))}
                />
              </label>
              <p className="traffic-editor-section-note">
                Ramka niekomercyjna używa kafelków capacity/kosztu. Nie ma typu kontraktu, waluty rozliczenia, etapu sprzedaży ani prawdopodobieństwa revenue.
              </p>
            </>
          )}
        </div>
      </section>

      <label className="traffic-field-block">
        Notatki / ryzyka
        <textarea value={draft.notes} onChange={(event) => patchDraft({ notes: event.target.value })} />
      </label>

      {isCommercialDraft ? (
        <label className="traffic-field-block">
          Notatka o źródle / CRM
          <textarea
            placeholder="Np. scope zmienił się po rozmowie z klientem, ale CRM/brief nie został jeszcze poprawiony."
            value={draft.sourceStatusNote || ''}
            onChange={(event) => patchDraft({ sourceStatusNote: event.target.value })}
          />
        </label>
      ) : null}

      {manualSplitEnabled ? (
        <section className="traffic-editor-section">
          <HelpSectionHeader title="Ręczny podział przychodu na miesiące" topicId="project-monthly-split" onOpenHelp={onOpenHelp}>
            <p className="traffic-editor-section-note">
              Przychód z projektu o stałym zakresie dzielisz tutaj na miesiące. To plan przychodu, nie harmonogram płatności.
            </p>
          </HelpSectionHeader>
          <div className="traffic-revenue-split-summary">
            <span>Razem w planie: {plannedRevenueK}k PLN</span>
            {!isPlnCurrency(billingCurrency) ? (
              <span>Waluta klienta: {formatNativeMoneyK(getProjectPlannedNativeRevenueK(draft), billingCurrency)}</span>
            ) : null}
            <span>Razem podpisane: {committedRevenueK}k PLN</span>
            <span>Miesiące: {draft.revenuePlan.length}</span>
          </div>
          <div className="traffic-revenue-split-grid">
            {revenueSplitPeriods.map((period) => {
              const plan = draft.revenuePlan.find((entry) => entry.periodId === period.id);
              const probabilityPercent = Math.round((plan?.probability ?? draft.probability) * 100);

              return (
                <div className="traffic-revenue-split-row" key={period.id}>
                  <span>
                    <strong>{period.label}</strong>
                    <small>{period.startsOn} - {period.endsOn}</small>
                  </span>
                  <label>
                    Przychód (k {getRevenuePlanCurrency(draft, plan)})
                    <input
                      min={0}
                      step={0.5}
                      type="number"
                      value={plan ? getRevenuePlanNativeRevenueK(draft, plan) : 0}
                      onChange={(event) => setDraft((current) => upsertMonthlyRevenuePlan(current, period.id, {
                        currency: getProjectBillingCurrency(current),
                        fx: getRevenuePlanFx(current, current.revenuePlan.find((entry) => entry.periodId === period.id)),
                        nativeRevenueK: Number(event.target.value),
                      }))}
                    />
                  </label>
                  {!isPlnCurrency(getRevenuePlanCurrency(draft, plan)) ? (
                    <label>
                      Board (k PLN)
                      <input
                        min={0}
                        step={0.5}
                        type="number"
                        value={plan?.revenueK ?? 0}
                        onChange={(event) => patchRevenuePlanBoardValue(period.id, Number(event.target.value))}
                      />
                    </label>
                  ) : null}
                  <label>
                    Podpisane (k {getRevenuePlanCurrency(draft, plan)})
                    <input
                      min={0}
                      step={0.5}
                      type="number"
                      value={plan ? getRevenuePlanNativeCommittedRevenueK(draft, plan) : 0}
                      onChange={(event) => setDraft((current) => upsertMonthlyRevenuePlan(current, period.id, {
                        currency: getProjectBillingCurrency(current),
                        fx: getRevenuePlanFx(current, current.revenuePlan.find((entry) => entry.periodId === period.id)),
                        nativeCommittedRevenueK: Number(event.target.value),
                      }))}
                    />
                  </label>
                  <label>
                    Kurs
                    <input
                      disabled={isPlnCurrency(getProjectBillingCurrency(draft))}
                      min={0}
                      step={0.0001}
                      type="number"
                      value={getFxRateToPln(getRevenuePlanCurrency(draft, plan), getRevenuePlanFx(draft, plan)) ?? ''}
                      onChange={(event) => patchRevenuePlanFx(period.id, Number(event.target.value), plan?.fx?.requestedDate || period.startsOn)}
                    />
                  </label>
                  <label>
                    Szansa (%)
                    <input
                      max={100}
                      min={0}
                      type="number"
                      value={probabilityPercent}
                      onChange={(event) => setDraft((current) => upsertMonthlyRevenuePlan(current, period.id, {
                        probability: Number(event.target.value) / 100,
                      }))}
                    />
                  </label>
                  <button
                    aria-label={`Usuń podział dla miesiąca ${period.label}`}
                    className="traffic-icon-button"
                    disabled={!plan || period.id === activePeriodId}
                    type="button"
                    onClick={() => setDraft((current) => removeMonthlyRevenuePlan(current, period.id))}
                  >
                    x
                  </button>
                </div>
              );
            })}
          </div>
          <label className="traffic-field-block">
            Dodaj miesiąc do podziału
            <select
              value=""
              onChange={(event) => {
                if (!event.target.value) return;
                setDraft((current) => upsertMonthlyRevenuePlan(current, event.target.value, {
                  currency: getProjectBillingCurrency(current),
                  nativeRevenueK: 0,
                  nativeCommittedRevenueK: 0,
                  probability: current.probability,
                }));
              }}
            >
              <option value="">Wybierz miesiąc</option>
              {monthPeriods
                .filter((period) => !draft.revenuePlan.some((entry) => entry.periodId === period.id))
                .map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.label}
                  </option>
                ))}
            </select>
          </label>
        </section>
      ) : null}

      <section className="traffic-editor-section">
        <HelpSectionHeader title="Preferowane / zablokowane osoby" topicId="project-people-fit" onOpenHelp={onOpenHelp} />
        <div className="traffic-project-rules-summary">
          <div>
            <strong>{activeProjectRules.length} aktywnych reguł dla tego miesiąca</strong>
            <span>
              {projectScopedRuleCount} projektowych · {globalRuleCount} ogólnych
              {legacyPreferredCount || legacyBlockedCount ? ` · legacy: ${legacyPreferredCount} preferowanych / ${legacyBlockedCount} zablokowanych` : ''}
            </span>
          </div>
          {onOpenPlanningRules ? (
            <button className="traffic-button" type="button" onClick={onOpenPlanningRules}>
              Zarządzaj regułami
            </button>
          ) : null}
        </div>
      </section>

      <section className="traffic-editor-section">
        <HelpSectionHeader
          title="Wymagane kompetencje"
          topicId="project-requirements"
          onOpenHelp={onOpenHelp}
          actions={(
            <button className="traffic-button" type="button" onClick={addRequirement}>
              Dodaj wymaganie
            </button>
          )}
        />
        {draft.requirements.length ? (
          <div className="traffic-editor-requirement-header" aria-hidden="true">
            <span>Skill</span>
            <span>Seniority</span>
            <span>Kafelki</span>
            <span>Godziny</span>
            <span>Etap</span>
            <span>Wymagane</span>
            <span />
          </div>
        ) : null}
        {draft.requirements.map((requirement) => {
          const skillLabel = skills.find((skill) => skill.id === requirement.skillId)?.label || requirement.skillId;
          const requiredInputId = `project-requirement-${requirement.id}-required`;

          return (
            <div className="traffic-editor-row" key={requirement.id}>
              <select
                aria-label="Kompetencja wymagania"
                value={requirement.skillId}
                onChange={(event) => updateRequirementSkill(requirement, event.target.value as SkillId)}
              >
                {skills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Seniority wymagania"
                value={requirement.seniority || ''}
                onChange={(event) =>
                  updateRequirement(requirement.id, {
                    seniority: event.target.value ? (event.target.value as Seniority) : undefined,
                  })
                }
              >
                <option value="">Bez preferencji</option>
                {seniorityOptions.map((seniority) => (
                  <option key={seniority} value={seniority}>
                    {seniorityLabels[seniority]}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Plan kafelków dla ${skillLabel}`}
                min={0}
                step={0.5}
                type="number"
                value={getRequirementTileCountK(draft, requirement, activePeriodId)}
                onChange={(event) => updateRequirementTileCount(requirement, Number(event.target.value))}
              />
              <input
                aria-label="Szacowane godziny"
                min={0}
                type="number"
                value={requirement.estimatedHours}
                onChange={(event) => updateRequirement(requirement.id, { estimatedHours: Number(event.target.value) })}
              />
              <input
                aria-label="Etap wymagania"
                value={requirement.phaseLabel || ''}
                onChange={(event) => updateRequirement(requirement.id, { phaseLabel: event.target.value })}
                placeholder="etap"
              />
              <label className="traffic-inline-check traffic-required-toggle" htmlFor={requiredInputId}>
                <input
                  id={requiredInputId}
                  aria-label={`Wymaganie ${skillLabel} jest obowiązkowe`}
                  checked={requirement.required}
                  type="checkbox"
                  onChange={(event) => updateRequirement(requirement.id, { required: event.target.checked })}
                />
                <span>wymagane</span>
              </label>
              <button
                aria-label="Usuń wymaganie"
                className="traffic-icon-button"
                type="button"
                onClick={() => removeRequirement(requirement.id)}
              >
                x
              </button>
            </div>
          );
        })}
      </section>

      <div className="traffic-editor-actions">
        <div className="traffic-editor-action-group">
          <button className="traffic-button" type="button" onClick={onClose}>
            Anuluj
          </button>
          <button
            className="traffic-button is-primary"
            type="submit"
            disabled={!canSaveProject}
            onClick={(event) => {
              event.preventDefault();
              saveProject();
            }}
          >
            {isNew ? 'Utwórz projekt' : 'Zapisz zmiany'}
          </button>
        </div>
      </div>
    </form>
  );
}

function getProjectFrameKind(workType: ProjectWorkType | undefined): ProjectFrameKind {
  return isNonCommercialProjectWorkType(workType) ? 'non_commercial' : 'commercial';
}

function isCommercialProjectWorkType(workType: ProjectWorkType | undefined) {
  return !isNonCommercialProjectWorkType(workType);
}

function isNonCommercialProjectWorkType(workType: ProjectWorkType | undefined) {
  return workType === 'research_development' || workType === 'waiting_room' || workType === 'time_off';
}

function normalizeNonCommercialProject(project: ProjectFrame, activePeriodId: string): ProjectFrame {
  const revenuePlan = project.revenuePlan.length
    ? project.revenuePlan
    : [{ periodId: activePeriodId, revenueK: project.budgetK, probability: 1 }];
  const normalizedRevenuePlan = revenuePlan.map((plan) => ({
    periodId: plan.periodId,
    currency: 'PLN',
    nativeRevenueK: plan.revenueK,
    revenueK: plan.revenueK,
    probability: 1,
  }));
  const activePlan = normalizedRevenuePlan.find((plan) => plan.periodId === activePeriodId);

  return {
    ...project,
    budgetK: activePlan?.revenueK ?? project.budgetK,
    contractType: 'fixed_monthly',
    currencyProfile: {
      billingCurrency: 'PLN',
      fxMode: 'pln',
    },
    planningStatus: 'active',
    probability: 1,
    rateConfig: {
      ...project.rateConfig,
      projectRateCurrency: 'PLN',
      projectRateNativeH: undefined,
      projectRatePlnH: undefined,
    },
    revenuePlan: normalizedRevenuePlan,
    sourceStatus: 'synced',
    sourceStatusNote: undefined,
    stage: 'signed',
  };
}

function getProjectPlannedNativeRevenueK(project: ProjectFrame) {
  return project.revenuePlan.reduce((sum, plan) => (
    sum + getRevenuePlanNativeRevenueK(project, plan)
  ), 0);
}

function applyDefaultFxToRevenuePlan(project: ProjectFrame, fx: ReturnType<typeof createManualFxSnapshot>): ProjectFrame {
  const fxCurrency = normalizeCurrencyCode(fx.currency);
  return {
    ...project,
    revenuePlan: project.revenuePlan.map((plan) => {
      const currency = getRevenuePlanCurrency(project, plan);
      if (currency !== fxCurrency || isPlnCurrency(currency) || plan.fx) return plan;
      const nativeRevenueK = getNativeRevenueForFxUpdate(project, plan, fx);
      const hasCommittedRevenue = hasPlanCommittedRevenue(plan);
      const nativeCommittedRevenueK = getNativeCommittedRevenueForFxUpdate(project, plan, fx);
      const revenueK = derivePlnMoneyK(nativeRevenueK, currency, fx) ?? plan.revenueK;
      const committedRevenueK = hasCommittedRevenue && typeof nativeCommittedRevenueK === 'number'
        ? derivePlnMoneyK(nativeCommittedRevenueK, currency, fx)
        : undefined;

      return {
        ...plan,
        fx,
        nativeRevenueK,
        ...(hasCommittedRevenue && typeof nativeCommittedRevenueK === 'number' ? { nativeCommittedRevenueK } : {}),
        revenueK,
        ...(typeof committedRevenueK === 'number' ? { committedRevenueK } : {}),
      };
    }),
  };
}

function hasPlanCommittedRevenue(plan: ProjectFrame['revenuePlan'][number]) {
  return typeof plan.nativeCommittedRevenueK === 'number' || typeof plan.committedRevenueK === 'number';
}

function getNativeRevenueForFxUpdate(
  project: ProjectFrame,
  plan: ProjectFrame['revenuePlan'][number] | undefined,
  fx: ReturnType<typeof createManualFxSnapshot>
) {
  if (!plan) return 0;
  if (typeof plan.nativeRevenueK === 'number') return getRevenuePlanNativeRevenueK(project, plan);
  return deriveNativeMoneyK(plan.revenueK, getRevenuePlanCurrency(project, plan), fx) ?? plan.revenueK;
}

function getNativeCommittedRevenueForFxUpdate(
  project: ProjectFrame,
  plan: ProjectFrame['revenuePlan'][number],
  fx: ReturnType<typeof createManualFxSnapshot>
) {
  if (typeof plan.nativeCommittedRevenueK === 'number') {
    return getRevenuePlanNativeCommittedRevenueK(project, plan);
  }
  if (typeof plan.committedRevenueK !== 'number') return undefined;
  return deriveNativeMoneyK(plan.committedRevenueK, getRevenuePlanCurrency(project, plan), fx) ?? plan.committedRevenueK;
}

function syncActivePeriodBudget(project: ProjectFrame, periodId: string, activePeriodId: string): ProjectFrame {
  if (usesManualMonthlySplit(project.contractType) || periodId !== activePeriodId) return project;
  return {
    ...project,
    budgetK: project.revenuePlan.find((plan) => plan.periodId === activePeriodId)?.revenueK ?? project.budgetK,
  };
}
