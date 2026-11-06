// Identity labels and financial amounts are synthetic demo fixtures.
import { create } from 'zustand';
import { demoEnabled, DEMO_RESET_EVENT } from '@/modules/demo/demoRuntime';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import {
  AllocationMeetingState,
  BoardLens,
  Period,
  Person,
  PersonTileAllocation,
  PlanningRule,
  ProjectFrame,
  ProjectStage,
  RevenueView,
  Skill,
  TileUnit,
  TrafficSnapshot,
  WeeklyAllocation,
  ContractType,
  createPersonPairPlanningRule,
  getSuggestedAllocationRequirement,
  applyPersonProfileUpdateFromPeriod,
  getPersonPeriodCostTileCount,
  getPersonPeriodHoursPerTile,
  getPersonPeriodProfile,
  isPersonActiveInPeriod,
} from '../models/traffic.model';
import {
  applyTrafficBoardCommand,
  type MoveTrafficAllocation,
  type TrafficBoardCommand,
} from '@ptm/domain';
import {
  connectTrafficBoardRealtime,
  executeTrafficBoardCommand,
  loadTrafficBoardSnapshot,
} from '../services/trafficBoardApi';
import type { TrafficBoardRealtimeConnection } from '../services/trafficBoardApi';
import { getSyncServerWsUrl, TrafficSyncServerConfig } from '../services/trafficRuntimeConfig';
import { validateAllocation } from '../utils/allocationValidation';
import {
  addUtcMonths,
  createMonthPeriod,
  createWeekPeriods,
  getMonthPeriodId,
  getPeriodDisplayLabel,
} from '../utils/trafficPeriods';
import { createPersonDraft } from '../utils/trafficBoardDrafts';
import {
  CollaborationAction,
  CollaborationCursor,
  CollaborationPeer,
  CollaborationPresenceState,
  CollaborationTarget,
  CollaborationUser,
  CollaborationViewState,
  getStoredCollaborationTrackingEnabled,
  getStoredCollaborationUser,
  persistCollaborationUser,
  updateCollaborationUserName,
} from '../utils/collaborationPresence';

const SCHEMA_VERSION = 1;
const SEED_DATA_VERSION = 10;
const SEED_PERIOD_ID = '2026-06';
const DEFAULT_ACTIVE_PERIOD_ID = getMonthPeriodId(new Date());
const ACTIVE_TILE_UNIT_ID = 'money-1k';
const SYSTEM_SNAPSHOT_TRANSACTION_ORIGIN = 'ptm:system-snapshot';
const BACKEND_COMMAND_TRANSACTION_ORIGIN = 'ptm:backend-command';

const SEED_SKILLS: Skill[] = [
  { id: 'backend', label: 'Backend', defaultTargetRatePlnH: 180 },
  { id: 'frontend', label: 'Frontend', defaultTargetRatePlnH: 200 },
  { id: 'fullstack', label: 'Fullstack', defaultTargetRatePlnH: 220 },
  { id: 'design', label: 'Design', defaultTargetRatePlnH: 240 },
  { id: 'pm', label: 'PM', defaultTargetRatePlnH: 180 },
  { id: 'qa', label: 'QA', defaultTargetRatePlnH: 200 },
  { id: 'devops', label: 'DevOps', defaultTargetRatePlnH: 220 },
  { id: 'mobile', label: 'Mobile', defaultTargetRatePlnH: 240 },
];

const SEED_PERIODS: Period[] = [
  {
    id: SEED_PERIOD_ID,
    label: 'June 2026',
    granularity: 'month',
    startsOn: '2026-06-01',
    endsOn: '2026-06-30',
  },
  {
    id: '2026-06-w1',
    label: 'June W1',
    granularity: 'week',
    startsOn: '2026-06-01',
    endsOn: '2026-06-07',
    parentPeriodId: SEED_PERIOD_ID,
  },
  {
    id: '2026-06-w2',
    label: 'June W2',
    granularity: 'week',
    startsOn: '2026-06-08',
    endsOn: '2026-06-14',
    parentPeriodId: SEED_PERIOD_ID,
  },
  {
    id: '2026-06-w3',
    label: 'June W3',
    granularity: 'week',
    startsOn: '2026-06-15',
    endsOn: '2026-06-21',
    parentPeriodId: SEED_PERIOD_ID,
  },
  {
    id: '2026-06-w4',
    label: 'June W4',
    granularity: 'week',
    startsOn: '2026-06-22',
    endsOn: '2026-06-28',
    parentPeriodId: SEED_PERIOD_ID,
  },
  {
    id: '2026-06-w5',
    label: 'June W5',
    granularity: 'week',
    startsOn: '2026-06-29',
    endsOn: '2026-06-30',
    parentPeriodId: SEED_PERIOD_ID,
  },
  {
    id: '2026-07',
    label: 'July 2026',
    granularity: 'month',
    startsOn: '2026-07-01',
    endsOn: '2026-07-31',
  },
];

const SEED_TILE_UNITS: TileUnit[] = [
  { id: ACTIVE_TILE_UNIT_ID, kind: 'money', label: '1k PLN', value: 1, currency: 'PLN' },
  { id: 'money-2k', kind: 'money', label: '2k PLN', value: 2, currency: 'PLN' },
  { id: 'money-5k', kind: 'money', label: '5k PLN', value: 5, currency: 'PLN' },
  { id: 'hours-8h', kind: 'hours', label: '8h', value: 8 },
  { id: 'hours-20h', kind: 'hours', label: '20h', value: 20 },
  { id: 'hours-40h', kind: 'hours', label: '40h', value: 40 },
];

function createPersonPeriodAllocations(person: Person, periodId: string, sourceAllocations?: PersonTileAllocation[]) {
  return Array.from({ length: getPersonPeriodCostTileCount(person, periodId) }, (_, tileIndex) => {
    const source = sourceAllocations?.find((allocation) => allocation.tileIndex === tileIndex);
    return {
      id: `${periodId}-${person.id}-${tileIndex}`,
      personId: person.id,
      tileIndex,
      target: source?.target || 'bench',
      previousTarget: source?.previousTarget,
      periodId,
      mode: source?.mode || 'revenue_first',
      revenueK: source?.revenueK || 1,
      hours: source?.hours || getPersonPeriodHoursPerTile(person, periodId),
      skillId: source?.skillId,
      requirementId: source?.requirementId,
      projectSlotIndex: source?.projectSlotIndex,
      hoursOverridden: source?.hoursOverridden,
      revenueOverridden: source?.revenueOverridden,
      meetingState: source?.meetingState,
      validation: source?.validation,
    } satisfies PersonTileAllocation;
  });
}

function revalidateAllocations(
  yPeople: Y.Map<Person>,
  yProjects: Y.Map<ProjectFrame>,
  yAllocations: Y.Map<PersonTileAllocation>,
  yPlanningRules?: Y.Map<PlanningRule>,
  periodId?: string,
  targetIds?: Set<string>
) {
  if (targetIds && targetIds.size === 0) return;
  const people = Array.from(yPeople.values());
  const projectsById = new Map(Array.from(yProjects.entries()));
  const planningRules = yPlanningRules ? Array.from(yPlanningRules.values()) : [];
  const allocations = Array.from(yAllocations.values());
  const allocationsByProjectPeriod = allocations.reduce((result, allocation) => {
    if (allocation.target === 'bench') return result;
    const key = `${allocation.periodId}:${allocation.target}`;
    const current = result.get(key) || [];
    current.push(allocation);
    result.set(key, current);
    return result;
  }, new Map<string, PersonTileAllocation[]>());

  allocations.forEach((allocation) => {
    if (periodId && allocation.periodId !== periodId) return;
    if (targetIds?.size && !targetIds.has(allocation.target)) return;
    const project = projectsById.get(allocation.target);
    const peopleById = getPeopleByIdForPeriod(people, allocation.periodId);
    const person = peopleById.get(allocation.personId);
    const projectAllocations = allocationsByProjectPeriod.get(`${allocation.periodId}:${allocation.target}`) || [];
    const validation = validateAllocation(allocation, person, project, projectAllocations, peopleById, planningRules);
    yAllocations.set(allocation.id, { ...allocation, validation });
  });
}

function getMappedAllocationForTarget(
  allocation: PersonTileAllocation,
  move: MoveTrafficAllocation,
  periodId: string,
  peopleById: Map<string, Person>,
  projectsById: Map<string, ProjectFrame>,
  allocations: PersonTileAllocation[]
) {
  const target = move.target;
  const previousTarget = allocation.target !== target ? allocation.target : allocation.previousTarget;
  if (target === 'bench') {
    return {
      ...allocation,
      target,
      previousTarget,
      periodId,
      skillId: undefined,
      requirementId: undefined,
      projectSlotIndex: undefined,
      validation: [],
    } satisfies PersonTileAllocation;
  }

  const project = projectsById.get(target);
  const periodPeopleById = getPeopleByIdForPeriod(Array.from(peopleById.values()), periodId);
  const person = periodPeopleById.get(allocation.personId);
  const explicitRequirement = project?.requirements.find((requirement) => requirement.id === move.requirementId);
  const projectAllocations = allocations.filter((item) => (
    item.periodId === periodId &&
    item.target === target
  ));
  const suggestedRequirement = explicitRequirement || (
    move.skipRequirementSuggestion
      ? undefined
      : getSuggestedAllocationRequirement(
        { ...allocation, target, periodId },
        project,
        person,
        projectAllocations,
        periodPeopleById
      )
  );

  return {
    ...allocation,
    target,
    previousTarget,
    periodId,
    skillId: suggestedRequirement?.skillId,
    requirementId: suggestedRequirement?.id,
    projectSlotIndex: getMappedProjectSlotIndex(allocation, move),
    validation: [],
  } satisfies PersonTileAllocation;
}

function getMappedProjectSlotIndex(allocation: PersonTileAllocation, move: MoveTrafficAllocation) {
  if (typeof move.projectSlotIndex === 'number') return move.projectSlotIndex;
  return allocation.target === move.target ? allocation.projectSlotIndex : undefined;
}

function getPeopleByIdForPeriod(people: Person[], periodId: string) {
  return new Map(people.map((person) => [person.id, getPersonPeriodProfile(person, periodId)]));
}

function getCurrentAndFutureMonthPeriods(periods: Period[], activePeriodId: string) {
  const activePeriod = periods.find((period) => period.id === activePeriodId && period.granularity === 'month');
  if (!activePeriod) return [];

  return periods.filter((period) => (
    period.granularity === 'month' &&
    period.startsOn >= activePeriod.startsOn
  ));
}

function clearConflictingProjectSlot(
  allocations: PersonTileAllocation[],
  move: MoveTrafficAllocation,
  periodId: string
) {
  const clearedAllocationIds: string[] = [];
  if (move.target === 'bench' || typeof move.projectSlotIndex !== 'number') return clearedAllocationIds;

  allocations.forEach((allocation, index) => {
    if (
      allocation.id === move.tileId ||
      allocation.periodId !== periodId ||
      allocation.target !== move.target ||
      allocation.projectSlotIndex !== move.projectSlotIndex
    ) {
      return;
    }

    allocations[index].projectSlotIndex = undefined;
    clearedAllocationIds.push(allocation.id);
  });

  return clearedAllocationIds;
}

function mapUnassignedAllocationSkills(
  yPeople: Y.Map<Person>,
  yProjects: Y.Map<ProjectFrame>,
  yAllocations: Y.Map<PersonTileAllocation>,
  periodId?: string
) {
  const peopleById = new Map(Array.from(yPeople.entries()));
  const projectsById = new Map(Array.from(yProjects.entries()));
  const nextAllocations = Array.from(yAllocations.values());

  yAllocations.forEach((allocation) => {
    if (periodId && allocation.periodId !== periodId) return;
    if (allocation.target === 'bench' || allocation.skillId || allocation.requirementId) return;

    const mappedAllocation = getMappedAllocationForTarget(
      allocation,
      { tileId: allocation.id, target: allocation.target },
      allocation.periodId,
      peopleById,
      projectsById,
      nextAllocations
    );
    if (!mappedAllocation.skillId && !mappedAllocation.requirementId) return;

    yAllocations.set(allocation.id, mappedAllocation);
    const allocationIndex = nextAllocations.findIndex((item) => item.id === allocation.id);
    if (allocationIndex >= 0) nextAllocations[allocationIndex] = mappedAllocation;
  });
}

function getLatestMonth(periods: Period[]) {
  return periods
    .filter((period) => period.granularity === 'month')
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .at(-1);
}

function getMonthDate(period: Period) {
  return new Date(`${period.startsOn}T00:00:00.000Z`);
}

const SEED_PEOPLE: Person[] = [
  {
    id: 'tomasz',
    name: "Taylor",
    role: 'Senior Developer',
    initials: "TG",
    color: '#ef4444',
    skillIds: ['backend', 'devops'],
    seniority: 'senior',
    costModel: {
      type: 'fixed_monthly',
      defaultMonthlyHours: 160,
      internalHourlyCostPln: 100,
      fixedMonthlyCostK: 16,
    },
    monthlyCostK: 16,
    hoursPerTile: 5,
    layers: { workK: 32, adminK: 4, salesK: 4, targetK: 40 },
    preferences: ["Sanitized preference 1."],
    blockedCollaborationPersonIds: ['anna'],
  },
  {
    id: 'anna',
    name: "Avery",
    role: 'UX Designer',
    initials: "AK",
    color: '#f59e0b',
    skillIds: ['design', 'frontend'],
    seniority: 'mid',
    costModel: {
      type: 'hourly',
      defaultMonthlyHours: 150,
      internalHourlyCostPln: 120,
    },
    monthlyCostK: 18,
    hoursPerTile: 7,
    layers: { workK: 36, adminK: 4, salesK: 4, targetK: 44 },
  },
  {
    id: 'marek',
    name: "Morgan",
    role: 'Project Manager',
    initials: "MP",
    color: '#10b981',
    skillIds: ['pm'],
    seniority: 'senior',
    costModel: {
      type: 'fixed_monthly',
      defaultMonthlyHours: 140,
      internalHourlyCostPln: 140,
      fixedMonthlyCostK: 20,
    },
    monthlyCostK: 20,
    hoursPerTile: 6,
    layers: { workK: 40, adminK: 4, salesK: 4, targetK: 48 },
  },
  {
    id: 'ola',
    name: "Oakley",
    role: 'Mid Developer',
    initials: "ON",
    color: '#3b82f6',
    skillIds: ['frontend', 'fullstack'],
    seniority: 'mid',
    costModel: {
      type: 'monthly_override',
      defaultMonthlyHours: 160,
      internalHourlyCostPln: 160,
      fixedMonthlyCostK: 22,
    },
    monthlyCostK: 22,
    hoursPerTile: 6,
    layers: { workK: 44, adminK: 4, salesK: 4, targetK: 52 },
  },
];

const SEED_PROJECTS: ProjectFrame[] = [
  {
    id: 'alfa',
    name: "Project A",
    client: "Client 1",
    contractType: 'time_materials_capped',
    stage: 'signed',
    workType: 'commercial',
    currencyProfile: {
      billingCurrency: 'PLN',
      fxMode: 'pln',
    },
    budgetK: 240,
    probability: 1,
    startMonth: 'June 2026',
    startPeriodId: SEED_PERIOD_ID,
    rateConfig: {
      projectRatePlnH: 200,
      companyTargetRatePlnH: 240,
      skillRatesPlnH: { backend: 240, pm: 240 },
    },
    requirements: [
      {
        id: 'alfa-backend',
        skillId: 'backend',
        seniority: 'senior',
        estimatedHours: 90,
        required: true,
        phaseLabel: 'Implementation',
      },
      {
        id: 'alfa-pm',
        skillId: 'pm',
        seniority: 'senior',
        estimatedHours: 24,
        required: true,
      },
    ],
    preferredPersonIds: ['tomasz', 'marek'],
    blockedPersonIds: ['anna'],
    revenuePlan: [
      {
        periodId: SEED_PERIOD_ID,
        nativeRevenueK: 40,
        nativeCommittedRevenueK: 30,
        currency: 'PLN',
        revenueK: 40,
        committedRevenueK: 30,
        probability: 1,
      },
    ],
    invoices: [],
    notes: "Sanitized project note 1.",
  },
  {
    id: 'beta',
    name: "Project C",
    client: "Client 2",
    contractType: 'fixed_phase',
    stage: 'likely',
    planningStatus: 'ghost',
    workType: 'waiting_room',
    currencyProfile: {
      billingCurrency: 'PLN',
      fxMode: 'pln',
    },
    budgetK: 360,
    probability: 0.65,
    startMonth: 'June 2026',
    startPeriodId: SEED_PERIOD_ID,
    endPeriodId: '2026-07',
    rateConfig: {
      projectRatePlnH: 220,
      companyTargetRatePlnH: 260,
      skillRatesPlnH: { design: 240, frontend: 240, backend: 240 },
    },
    requirements: [
      {
        id: 'beta-design',
        skillId: 'design',
        seniority: 'mid',
        estimatedHours: 40,
        required: true,
        phaseLabel: 'Discovery',
      },
      {
        id: 'beta-frontend',
        skillId: 'frontend',
        seniority: 'mid',
        estimatedHours: 70,
        required: true,
        phaseLabel: 'Implementation',
      },
    ],
    preferredPersonIds: ['anna', 'tomasz'],
    revenuePlan: [
      { periodId: SEED_PERIOD_ID, nativeRevenueK: 60, currency: 'PLN', revenueK: 60, probability: 0.65 },
      { periodId: '2026-07', nativeRevenueK: 60, currency: 'PLN', revenueK: 60, probability: 0.65 },
    ],
    invoices: [],
    notes: 'Good target, but revenue depends on the client decision this week.',
  },
  {
    id: 'gamma',
    name: "Project B",
    client: "Client 3",
    contractType: 'hourly',
    stage: 'defensive',
    workType: 'defensive_maintenance',
    currencyProfile: {
      billingCurrency: 'PLN',
      fxMode: 'pln',
    },
    budgetK: 480,
    probability: 0.9,
    startMonth: 'June 2026',
    startPeriodId: SEED_PERIOD_ID,
    rateConfig: {
      projectRatePlnH: 240,
      companyTargetRatePlnH: 280,
      skillRatesPlnH: { fullstack: 240, qa: 240 },
    },
    requirements: [
      {
        id: 'gamma-fullstack',
        skillId: 'fullstack',
        seniority: 'mid',
        estimatedHours: 32,
        required: false,
        phaseLabel: 'Maintenance',
      },
    ],
    preferredPersonIds: ['ola'],
    blockedPersonIds: ['tomasz'],
    revenuePlan: [
      {
        periodId: SEED_PERIOD_ID,
        nativeRevenueK: 80,
        nativeCommittedRevenueK: 50,
        currency: 'PLN',
        revenueK: 80,
        committedRevenueK: 50,
        probability: 0.9,
      },
    ],
    invoices: [],
    notes: "Sanitized project note 3.",
  },
];

const SEED_PLANNING_RULES: PlanningRule[] = [
  createPersonPairPlanningRule({
    periodId: SEED_PERIOD_ID,
    personAId: 'tomasz',
    personBId: 'anna',
    severity: 'hard',
    reason: "Sanitized planning constraint.",
    now: '2026-06-01T00:00:00.000Z',
  }),
];

function createSeedAllocations(people: Person[]): PersonTileAllocation[] {
  return people.flatMap((person) => createPersonPeriodAllocations(person, SEED_PERIOD_ID));
}

interface YjsBoardMaps {
  ySettings: Y.Map<unknown>;
  ySkills: Y.Map<Skill>;
  yPeriods: Y.Map<Period>;
  yTileUnits: Y.Map<TileUnit>;
  yPeople: Y.Map<Person>;
  yProjects: Y.Map<ProjectFrame>;
  yAllocations: Y.Map<PersonTileAllocation>;
  yWeeklyAllocations: Y.Map<WeeklyAllocation>;
  yPlanningRules: Y.Map<PlanningRule>;
}

function writeSeedBoardData(doc: Y.Doc, {
  ySettings,
  ySkills,
  yPeriods,
  yTileUnits,
  yPeople,
  yProjects,
  yAllocations,
  yWeeklyAllocations,
  yPlanningRules,
}: YjsBoardMaps, transactionOrigin?: unknown) {
  doc.transact(() => {
    ySettings.set('schemaVersion', SCHEMA_VERSION);
    ySettings.set('seedDataVersion', SEED_DATA_VERSION);
    ySettings.set('activePeriodId', DEFAULT_ACTIVE_PERIOD_ID);
    ySettings.set('activeTileUnitId', ACTIVE_TILE_UNIT_ID);
    ySkills.clear();
    yPeriods.clear();
    yTileUnits.clear();
    yPeople.clear();
    yProjects.clear();
    yAllocations.clear();
    yWeeklyAllocations.clear();
    yPlanningRules.clear();
    SEED_SKILLS.forEach((skill) => ySkills.set(skill.id, skill));
    SEED_PERIODS.forEach((period) => yPeriods.set(period.id, period));
    SEED_TILE_UNITS.forEach((tileUnit) => yTileUnits.set(tileUnit.id, tileUnit));
    SEED_PEOPLE.forEach((person) => yPeople.set(person.id, person));
    SEED_PROJECTS.forEach((project) => yProjects.set(project.id, project));
    SEED_PLANNING_RULES.forEach((planningRule) => yPlanningRules.set(planningRule.id, planningRule));
    createSeedAllocations(SEED_PEOPLE).forEach((allocation) => {
      yAllocations.set(allocation.id, allocation);
    });
    ensureCurrentMonth({ ySettings, ySkills, yPeriods, yTileUnits, yPeople, yProjects, yAllocations, yWeeklyAllocations, yPlanningRules });
  }, transactionOrigin);
}

function writeTrafficSnapshotData(doc: Y.Doc, {
  ySettings,
  ySkills,
  yPeriods,
  yTileUnits,
  yPeople,
  yProjects,
  yAllocations,
  yWeeklyAllocations,
  yPlanningRules,
}: YjsBoardMaps, snapshot: TrafficSnapshot, transactionOrigin?: unknown) {
  doc.transact(() => {
    ySettings.set('schemaVersion', snapshot.schemaVersion);
    ySettings.set('seedDataVersion', SEED_DATA_VERSION);
    ySettings.set('activePeriodId', snapshot.activePeriodId);
    ySettings.set('activeTileUnitId', snapshot.activeTileUnitId);
    ySkills.clear();
    yPeriods.clear();
    yTileUnits.clear();
    yPeople.clear();
    yProjects.clear();
    yAllocations.clear();
    yWeeklyAllocations.clear();
    yPlanningRules.clear();
    snapshot.skills.forEach((skill) => ySkills.set(skill.id, skill));
    snapshot.periods.forEach((period) => yPeriods.set(period.id, period));
    snapshot.tileUnits.forEach((tileUnit) => yTileUnits.set(tileUnit.id, tileUnit));
    snapshot.people.forEach((person) => yPeople.set(person.id, person));
    snapshot.projects.forEach((project) => yProjects.set(project.id, project));
    snapshot.allocations.forEach((allocation) => yAllocations.set(allocation.id, allocation));
    (snapshot.weeklyAllocations || []).forEach((allocation) => yWeeklyAllocations.set(allocation.id, allocation));
    (snapshot.planningRules || []).forEach((planningRule) => yPlanningRules.set(planningRule.id, planningRule));
    ensureCurrentMonth({ ySettings, ySkills, yPeriods, yTileUnits, yPeople, yProjects, yAllocations, yWeeklyAllocations, yPlanningRules });
    migrateLegacySeedData({ ySettings, ySkills, yPeriods, yTileUnits, yPeople, yProjects, yAllocations, yWeeklyAllocations, yPlanningRules });
  }, transactionOrigin);
}

function migrateLegacySeedData({ yProjects }: YjsBoardMaps) {
  const gamma = yProjects.get('gamma');
  if (!gamma?.preferredPersonIds?.includes('kuba')) return;

  yProjects.set('gamma', {
    ...gamma,
    preferredPersonIds: Array.from(new Set(gamma.preferredPersonIds.map((personId) => (
      personId === 'kuba' ? 'ola' : personId
    )))),
  });
}

function ensureCurrentMonth(boardMaps: YjsBoardMaps) {
  const { ySettings, yPeriods, yPeople, yAllocations } = boardMaps;
  const currentMonthDate = new Date(`${DEFAULT_ACTIVE_PERIOD_ID}-01T00:00:00.000Z`);
  const currentMonth = createMonthPeriod(currentMonthDate);

  if (!yPeriods.has(currentMonth.id)) {
    yPeriods.set(currentMonth.id, currentMonth);
    createWeekPeriods(currentMonth).forEach((week) => yPeriods.set(week.id, week));
  }

  migrateLegacyCurrentMonthAllocationIds(yAllocations, currentMonth.id);

  Array.from(yPeople.values())
    .filter((person) => isPersonActiveInPeriod(person, currentMonth.id))
    .forEach((person) => {
      createPersonPeriodAllocations(person, currentMonth.id).forEach((allocation) => {
        if (!yAllocations.has(allocation.id)) {
          yAllocations.set(allocation.id, allocation);
        }
      });
    });

  const activePeriodId = String(ySettings.get('activePeriodId') || '');
  const activePeriod = activePeriodId ? yPeriods.get(activePeriodId) : undefined;
  if (!activePeriod || activePeriod.granularity !== 'month') {
    ySettings.set('activePeriodId', currentMonth.id);
  }
}

function migrateLegacyCurrentMonthAllocationIds(yAllocations: Y.Map<PersonTileAllocation>, periodId: string) {
  Array.from(yAllocations.values()).forEach((allocation) => {
    if (allocation.periodId !== periodId) return;
    const canonicalId = `${periodId}-${allocation.personId}-${allocation.tileIndex}`;
    if (allocation.id === canonicalId) return;

    if (yAllocations.has(canonicalId)) {
      yAllocations.delete(allocation.id);
      return;
    }

    yAllocations.set(canonicalId, { ...allocation, id: canonicalId });
    yAllocations.delete(allocation.id);
  });
}

function readTrafficSnapshotFromYjs({
  ySettings,
  ySkills,
  yPeriods,
  yTileUnits,
  yPeople,
  yProjects,
  yAllocations,
  yWeeklyAllocations,
  yPlanningRules,
}: YjsBoardMaps): TrafficSnapshot {
  return {
    schemaVersion: Number(ySettings.get('schemaVersion') || SCHEMA_VERSION),
    activePeriodId: String(ySettings.get('activePeriodId') || DEFAULT_ACTIVE_PERIOD_ID),
    activeTileUnitId: String(ySettings.get('activeTileUnitId') || ACTIVE_TILE_UNIT_ID),
    skills: Array.from(ySkills.values()),
    periods: Array.from(yPeriods.values()),
    tileUnits: Array.from(yTileUnits.values()),
    people: Array.from(yPeople.values()),
    projects: Array.from(yProjects.values()),
    allocations: Array.from(yAllocations.values()),
    weeklyAllocations: Array.from(yWeeklyAllocations.values()),
    planningRules: Array.from(yPlanningRules.values()),
  };
}

function getProviderAwareness(provider: WebsocketProvider | null) {
  return provider ? (provider as unknown as {
    awareness?: {
      clientID: number;
      getLocalState: () => Record<string, unknown> | null;
      setLocalState: (state: Record<string, unknown> | null) => void;
      getStates: () => Map<number, Record<string, unknown>>;
      on: (event: 'change', callback: () => void) => void;
      off: (event: 'change', callback: () => void) => void;
    };
  }).awareness : undefined;
}

function readCollaborationPeers(provider: WebsocketProvider) {
  const awareness = getProviderAwareness(provider);
  if (!awareness) return [];

  return Array.from(awareness.getStates().entries())
    .filter(([clientId]) => clientId !== awareness.clientID)
    .map(([clientId, state]) => parseCollaborationPeer(clientId, state))
    .filter((state): state is CollaborationPeer => Boolean(state && state.trackingEnabled !== false));
}

function parseCollaborationPeer(clientId: number, state: Record<string, unknown>): CollaborationPeer | null {
  const user = state.user as Partial<CollaborationUser> | undefined;
  if (!user?.id || !user.name || !user.color) return null;
  return {
    clientId,
    user: {
      id: user.id,
      name: user.name,
      color: user.color,
    },
    cursor: state.cursor as CollaborationCursor | null | undefined,
    activeTarget: state.activeTarget as CollaborationTarget | null | undefined,
    editingTarget: state.editingTarget as CollaborationTarget | null | undefined,
    view: state.view as CollaborationViewState | undefined,
    action: state.action as CollaborationAction | null | undefined,
    trackingEnabled: state.trackingEnabled !== false,
    lastSeenAt: typeof state.lastSeenAt === 'number' ? state.lastSeenAt : undefined,
  };
}

function setLocalCollaborationPresence(
  provider: WebsocketProvider | null,
  patch: Partial<CollaborationPresenceState>,
  user: CollaborationUser
) {
  const awareness = getProviderAwareness(provider);
  if (!awareness) return;
  const current = awareness.getLocalState() || {};
  awareness.setLocalState({
    ...current,
    ...patch,
    user,
    lastSeenAt: Date.now(),
  });
}

function updateLocalCollaborationPresence(
  provider: WebsocketProvider | null,
  patch: Partial<CollaborationPresenceState>,
  user: CollaborationUser
) {
  const awareness = getProviderAwareness(provider);
  if (!awareness || !awareness.getLocalState()) return;
  setLocalCollaborationPresence(provider, patch, user);
}

function clearLocalCollaborationPresence(provider: WebsocketProvider | null) {
  getProviderAwareness(provider)?.setLocalState(null);
}

interface TrafficState extends TrafficSnapshot {
  durableLoadStatus: 'idle' | 'loading' | 'loaded' | 'failed';
  durableSaveStatus: 'idle' | 'saving' | 'saved' | 'failed';
  durableError: string | null;
  durableUpdatedAt: string | null;
  durableVersion: number | null;
  isConnected: boolean;
  isSynced: boolean;
  collaborationUser: CollaborationUser;
  collaborationPeers: CollaborationPeer[];
  lens: BoardLens;
  revenueView: RevenueView;
  doc: Y.Doc | null;
  provider: WebsocketProvider | null;
  ySettings: Y.Map<unknown> | null;
  ySkills: Y.Map<Skill> | null;
  yPeriods: Y.Map<Period> | null;
  yTileUnits: Y.Map<TileUnit> | null;
  yPeople: Y.Map<Person> | null;
  yProjects: Y.Map<ProjectFrame> | null;
  yAllocations: Y.Map<PersonTileAllocation> | null;
  yWeeklyAllocations: Y.Map<WeeklyAllocation> | null;
  yPlanningRules: Y.Map<PlanningRule> | null;
  initializeBoard: (roomName: string, serverConfig?: Pick<TrafficSyncServerConfig, 'host' | 'wsPort' | 'wsUrl'>) => void;
  movePersonToTarget: (personId: string, target: string, periodId: string) => void;
  moveTileToTarget: (tileId: string, target: string, periodId: string) => void;
  moveTilesToTargets: (
    moves: MoveTrafficAllocation[],
    periodId: string,
    options?: { persistDurably?: boolean }
  ) => TrafficSnapshot | null;
  applyBoardCommand: (
    command: TrafficBoardCommand,
    options?: { persistDurably?: boolean }
  ) => TrafficSnapshot | null;
  replaceBoardSnapshot: (snapshot: TrafficSnapshot, updatedAt?: string, version?: number) => void;
  commitBoardCommand: (command: TrafficBoardCommand) => void;
  resetPersonAllocations: (personId: string, periodId: string) => void;
  updateAllocation: (allocation: PersonTileAllocation) => void;
  updateAllocationWithGroupMeetingState: (
    allocation: PersonTileAllocation,
    groupAllocationIds: string[],
    meetingState: AllocationMeetingState | undefined
  ) => void;
  createPerson: (periodId?: string, options?: { monthlyCostK?: number; person?: Person }) => string | null;
  updatePerson: (person: Person, activePeriodId?: string) => void;
  archivePerson: (personId: string) => void;
  restorePerson: (personId: string, periodIds?: string[]) => void;
  createProject: (periodId?: string) => string | null;
  updateProject: (project: ProjectFrame) => void;
  upsertPlanningRules: (planningRules: PlanningRule[]) => void;
  deletePlanningRule: (planningRuleId: string) => void;
  archiveProject: (projectId: string, periodId: string) => void;
  deleteProject: (projectId: string) => void;
  restoreProject: (projectId: string, periodId: string) => void;
  ensurePeriodCapacity: (periodId: string) => void;
  ensurePlanningRange: (fromPeriodId: string, monthCount: number) => void;
  setActivePeriod: (periodId: string) => void;
  createMonth: (periodId: string, activate?: boolean) => string | null;
  createNextMonth: (activate?: boolean) => string | null;
  setActiveTileUnit: (tileUnitId: string) => void;
  setLens: (lens: BoardLens) => void;
  setRevenueView: (view: RevenueView) => void;
  setCollaborationUserName: (name: string) => void;
  setCollaborationCursor: (cursor: CollaborationCursor | null) => void;
  setCollaborationActiveTarget: (target: CollaborationTarget | null) => void;
  setCollaborationEditingTarget: (target: CollaborationTarget | null) => void;
  setCollaborationView: (view: CollaborationViewState) => void;
  setCollaborationAction: (action: CollaborationAction | null) => void;
  setCollaborationTrackingEnabled: (enabled: boolean) => void;
  resetBoard: () => void;
  cleanup: () => void;
}

export const useTrafficStore = create<TrafficState>()((set, get) => ({
  schemaVersion: SCHEMA_VERSION,
  skills: [],
  periods: [],
  tileUnits: [],
  activePeriodId: DEFAULT_ACTIVE_PERIOD_ID,
  activeTileUnitId: ACTIVE_TILE_UNIT_ID,
  people: [],
  projects: [],
  allocations: [],
  weeklyAllocations: [],
  planningRules: [],
  durableLoadStatus: 'idle',
  durableSaveStatus: 'idle',
  durableError: null,
  durableUpdatedAt: null,
  durableVersion: null,
  isConnected: false,
  isSynced: false,
  collaborationUser: getStoredCollaborationUser(),
  collaborationPeers: [],
  lens: 'management',
  revenueView: 'expected',
  doc: null,
  provider: null,
  ySettings: null,
  ySkills: null,
  yPeriods: null,
  yTileUnits: null,
  yPeople: null,
  yProjects: null,
  yAllocations: null,
  yWeeklyAllocations: null,
  yPlanningRules: null,

  initializeBoard: (roomName, serverConfig) => {
    get().cleanup();

    let disposed = false;
    const doc = new Y.Doc();
    const wsUrl = getSyncServerWsUrl(serverConfig);
    // Keep business board maps local-only; API/Postgres is the durable source of truth.
    const presenceDoc = new Y.Doc();
    const provider = new WebsocketProvider(wsUrl, `${roomName}:presence`, presenceDoc, { connect: !demoEnabled, disableBc: demoEnabled });
    const collaborationUser = get().collaborationUser;
    const ySettings = doc.getMap<unknown>('settings');
    const ySkills = doc.getMap<Skill>('skills');
    const yPeriods = doc.getMap<Period>('periods');
    const yTileUnits = doc.getMap<TileUnit>('tileUnits');
    const yPeople = doc.getMap<Person>('people');
    const yProjects = doc.getMap<ProjectFrame>('projects');
    const yAllocations = doc.getMap<PersonTileAllocation>('allocations');
    const yWeeklyAllocations = doc.getMap<WeeklyAllocation>('weeklyAllocations');
    const yPlanningRules = doc.getMap<PlanningRule>('planningRules');
    const boardMaps = { ySettings, ySkills, yPeriods, yTileUnits, yPeople, yProjects, yAllocations, yWeeklyAllocations, yPlanningRules };
    let hasDurableLoadSettled = false;
    let hasDurableLoadFailed = false;
    let durableSnapshot: TrafficSnapshot | null = null;
    let isApplyingSystemSnapshot = false;
    let realtimeConnection: TrafficBoardRealtimeConnection | null = null;

    const hasYjsBoardData = () => Boolean(
      ySkills.size &&
      yPeriods.size &&
      yTileUnits.size &&
      yPeople.size &&
      yProjects.size &&
      yAllocations.size
    );

    const scheduleDurableSave = () => {
      // Full-snapshot autosave stays disabled: business changes must use API commands backed by Postgres.
    };

    const withSystemSnapshot = (callback: () => void) => {
      const previousValue = isApplyingSystemSnapshot;
      isApplyingSystemSnapshot = true;
      try {
        callback();
      } finally {
        isApplyingSystemSnapshot = previousValue;
      }
    };

    const syncFromYjs = ({ skipDurableSave = false }: { skipDurableSave?: boolean } = {}) => {
      set({
        schemaVersion: Number(ySettings.get('schemaVersion') || SCHEMA_VERSION),
        activePeriodId: String(ySettings.get('activePeriodId') || DEFAULT_ACTIVE_PERIOD_ID),
        activeTileUnitId: String(ySettings.get('activeTileUnitId') || ACTIVE_TILE_UNIT_ID),
        skills: Array.from(ySkills.values()),
        periods: Array.from(yPeriods.values()).map((period) => ({ ...period, label: getPeriodDisplayLabel(period) })),
        tileUnits: Array.from(yTileUnits.values()),
        people: Array.from(yPeople.values()),
        projects: Array.from(yProjects.values()),
        allocations: Array.from(yAllocations.values()),
        weeklyAllocations: Array.from(yWeeklyAllocations.values()),
        planningRules: Array.from(yPlanningRules.values()),
      });
      if (!skipDurableSave) scheduleDurableSave();
    };
    const syncObservedYjsChange = (transaction: Y.Transaction) => {
      const isSystemTransaction = (
        isApplyingSystemSnapshot ||
        transaction.origin === SYSTEM_SNAPSHOT_TRANSACTION_ORIGIN
      );
      const isBackendCommandTransaction = transaction.origin === BACKEND_COMMAND_TRANSACTION_ORIGIN;
      if (!transaction.local) {
        syncFromYjs({ skipDurableSave: true });
        if (durableSnapshot) applyDurableSnapshot(durableSnapshot);
        return;
      }

      const isLocalUserMutation = transaction.local && !isSystemTransaction;
      const shouldPersistDurably = isLocalUserMutation && !isBackendCommandTransaction;
      syncFromYjs({ skipDurableSave: !shouldPersistDurably });
    };
    const observeSettingsChanges = (_event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => syncObservedYjsChange(transaction);
    const observeSkillChanges = (_event: Y.YMapEvent<Skill>, transaction: Y.Transaction) => syncObservedYjsChange(transaction);
    const observePeriodChanges = (_event: Y.YMapEvent<Period>, transaction: Y.Transaction) => syncObservedYjsChange(transaction);
    const observeTileUnitChanges = (_event: Y.YMapEvent<TileUnit>, transaction: Y.Transaction) => syncObservedYjsChange(transaction);
    const observePersonChanges = (_event: Y.YMapEvent<Person>, transaction: Y.Transaction) => syncObservedYjsChange(transaction);
    const observeProjectChanges = (_event: Y.YMapEvent<ProjectFrame>, transaction: Y.Transaction) => syncObservedYjsChange(transaction);
    const observeAllocationChanges = (_event: Y.YMapEvent<PersonTileAllocation>, transaction: Y.Transaction) => syncObservedYjsChange(transaction);
    const observeWeeklyAllocationChanges = (_event: Y.YMapEvent<WeeklyAllocation>, transaction: Y.Transaction) => syncObservedYjsChange(transaction);
    const observePlanningRuleChanges = (_event: Y.YMapEvent<PlanningRule>, transaction: Y.Transaction) => syncObservedYjsChange(transaction);

    const refreshDerivedAllocations = () => {
      mapUnassignedAllocationSkills(yPeople, yProjects, yAllocations);
      revalidateAllocations(yPeople, yProjects, yAllocations, yPlanningRules);
    };

    const applyDurableSnapshot = (snapshot: TrafficSnapshot) => {
      withSystemSnapshot(() => {
        writeTrafficSnapshotData(doc, boardMaps, snapshot, SYSTEM_SNAPSHOT_TRANSACTION_ORIGIN);
        refreshDerivedAllocations();
      });
      syncFromYjs({ skipDurableSave: true });
    };

    const applyVersionedSnapshot = (
      snapshot: TrafficSnapshot,
      updatedAt: string | undefined,
      version: number | undefined,
      options: { force?: boolean } = {}
    ) => {
      if (disposed) return;
      const currentVersion = get().durableVersion;
      if (
        !options.force &&
        typeof version === 'number' &&
        typeof currentVersion === 'number' &&
        version <= currentVersion
      ) {
        return;
      }

      durableSnapshot = snapshot;
      hasDurableLoadSettled = true;
      hasDurableLoadFailed = false;
      applyDurableSnapshot(snapshot);
      set({
        durableLoadStatus: 'loaded',
        durableSaveStatus: 'saved',
        durableError: null,
        durableUpdatedAt: updatedAt ?? get().durableUpdatedAt,
        durableVersion: typeof version === 'number' ? version : currentVersion,
      });
    };

    const reloadCanonicalSnapshot = async () => {
      const response = await loadTrafficBoardSnapshot(roomName);
      applyVersionedSnapshot(response.snapshot, response.updatedAt, response.version, { force: true });
    };

    const commitBoardCommand = (command: TrafficBoardCommand) => {
      if (disposed || hasDurableLoadFailed || !hasDurableLoadSettled) return;
      set({ durableSaveStatus: 'saving', durableError: null });
      void executeTrafficBoardCommand(roomName, command)
        .then((response) => {
          applyVersionedSnapshot(response.snapshot, response.updatedAt, response.version);
        })
        .catch((error) => {
          if (disposed) return;
          const errorMessage = error instanceof Error ? error.message : 'Could not save the command to the backend.';
          set({
            durableSaveStatus: 'failed',
            durableError: errorMessage,
          });
          void reloadCanonicalSnapshot()
            .then(() => {
              if (disposed) return;
              const state = get();
              if (state.durableSaveStatus !== 'failed' || state.durableError !== errorMessage) return;
              set({
                durableSaveStatus: 'failed',
                durableError: `${errorMessage} Restored the last saved state from the backend.`,
              });
            })
            .catch(() => {
              // Keep the optimistic local state visible when recovery also fails.
            });
        });
    };

    const seedIfEmpty = () => {
      const hasExistingBoardData = hasYjsBoardData();

      if (ySettings.get('schemaVersion') === SCHEMA_VERSION && hasExistingBoardData) {
        ensureCurrentMonth(boardMaps);
        migrateLegacySeedData(boardMaps);
        ySettings.set('seedDataVersion', SEED_DATA_VERSION);
        return;
      }

      writeSeedBoardData(doc, boardMaps);
    };

    provider.on('status', (event: { status: string }) => {
      if (disposed) return;
      set({ isConnected: event.status === 'connected' });
    });

    provider.on('sync', (isSynced: boolean) => {
      if (disposed) return;
      set({ isSynced });
      if (!hasDurableLoadSettled && !hasYjsBoardData()) {
        syncFromYjs({ skipDurableSave: true });
        return;
      }
      if (hasDurableLoadFailed) {
        if (demoEnabled) return;
        withSystemSnapshot(() => {
          seedIfEmpty();
          refreshDerivedAllocations();
        });
        syncFromYjs({ skipDurableSave: true });
        return;
      }

      withSystemSnapshot(refreshDerivedAllocations);
      syncFromYjs({ skipDurableSave: true });
    });

    const syncCollaborationPeers = () => {
      set({ collaborationPeers: readCollaborationPeers(provider) });
    };

    getProviderAwareness(provider)?.on('change', syncCollaborationPeers);
    const trackingEnabled = getStoredCollaborationTrackingEnabled();
    if (trackingEnabled) {
      setLocalCollaborationPresence(provider, {
        cursor: null,
        activeTarget: null,
        editingTarget: null,
        action: null,
        trackingEnabled: true,
      }, collaborationUser);
    } else {
      clearLocalCollaborationPresence(provider);
    }
    syncCollaborationPeers();

    realtimeConnection = connectTrafficBoardRealtime(roomName, {
      onEvent: (event) => {
        if (disposed) return;
        if (event.type === 'board.snapshot' || event.type === 'board.updated') {
          applyVersionedSnapshot(event.snapshot, event.updatedAt, event.version);
          return;
        }
        if (event.type === 'command.error') {
          set({
            durableSaveStatus: 'failed',
            durableError: event.message,
          });
        }
      },
      onError: () => {
        if (disposed) return;
        set({
          durableError: 'The realtime API connection was interrupted. Changes still use the REST command endpoint.',
        });
      },
    });

    ySettings.observe(observeSettingsChanges);
    ySkills.observe(observeSkillChanges);
    yPeriods.observe(observePeriodChanges);
    yTileUnits.observe(observeTileUnitChanges);
    yPeople.observe(observePersonChanges);
    yProjects.observe(observeProjectChanges);
    yAllocations.observe(observeAllocationChanges);
    yWeeklyAllocations.observe(observeWeeklyAllocationChanges);
    yPlanningRules.observe(observePlanningRuleChanges);

    set({
      doc,
      provider,
      ySettings,
      ySkills,
      yPeriods,
      yTileUnits,
      yPeople,
      yProjects,
      yAllocations,
      yWeeklyAllocations,
      yPlanningRules,
      durableLoadStatus: 'loading',
      durableSaveStatus: 'idle',
      durableError: null,
      durableUpdatedAt: null,
      durableVersion: null,
      replaceBoardSnapshot: (snapshot, updatedAt, version) => {
        applyVersionedSnapshot(snapshot, updatedAt, version);
      },
      commitBoardCommand,
    });

    void loadTrafficBoardSnapshot(roomName)
      .then(({ snapshot, updatedAt, version }) => {
        applyVersionedSnapshot(snapshot, updatedAt, version);
      })
      .catch((error) => {
        if (disposed) return;
        hasDurableLoadSettled = true;
        hasDurableLoadFailed = true;
        set({
          durableLoadStatus: 'failed',
          durableSaveStatus: 'idle',
          durableError: error instanceof Error ? error.message : 'Could not load data from the backend.',
        });
        if (demoEnabled) return;
        withSystemSnapshot(() => {
          seedIfEmpty();
          refreshDerivedAllocations();
        });
        syncFromYjs({ skipDurableSave: true });
      });

    const recoveryTimer = window.setTimeout(() => {
      if (disposed || demoEnabled || !hasDurableLoadSettled || !hasDurableLoadFailed) return;
      withSystemSnapshot(() => {
        seedIfEmpty();
        refreshDerivedAllocations();
      });
      syncFromYjs({ skipDurableSave: true });
    }, 750);

    set({
      cleanup: () => {
        if (disposed) return;
        disposed = true;
        window.clearTimeout(recoveryTimer);
        ySettings.unobserve(observeSettingsChanges);
        ySkills.unobserve(observeSkillChanges);
        yPeriods.unobserve(observePeriodChanges);
        yTileUnits.unobserve(observeTileUnitChanges);
        yPeople.unobserve(observePersonChanges);
        yProjects.unobserve(observeProjectChanges);
        yAllocations.unobserve(observeAllocationChanges);
        yWeeklyAllocations.unobserve(observeWeeklyAllocationChanges);
        yPlanningRules.unobserve(observePlanningRuleChanges);
        getProviderAwareness(provider)?.off('change', syncCollaborationPeers);
        getProviderAwareness(provider)?.setLocalState(null);
        realtimeConnection?.close();
        provider.destroy();
        presenceDoc.destroy();
        doc.destroy();
        set({
          schemaVersion: SCHEMA_VERSION,
          skills: [],
          periods: [],
          tileUnits: [],
          activePeriodId: DEFAULT_ACTIVE_PERIOD_ID,
          activeTileUnitId: ACTIVE_TILE_UNIT_ID,
          people: [],
          projects: [],
          allocations: [],
          weeklyAllocations: [],
          planningRules: [],
          doc: null,
          provider: null,
          ySettings: null,
          ySkills: null,
          yPeriods: null,
          yTileUnits: null,
          yPeople: null,
          yProjects: null,
          yAllocations: null,
          yWeeklyAllocations: null,
          yPlanningRules: null,
          durableLoadStatus: 'idle',
          durableSaveStatus: 'idle',
          durableError: null,
          durableUpdatedAt: null,
          durableVersion: null,
          isConnected: false,
          isSynced: false,
          collaborationPeers: [],
          replaceBoardSnapshot: () => undefined,
          commitBoardCommand: () => undefined,
          cleanup: () => undefined,
        });
      },
    });
  },

  movePersonToTarget: (personId, target, periodId) => {
    const { yPeople, yProjects, yAllocations, yPlanningRules } = get();
    if (!yPeople || !yProjects || !yAllocations) return;
    const moves = Array.from(yAllocations.values())
      .filter((allocation) => allocation.personId === personId && allocation.periodId === periodId && allocation.target === 'bench')
      .map((allocation) => ({ tileId: allocation.id, target }));
    if (!moves.length) return;

    yAllocations.doc?.transact(() => {
      const peopleById = new Map(Array.from(yPeople.entries()));
      const projectsById = new Map(Array.from(yProjects.entries()));
      const nextAllocations = Array.from(yAllocations.values());
      const affectedTargetIds = new Set<string>();
      yAllocations.forEach((allocation) => {
        if (allocation.personId === personId && allocation.periodId === periodId && allocation.target === 'bench') {
          if (target !== 'bench') affectedTargetIds.add(target);
          const mappedAllocation = getMappedAllocationForTarget(
            allocation,
            { tileId: allocation.id, target },
            periodId,
            peopleById,
            projectsById,
            nextAllocations
          );
          yAllocations.set(allocation.id, mappedAllocation);
          const allocationIndex = nextAllocations.findIndex((item) => item.id === allocation.id);
          if (allocationIndex >= 0) nextAllocations[allocationIndex] = mappedAllocation;
        }
      });
      revalidateAllocations(yPeople, yProjects, yAllocations, yPlanningRules || undefined, periodId, affectedTargetIds);
    });
    get().commitBoardCommand({ type: 'allocations.move', periodId, moves });
  },

  moveTileToTarget: (tileId, target, periodId) => {
    const { yPeople, yProjects, yAllocations, yPlanningRules } = get();
    if (!yPeople || !yProjects || !yAllocations) return;

    const allocation = yAllocations.get(tileId);
    if (!allocation) return;
    yAllocations.doc?.transact(() => {
      const affectedTargetIds = new Set([allocation.target, target].filter((item) => item !== 'bench'));
      const mappedAllocation = getMappedAllocationForTarget(
        allocation,
        { tileId, target },
        periodId,
        new Map(Array.from(yPeople.entries())),
        new Map(Array.from(yProjects.entries())),
        Array.from(yAllocations.values())
      );
      yAllocations.set(tileId, mappedAllocation);
      revalidateAllocations(yPeople, yProjects, yAllocations, yPlanningRules || undefined, periodId, affectedTargetIds);
    });
    get().commitBoardCommand({ type: 'allocations.move', periodId, moves: [{ tileId, target }] });
  },

  moveTilesToTargets: (moves, periodId, options) => {
    const { ySettings, ySkills, yPeriods, yTileUnits, yPeople, yProjects, yAllocations, yWeeklyAllocations, yPlanningRules } = get();
    if (!ySettings || !ySkills || !yPeriods || !yTileUnits || !yPeople || !yProjects || !yAllocations || !yWeeklyAllocations || !yPlanningRules) return null;
    const transactionOrigin = options?.persistDurably === false
      ? BACKEND_COMMAND_TRANSACTION_ORIGIN
      : undefined;

    yAllocations.doc?.transact(() => {
      const peopleById = new Map(Array.from(yPeople.entries()));
      const projectsById = new Map(Array.from(yProjects.entries()));
      const nextAllocations = Array.from(yAllocations.values());
      const affectedTargetIds = new Set<string>();

      moves.forEach((move) => {
        const allocation = yAllocations.get(move.tileId);
        if (!allocation) return;
        if (allocation.target !== 'bench') affectedTargetIds.add(allocation.target);
        if (move.target !== 'bench') affectedTargetIds.add(move.target);

        const clearedSlotAllocationIds = clearConflictingProjectSlot(nextAllocations, move, periodId);
        clearedSlotAllocationIds.forEach((allocationId) => {
          const clearedAllocation = nextAllocations.find((item) => item.id === allocationId);
          if (clearedAllocation) yAllocations.set(allocationId, clearedAllocation);
        });

        const mappedAllocation = getMappedAllocationForTarget(
          allocation,
          move,
          periodId,
          peopleById,
          projectsById,
          nextAllocations
        );
        yAllocations.set(move.tileId, mappedAllocation);
        const allocationIndex = nextAllocations.findIndex((item) => item.id === move.tileId);
        if (allocationIndex >= 0) nextAllocations[allocationIndex] = mappedAllocation;
      });

      revalidateAllocations(yPeople, yProjects, yAllocations, yPlanningRules, periodId, affectedTargetIds);
    }, transactionOrigin);

    if (moves.length && options?.persistDurably !== false) {
      get().commitBoardCommand({ type: 'allocations.move', periodId, moves });
    }
    return readTrafficSnapshotFromYjs({ ySettings, ySkills, yPeriods, yTileUnits, yPeople, yProjects, yAllocations, yWeeklyAllocations, yPlanningRules });
  },

  applyBoardCommand: (command, options) => {
    const { doc, ySettings, ySkills, yPeriods, yTileUnits, yPeople, yProjects, yAllocations, yWeeklyAllocations, yPlanningRules } = get();
    if (!doc || !ySettings || !ySkills || !yPeriods || !yTileUnits || !yPeople || !yProjects || !yAllocations || !yWeeklyAllocations || !yPlanningRules) return null;

    const currentSnapshot = readTrafficSnapshotFromYjs({
      ySettings,
      ySkills,
      yPeriods,
      yTileUnits,
      yPeople,
      yProjects,
      yAllocations,
      yWeeklyAllocations,
      yPlanningRules,
    });
    const nextSnapshot = applyTrafficBoardCommand(currentSnapshot, command);

    writeTrafficSnapshotData(doc, {
      ySettings,
      ySkills,
      yPeriods,
      yTileUnits,
      yPeople,
      yProjects,
      yAllocations,
      yWeeklyAllocations,
      yPlanningRules,
    }, nextSnapshot, BACKEND_COMMAND_TRANSACTION_ORIGIN);

    if (options?.persistDurably !== false) {
      get().commitBoardCommand(command);
    }

    return nextSnapshot;
  },

  replaceBoardSnapshot: (snapshot, updatedAt, version) => {
    const { doc, ySettings, ySkills, yPeriods, yTileUnits, yPeople, yProjects, yAllocations, yWeeklyAllocations, yPlanningRules } = get();
    if (!doc || !ySettings || !ySkills || !yPeriods || !yTileUnits || !yPeople || !yProjects || !yAllocations || !yWeeklyAllocations || !yPlanningRules) return;

    writeTrafficSnapshotData(doc, {
      ySettings,
      ySkills,
      yPeriods,
      yTileUnits,
      yPeople,
      yProjects,
      yAllocations,
      yWeeklyAllocations,
      yPlanningRules,
    }, snapshot, SYSTEM_SNAPSHOT_TRANSACTION_ORIGIN);
    set({
      durableSaveStatus: 'saved',
      durableError: null,
      durableUpdatedAt: updatedAt ?? get().durableUpdatedAt,
      durableVersion: typeof version === 'number' ? version : get().durableVersion,
    });
  },

  commitBoardCommand: () => undefined,

  resetPersonAllocations: (personId, periodId) => {
    const { yPeople, yProjects, yAllocations, yPlanningRules } = get();
    if (!yPeople || !yProjects || !yAllocations) return;

    yAllocations.doc?.transact(() => {
      const affectedTargetIds = new Set<string>();
      yAllocations.forEach((allocation) => {
        if (allocation.personId === personId && allocation.periodId === periodId) {
          if (allocation.target !== 'bench') affectedTargetIds.add(allocation.target);
          yAllocations.set(allocation.id, {
            ...allocation,
            target: 'bench',
            previousTarget: allocation.target !== 'bench' ? allocation.target : allocation.previousTarget,
            skillId: undefined,
            requirementId: undefined,
            projectSlotIndex: undefined,
            validation: [],
          });
        }
      });
      revalidateAllocations(yPeople, yProjects, yAllocations, yPlanningRules || undefined, periodId, affectedTargetIds);
    });
    get().commitBoardCommand({ type: 'allocations.resetPerson', personId, periodId });
  },

  updateAllocation: (allocation) => {
    const { yPeople, yProjects, yAllocations, yPlanningRules } = get();
    if (!yPeople || !yProjects || !yAllocations) return;

    yAllocations.doc?.transact(() => {
      const currentAllocation = yAllocations.get(allocation.id);
      const affectedTargetIds = new Set([currentAllocation?.target, allocation.target].filter((item): item is string => Boolean(item) && item !== 'bench'));
      yAllocations.set(allocation.id, allocation);
      revalidateAllocations(yPeople, yProjects, yAllocations, yPlanningRules || undefined, allocation.periodId, affectedTargetIds);
    });
    get().commitBoardCommand({ type: 'allocations.update', allocation });
  },

  updateAllocationWithGroupMeetingState: (allocation, groupAllocationIds, meetingState) => {
    const { yPeople, yProjects, yAllocations, yPlanningRules } = get();
    if (!yPeople || !yProjects || !yAllocations) return;

    const groupIds = new Set(groupAllocationIds);

    yAllocations.doc?.transact(() => {
      const affectedTargetIds = new Set<string>();
      yAllocations.forEach((current) => {
        if (!groupIds.has(current.id)) return;
        if (current.target !== 'bench') affectedTargetIds.add(current.target);
        yAllocations.set(current.id, {
          ...current,
          meetingState,
          previousTarget: allocation.previousTarget,
        });
      });
      yAllocations.set(allocation.id, {
        ...allocation,
        meetingState,
      });
      if (allocation.target !== 'bench') affectedTargetIds.add(allocation.target);
      revalidateAllocations(yPeople, yProjects, yAllocations, yPlanningRules || undefined, allocation.periodId, affectedTargetIds);
    });
    get().commitBoardCommand({
      type: 'allocations.updateGroupMeetingState',
      allocation,
      groupAllocationIds,
      meetingState,
    });
  },

  createPerson: (periodId, options) => {
    const { yPeople, yAllocations, people, activePeriodId } = get();
    if (!yPeople || !yAllocations) return null;
    const targetPeriodId = periodId || activePeriodId;

    const nextNumber = people.length + 1;
    const person = options?.person ? structuredClone(options.person) : createPersonDraft(nextNumber, options);

    yPeople.set(person.id, person);
    createPersonPeriodAllocations(person, targetPeriodId).forEach((allocation) => {
      yAllocations.set(allocation.id, allocation);
    });

    get().commitBoardCommand({ type: 'person.create', person, periodId: targetPeriodId });
    return person.id;
  },

  updatePerson: (person, nextActivePeriodId) => {
    const { yPeople, yProjects, yAllocations, yPlanningRules, activePeriodId, periods } = get();
    if (!yPeople || !yProjects || !yAllocations) return;
    const targetPeriodId = nextActivePeriodId || activePeriodId;

    const existing = yPeople.get(person.id);
    const currentAllocations = Array.from(yAllocations.values());
    const nextPerson = applyPersonProfileUpdateFromPeriod(existing, person, targetPeriodId, periods, currentAllocations);
    yPeople.set(nextPerson.id, nextPerson);
    const periodsToSync = getCurrentAndFutureMonthPeriods(periods, targetPeriodId);

    yAllocations.doc?.transact(() => {
      const nextTileCountByPeriodId = new Map<string, number>();
      periodsToSync.forEach((period) => {
        const hasExistingAllocations = currentAllocations.some((allocation) => (
          allocation.personId === nextPerson.id && allocation.periodId === period.id
        ));
        if (!hasExistingAllocations && period.id !== targetPeriodId) return;

        const previousTileCount = existing ? getPersonPeriodCostTileCount(existing, period.id) : 0;
        const nextTileCount = getPersonPeriodCostTileCount(nextPerson, period.id);
        nextTileCountByPeriodId.set(period.id, nextTileCount);

        for (let tileIndex = previousTileCount; tileIndex < nextTileCount; tileIndex += 1) {
          const allocationId = `${period.id}-${nextPerson.id}-${tileIndex}`;
          yAllocations.set(allocationId, {
            id: allocationId,
            personId: nextPerson.id,
            tileIndex,
            target: 'bench',
            periodId: period.id,
            mode: 'revenue_first',
            revenueK: 1,
            hours: getPersonPeriodHoursPerTile(nextPerson, period.id),
          });
        }
      });

      yAllocations.forEach((allocation) => {
        const nextTileCount = nextTileCountByPeriodId.get(allocation.periodId);
        if (
          allocation.personId === nextPerson.id &&
          typeof nextTileCount === 'number' &&
          allocation.tileIndex >= nextTileCount
        ) {
          yAllocations.delete(allocation.id);
        }
      });

      yAllocations.forEach((allocation) => {
        if (allocation.personId === nextPerson.id) {
          yAllocations.set(allocation.id, {
            ...allocation,
            hours: allocation.hoursOverridden
              ? allocation.hours
              : getPersonPeriodHoursPerTile(nextPerson, allocation.periodId),
          });
        }
      });
      mapUnassignedAllocationSkills(yPeople, yProjects, yAllocations);
      revalidateAllocations(yPeople, yProjects, yAllocations, yPlanningRules || undefined);
    });
    get().commitBoardCommand({ type: 'person.update', person: nextPerson, activePeriodId: targetPeriodId });
  },

  archivePerson: (personId) => {
    const { yPeople, yProjects, yAllocations, yPlanningRules } = get();
    if (!yPeople) return;

    const person = yPeople.get(personId);
    if (!person) return;

    const archivedAt = new Date().toISOString();
    yPeople.set(personId, {
      ...person,
      archivedAt,
    });

    yAllocations?.doc?.transact(() => {
      const affectedTargetIds = new Set<string>();
      yAllocations.forEach((allocation) => {
        if (allocation.personId === personId) {
          if (allocation.target !== 'bench') affectedTargetIds.add(allocation.target);
          yAllocations.set(allocation.id, {
            ...allocation,
            target: 'bench',
            previousTarget: allocation.target !== 'bench' ? allocation.target : allocation.previousTarget,
            validation: [],
          });
        }
      });
      if (yProjects && affectedTargetIds.size) {
        revalidateAllocations(yPeople, yProjects, yAllocations, yPlanningRules || undefined, undefined, affectedTargetIds);
      }
    });
    get().commitBoardCommand({ type: 'person.archive', personId, archivedAt });
  },

  restorePerson: (personId, periodIds) => {
    const { activePeriodId, periods, yPeople, yAllocations } = get();
    if (!yPeople) return;

    const person = yPeople.get(personId);
    if (!person) return;

    const restoredPerson = { ...person };
    delete restoredPerson.archivedAt;
    const targetPeriodIds = Array.from(new Set(periodIds?.length ? periodIds : [activePeriodId]))
      .filter((periodId) => periods.some((period) => period.id === periodId && period.granularity === 'month'));

    const restoreInMaps = () => {
      yPeople.set(personId, restoredPerson);
      if (!yAllocations) return;
      const currentAllocations = Array.from(yAllocations.values());
      const existingAllocationIds = new Set(currentAllocations.map((allocation) => allocation.id));
      targetPeriodIds
        .filter((periodId) => !currentAllocations.some((allocation) => (
          allocation.personId === personId && allocation.periodId === periodId
        )))
        .flatMap((periodId) => createPersonPeriodAllocations(restoredPerson, periodId))
        .filter((allocation) => !existingAllocationIds.has(allocation.id))
        .forEach((allocation) => yAllocations.set(allocation.id, allocation));
    };

    if (yPeople.doc) {
      yPeople.doc.transact(restoreInMaps);
    } else {
      restoreInMaps();
    }
    get().commitBoardCommand({ type: 'person.restore', personId, periodIds: targetPeriodIds });
  },

  createProject: (periodId) => {
    const { yProjects, activePeriodId, projects, periods } = get();
    if (!yProjects) return null;

    const targetPeriodId = periodId || activePeriodId;
    const targetPeriod = periods.find((period) => period.id === targetPeriodId);
    const nextNumber = projects.length + 1;
    const id = `project-${Date.now()}`;
    const defaultProject: ProjectFrame = {
      id,
      name: `New project ${nextNumber}`,
      client: `Client ${nextNumber}`,
      contractType: 'time_materials_capped' satisfies ContractType,
      stage: 'possible' satisfies ProjectStage,
      planningStatus: 'ghost',
      workType: 'commercial',
      currencyProfile: {
        billingCurrency: 'PLN',
        fxMode: 'pln',
      },
      budgetK: 10,
      probability: 0.5,
      startMonth: targetPeriod?.label || 'New month',
      startPeriodId: targetPeriodId,
      endPeriodId: targetPeriodId,
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
          periodId: targetPeriodId,
          nativeRevenueK: 10,
          currency: 'PLN',
          revenueK: 10,
          probability: 0.5,
        },
      ],
      invoices: [],
      notes: '',
    };

    yProjects.set(id, defaultProject);
    get().commitBoardCommand({ type: 'project.create', project: defaultProject });
    return id;
  },

  updateProject: (project) => {
    const { yPeople, yProjects, yAllocations, yPlanningRules } = get();
    if (!yPeople || !yProjects || !yAllocations) return;
    const isExistingProject = yProjects.has(project.id);
    yProjects.doc?.transact(() => {
      yProjects.set(project.id, project);
      mapUnassignedAllocationSkills(yPeople, yProjects, yAllocations);
      revalidateAllocations(yPeople, yProjects, yAllocations, yPlanningRules || undefined, undefined, new Set([project.id]));
    });
    get().commitBoardCommand({ type: isExistingProject ? 'project.update' : 'project.create', project });
  },

  upsertPlanningRules: (planningRules) => {
    const { yPeople, yProjects, yAllocations, yPlanningRules } = get();
    if (!yPeople || !yProjects || !yAllocations || !yPlanningRules || !planningRules.length) return;

    yPlanningRules.doc?.transact(() => {
      planningRules.forEach((planningRule) => yPlanningRules.set(planningRule.id, planningRule));
      revalidateAllocations(yPeople, yProjects, yAllocations, yPlanningRules);
    });
    set({
      allocations: Array.from(yAllocations.values()),
      planningRules: Array.from(yPlanningRules.values()),
    });
    get().commitBoardCommand({ type: 'planningRules.upsertMany', planningRules });
  },

  deletePlanningRule: (planningRuleId) => {
    const { yPeople, yProjects, yAllocations, yPlanningRules } = get();
    if (!yPeople || !yProjects || !yAllocations || !yPlanningRules) return;

    const currentRule = yPlanningRules.get(planningRuleId);
    yPlanningRules.doc?.transact(() => {
      yPlanningRules.delete(planningRuleId);
      revalidateAllocations(
        yPeople,
        yProjects,
        yAllocations,
        yPlanningRules,
        currentRule?.periodId,
        currentRule?.projectId ? new Set([currentRule.projectId]) : undefined
      );
    });
    set({
      allocations: Array.from(yAllocations.values()),
      planningRules: Array.from(yPlanningRules.values()),
    });
    get().commitBoardCommand({ type: 'planningRules.delete', planningRuleId });
  },

  archiveProject: (projectId, periodId) => {
    const { yPeople, yProjects, yAllocations, yPlanningRules } = get();
    if (!yProjects) return;

    const project = yProjects.get(projectId);
    if (!project) return;

    yProjects.set(projectId, {
      ...project,
      archivedPeriodIds: Array.from(new Set([...(project.archivedPeriodIds || []), periodId])),
    });

    yAllocations?.doc?.transact(() => {
      yAllocations.forEach((allocation) => {
        if (allocation.target === projectId && allocation.periodId === periodId) {
          yAllocations.set(allocation.id, {
            ...allocation,
            target: 'bench',
            previousTarget: allocation.target,
            validation: [],
          });
        }
      });
      if (yPeople) {
        revalidateAllocations(yPeople, yProjects, yAllocations, yPlanningRules || undefined, periodId, new Set([projectId]));
      }
    });
    get().commitBoardCommand({ type: 'project.archivePeriod', projectId, periodId });
  },

  deleteProject: (projectId) => {
    const { yProjects, yAllocations, yPlanningRules } = get();
    if (!yProjects) return;

    yProjects.doc?.transact(() => {
      yProjects.delete(projectId);
      yPlanningRules?.forEach((planningRule) => {
        if (planningRule.projectId === projectId) yPlanningRules.delete(planningRule.id);
      });
      yAllocations?.forEach((allocation) => {
        if (allocation.target === projectId) {
          yAllocations.set(allocation.id, {
            ...allocation,
            target: 'bench',
            previousTarget: allocation.target,
            skillId: undefined,
            requirementId: undefined,
            projectSlotIndex: undefined,
            validation: [],
          });
        }
      });
    });
    get().commitBoardCommand({ type: 'project.delete', projectId });
  },

  restoreProject: (projectId, periodId) => {
    const { yProjects } = get();
    if (!yProjects) return;

    const project = yProjects.get(projectId);
    if (!project) return;

    yProjects.set(projectId, {
      ...project,
      archivedPeriodIds: (project.archivedPeriodIds || []).filter((archivedPeriodId) => archivedPeriodId !== periodId),
    });
    get().commitBoardCommand({ type: 'project.restorePeriod', projectId, periodId });
  },

  ensurePeriodCapacity: (periodId) => {
    const { yAllocations, people, allocations } = get();
    if (!yAllocations) return;

    const activePeople = people.filter((person) => isPersonActiveInPeriod(person, periodId));
    const missingPeople = activePeople.filter((person) => !allocations.some((allocation) => (
      allocation.periodId === periodId && allocation.personId === person.id
    )));

    if (!missingPeople.length) return;

    yAllocations.doc?.transact(() => {
      missingPeople
        .flatMap((person) => createPersonPeriodAllocations(person, periodId))
        .forEach((allocation) => yAllocations.set(allocation.id, allocation));
    });
    get().commitBoardCommand({ type: 'period.ensureCapacity', periodId });
  },

  ensurePlanningRange: (fromPeriodId, monthCount) => {
    const { doc, yPeriods, yAllocations, people, periods } = get();
    if (!doc || !yPeriods || !yAllocations) return;

    const sourcePeriod = periods.find((period) => period.id === fromPeriodId && period.granularity === 'month');
    if (!sourcePeriod) return;

    const existingPeriodIds = new Set(periods.map((period) => period.id));
    const sourceDate = getMonthDate(sourcePeriod);
    const monthsToCreate: Period[] = [];

    for (let index = 0; index < monthCount; index += 1) {
      const candidate = createMonthPeriod(addUtcMonths(sourceDate, index));
      if (!existingPeriodIds.has(candidate.id)) {
        existingPeriodIds.add(candidate.id);
        monthsToCreate.push(candidate);
      }
    }

    if (!monthsToCreate.length) return;

    doc.transact(() => {
      monthsToCreate.forEach((month) => {
        yPeriods.set(month.id, month);
        createWeekPeriods(month).forEach((week) => yPeriods.set(week.id, week));
        people
          .filter((person) => isPersonActiveInPeriod(person, month.id))
          .flatMap((person) => createPersonPeriodAllocations(person, month.id))
          .forEach((allocation) => yAllocations.set(allocation.id, allocation));
      });
    });
    get().commitBoardCommand({ type: 'period.ensureRange', fromPeriodId, monthCount });
  },

  setActivePeriod: (periodId) => {
    const { ySettings, periods } = get();
    if (!periods.some((period) => period.id === periodId)) return;
    ySettings?.set('activePeriodId', periodId);
    set({ activePeriodId: periodId });
    get().commitBoardCommand({ type: 'settings.setActivePeriod', periodId });
  },

  createMonth: (periodId, activate = true) => {
    const { doc, ySettings, yPeriods, yAllocations, people, periods } = get();
    if (!doc || !ySettings || !yPeriods || !yAllocations) return null;
    if (periods.some((period) => period.id === periodId)) {
      if (activate) {
        ySettings.set('activePeriodId', periodId);
        set({ activePeriodId: periodId });
        get().commitBoardCommand({ type: 'period.createMonth', periodId, activate });
      }
      return periodId;
    }

    const candidateDate = new Date(`${periodId}-01T00:00:00.000Z`);
    if (Number.isNaN(candidateDate.getTime())) return null;
    const month = createMonthPeriod(candidateDate);

    doc.transact(() => {
      yPeriods.set(month.id, month);
      createWeekPeriods(month).forEach((week) => yPeriods.set(week.id, week));
      people
        .filter((person) => isPersonActiveInPeriod(person, month.id))
        .flatMap((person) => createPersonPeriodAllocations(person, month.id))
        .forEach((allocation) => yAllocations.set(allocation.id, allocation));
      if (activate) {
        ySettings.set('activePeriodId', month.id);
      }
    });

    get().commitBoardCommand({ type: 'period.createMonth', periodId: month.id, activate });
    return month.id;
  },

  createNextMonth: (activate = true) => {
    const { doc, ySettings, yPeriods, yAllocations, people, periods } = get();
    if (!doc || !ySettings || !yPeriods || !yAllocations) return null;

    const latestMonth = getLatestMonth(periods);
    const latestDate = latestMonth
      ? new Date(`${latestMonth.startsOn}T00:00:00.000Z`)
      : new Date(`${DEFAULT_ACTIVE_PERIOD_ID}-01T00:00:00.000Z`);
    const nextMonth = createMonthPeriod(addUtcMonths(latestDate, 1));

    doc.transact(() => {
      yPeriods.set(nextMonth.id, nextMonth);
      createWeekPeriods(nextMonth).forEach((week) => yPeriods.set(week.id, week));
      people
        .filter((person) => isPersonActiveInPeriod(person, nextMonth.id))
        .flatMap((person) => createPersonPeriodAllocations(person, nextMonth.id))
        .forEach((allocation) => yAllocations.set(allocation.id, allocation));
      if (activate) {
        ySettings.set('activePeriodId', nextMonth.id);
      }
    });

    get().commitBoardCommand({ type: 'period.createMonth', periodId: nextMonth.id, activate });
    return nextMonth.id;
  },

  setLens: (lens) => set({ lens }),
  setActiveTileUnit: (tileUnitId) => {
    const { ySettings, tileUnits } = get();
    if (!tileUnits.some((tileUnit) => tileUnit.id === tileUnitId)) return;
    ySettings?.set('activeTileUnitId', tileUnitId);
    set({ activeTileUnitId: tileUnitId });
    get().commitBoardCommand({ type: 'settings.setActiveTileUnit', tileUnitId });
  },
  setRevenueView: (revenueView) => set({ revenueView }),
  setCollaborationUserName: (name) => {
    const nextUser = updateCollaborationUserName(get().collaborationUser, name);
    persistCollaborationUser(nextUser);
    set({ collaborationUser: nextUser });
    updateLocalCollaborationPresence(get().provider, {}, nextUser);
  },
  setCollaborationCursor: (cursor) => {
    updateLocalCollaborationPresence(get().provider, { cursor }, get().collaborationUser);
  },
  setCollaborationActiveTarget: (target) => {
    updateLocalCollaborationPresence(get().provider, { activeTarget: target }, get().collaborationUser);
  },
  setCollaborationEditingTarget: (target) => {
    updateLocalCollaborationPresence(get().provider, { editingTarget: target }, get().collaborationUser);
  },
  setCollaborationView: (view) => {
    updateLocalCollaborationPresence(get().provider, { view }, get().collaborationUser);
  },
  setCollaborationAction: (action) => {
    updateLocalCollaborationPresence(get().provider, { action }, get().collaborationUser);
  },
  setCollaborationTrackingEnabled: (enabled) => {
    if (!enabled) {
      clearLocalCollaborationPresence(get().provider);
      set({ collaborationPeers: get().provider ? readCollaborationPeers(get().provider!) : [] });
      return;
    }

    setLocalCollaborationPresence(get().provider, {
      cursor: null,
      activeTarget: null,
      editingTarget: null,
      action: null,
      trackingEnabled: true,
    }, get().collaborationUser);
  },

  resetBoard: () => {
    if (demoEnabled) {
      window.dispatchEvent(new Event(DEMO_RESET_EVENT));
      return;
    }
    const { doc, ySettings, ySkills, yPeriods, yTileUnits, yPeople, yProjects, yAllocations, yWeeklyAllocations, yPlanningRules } = get();
    if (!doc || !ySettings || !ySkills || !yPeriods || !yTileUnits || !yPeople || !yProjects || !yAllocations || !yWeeklyAllocations || !yPlanningRules) return;

    writeSeedBoardData(doc, { ySettings, ySkills, yPeriods, yTileUnits, yPeople, yProjects, yAllocations, yWeeklyAllocations, yPlanningRules });
    get().commitBoardCommand({ type: 'board.reset' });
  },

  cleanup: () => undefined,
}));
