export type MoneyK = number;

export type Money = number;
export type Hours = number;
export type CurrencyCode = string;
export type FxRateSource = 'pln' | 'nbp_mid' | 'manual' | 'contract';

export type SkillId =
  | 'backend'
  | 'frontend'
  | 'fullstack'
  | 'design'
  | 'pm'
  | 'qa'
  | 'devops'
  | 'mobile';

export type Seniority = 'junior' | 'mid' | 'senior' | 'lead';
export type BenchAlertSeverity = 'auto' | 'none' | 'watch' | 'warning' | 'critical';
export type ContractType = 'hourly' | 'time_materials_capped' | 'fixed_monthly' | 'fixed_phase' | 'multi_month_fixed';
export type ProjectStage = 'signed' | 'likely' | 'possible' | 'defensive';
export type ProjectPlanningStatus = 'active' | 'ghost';
export type ProjectSourceStatus = 'synced' | 'scope_changed' | 'source_missing';
export type ProjectWorkType = 'commercial' | 'research_development' | 'waiting_room' | 'defensive_maintenance' | 'time_off';
export type BoardLens = 'management' | 'finance' | 'sales' | 'pm' | 'hr';
export type RevenueView = 'committed' | 'expected';
export type AllocationTarget = 'bench' | string;
export type PeriodGranularity = 'month' | 'week';
export type CostModelType = 'fixed_monthly' | 'hourly' | 'monthly_override';
export type TileUnitKind = 'money' | 'hours';
export type AllocationMode = 'revenue_first' | 'hours_first';
export type InvoiceStatus = 'draft' | 'issued' | 'overdue' | 'paid' | 'cancelled';
export type ValidationSeverity = 'info' | 'warning' | 'invalid';
export type MonthlyOverrideStatus = 'holiday' | 'notice_period' | 'partial_availability' | 'unavailable' | 'other';
export type PlanningRuleType = 'person_pair_block';
export type PlanningRuleSeverity = 'hard' | 'warning';
export type PlanningRuleTimeScope = 'permanent' | 'period';

export interface Skill {
  id: SkillId;
  label: string;
  defaultTargetRatePlnH: Money;
}

export interface Period {
  id: string;
  label: string;
  granularity: PeriodGranularity;
  startsOn: string;
  endsOn: string;
  parentPeriodId?: string;
}

export interface TileUnit {
  id: string;
  kind: TileUnitKind;
  label: string;
  value: number;
  currency?: 'PLN';
}

export interface CostLayers {
  workK: MoneyK;
  adminK: MoneyK;
  salesK: MoneyK;
  targetK: MoneyK;
}

export interface PersonCostModel {
  type: CostModelType;
  defaultMonthlyHours: Hours;
  internalHourlyCostPln?: Money;
  fixedMonthlyCostK?: MoneyK;
}

export interface PersonPeriodProfileSnapshot {
  role: string;
  skillIds: SkillId[];
  seniority?: Seniority | null;
  costModel: PersonCostModel;
  monthlyCostK: MoneyK;
  hoursPerTile: number;
  layers: CostLayers;
}

export interface MonthlyPersonOverride {
  periodId: string;
  availableHours?: Hours;
  internalHourlyCostPln?: Money;
  fixedMonthlyCostK?: MoneyK;
  layers?: CostLayers;
  profile?: PersonPeriodProfileSnapshot;
  status?: MonthlyOverrideStatus;
  note?: string;
}

export interface ExternalEntityRef {
  sourceSystem: string;
  sourceId: string;
  importedAt?: string;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  initials: string;
  color: string;
  skillIds: SkillId[];
  seniority?: Seniority;
  costModel: PersonCostModel;
  monthlyCostK: MoneyK;
  hoursPerTile: number;
  layers: CostLayers;
  monthlyOverrides?: MonthlyPersonOverride[];
  preferences?: string[];
  blockedCollaborationPersonIds?: string[];
  benchAlertSeverity?: BenchAlertSeverity;
  externalRefs?: ExternalEntityRef[];
  hiddenPeriodIds?: string[];
  archivedAt?: string;
}

export interface FxRateSnapshot {
  currency: CurrencyCode;
  rateToPln: number;
  requestedDate?: string;
  effectiveDate: string;
  source: FxRateSource;
  providerTable?: 'A' | 'B';
  providerTableNo?: string;
  fetchedAt?: string;
}

export interface ProjectCurrencyProfile {
  billingCurrency: CurrencyCode;
  defaultFx?: FxRateSnapshot;
  fxMode: 'pln' | 'provider_daily_mid' | 'manual' | 'fixed_contract_rate';
}

export interface RateConfig {
  projectRateNativeH?: Money;
  projectRateCurrency?: CurrencyCode;
  projectRatePlnH?: Money;
  skillRatesPlnH?: Partial<Record<SkillId, Money>>;
  companyTargetRatePlnH: Money;
}

export interface ProjectRequirement {
  id: string;
  skillId: SkillId;
  seniority?: Seniority;
  estimatedHours: Hours;
  required: boolean;
  phaseLabel?: string;
}

export interface MonthlyRevenuePlan {
  periodId: string;
  nativeRevenueK?: MoneyK;
  nativeCommittedRevenueK?: MoneyK;
  currency?: CurrencyCode;
  fx?: FxRateSnapshot;
  revenueK: MoneyK;
  committedRevenueK?: MoneyK;
  probability?: number;
}

export interface WeeklyProjectRevenuePlan {
  monthPeriodId: string;
  weekPeriodId: string;
  revenueK: MoneyK;
  source?: 'balanced' | 'manual';
}

export interface Invoice {
  id: string;
  projectId: string;
  amount: Money;
  currency?: CurrencyCode;
  fx?: FxRateSnapshot;
  amountPln?: Money;
  issueDate: string;
  dueDate: string;
  paidDate?: string;
  status: InvoiceStatus;
  probability?: number;
  notes?: string;
}

export interface ProjectFrame {
  id: string;
  name: string;
  client: string;
  contractType: ContractType;
  stage: ProjectStage;
  planningStatus?: ProjectPlanningStatus;
  sourceStatus?: ProjectSourceStatus;
  sourceStatusNote?: string;
  workType?: ProjectWorkType;
  currencyProfile?: ProjectCurrencyProfile;
  budgetK: MoneyK;
  probability: number;
  startMonth: string;
  startPeriodId: string;
  endPeriodId?: string;
  rateConfig: RateConfig;
  requirements: ProjectRequirement[];
  preferredPersonIds?: string[];
  blockedPersonIds?: string[];
  revenuePlan: MonthlyRevenuePlan[];
  weeklyRevenuePlan?: WeeklyProjectRevenuePlan[];
  invoices: Invoice[];
  notes: string;
  externalRefs?: ExternalEntityRef[];
  archivedPeriodIds?: string[];
  archivedAt?: string;
}

export interface PlanningRule {
  id: string;
  type: PlanningRuleType;
  timeScope?: PlanningRuleTimeScope;
  periodId?: string;
  personAId: string;
  personBId: string;
  projectId?: string;
  severity: PlanningRuleSeverity;
  reason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AllocationValidation {
  code:
    | 'missing_required_skill'
    | 'insufficient_seniority'
    | 'insufficient_hours'
    | 'role_mismatch'
    | 'blocked_person'
    | 'not_preferred_person'
    | 'person_collaboration_conflict'
    | 'internal_margin_gap'
    | 'target_revenue_gap'
    | 'target_revenue_surplus'
    | 'over_allocated';
  severity: ValidationSeverity;
  message: string;
}

export interface AllocationWeeklyOverride {
  periodId: string;
  hours?: Hours;
}

export interface AllocationMeetingState {
  unchanged?: boolean;
  changedThisWeek?: boolean;
  handoffRequired?: boolean;
  planB?: boolean;
  mentoring?: boolean;
  backup?: boolean;
}

export interface PersonTileAllocation {
  id: string;
  personId: string;
  tileIndex: number;
  target: AllocationTarget;
  previousTarget?: AllocationTarget;
  periodId: string;
  mode: AllocationMode;
  revenueK: MoneyK;
  hours: Hours;
  skillId?: SkillId;
  requirementId?: string;
  projectSlotIndex?: number;
  hoursOverridden?: boolean;
  revenueOverridden?: boolean;
  meetingState?: AllocationMeetingState;
  weeklyOverrides?: AllocationWeeklyOverride[];
  validation?: AllocationValidation[];
}

export type WeeklyAllocationSource = 'baseline' | 'manual';

export interface WeeklyAllocation {
  id: string;
  monthPeriodId: string;
  weekPeriodId: string;
  personId: string;
  slotIndex: number;
  source?: WeeklyAllocationSource;
  target: AllocationTarget;
  mode: AllocationMode;
  costK: MoneyK;
  revenueK: MoneyK;
  hours: Hours;
  skillId?: SkillId;
  requirementId?: string;
  projectSlotIndex?: number;
  validation?: AllocationValidation[];
}

export interface TrafficSnapshot {
  schemaVersion: number;
  skills: Skill[];
  periods: Period[];
  tileUnits: TileUnit[];
  activePeriodId: string;
  activeTileUnitId: string;
  people: Person[];
  projects: ProjectFrame[];
  allocations: PersonTileAllocation[];
  weeklyAllocations?: WeeklyAllocation[];
  planningRules?: PlanningRule[];
}

export function getTileLayer(person: Person, tileIndex: number, periodId?: string) {
  const ordinal = tileIndex + 1;
  const periodOverride = periodId
    ? person.monthlyOverrides?.find((entry) => entry.periodId === periodId)
    : undefined;
  const layers = periodOverride?.layers || periodOverride?.profile?.layers || person.layers;

  if (ordinal <= layers.workK) return 'work';
  if (ordinal <= layers.adminK) return 'admin';
  if (ordinal <= layers.salesK) return 'sales';
  return 'margin';
}

export function getContractTypeLabel(type: ContractType) {
  switch (type) {
    case 'hourly':
      return 'T&M bez CAP';
    case 'time_materials_capped':
      return 'T&M z CAP';
    case 'fixed_monthly':
      return 'Stała kwota / miesiąc';
    case 'fixed_phase':
      return 'Stała kwota / etap';
    case 'multi_month_fixed':
      return 'Stała kwota wielomiesięczna';
  }
}

export function getStageLabel(stage: ProjectStage) {
  switch (stage) {
    case 'signed':
      return 'Pewne';
    case 'likely':
      return 'Prawdopodobne';
    case 'possible':
      return 'Możliwe';
    case 'defensive':
      return 'Defensywny';
  }
}

export function getProjectPlanningStatusLabel(status: ProjectPlanningStatus | undefined) {
  switch (status) {
    case 'ghost':
      return 'Szansa sprzedażowa';
    case 'active':
    default:
      return 'Aktywny projekt';
  }
}

export function getProjectWorkTypeLabel(workType: ProjectWorkType | undefined) {
  switch (workType) {
    case 'research_development':
      return 'R&D / eksperyment';
    case 'waiting_room':
      return 'Poczekalnia';
    case 'defensive_maintenance':
      return 'Defensywny maintenance';
    case 'time_off':
      return 'URLOP';
    case 'commercial':
    default:
      return 'Komercyjny';
  }
}

export function getProjectWorkType(project: Pick<ProjectFrame, 'workType'> | undefined): ProjectWorkType {
  return project?.workType || 'commercial';
}

export function isTimeOffProject(project: Pick<ProjectFrame, 'workType'> | undefined) {
  return getProjectWorkType(project) === 'time_off';
}

export function isProductiveAllocationTarget(
  allocation: Pick<PersonTileAllocation, 'target'>,
  projectsById: ReadonlyMap<string, Pick<ProjectFrame, 'workType'>>
) {
  if (allocation.target === 'bench') return false;
  return !isTimeOffProject(projectsById.get(allocation.target));
}
