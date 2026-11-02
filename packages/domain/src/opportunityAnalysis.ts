import {
  AllocationValidation,
  Hours,
  isProductiveAllocationTarget,
  isTimeOffProject,
  MoneyK,
  Period,
  Person,
  PersonTileAllocation,
  PlanningRule,
  ProjectFrame,
  Seniority,
  SkillId,
  TrafficSnapshot,
} from './traffic.model.js';
import { hasHardPersonPairPlanningConflict } from './planningRules.js';
import {
  allocationCoversRequirement,
  getEffectiveAllocationSkillId,
  hasEnoughSeniority,
  personCanCoverRequirement,
  skillCoversRequirementSkill,
} from './allocationSkills.js';
import {
  getPersonPeriodAvailableHours,
  getPersonPeriodCostK,
  getPersonPeriodLayers,
  getPersonPeriodOverride,
  getPersonPeriodProfile,
} from './personPeriod.js';
import { isPersonActiveInPeriod } from './periods.js';

export type OpportunityVerdict = 'pursue' | 'pursue_with_changes' | 'renegotiate' | 'drop_or_delay';

export interface MonthOpportunityAnalysis {
  generatedAt: string;
  period: Period;
  monthSummary: MonthOpportunitySummary;
  projects: ProjectOpportunityAnalysis[];
  people: PersonCapacityAnalysis[];
  skillBottlenecks: SkillBottleneckAnalysis[];
  allocationRisks: AllocationRiskSummary[];
  removeProjectScenarios: RemoveProjectScenario[];
  benchUtilizationSuggestions: BenchUtilizationSuggestion[];
}

export interface MonthOpportunitySummary {
  committedRevenueK: MoneyK;
  expectedRevenueK: MoneyK;
  plannedRevenueK: MoneyK;
  allocatedRevenueK: MoneyK;
  nonCommercialCapacityK: MoneyK;
  nonCommercialAllocatedCapacityK: MoneyK;
  unallocatedPlannedRevenueK: MoneyK;
  totalCostK: MoneyK;
  targetRevenueK: MoneyK;
  committedGapK: MoneyK;
  expectedGapK: MoneyK;
  targetGapK: MoneyK;
  internalMarginK: MoneyK;
  targetMarginK: MoneyK;
  overAllocatedPeople: number;
  underAllocatedPeople: number;
  highRiskProjectCount: number;
}

export interface ProjectOpportunityAnalysis {
  projectId: string;
  name: string;
  client: string;
  notes?: string;
  workType: ProjectFrame['workType'];
  isCommercialRevenue: boolean;
  contractType: ProjectFrame['contractType'];
  stage: ProjectFrame['stage'];
  planningStatus: ProjectFrame['planningStatus'];
  probability: number;
  plannedCapacityK: MoneyK;
  allocatedCapacityK: MoneyK;
  nonCommercialCapacityK: MoneyK;
  nonCommercialAllocatedCapacityK: MoneyK;
  plannedRevenueK: MoneyK;
  committedRevenueK: MoneyK;
  expectedRevenueK: MoneyK;
  allocatedRevenueK: MoneyK;
  resourceGapK: MoneyK;
  allocatedHours: Hours;
  internalCostK: MoneyK;
  requiredTargetRevenueK: MoneyK;
  contributionMarginK: MoneyK;
  targetMarginK: MoneyK;
  internalMarginGapK: MoneyK;
  targetRevenueGapK: MoneyK;
  riskAdjustedMarginK: MoneyK;
  capacityWeightedOpportunityScore: number;
  profitabilityScore: number;
  deliveryFeasibilityScore: number;
  opportunityCostScore: number;
  overallRecommendationScore: number;
  recommendation: OpportunityVerdict;
  requiredHoursBySkill: SkillHours[];
  allocatedHoursBySkill: SkillHours[];
  missingRequiredHoursBySkill: SkillHours[];
  requirementCoverage: RequirementCoverageAnalysis[];
  validationWarnings: AllocationRiskSummary[];
  allocationCandidates: AllocationCandidateAnalysis[];
}

export interface AllocationCandidateAnalysis {
  projectId: string;
  requirementId?: string;
  skillId?: SkillId;
  personId: string;
  personName: string;
  sourceAllocationIds: string[];
  sourceTargetIds: string[];
  source: 'bench' | 'misallocated_project' | 'low_value_project';
  sourceReason: string;
  availableBenchHours: Hours;
  availableBenchRevenueK: MoneyK;
  missingHours: Hours;
  estimatedRevenueK: MoneyK;
  estimatedInternalCostK: MoneyK;
  estimatedRequiredRevenueK: MoneyK;
  estimatedGrossProfitK: MoneyK;
  profitPerHourPln: number;
  fitScore: number;
  reasons: string[];
}

export interface SkillHours {
  skillId: SkillId;
  hours: Hours;
}

export interface RequirementCoverageAnalysis {
  requirementId: string;
  skillId: SkillId;
  seniority?: Seniority;
  phaseLabel?: string;
  requiredHours: Hours;
  allocatedHours: Hours;
  missingHours: Hours;
}

export interface PersonCapacityAnalysis {
  personId: string;
  name: string;
  role: string;
  skillIds: SkillId[];
  seniority?: Seniority;
  availableHours: Hours;
  allocatedHours: Hours;
  allocatedRevenueK: MoneyK;
  internalCostK: MoneyK;
  internalMarginK: MoneyK;
  targetRevenueK: MoneyK;
  utilizationPercent: number;
  targetCoveragePercent: number;
  fragmentation: number;
  loadScore: number;
  status: 'unavailable' | 'under' | 'healthy' | 'over';
  monthlyOverrideStatus?: string;
  monthlyOverrideNote?: string;
}

export interface SkillBottleneckAnalysis {
  skillId: SkillId;
  requiredHours: Hours;
  allocatedHours: Hours;
  availableMatchingHours: Hours;
  missingHours: Hours;
  bottleneckScore: number;
  isBottleneck: boolean;
}

export interface AllocationRiskSummary {
  allocationId: string;
  projectId?: string;
  personId: string;
  severity: AllocationValidation['severity'];
  code: AllocationValidation['code'];
  message: string;
}

export interface RemoveProjectScenario {
  projectId: string;
  name: string;
  client: string;
  lostAllocatedRevenueK: MoneyK;
  lostExpectedRevenueK: MoneyK;
  releasedHours: Hours;
  releasedInternalCostK: MoneyK;
  releasedTargetRevenueK: MoneyK;
  releasedScarceSkillHours: SkillHours[];
  targetGapAfterRemovalK: MoneyK;
  expectedGapAfterRemovalK: MoneyK;
  riskReductionCount: number;
  dropCandidateScore: number;
}

export interface BenchUtilizationSuggestion {
  personId: string;
  name: string;
  role: string;
  seniority?: Seniority;
  skillIds: SkillId[];
  benchHours: Hours;
  benchRevenueK: MoneyK;
  benchInternalCostK: MoneyK;
  alertLevel: 'low' | 'medium' | 'high' | 'critical';
  suggestion: 'allocate_to_project' | 'create_inhouse_rd';
  preferredProjectIds: string[];
  reason: string;
}

export function generateMonthOpportunityAnalysis(
  snapshot: TrafficSnapshot,
  periodId = snapshot.activePeriodId,
  generatedAt = new Date().toISOString()
): MonthOpportunityAnalysis {
  const period = snapshot.periods.find((item) => item.id === periodId);
  if (!period) {
    throw new Error(`Cannot generate opportunity analysis for missing period: ${periodId}`);
  }

  const people = snapshot.people
    .filter((person) => isPersonActiveInPeriod(person, periodId))
    .map((person) => getPersonPeriodProfile(person, periodId));
  const periodAllocations = snapshot.allocations.filter((allocation) => allocation.periodId === periodId);
  const allocationsByTarget = groupAllocationsByTarget(periodAllocations);
  const activeProjects = snapshot.projects.filter((project) => isProjectActiveInPeriod(project, periodId, allocationsByTarget));
  const activeProjectsById = new Map(activeProjects.map((project) => [project.id, project]));
  const projects = activeProjects.filter((project) => !isTimeOffProject(project));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const projectAnalysesWithoutCandidates = projects.map((project) => analyzeProject(project, periodId, allocationsByTarget.get(project.id) || [], peopleById));
  const projectAnalyses = addAllocationCandidates(projectAnalysesWithoutCandidates, projects, people, periodId, periodAllocations, snapshot.planningRules || []);
  const personAnalyses = people.map((person) => analyzePerson(person, periodId, periodAllocations, activeProjectsById));
  const skillBottlenecks = analyzeSkillBottlenecks(snapshot.skills.map((skill) => skill.id), projects, people, periodId, periodAllocations);
  const allocationRisks = summarizeAllocationRisks(periodAllocations);
  const monthSummary = summarizeMonth(projectAnalyses, personAnalyses);
  const removeProjectScenarios = projectAnalyses
    .map((project) => analyzeRemoveProjectScenario(project, monthSummary, skillBottlenecks))
    .sort((a, b) => b.dropCandidateScore - a.dropCandidateScore);
  const benchUtilizationSuggestions = analyzeBenchUtilization(people, periodId, periodAllocations, projectAnalyses, projects);

  return {
    generatedAt,
    period,
    monthSummary,
    projects: projectAnalyses,
    people: personAnalyses,
    skillBottlenecks,
    allocationRisks,
    removeProjectScenarios,
    benchUtilizationSuggestions,
  };
}

function analyzeProject(
  project: ProjectFrame,
  periodId: string,
  allocations: PersonTileAllocation[],
  peopleById: Map<string, Person>
): ProjectOpportunityAnalysis {
  const plan = project.revenuePlan.find((entry) => entry.periodId === periodId);
  const plannedCapacityK = roundMoneyK(plan?.revenueK ?? project.budgetK);
  const isCommercialRevenue = projectCountsAsCommercialRevenue(project);
  const plannedRevenueK = isCommercialRevenue ? plannedCapacityK : 0;
  const nonCommercialCapacityK = isCommercialRevenue ? 0 : plannedCapacityK;
  const probability = clamp(plan?.probability ?? project.probability, 0, 1);
  const committedCapacityK = roundMoneyK(plan?.committedRevenueK ?? (project.stage === 'signed' ? plannedCapacityK : 0));
  const committedRevenueK = isCommercialRevenue ? committedCapacityK : 0;
  const allocatedCapacityK = roundMoneyK(sum(allocations, (allocation) => allocation.revenueK));
  const allocatedRevenueK = isCommercialRevenue ? allocatedCapacityK : 0;
  const nonCommercialAllocatedCapacityK = isCommercialRevenue ? 0 : allocatedCapacityK;
  const resourceGapK = roundMoneyK(Math.max(0, plannedRevenueK - allocatedRevenueK));
  const allocatedHours = roundHours(sum(allocations, (allocation) => allocation.hours));
  const internalCostK = roundMoneyK(sum(allocations, (allocation) => {
    return calculateHoursToInternalCostK(peopleById.get(allocation.personId), periodId, allocation.hours);
  }));
  const requiredTargetRevenueK = roundMoneyK(sum(allocations, (allocation) => {
    return calculateHoursToRequiredRevenueK(
      allocation.hours,
      getRequiredRevenueRate(project, getEffectiveAllocationSkillId(allocation, project, peopleById.get(allocation.personId)))
    );
  }));
  const effectiveRevenueK = allocatedRevenueK || plannedRevenueK;
  const expectedRevenueK = roundMoneyK(effectiveRevenueK * probability);
  const contributionMarginK = roundMoneyK(effectiveRevenueK - internalCostK);
  const targetMarginK = roundMoneyK(effectiveRevenueK - requiredTargetRevenueK);
  const internalMarginGapK = roundMoneyK(Math.max(0, internalCostK - effectiveRevenueK));
  const targetRevenueGapK = roundMoneyK(Math.max(0, requiredTargetRevenueK - effectiveRevenueK));
  const riskAdjustedMarginK = roundMoneyK(expectedRevenueK - internalCostK);
  const requirementCoverage = getRequirementCoverage(project, allocations, peopleById);
  const requiredHoursBySkill = groupRequirementHours(project);
  const allocatedHoursBySkill = groupAllocationHours(project, allocations, peopleById);
  const missingRequiredHoursBySkill = groupMissingRequirementHoursBySkill(requirementCoverage);
  const validationWarnings = summarizeAllocationRisks(allocations);
  const deliveryFeasibilityScore = getDeliveryFeasibilityScore(missingRequiredHoursBySkill, validationWarnings, resourceGapK);
  const profitabilityScore = getProfitabilityScore(contributionMarginK, effectiveRevenueK, targetRevenueGapK);
  const capacityWeightedOpportunityScore = getCapacityWeightedOpportunityScore(riskAdjustedMarginK, allocatedHours);
  const opportunityCostScore = getOpportunityCostScore(capacityWeightedOpportunityScore, missingRequiredHoursBySkill);
  const overallRecommendationScore = Math.round((
    profitabilityScore * 0.35 +
    deliveryFeasibilityScore * 0.25 +
    capacityWeightedOpportunityScore * 0.25 +
    (100 - opportunityCostScore) * 0.15
  ));

  return {
    projectId: project.id,
    name: project.name,
    client: project.client,
    notes: normalizeProjectNotes(project.notes),
    workType: project.workType,
    isCommercialRevenue,
    contractType: project.contractType,
    stage: project.stage,
    planningStatus: project.planningStatus,
    probability,
    plannedCapacityK,
    allocatedCapacityK,
    nonCommercialCapacityK,
    nonCommercialAllocatedCapacityK,
    plannedRevenueK,
    committedRevenueK,
    expectedRevenueK,
    allocatedRevenueK,
    resourceGapK,
    allocatedHours,
    internalCostK,
    requiredTargetRevenueK,
    contributionMarginK,
    targetMarginK,
    internalMarginGapK,
    targetRevenueGapK,
    riskAdjustedMarginK,
    capacityWeightedOpportunityScore,
    profitabilityScore,
    deliveryFeasibilityScore,
    opportunityCostScore,
    overallRecommendationScore,
    recommendation: getProjectRecommendation(overallRecommendationScore, internalMarginGapK, targetRevenueGapK, deliveryFeasibilityScore, resourceGapK),
    requiredHoursBySkill,
    allocatedHoursBySkill,
    missingRequiredHoursBySkill,
    requirementCoverage,
    validationWarnings,
    allocationCandidates: [],
  };
}

function addAllocationCandidates(
  analyses: ProjectOpportunityAnalysis[],
  projects: ProjectFrame[],
  people: Person[],
  periodId: string,
  periodAllocations: PersonTileAllocation[],
  planningRules: PlanningRule[]
): ProjectOpportunityAnalysis[] {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const analysesByProjectId = new Map(analyses.map((analysis) => [analysis.projectId, analysis]));
  const peopleById = new Map(people.map((person) => [person.id, person]));

  return analyses.map((analysis) => {
    const project = projectsById.get(analysis.projectId);
    if (!project) return analysis;

    return {
      ...analysis,
      allocationCandidates: buildProjectAllocationCandidates(
        analysis,
        project,
        people,
        periodAllocations,
        periodId,
        planningRules,
        projectsById,
        analysesByProjectId,
        peopleById
      ),
    };
  });
}

function buildProjectAllocationCandidates(
  analysis: ProjectOpportunityAnalysis,
  project: ProjectFrame,
  people: Person[],
  periodAllocations: PersonTileAllocation[],
  periodId: string,
  planningRules: PlanningRule[],
  projectsById: Map<string, ProjectFrame>,
  analysesByProjectId: Map<string, ProjectOpportunityAnalysis>,
  peopleById: Map<string, Person>
): AllocationCandidateAnalysis[] {
  const candidateNeeds = getProjectCandidateNeeds(analysis, project);
  if (!candidateNeeds.length) return [];

  return candidateNeeds.flatMap((need) => {
    return people.flatMap((person) => {
      if (isPersonUnavailableForAiPlanning(person, periodId)) return [];
      if (project.blockedPersonIds?.includes(person.id)) return [];
      if (hasHardPersonPairPlanningConflict({
        candidatePersonId: person.id,
        existingPersonIds: periodAllocations
          .filter((allocation) => allocation.target === project.id)
          .map((allocation) => allocation.personId),
        peopleById,
        periodId,
        planningRules,
        projectId: project.id,
      })) return [];
      if (need.requirement && !personCanCoverRequirement(person, need.requirement)) return [];
      if (need.requirement && !hasEnoughSeniority(person.seniority, need.requirement.seniority)) return [];

      const candidateSources = getAllocationCandidateSources({
        analysesByProjectId,
        need,
        peopleById,
        periodAllocations,
        person,
        projectsById,
        targetProject: project,
      });
      const availableBenchHours = roundHours(sum(candidateSources, (source) => source.allocation.hours));
      if (availableBenchHours <= 0) return [];

      const availableBenchRevenueK = roundMoneyK(sum(candidateSources, (source) => source.allocation.revenueK));
      const hoursToUse = Math.min(need.missingHours, availableBenchHours);
      const revenueRatePlnH = getCandidateRevenueRate(project, need.skillId);
      const estimatedRevenueK = roundMoneyK(Math.min(
        need.resourceGapK || Number.POSITIVE_INFINITY,
        (hoursToUse * revenueRatePlnH) / 1000
      ));
      const estimatedInternalCostK = calculateHoursToInternalCostK(person, periodId, hoursToUse);
      const estimatedRequiredRevenueK = calculateHoursToRequiredRevenueK(
        hoursToUse,
        getRequiredRevenueRate(project, need.skillId)
      );
      const estimatedGrossProfitK = roundMoneyK(estimatedRevenueK - estimatedInternalCostK);
      const profitPerHourPln = hoursToUse > 0 ? Math.round((estimatedGrossProfitK * 1000) / hoursToUse) : 0;

      return [{
        projectId: project.id,
        requirementId: need.requirement?.id,
        skillId: need.skillId,
        personId: person.id,
        personName: person.name,
        sourceAllocationIds: candidateSources.map((source) => source.allocation.id),
        sourceTargetIds: Array.from(new Set(candidateSources.map((source) => source.allocation.target))),
        source: getCandidateSourceKind(candidateSources),
        sourceReason: getCandidateSourceReason(candidateSources, projectsById),
        availableBenchHours,
        availableBenchRevenueK,
        missingHours: need.missingHours,
        estimatedRevenueK,
        estimatedInternalCostK,
        estimatedRequiredRevenueK,
        estimatedGrossProfitK,
        profitPerHourPln,
        fitScore: getAllocationCandidateFitScore({
          estimatedGrossProfitK,
          estimatedRevenueK,
          estimatedRequiredRevenueK,
          hoursToUse,
          isPreferred: Boolean(project.preferredPersonIds?.includes(person.id)),
          isRequiredSkillMatch: Boolean(need.requirement),
          person,
          requirement: need.requirement,
          sourcePriority: Math.max(...candidateSources.map((source) => source.priority)),
        }),
        reasons: getAllocationCandidateReasons(project, need, person, estimatedGrossProfitK, profitPerHourPln, candidateSources, projectsById),
      }];
    });
  }).sort((a, b) => (
    b.fitScore - a.fitScore ||
    b.estimatedGrossProfitK - a.estimatedGrossProfitK ||
    b.availableBenchHours - a.availableBenchHours
  ));
}

function getProjectCandidateNeeds(analysis: ProjectOpportunityAnalysis, project: ProjectFrame) {
  const requirementsById = new Map(project.requirements.map((requirement) => [requirement.id, requirement]));
  const missingRequiredNeeds = analysis.requirementCoverage
    .map((coverage) => {
      const requirement = requirementsById.get(coverage.requirementId);
      if (!requirement) return undefined;
      return {
        requirement,
        skillId: requirement.skillId,
        missingHours: coverage.missingHours,
        resourceGapK: analysis.resourceGapK,
      };
    })
    .filter((need): need is {
      requirement: ProjectFrame['requirements'][number];
      skillId: SkillId;
      missingHours: Hours;
      resourceGapK: MoneyK;
    } => Boolean(need))
    .filter((need) => need.missingHours > 0);

  if (missingRequiredNeeds.length) return missingRequiredNeeds;

  if (project.workType && project.workType !== 'commercial') {
    return [];
  }

  if (analysis.resourceGapK <= 0 || project.requirements.some((requirement) => requirement.required)) {
    return [];
  }

  const revenueRatePlnH = getCandidateRevenueRate(project, undefined);
  const missingHours = revenueRatePlnH > 0
    ? roundHours((analysis.resourceGapK * 1000) / revenueRatePlnH)
    : 0;

  return missingHours > 0
    ? [{
      requirement: undefined,
      skillId: undefined,
      missingHours,
      resourceGapK: analysis.resourceGapK,
    }]
    : [];
}

function getCandidateRevenueRate(project: ProjectFrame, skillId: SkillId | undefined) {
  if (skillId && typeof project.rateConfig.skillRatesPlnH?.[skillId] === 'number') {
    return project.rateConfig.skillRatesPlnH[skillId] as number;
  }
  return project.rateConfig.projectRatePlnH || project.rateConfig.companyTargetRatePlnH;
}

function getAllocationCandidateFitScore({
  estimatedGrossProfitK,
  estimatedRevenueK,
  estimatedRequiredRevenueK,
  hoursToUse,
  isPreferred,
  isRequiredSkillMatch,
  person,
  requirement,
  sourcePriority,
}: {
  estimatedGrossProfitK: number;
  estimatedRevenueK: number;
  estimatedRequiredRevenueK: number;
  hoursToUse: number;
  isPreferred: boolean;
  isRequiredSkillMatch: boolean;
  person: Person;
  requirement: ProjectFrame['requirements'][number] | undefined;
  sourcePriority: number;
}) {
  const marginPercent = estimatedRevenueK > 0 ? (estimatedGrossProfitK / estimatedRevenueK) * 100 : 0;
  const targetCoveragePercent = estimatedRequiredRevenueK > 0 ? (estimatedRevenueK / estimatedRequiredRevenueK) * 100 : 100;
  const seniorityPenalty = requirement?.seniority && person.seniority !== requirement.seniority ? 6 : 0;

  return clampScore(
    35 +
    marginPercent +
    Math.min(25, hoursToUse / 2) +
    Math.min(20, targetCoveragePercent / 8) +
    (isPreferred ? 10 : 0) +
    (isRequiredSkillMatch ? 8 : 0) -
    seniorityPenalty +
    sourcePriority
  );
}

function getAllocationCandidateReasons(
  project: ProjectFrame,
  need: ReturnType<typeof getProjectCandidateNeeds>[number],
  person: Person,
  estimatedGrossProfitK: number,
  profitPerHourPln: number,
  candidateSources: AllocationCandidateSource[],
  projectsById: Map<string, ProjectFrame>
) {
  const sourceReason = getCandidateSourceReason(candidateSources, projectsById);
  const reasons = [
    `${person.name} ma ${need.skillId ? `skill ${need.skillId}` : 'wolna komercyjna pojemnosc'}: ${sourceReason}.`,
    `Szacowany zysk brutto ${roundMoneyK(estimatedGrossProfitK)}k, ok. ${profitPerHourPln} PLN/h.`,
  ];

  if (need.requirement?.seniority) reasons.push(`Wymagane seniority: ${need.requirement.seniority}.`);
  if (project.preferredPersonIds?.includes(person.id)) reasons.push('Osoba jest preferowana w projekcie.');
  if (!need.requirement) reasons.push('Projekt nie ma wymagan, wiec kandydat wypelnia luke przychodu wedlug rate projektu.');

  return reasons;
}

interface AllocationCandidateSource {
  allocation: PersonTileAllocation;
  kind: AllocationCandidateAnalysis['source'];
  priority: number;
  reason: string;
}

function getAllocationCandidateSources({
  analysesByProjectId,
  need,
  peopleById,
  periodAllocations,
  person,
  projectsById,
  targetProject,
}: {
  analysesByProjectId: Map<string, ProjectOpportunityAnalysis>;
  need: ReturnType<typeof getProjectCandidateNeeds>[number];
  peopleById: Map<string, Person>;
  periodAllocations: PersonTileAllocation[];
  person: Person;
  projectsById: Map<string, ProjectFrame>;
  targetProject: ProjectFrame;
}): AllocationCandidateSource[] {
  return periodAllocations
    .filter((allocation) => allocation.personId === person.id)
    .filter((allocation) => allocation.target !== targetProject.id)
    .flatMap((allocation) => {
      if (allocation.target === 'bench') {
        return [{
          allocation,
          kind: 'bench' as const,
          priority: 0,
          reason: 'kafelek jest na lawce',
        }];
      }
      if (!need.requirement) return [];

      const sourceProject = projectsById.get(allocation.target);
      if (!sourceProject) return [];

      const sourceAnalysis = analysesByProjectId.get(sourceProject.id);
      const source = getReallocationSourceCandidate(
        allocation,
        sourceProject,
        sourceAnalysis,
        peopleById
      );
      if (!source) return [];

      return [source];
    })
    .sort((a, b) => (
      b.priority - a.priority ||
      a.allocation.tileIndex - b.allocation.tileIndex
    ));
}

function getReallocationSourceCandidate(
  allocation: PersonTileAllocation,
  sourceProject: ProjectFrame,
  sourceAnalysis: ProjectOpportunityAnalysis | undefined,
  peopleById: Map<string, Person>
): AllocationCandidateSource | null {
  if (isTimeOffProject(sourceProject)) return null;

  const person = peopleById.get(allocation.personId);
  const blockingValidation = (allocation.validation || []).find((validation) => (
    validation.severity !== 'info' &&
    [
      'missing_required_skill',
      'insufficient_seniority',
      'role_mismatch',
      'blocked_person',
      'not_preferred_person',
      'person_collaboration_conflict',
      'internal_margin_gap',
      'target_revenue_gap',
      'over_allocated',
    ].includes(validation.code)
  ));

  if (blockingValidation) {
    return {
      allocation,
      kind: 'misallocated_project',
      priority: blockingValidation.severity === 'invalid' ? 18 : 10,
      reason: `walidacja w ${sourceProject.client}: ${sourceProject.name}: ${blockingValidation.message}`,
    };
  }

  if (person && isAllocationRequirementMismatch(allocation, sourceProject, person, peopleById)) {
    return {
      allocation,
      kind: 'misallocated_project',
      priority: 16,
      reason: `nie pokrywa wymagan projektu ${sourceProject.client}: ${sourceProject.name}`,
    };
  }

  if (sourceProject.workType && sourceProject.workType !== 'commercial') {
    return {
      allocation,
      kind: 'low_value_project',
      priority: 8,
      reason: `siedzi w pracy niekomercyjnej ${sourceProject.client}: ${sourceProject.name}`,
    };
  }

  if (sourceProject.planningStatus === 'ghost') {
    return {
      allocation,
      kind: 'low_value_project',
      priority: 6,
      reason: `siedzi w ghost dealu ${sourceProject.client}: ${sourceProject.name}`,
    };
  }

  if (sourceAnalysis && sourceAnalysis.targetRevenueGapK > 0 && sourceAnalysis.recommendation !== 'pursue') {
    return {
      allocation,
      kind: 'low_value_project',
      priority: 4,
      reason: `siedzi w projekcie o slabym pokryciu celu ${sourceProject.client}: ${sourceProject.name}`,
    };
  }

  return null;
}

function isPersonUnavailableForAiPlanning(person: Person, periodId: string) {
  const override = getPersonPeriodOverride(person, periodId);
  const availableHours = getPersonPeriodAvailableHours(person, periodId);
  return availableHours <= 0 || override?.status === 'holiday' || override?.status === 'unavailable';
}

function isAllocationRequirementMismatch(
  allocation: PersonTileAllocation,
  sourceProject: ProjectFrame,
  person: Person,
  peopleById: Map<string, Person>
) {
  const requiredRequirements = sourceProject.requirements.filter((requirement) => requirement.required);
  if (!requiredRequirements.length) return false;

  return !requiredRequirements.some((requirement) => (
    personCanCoverRequirement(person, requirement) &&
    hasEnoughSeniority(person.seniority, requirement.seniority) &&
    allocationContributesToRequirement(allocation, requirement, sourceProject, peopleById)
  ));
}

function allocationContributesToRequirement(
  allocation: PersonTileAllocation,
  requirement: ProjectFrame['requirements'][number],
  sourceProject: ProjectFrame,
  peopleById: Map<string, Person>
) {
  const sourcePerson = peopleById.get(allocation.personId);
  const allocationSkillId = getEffectiveAllocationSkillId(allocation, sourceProject, sourcePerson);
  if (allocation.requirementId === requirement.id) return true;
  if (allocationSkillId && skillCoversRequirementSkill(allocationSkillId, requirement.skillId)) return true;
  return false;
}

function getCandidateSourceKind(candidateSources: AllocationCandidateSource[]): AllocationCandidateAnalysis['source'] {
  if (candidateSources.some((source) => source.kind === 'misallocated_project')) return 'misallocated_project';
  if (candidateSources.some((source) => source.kind === 'low_value_project')) return 'low_value_project';
  return 'bench';
}

function getCandidateSourceReason(
  candidateSources: AllocationCandidateSource[],
  projectsById: Map<string, ProjectFrame>
) {
  const groupedReasons = Array.from(candidateSources.reduce((result, source) => {
    const target = source.allocation.target;
    const project = projectsById.get(target);
    const label = target === 'bench'
      ? 'ławka'
      : project
        ? `${project.client}: ${project.name}`
        : target;
    const current = result.get(label) || { count: 0, reason: source.reason };
    current.count += 1;
    result.set(label, current);
    return result;
  }, new Map<string, { count: number; reason: string }>()).entries());

  return groupedReasons
    .slice(0, 3)
    .map(([label, item]) => `${label}${item.count > 1 ? ` (${item.count} kaf.)` : ''} - ${item.reason}`)
    .join('; ');
}

function analyzeBenchUtilization(
  people: Person[],
  periodId: string,
  periodAllocations: PersonTileAllocation[],
  projects: ProjectOpportunityAnalysis[],
  activeProjects: ProjectFrame[]
): BenchUtilizationSuggestion[] {
  const candidateProjectIdsByPersonId = projects.reduce((result, project) => {
    project.allocationCandidates.forEach((candidate) => {
      const current = result.get(candidate.personId) || [];
      if (!current.includes(project.projectId)) current.push(project.projectId);
      result.set(candidate.personId, current);
    });
    return result;
  }, new Map<string, string[]>());
  const inhouseProjectIds = activeProjects
    .filter((project) => project.workType === 'research_development')
    .map((project) => project.id);

  return people.flatMap((person) => {
    if (isPersonUnavailableForAiPlanning(person, periodId)) return [];
    const personBenchAllocations = periodAllocations.filter((allocation) => (
      allocation.personId === person.id && allocation.periodId === periodId && allocation.target === 'bench'
    ));
    const benchHours = roundHours(sum(personBenchAllocations, (allocation) => allocation.hours));
    if (benchHours <= 0) return [];

    const benchRevenueK = roundMoneyK(sum(personBenchAllocations, (allocation) => allocation.revenueK));
    const benchInternalCostK = calculateHoursToInternalCostK(person, periodId, benchHours);
    const candidateProjectIds = candidateProjectIdsByPersonId.get(person.id) || [];
    const hasProjectCandidate = candidateProjectIds.length > 0;
    const suggestion: BenchUtilizationSuggestion['suggestion'] = hasProjectCandidate
      ? 'allocate_to_project'
      : 'create_inhouse_rd';

    return [{
      personId: person.id,
      name: person.name,
      role: person.role,
      seniority: person.seniority,
      skillIds: person.skillIds,
      benchHours,
      benchRevenueK,
      benchInternalCostK,
      alertLevel: getBenchUtilizationAlertLevel(person, benchInternalCostK, benchHours),
      suggestion,
      preferredProjectIds: hasProjectCandidate ? candidateProjectIds : inhouseProjectIds,
      reason: hasProjectCandidate
        ? 'Osoba ma dopasowanie do co najmniej jednego projektu z luka zasobow.'
        : 'Brak bezpiecznego dopasowania do aktywnych projektow; rozwaz utworzenie wewnetrznego projektu R&D, sales support albo innego celu na lawke.',
    }];
  }).sort((a, b) => (
    getBenchAlertRank(b.alertLevel) - getBenchAlertRank(a.alertLevel) ||
    b.benchInternalCostK - a.benchInternalCostK ||
    b.benchHours - a.benchHours
  ));
}

function getBenchUtilizationAlertLevel(person: Person, benchInternalCostK: MoneyK, benchHours: Hours): BenchUtilizationSuggestion['alertLevel'] {
  const isSeniorOrLead = person.seniority === 'senior' || person.seniority === 'lead';

  if ((isSeniorOrLead && benchInternalCostK >= 8) || benchInternalCostK >= 14 || benchHours >= 80) return 'critical';
  if (isSeniorOrLead || benchInternalCostK >= 8 || benchHours >= 40) return 'high';
  if (benchInternalCostK >= 4 || benchHours >= 24) return 'medium';
  return 'low';
}

function getBenchAlertRank(alertLevel: BenchUtilizationSuggestion['alertLevel']) {
  switch (alertLevel) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
  }
}

function normalizeProjectNotes(notes: string | undefined) {
  const normalizedNotes = notes?.trim();
  return normalizedNotes || undefined;
}

function analyzePerson(
  person: Person,
  periodId: string,
  allocations: PersonTileAllocation[],
  projectsById: Map<string, ProjectFrame>
): PersonCapacityAnalysis {
  const productiveAllocations = allocations.filter((allocation) => (
    allocation.personId === person.id &&
    isProductiveAllocationTarget(allocation, projectsById)
  ));
  const availableHours = getPersonPeriodAvailableHours(person, periodId);
  const allocatedHours = roundHours(sum(productiveAllocations, (allocation) => allocation.hours));
  const allocatedRevenueK = roundMoneyK(sum(productiveAllocations, (allocation) => allocation.revenueK));
  const internalCostK = getPersonPeriodCostK(person, periodId);
  const targetRevenueK = getPersonPeriodLayers(person, periodId).targetK;
  const utilizationPercent = getPercent(allocatedHours, availableHours);
  const targetCoveragePercent = getPercent(allocatedRevenueK, targetRevenueK);
  const fragmentation = new Set(productiveAllocations.map((allocation) => allocation.target)).size;
  const override = getPersonPeriodOverride(person, periodId);

  return {
    personId: person.id,
    name: person.name,
    role: person.role,
    skillIds: person.skillIds,
    seniority: person.seniority,
    availableHours,
    allocatedHours,
    allocatedRevenueK,
    internalCostK,
    internalMarginK: roundMoneyK(allocatedRevenueK - internalCostK),
    targetRevenueK,
    utilizationPercent,
    targetCoveragePercent,
    fragmentation,
    loadScore: getPersonLoadScore(utilizationPercent, fragmentation, override?.status),
    status: getUtilizationStatus(availableHours, allocatedHours, utilizationPercent),
    monthlyOverrideStatus: override?.status,
    monthlyOverrideNote: override?.note,
  };
}

function analyzeSkillBottlenecks(
  skillIds: SkillId[],
  projects: ProjectFrame[],
  people: Person[],
  periodId: string,
  allocations: PersonTileAllocation[]
): SkillBottleneckAnalysis[] {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const peopleById = new Map(people.map((person) => [person.id, person]));

  return skillIds.map((skillId) => {
    const requiredHours = roundHours(sum(projects.flatMap((project) => project.requirements), (requirement) => (
      requirement.required && requirement.skillId === skillId ? requirement.estimatedHours : 0
    )));
    const allocatedHours = roundHours(sum(allocations, (allocation) => {
      const project = projectsById.get(allocation.target);
      if (!project) return 0;
      return getEffectiveAllocationSkillId(
        allocation,
        project,
        peopleById.get(allocation.personId)
      ) === skillId ? allocation.hours : 0;
    }));
    const availableMatchingHours = roundHours(sum(people, (person) => (
      person.skillIds.some((personSkillId) => skillCoversRequirementSkill(personSkillId, skillId))
        ? getPersonPeriodAvailableHours(person, periodId)
        : 0
    )));
    const missingHours = roundHours(Math.max(0, requiredHours - Math.max(allocatedHours, availableMatchingHours)));
    const demandPressure = availableMatchingHours > 0 ? requiredHours / availableMatchingHours : requiredHours > 0 ? 2 : 0;
    const allocationGap = requiredHours > 0 ? Math.max(0, requiredHours - allocatedHours) / requiredHours : 0;
    const bottleneckScore = clampScore((demandPressure * 55) + (allocationGap * 45));

    return {
      skillId,
      requiredHours,
      allocatedHours,
      availableMatchingHours,
      missingHours,
      bottleneckScore,
      isBottleneck: bottleneckScore >= 75 || missingHours > 0,
    };
  }).sort((a, b) => b.bottleneckScore - a.bottleneckScore);
}

function summarizeMonth(projectAnalyses: ProjectOpportunityAnalysis[], people: PersonCapacityAnalysis[]): MonthOpportunitySummary {
  const plannedRevenueK = roundMoneyK(sum(projectAnalyses, (project) => project.plannedRevenueK));
  const allocatedRevenueK = roundMoneyK(sum(projectAnalyses, (project) => project.allocatedRevenueK));
  const committedRevenueK = roundMoneyK(sum(projectAnalyses, (project) => project.committedRevenueK));
  const expectedRevenueK = roundMoneyK(sum(projectAnalyses, (project) => project.expectedRevenueK));
  const nonCommercialCapacityK = roundMoneyK(sum(projectAnalyses, (project) => project.nonCommercialCapacityK));
  const nonCommercialAllocatedCapacityK = roundMoneyK(sum(projectAnalyses, (project) => project.nonCommercialAllocatedCapacityK));
  const totalCostK = roundMoneyK(sum(people, (person) => person.internalCostK));
  const targetRevenueK = roundMoneyK(sum(people, (person) => person.targetRevenueK));
  return {
    committedRevenueK,
    expectedRevenueK,
    plannedRevenueK,
    allocatedRevenueK,
    nonCommercialCapacityK,
    nonCommercialAllocatedCapacityK,
    unallocatedPlannedRevenueK: roundMoneyK(sum(projectAnalyses, (project) => project.resourceGapK)),
    totalCostK,
    targetRevenueK,
    committedGapK: roundMoneyK(Math.max(0, targetRevenueK - committedRevenueK)),
    expectedGapK: roundMoneyK(Math.max(0, targetRevenueK - expectedRevenueK)),
    targetGapK: roundMoneyK(Math.max(0, targetRevenueK - Math.max(committedRevenueK, expectedRevenueK))),
    internalMarginK: roundMoneyK(expectedRevenueK - totalCostK),
    targetMarginK: roundMoneyK(expectedRevenueK - targetRevenueK),
    overAllocatedPeople: people.filter((person) => person.status === 'over').length,
    underAllocatedPeople: people.filter((person) => person.status === 'under').length,
    highRiskProjectCount: projectAnalyses.filter((project) => project.recommendation === 'drop_or_delay' || project.recommendation === 'renegotiate').length,
  };
}

function analyzeRemoveProjectScenario(
  project: ProjectOpportunityAnalysis,
  month: MonthOpportunitySummary,
  bottlenecks: SkillBottleneckAnalysis[]
): RemoveProjectScenario {
  const bottleneckSkillIds = new Set(bottlenecks.filter((skill) => skill.isBottleneck).map((skill) => skill.skillId));
  const releasedScarceSkillHours = project.allocatedHoursBySkill.filter((entry) => bottleneckSkillIds.has(entry.skillId));
  const releasedScarceHours = sum(releasedScarceSkillHours, (entry) => entry.hours);
  const riskReductionCount = project.validationWarnings.length + project.requirementCoverage.filter((requirement) => requirement.missingHours > 0).length + (project.targetRevenueGapK > 0 ? 1 : 0);
  const expectedGapAfterRemovalK = roundMoneyK(month.expectedGapK + project.expectedRevenueK);
  const targetGapAfterRemovalK = roundMoneyK(month.targetGapK + project.expectedRevenueK);

  return {
    projectId: project.projectId,
    name: project.name,
    client: project.client,
    lostAllocatedRevenueK: project.allocatedRevenueK,
    lostExpectedRevenueK: project.expectedRevenueK,
    releasedHours: project.allocatedHours,
    releasedInternalCostK: project.internalCostK,
    releasedTargetRevenueK: project.requiredTargetRevenueK,
    releasedScarceSkillHours,
    targetGapAfterRemovalK,
    expectedGapAfterRemovalK,
    riskReductionCount,
    dropCandidateScore: clampScore(
      (releasedScarceHours * 0.8) +
      (riskReductionCount * 12) +
      Math.max(0, -project.riskAdjustedMarginK * 4) -
      (project.expectedRevenueK * 1.5)
    ),
  };
}

function summarizeAllocationRisks(allocations: PersonTileAllocation[]): AllocationRiskSummary[] {
  return allocations.flatMap((allocation) => (allocation.validation || []).map((validation) => ({
    allocationId: allocation.id,
    projectId: allocation.target === 'bench' ? undefined : allocation.target,
    personId: allocation.personId,
    severity: validation.severity,
    code: validation.code,
    message: validation.message,
  })));
}

function groupRequirementHours(project: ProjectFrame): SkillHours[] {
  return Array.from(project.requirements
    .filter((requirement) => requirement.required)
    .reduce((result, requirement) => {
      result.set(requirement.skillId, (result.get(requirement.skillId) || 0) + requirement.estimatedHours);
      return result;
    }, new Map<SkillId, number>()))
    .map(([skillId, hours]) => ({ skillId, hours: roundHours(hours) }));
}

function groupAllocationHours(
  project: ProjectFrame,
  allocations: PersonTileAllocation[],
  peopleById: Map<string, Person>
): SkillHours[] {
  return Array.from(allocations.reduce((result, allocation) => {
    const skillId = getEffectiveAllocationSkillId(allocation, project, peopleById.get(allocation.personId));
    if (!skillId) return result;
    result.set(skillId, (result.get(skillId) || 0) + allocation.hours);
    return result;
  }, new Map<SkillId, number>()))
    .map(([skillId, hours]) => ({ skillId, hours: roundHours(hours) }));
}

function getRequirementCoverage(
  project: ProjectFrame,
  allocations: PersonTileAllocation[],
  peopleById: Map<string, Person>
): RequirementCoverageAnalysis[] {
  return project.requirements
    .filter((requirement) => requirement.required)
    .map((requirement) => {
      const allocatedHours = roundHours(sum(allocations, (allocation) => (
        allocationCoversRequirement(allocation, requirement, project, peopleById.get(allocation.personId))
          ? allocation.hours
          : 0
      )));
      return {
        requirementId: requirement.id,
        skillId: requirement.skillId,
        seniority: requirement.seniority,
        phaseLabel: requirement.phaseLabel,
        requiredHours: roundHours(requirement.estimatedHours),
        allocatedHours,
        missingHours: roundHours(Math.max(0, requirement.estimatedHours - allocatedHours)),
      };
    });
}

function groupMissingRequirementHoursBySkill(requirementCoverage: RequirementCoverageAnalysis[]): SkillHours[] {
  return Array.from(requirementCoverage.reduce((result, requirement) => {
    if (requirement.missingHours <= 0) return result;
    result.set(requirement.skillId, (result.get(requirement.skillId) || 0) + requirement.missingHours);
    return result;
  }, new Map<SkillId, number>()))
    .map(([skillId, hours]) => ({ skillId, hours: roundHours(hours) }));
}

function projectCountsAsCommercialRevenue(project: ProjectFrame) {
  return project.workType !== 'research_development' &&
    project.workType !== 'waiting_room' &&
    !isTimeOffProject(project);
}

function getRequiredRevenueRate(project: ProjectFrame | undefined, skillId: SkillId | undefined) {
  if (!project) return undefined;
  if (skillId && typeof project.rateConfig.skillRatesPlnH?.[skillId] === 'number') {
    return project.rateConfig.skillRatesPlnH[skillId];
  }
  return project.rateConfig.companyTargetRatePlnH;
}

function calculateHoursToRequiredRevenueK(hours: number, ratePlnH: number | undefined) {
  if (!ratePlnH) return 0;
  return roundMoneyK((hours * ratePlnH) / 1000);
}

function calculateHoursToInternalCostK(person: Person | undefined, periodId: string, hours: number) {
  const internalHourlyCostPln = getPersonInternalHourlyCostPln(person, periodId);
  if (!internalHourlyCostPln) return 0;
  return roundMoneyK((hours * internalHourlyCostPln) / 1000);
}

function getPersonInternalHourlyCostPln(person: Person | undefined, periodId: string) {
  if (!person) return undefined;
  const availableHours = getPersonPeriodAvailableHours(person, periodId);
  if (!availableHours) return undefined;
  return (getPersonPeriodCostK(person, periodId) * 1000) / availableHours;
}

function isProjectActiveInPeriod(
  project: ProjectFrame,
  periodId: Period['id'],
  allocationsByTarget: Map<string, PersonTileAllocation[]>
) {
  if (project.archivedAt || project.archivedPeriodIds?.includes(periodId)) return false;

  const hasRevenuePlan = project.revenuePlan.some((plan) => plan.periodId === periodId);
  const hasAllocations = Boolean(allocationsByTarget.get(project.id)?.length);

  return hasRevenuePlan || hasAllocations || project.startPeriodId === periodId;
}

function getDeliveryFeasibilityScore(missingRequiredHours: SkillHours[], warnings: AllocationRiskSummary[], resourceGapK: number) {
  const missingHours = sum(missingRequiredHours, (entry) => entry.hours);
  const invalidWarnings = warnings.filter((warning) => warning.severity === 'invalid').length;
  const softWarnings = warnings.length - invalidWarnings;
  return clampScore(100 - missingHours - (resourceGapK * 2) - (invalidWarnings * 18) - (softWarnings * 8));
}

function getProfitabilityScore(contributionMarginK: number, revenueK: number, targetRevenueGapK: number) {
  const marginPercent = revenueK > 0 ? (contributionMarginK / revenueK) * 100 : contributionMarginK > 0 ? 100 : 0;
  return clampScore(55 + marginPercent - (targetRevenueGapK * 4));
}

function getCapacityWeightedOpportunityScore(riskAdjustedMarginK: number, allocatedHours: number) {
  if (allocatedHours <= 0) return riskAdjustedMarginK > 0 ? 80 : 45;
  return clampScore(50 + ((riskAdjustedMarginK * 1000) / allocatedHours) / 8);
}

function getOpportunityCostScore(capacityWeightedOpportunityScore: number, missingRequiredHours: SkillHours[]) {
  const missingHours = sum(missingRequiredHours, (entry) => entry.hours);
  return clampScore((100 - capacityWeightedOpportunityScore) + missingHours);
}

function getPersonLoadScore(utilizationPercent: number, fragmentation: number, overrideStatus: string | undefined) {
  const utilizationPressure = utilizationPercent > 100 ? 45 : utilizationPercent < 65 ? 20 : 8;
  const fragmentationPressure = Math.max(0, fragmentation - 2) * 12;
  const overridePressure = overrideStatus === 'unavailable' ? 45 : overrideStatus ? 18 : 0;
  return clampScore(utilizationPressure + fragmentationPressure + overridePressure);
}

function getProjectRecommendation(
  score: number,
  internalMarginGapK: number,
  targetRevenueGapK: number,
  deliveryFeasibilityScore: number,
  resourceGapK: number
): OpportunityVerdict {
  if (score >= 78 && deliveryFeasibilityScore >= 75) return 'pursue';
  if (internalMarginGapK > 0 || targetRevenueGapK >= 8) return 'renegotiate';
  if (resourceGapK > 0) return 'pursue_with_changes';
  if (score < 45 || deliveryFeasibilityScore < 45) return 'drop_or_delay';
  return 'pursue_with_changes';
}

function getUtilizationStatus(
  availableHours: number,
  allocatedHours: number,
  utilizationPercent: number
): PersonCapacityAnalysis['status'] {
  if (availableHours === 0 && allocatedHours > 0) return 'over';
  if (availableHours === 0) return 'unavailable';
  if (utilizationPercent > 105) return 'over';
  if (utilizationPercent < 65) return 'under';
  return 'healthy';
}

function groupAllocationsByTarget(allocations: PersonTileAllocation[]) {
  return allocations.reduce((result, allocation) => {
    const current = result.get(allocation.target) || [];
    current.push(allocation);
    result.set(allocation.target, current);
    return result;
  }, new Map<string, PersonTileAllocation[]>());
}

function getPercent(value: number, total: number) {
  if (total > 0) return Math.round((value / total) * 100);
  return value > 0 ? 100 : 0;
}

function sum<T>(items: T[], getValue: (item: T) => number) {
  return items.reduce((total, item) => total + getValue(item), 0);
}

function roundMoneyK(value: number) {
  return Math.round(value * 10) / 10;
}

function roundHours(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampScore(value: number) {
  return Math.round(clamp(value, 0, 100));
}
