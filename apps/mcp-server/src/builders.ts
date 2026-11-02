import {
  createPersonPairPlanningRule,
  isPersonActiveInPeriod,
  type BenchAlertSeverity,
  type ContractType,
  type CostLayers,
  type CostModelType,
  type ExternalEntityRef,
  type FxRateSnapshot,
  type MonthlyPersonOverride,
  type MonthlyRevenuePlan,
  type MoveTrafficAllocation,
  type Person,
  type PlanningRule,
  type ProjectFrame,
  type ProjectRequirement,
  type ProjectStage,
  type ProjectWorkType,
  type Seniority,
  type SkillId,
  type TrafficSnapshot,
} from '@ptm/domain';

export interface CreatePersonInput {
  id?: string;
  externalId?: string;
  sourceSystem?: string;
  name: string;
  role: string;
  initials?: string;
  color?: string;
  skillIds?: SkillId[];
  seniority?: Seniority;
  monthlyCostK: number;
  costModelType?: CostModelType;
  defaultMonthlyHours?: number;
  internalHourlyCostPln?: number;
  fixedMonthlyCostK?: number;
  hoursPerTile?: number;
  layers?: CostLayers;
  monthlyOverrides?: MonthlyPersonOverride[];
  benchAlertSeverity?: BenchAlertSeverity;
  archivedAt?: string;
}

export interface CreateProjectInput {
  id?: string;
  externalId?: string;
  sourceSystem?: string;
  name: string;
  client: string;
  periodId?: string;
  contractType?: ContractType;
  stage?: ProjectStage;
  planningStatus?: ProjectFrame['planningStatus'];
  workType?: ProjectWorkType;
  revenueK: number;
  committedRevenueK?: number;
  probability?: number;
  projectRatePlnH?: number;
  projectRateNativeH?: number;
  projectRateCurrency?: string;
  companyTargetRatePlnH?: number;
  skillRatesPlnH?: Partial<Record<SkillId, number>>;
  billingCurrency?: string;
  fxMode?: NonNullable<ProjectFrame['currencyProfile']>['fxMode'];
  fx?: FxRateSnapshot;
  notes?: string;
  endPeriodId?: string;
  sourceStatus?: ProjectFrame['sourceStatus'];
  sourceStatusNote?: string;
  preferredPersonIds?: string[];
  blockedPersonIds?: string[];
  revenuePlans?: MonthlyRevenuePlan[];
  requirements?: Array<{
    id?: string;
    skillId: SkillId;
    seniority?: Seniority;
    estimatedHours: number;
    required?: boolean;
    phaseLabel?: string;
  }>;
}

export interface MovePersonCapacityInput {
  personId: string;
  toTarget: string;
  periodId?: string;
  tileCount?: number;
  fromTarget?: string;
}

export interface ReconcilePersonCapacityInput {
  personId: string;
  target: string;
  desiredTileCount: number;
  periodId?: string;
  fromTarget?: string;
  allowReduce?: boolean;
  requirementId?: string;
  projectSlotStart?: number;
  skipRequirementSuggestion?: boolean;
}

export interface CreatePersonPairBlockInput {
  personAId: string;
  personBId: string;
  periodId?: string;
  projectId?: string;
  severity?: PlanningRule['severity'];
  reason?: string;
}

export interface ImportValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  sourceRecordId?: string;
}

export interface BoardSummaryOptions {
  includeEntities?: boolean;
}

export interface CompactBoardSummary {
  schemaVersion: number;
  activePeriodId: string;
  requestedPeriod: TrafficSnapshot['periods'][number] | undefined;
  counts: {
    skills: number;
    periods: number;
    people: number;
    activePeople: number;
    projects: number;
    planningRules: number;
    periodAllocations: number;
  };
}

export interface BoardSummary extends CompactBoardSummary {
  people: Array<{
    id: string;
    name: string;
    role: string;
    initials: string;
    skillIds: SkillId[];
    seniority: Seniority | undefined;
    monthlyCostK: number;
    externalRefCount: number;
    archivedAt: string | undefined;
    benchTiles: number;
    assignedTiles: number;
  }>;
  projects: Array<{
    id: string;
    name: string;
    client: string;
    contractType: ContractType;
    stage: ProjectStage;
    planningStatus: ProjectFrame['planningStatus'];
    workType: ProjectWorkType;
    probability: number;
    revenueK: number;
    committedRevenueK: number;
    externalRefCount: number;
    assignedTiles: number;
    assignedRevenueK: number;
    archivedInPeriod: boolean;
  }>;
}

export function summarizeBoard(
  snapshot: TrafficSnapshot,
  periodId: string | undefined,
  options: { includeEntities: false }
): CompactBoardSummary;
export function summarizeBoard(
  snapshot: TrafficSnapshot,
  periodId?: string,
  options?: BoardSummaryOptions
): BoardSummary;
export function summarizeBoard(
  snapshot: TrafficSnapshot,
  periodId = snapshot.activePeriodId,
  options: BoardSummaryOptions = {}
): BoardSummary | CompactBoardSummary {
  const period = snapshot.periods.find((item) => item.id === periodId);
  const periodAllocations = snapshot.allocations.filter((allocation) => allocation.periodId === periodId);

  const summary = {
    schemaVersion: snapshot.schemaVersion,
    activePeriodId: snapshot.activePeriodId,
    requestedPeriod: period,
    counts: {
      skills: snapshot.skills.length,
      periods: snapshot.periods.length,
      people: snapshot.people.length,
      activePeople: snapshot.people.filter((person) => isPersonActiveInPeriod(person, periodId)).length,
      projects: snapshot.projects.length,
      planningRules: snapshot.planningRules?.length || 0,
      periodAllocations: periodAllocations.length,
    },
  };

  if (options.includeEntities === false) {
    return summary;
  }

  return {
    ...summary,
    people: snapshot.people.map((person) => {
      const allocations = periodAllocations.filter((allocation) => allocation.personId === person.id);
      return {
        id: person.id,
        name: person.name,
        role: person.role,
        initials: person.initials,
        skillIds: person.skillIds,
        seniority: person.seniority,
        monthlyCostK: person.monthlyCostK,
        externalRefCount: person.externalRefs?.length || 0,
        archivedAt: person.archivedAt,
        benchTiles: allocations.filter((allocation) => allocation.target === 'bench').length,
        assignedTiles: allocations.filter((allocation) => allocation.target !== 'bench').length,
      };
    }),
    projects: snapshot.projects.map((project) => {
      const revenuePlan = project.revenuePlan.find((plan) => plan.periodId === periodId);
      const allocations = periodAllocations.filter((allocation) => allocation.target === project.id);
      return {
        id: project.id,
        name: project.name,
        client: project.client,
        contractType: project.contractType,
        stage: project.stage,
        planningStatus: project.planningStatus,
        workType: project.workType || 'commercial',
        probability: revenuePlan?.probability ?? project.probability,
        revenueK: revenuePlan?.revenueK ?? 0,
        committedRevenueK: revenuePlan?.committedRevenueK ?? 0,
        externalRefCount: project.externalRefs?.length || 0,
        assignedTiles: allocations.length,
        assignedRevenueK: sumBy(allocations, (allocation) => allocation.revenueK),
        archivedInPeriod: Boolean(project.archivedPeriodIds?.includes(periodId)),
      };
    }),
  };
}

export function buildPerson(snapshot: TrafficSnapshot, input: CreatePersonInput): Person {
  const monthlyCostK = positiveNumber(input.monthlyCostK, 'monthlyCostK');
  const defaultMonthlyHours = positiveNumber(input.defaultMonthlyHours ?? 160, 'defaultMonthlyHours');
  const name = nonEmptyString(input.name, 'name');
  const role = nonEmptyString(input.role, 'role');
  const externalRefs = createExternalRefs(input.sourceSystem, input.externalId);
  const id = input.id?.trim() ||
    createStableImportId('person', input.sourceSystem, input.externalId) ||
    createEntityId('person', name, new Set(snapshot.people.map((person) => person.id)));
  const fixedMonthlyCostK = input.fixedMonthlyCostK ?? monthlyCostK;
  const costModelType = input.costModelType || 'fixed_monthly';

  return {
    id,
    name,
    role,
    initials: normalizeInitials(input.initials || deriveInitials(name)),
    color: input.color || pickColor(snapshot.people.length),
    skillIds: input.skillIds?.length ? input.skillIds : ['fullstack'],
    seniority: input.seniority || 'mid',
    costModel: {
      type: costModelType,
      defaultMonthlyHours,
      internalHourlyCostPln: input.internalHourlyCostPln ?? Math.round((fixedMonthlyCostK * 1000) / defaultMonthlyHours),
      fixedMonthlyCostK,
    },
    monthlyCostK,
    hoursPerTile: positiveNumber(input.hoursPerTile ?? 5, 'hoursPerTile'),
    layers: input.layers || createDefaultLayers(monthlyCostK),
    monthlyOverrides: input.monthlyOverrides,
    preferences: [],
    benchAlertSeverity: input.benchAlertSeverity,
    externalRefs,
    archivedAt: input.archivedAt,
  };
}

export function buildProject(snapshot: TrafficSnapshot, input: CreateProjectInput): ProjectFrame {
  const periodId = input.periodId || snapshot.activePeriodId;
  const period = snapshot.periods.find((item) => item.id === periodId);
  if (!period) throw new Error(`Unknown periodId: ${periodId}`);
  if (input.endPeriodId && !snapshot.periods.some((item) => item.id === input.endPeriodId)) {
    throw new Error(`Unknown endPeriodId: ${input.endPeriodId}`);
  }

  const revenueK = positiveNumber(input.revenueK, 'revenueK');
  const stage = input.stage || (input.committedRevenueK && input.committedRevenueK >= revenueK ? 'signed' : 'possible');
  const probability = clampProbability(input.probability ?? getDefaultProbability(stage));
  const name = nonEmptyString(input.name, 'name');
  const client = nonEmptyString(input.client, 'client');
  const externalRefs = createExternalRefs(input.sourceSystem, input.externalId);
  const id = input.id?.trim() ||
    createStableImportId('project', input.sourceSystem, input.externalId) ||
    createEntityId('project', name, new Set(snapshot.projects.map((project) => project.id)));
  const requirements = (input.requirements || []).map((requirement, index) => buildRequirement(id, requirement, index));
  const billingCurrency = normalizeCurrencyCode(input.billingCurrency || input.revenuePlans?.[0]?.currency || 'PLN');
  const fxMode = input.fxMode || (billingCurrency === 'PLN' ? 'pln' : input.fx ? 'manual' : 'provider_daily_mid');
  const revenuePlan = input.revenuePlans?.length
    ? input.revenuePlans.map((plan) => buildRevenuePlan(plan, probability, billingCurrency))
    : [{
      periodId,
      nativeRevenueK: revenueK,
      nativeCommittedRevenueK: input.committedRevenueK,
      currency: billingCurrency,
      fx: input.fx,
      revenueK,
      committedRevenueK: input.committedRevenueK,
      probability,
    }];

  return {
    id,
    name,
    client,
    contractType: input.contractType || 'time_materials_capped',
    stage,
    planningStatus: input.planningStatus || (stage === 'signed' ? 'active' : 'ghost'),
    sourceStatus: input.sourceStatus || 'synced',
    sourceStatusNote: input.sourceStatusNote,
    workType: input.workType || 'commercial',
    currencyProfile: {
      billingCurrency,
      defaultFx: input.fx,
      fxMode,
    },
    budgetK: revenueK,
    probability,
    startMonth: period.label,
    startPeriodId: periodId,
    endPeriodId: input.endPeriodId || periodId,
    rateConfig: {
      projectRateNativeH: input.projectRateNativeH,
      projectRateCurrency: input.projectRateCurrency,
      projectRatePlnH: input.projectRatePlnH,
      companyTargetRatePlnH: input.companyTargetRatePlnH ?? 260,
      skillRatesPlnH: input.skillRatesPlnH || {},
    },
    requirements,
    preferredPersonIds: input.preferredPersonIds || [],
    blockedPersonIds: input.blockedPersonIds || [],
    revenuePlan,
    invoices: [],
    notes: input.notes?.trim() || '',
    externalRefs,
  };
}

export function selectPersonCapacityMoves(snapshot: TrafficSnapshot, input: MovePersonCapacityInput) {
  const periodId = input.periodId || snapshot.activePeriodId;
  const tileCount = Math.floor(input.tileCount ?? 1);
  if (tileCount < 1) throw new Error('tileCount must be at least 1.');
  if (!snapshot.people.some((person) => person.id === input.personId && !person.archivedAt)) {
    throw new Error(`Unknown active personId: ${input.personId}`);
  }
  if (input.toTarget !== 'bench' && !snapshot.projects.some((project) => project.id === input.toTarget)) {
    throw new Error(`Unknown target project id: ${input.toTarget}`);
  }

  const candidates = snapshot.allocations
    .filter((allocation) => allocation.periodId === periodId)
    .filter((allocation) => allocation.personId === input.personId)
    .filter((allocation) => allocation.target !== input.toTarget)
    .filter((allocation) => !input.fromTarget || allocation.target === input.fromTarget)
    .sort((a, b) => {
      if (a.target === 'bench' && b.target !== 'bench') return -1;
      if (a.target !== 'bench' && b.target === 'bench') return 1;
      return a.tileIndex - b.tileIndex;
    })
    .slice(0, tileCount);

  if (candidates.length < tileCount) {
    throw new Error(`Only ${candidates.length} movable tile(s) found for ${input.personId} in ${periodId}.`);
  }

  return {
    periodId,
    moves: candidates.map((allocation) => ({
      tileId: allocation.id,
      target: input.toTarget,
    })),
  };
}

export function selectPersonCapacityReconciliation(snapshot: TrafficSnapshot, input: ReconcilePersonCapacityInput) {
  const periodId = input.periodId || snapshot.activePeriodId;
  const desiredTileCount = Math.floor(input.desiredTileCount);
  if (desiredTileCount < 0) throw new Error('desiredTileCount must be at least 0.');
  if (!snapshot.periods.some((period) => period.id === periodId && period.granularity === 'month')) {
    throw new Error(`Unknown month periodId: ${periodId}.`);
  }
  if (!snapshot.people.some((person) => person.id === input.personId && !person.archivedAt)) {
    throw new Error(`Unknown active personId: ${input.personId}`);
  }
  if (input.target !== 'bench' && !snapshot.projects.some((project) => project.id === input.target)) {
    throw new Error(`Unknown target project id: ${input.target}`);
  }

  const allocations = snapshot.allocations
    .filter((allocation) => allocation.periodId === periodId)
    .filter((allocation) => allocation.personId === input.personId);
  const currentTargetAllocations = allocations
    .filter((allocation) => allocation.target === input.target)
    .sort((a, b) => a.tileIndex - b.tileIndex);
  const delta = desiredTileCount - currentTargetAllocations.length;
  const moves: MoveTrafficAllocation[] = [];

  if (delta > 0) {
    const candidates = allocations
      .filter((allocation) => allocation.target !== input.target)
      .filter((allocation) => !input.fromTarget || allocation.target === input.fromTarget)
      .sort((a, b) => {
        if (a.target === 'bench' && b.target !== 'bench') return -1;
        if (a.target !== 'bench' && b.target === 'bench') return 1;
        return a.tileIndex - b.tileIndex;
      })
      .slice(0, delta);
    if (candidates.length < delta) {
      throw new Error(`Only ${candidates.length} movable tile(s) found for ${input.personId} in ${periodId}.`);
    }
    moves.push(...candidates.map((allocation, index) => ({
      tileId: allocation.id,
      target: input.target,
      requirementId: input.requirementId,
      projectSlotIndex: input.projectSlotStart === undefined ? undefined : input.projectSlotStart + index,
      skipRequirementSuggestion: input.skipRequirementSuggestion,
    })));
  }

  if (delta < 0 && input.allowReduce !== false) {
    moves.push(...currentTargetAllocations.slice(desiredTileCount).map((allocation) => ({
      tileId: allocation.id,
      target: 'bench',
      skipRequirementSuggestion: true,
    })));
  }

  return {
    periodId,
    moves,
    currentTileCount: currentTargetAllocations.length,
    desiredTileCount,
  };
}

export function findPersonByExternalRef(snapshot: TrafficSnapshot, sourceSystem: string | undefined, externalId: string | undefined) {
  const stableId = createStableImportId('person', sourceSystem, externalId);
  return snapshot.people.find((person) => (
    Boolean(stableId && person.id === stableId) ||
    hasExternalRef(person.externalRefs, sourceSystem, externalId)
  ));
}

export function findProjectByExternalRef(snapshot: TrafficSnapshot, sourceSystem: string | undefined, externalId: string | undefined) {
  const stableId = createStableImportId('project', sourceSystem, externalId);
  return snapshot.projects.find((project) => (
    Boolean(stableId && project.id === stableId) ||
    hasExternalRef(project.externalRefs, sourceSystem, externalId)
  ));
}

export function mergeExternalRefs(
  existingRefs: ExternalEntityRef[] | undefined,
  sourceSystem: string | undefined,
  externalId: string | undefined
) {
  const nextRef = createExternalRefs(sourceSystem, externalId)?.[0];
  if (!nextRef) return existingRefs;
  if (hasExternalRef(existingRefs, nextRef.sourceSystem, nextRef.sourceId)) return existingRefs;
  return [...(existingRefs || []), nextRef];
}

export function validateImportReferences(snapshot: TrafficSnapshot, input: {
  sourceSystem?: string;
  people?: Array<{ externalId?: string; id?: string; name?: string; periodId?: string }>;
  projects?: Array<{ externalId?: string; id?: string; name?: string; periodId?: string; revenuePlans?: Array<{ periodId: string }> }>;
  allocations?: Array<{
    sourceRecordId?: string;
    personId?: string;
    personExternalId?: string;
    projectId?: string;
    projectExternalId?: string;
    target?: string;
    periodId?: string;
    desiredTileCount?: number;
  }>;
}): ImportValidationIssue[] {
  const issues: ImportValidationIssue[] = [];
  collectDuplicateIssues(issues, 'person', input.people || []);
  collectDuplicateIssues(issues, 'project', input.projects || []);

  input.people?.forEach((person) => {
    if (!person.periodId) return;
    if (!snapshot.periods.some((period) => period.id === person.periodId && period.granularity === 'month')) {
      issues.push({
        severity: 'error',
        code: 'missing_period',
        message: `Person ${person.name || person.id || person.externalId || 'unknown'} references missing month period ${person.periodId}.`,
        sourceRecordId: person.externalId,
      });
    }
  });

  input.projects?.forEach((project) => {
    const periodIds = new Set([
      project.periodId,
      ...(project.revenuePlans || []).map((plan) => plan.periodId),
    ].filter((periodId): periodId is string => Boolean(periodId)));
    periodIds.forEach((periodId) => {
      if (!snapshot.periods.some((period) => period.id === periodId && period.granularity === 'month')) {
        issues.push({
          severity: 'error',
          code: 'missing_period',
          message: `Project ${project.name || project.id || project.externalId || 'unknown'} references missing month period ${periodId}.`,
          sourceRecordId: project.externalId,
        });
      }
    });
  });

  input.allocations?.forEach((allocation) => {
    const sourceRecordId = allocation.sourceRecordId || allocation.personExternalId || allocation.personId;
    const person = allocation.personId
      ? snapshot.people.find((item) => item.id === allocation.personId)
      : findPersonByExternalRef(snapshot, input.sourceSystem, allocation.personExternalId);
    const project = allocation.projectId
      ? snapshot.projects.find((item) => item.id === allocation.projectId)
      : findProjectByExternalRef(snapshot, input.sourceSystem, allocation.projectExternalId);
    const periodId = allocation.periodId || snapshot.activePeriodId;

    if (!person) {
      issues.push({ severity: 'error', code: 'missing_person', message: 'Allocation references an unknown person.', sourceRecordId });
    }
    if (!project && allocation.target !== 'bench' && allocation.projectId !== 'bench' && allocation.projectExternalId !== 'bench') {
      issues.push({ severity: 'error', code: 'missing_project', message: 'Allocation references an unknown project.', sourceRecordId });
    }
    if (!snapshot.periods.some((period) => period.id === periodId && period.granularity === 'month')) {
      issues.push({ severity: 'error', code: 'missing_period', message: `Allocation references missing month period ${periodId}.`, sourceRecordId });
    }
    if (allocation.desiredTileCount !== undefined && (!Number.isFinite(allocation.desiredTileCount) || allocation.desiredTileCount < 0)) {
      issues.push({ severity: 'error', code: 'invalid_tile_count', message: 'desiredTileCount must be a non-negative number.', sourceRecordId });
    }
  });

  return issues;
}

export function buildPersonPairBlockRule(snapshot: TrafficSnapshot, input: CreatePersonPairBlockInput): PlanningRule {
  if (input.personAId === input.personBId) {
    throw new Error('personAId and personBId must be different.');
  }
  if (!snapshot.people.some((person) => person.id === input.personAId && !person.archivedAt)) {
    throw new Error(`Unknown active personAId: ${input.personAId}`);
  }
  if (!snapshot.people.some((person) => person.id === input.personBId && !person.archivedAt)) {
    throw new Error(`Unknown active personBId: ${input.personBId}`);
  }
  if (input.periodId && !snapshot.periods.some((period) => period.id === input.periodId)) {
    throw new Error(`Unknown periodId: ${input.periodId}`);
  }
  if (input.projectId && !snapshot.projects.some((project) => project.id === input.projectId)) {
    throw new Error(`Unknown projectId: ${input.projectId}`);
  }
  return createPersonPairPlanningRule({
    personAId: input.personAId,
    personBId: input.personBId,
    projectId: input.projectId,
    timeScope: input.periodId ? 'period' : 'permanent',
    periodId: input.periodId,
    severity: input.severity || 'hard',
    reason: input.reason,
  });
}

function buildRequirement(
  projectId: string,
  requirement: NonNullable<CreateProjectInput['requirements']>[number],
  index: number
): ProjectRequirement {
  return {
    id: requirement.id?.trim() || `${projectId}-${requirement.skillId}-${index + 1}`,
    skillId: requirement.skillId,
    seniority: requirement.seniority,
    estimatedHours: positiveNumber(requirement.estimatedHours, 'estimatedHours'),
    required: requirement.required !== false,
    phaseLabel: requirement.phaseLabel?.trim() || undefined,
  };
}

function buildRevenuePlan(plan: MonthlyRevenuePlan, defaultProbability: number, fallbackCurrency: string): MonthlyRevenuePlan {
  return {
    ...plan,
    currency: normalizeCurrencyCode(plan.currency || fallbackCurrency),
    revenueK: positiveNumber(plan.revenueK, 'revenuePlan.revenueK'),
    committedRevenueK: plan.committedRevenueK,
    probability: plan.probability === undefined ? defaultProbability : clampProbability(plan.probability),
  };
}

function createDefaultLayers(monthlyCostK: number): CostLayers {
  const workK = Math.max(1, Math.round(monthlyCostK * 0.65));
  const adminK = Math.max(workK, Math.round(monthlyCostK * 0.82));
  const salesK = Math.max(adminK, Math.round(monthlyCostK));
  const targetK = Math.max(salesK + 1, Math.ceil(monthlyCostK * 1.35));
  return { workK, adminK, salesK, targetK };
}

function createEntityId(prefix: string, label: string, existingIds: Set<string>) {
  const slug = sanitizeIdPart(label) || prefix;
  let candidate = `${prefix}-${slug}`;
  let index = 2;
  while (existingIds.has(candidate)) {
    candidate = `${prefix}-${slug}-${index}`;
    index += 1;
  }
  return candidate;
}

function createStableImportId(prefix: 'person' | 'project', sourceSystem: string | undefined, externalId: string | undefined) {
  if (!sourceSystem?.trim() || !externalId?.trim()) return undefined;
  const source = sanitizeIdPart(sourceSystem);
  const sourceId = sanitizeIdPart(externalId);
  if (!source || !sourceId) return undefined;
  return `${prefix}-${source}-${sourceId}`;
}

function sanitizeIdPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function createExternalRefs(sourceSystem: string | undefined, sourceId: string | undefined): ExternalEntityRef[] | undefined {
  const normalizedSource = sourceSystem?.trim();
  const normalizedId = sourceId?.trim();
  if (!normalizedSource || !normalizedId) return undefined;
  return [{
    sourceSystem: normalizedSource,
    sourceId: normalizedId,
    importedAt: new Date().toISOString(),
  }];
}

function hasExternalRef(
  refs: ExternalEntityRef[] | undefined,
  sourceSystem: string | undefined,
  sourceId: string | undefined
) {
  if (!sourceSystem?.trim() || !sourceId?.trim()) return false;
  return Boolean(refs?.some((ref) => (
    ref.sourceSystem === sourceSystem.trim() &&
    ref.sourceId === sourceId.trim()
  )));
}

function normalizeCurrencyCode(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(`Invalid currency code: ${value}`);
  }
  return normalized;
}

function collectDuplicateIssues(
  issues: ImportValidationIssue[],
  entityType: 'person' | 'project',
  items: Array<{ externalId?: string; id?: string; name?: string }>
) {
  const seen = new Map<string, string>();
  items.forEach((item) => {
    const key = item.externalId || item.id;
    if (!key) return;
    const label = item.name || item.id || item.externalId || entityType;
    const previous = seen.get(key);
    if (previous) {
      issues.push({
        severity: 'error',
        code: `duplicate_${entityType}`,
        message: `Duplicate ${entityType} source id ${key}: ${previous} and ${label}.`,
        sourceRecordId: key,
      });
      return;
    }
    seen.set(key, label);
  });
}

function deriveInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'NA';
  return parts.slice(0, 2).map((part) => part[0]).join('');
}

function normalizeInitials(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'NA';
}

function pickColor(index: number) {
  const colors = ['#8b5cf6', '#0ea5e9', '#f97316', '#14b8a6', '#ec4899', '#64748b'];
  return colors[index % colors.length];
}

function positiveNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return value;
}

function nonEmptyString(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty.`);
  return normalized;
}

function clampProbability(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  if (value > 1) return Math.min(100, value) / 100;
  return Math.max(0, Math.min(1, value));
}

function getDefaultProbability(stage: ProjectStage | undefined) {
  switch (stage) {
    case 'signed':
      return 1;
    case 'likely':
      return 0.65;
    case 'defensive':
      return 0.4;
    case 'possible':
    default:
      return 0.5;
  }
}

function sumBy<T>(items: T[], getValue: (item: T) => number) {
  return items.reduce((sum, item) => sum + getValue(item), 0);
}
