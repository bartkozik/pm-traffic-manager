// Public snapshot: identity labels and financial amounts below are synthetic fixture values.
// Existing schema, relationships, planning scenarios and implementation are retained.
import { Period, Person, PersonTileAllocation, PlanningRule, ProjectFrame, Skill, TileUnit, TrafficSnapshot } from './traffic.model.js';
import { createPersonPeriodAllocations } from './periods.js';
import { createPersonPairPlanningRule } from './planningRules.js';

export const TRAFFIC_SCHEMA_VERSION = 1;
export const TRAFFIC_SEED_DATA_VERSION = 10;
export const DEFAULT_ACTIVE_PERIOD_ID = '2026-06';
export const DEFAULT_ACTIVE_TILE_UNIT_ID = 'money-1k';

export const SEED_SKILLS: Skill[] = [
  { id: 'backend', label: 'Backend', defaultTargetRatePlnH: 180 },
  { id: 'frontend', label: 'Frontend', defaultTargetRatePlnH: 200 },
  { id: 'fullstack', label: 'Fullstack', defaultTargetRatePlnH: 220 },
  { id: 'design', label: 'Design', defaultTargetRatePlnH: 240 },
  { id: 'pm', label: 'PM', defaultTargetRatePlnH: 180 },
  { id: 'qa', label: 'QA', defaultTargetRatePlnH: 200 },
  { id: 'devops', label: 'DevOps', defaultTargetRatePlnH: 220 },
  { id: 'mobile', label: 'Mobile', defaultTargetRatePlnH: 240 },
];

export const SEED_PERIODS: Period[] = [
  {
    id: DEFAULT_ACTIVE_PERIOD_ID,
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
    parentPeriodId: DEFAULT_ACTIVE_PERIOD_ID,
  },
  {
    id: '2026-06-w2',
    label: 'June W2',
    granularity: 'week',
    startsOn: '2026-06-08',
    endsOn: '2026-06-14',
    parentPeriodId: DEFAULT_ACTIVE_PERIOD_ID,
  },
  {
    id: '2026-06-w3',
    label: 'June W3',
    granularity: 'week',
    startsOn: '2026-06-15',
    endsOn: '2026-06-21',
    parentPeriodId: DEFAULT_ACTIVE_PERIOD_ID,
  },
  {
    id: '2026-06-w4',
    label: 'June W4',
    granularity: 'week',
    startsOn: '2026-06-22',
    endsOn: '2026-06-28',
    parentPeriodId: DEFAULT_ACTIVE_PERIOD_ID,
  },
  {
    id: '2026-06-w5',
    label: 'June W5',
    granularity: 'week',
    startsOn: '2026-06-29',
    endsOn: '2026-06-30',
    parentPeriodId: DEFAULT_ACTIVE_PERIOD_ID,
  },
  {
    id: '2026-07',
    label: 'July 2026',
    granularity: 'month',
    startsOn: '2026-07-01',
    endsOn: '2026-07-31',
  },
];

export const SEED_TILE_UNITS: TileUnit[] = [
  { id: DEFAULT_ACTIVE_TILE_UNIT_ID, kind: 'money', label: '1k PLN', value: 1, currency: 'PLN' },
  { id: 'money-2k', kind: 'money', label: '2k PLN', value: 2, currency: 'PLN' },
  { id: 'money-5k', kind: 'money', label: '5k PLN', value: 5, currency: 'PLN' },
  { id: 'hours-8h', kind: 'hours', label: '8h', value: 8 },
  { id: 'hours-20h', kind: 'hours', label: '20h', value: 20 },
  { id: 'hours-40h', kind: 'hours', label: '40h', value: 40 },
];

export const SEED_PEOPLE: Person[] = [
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

export const SEED_PROJECTS: ProjectFrame[] = [
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
    startPeriodId: DEFAULT_ACTIVE_PERIOD_ID,
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
        periodId: DEFAULT_ACTIVE_PERIOD_ID,
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
    startPeriodId: DEFAULT_ACTIVE_PERIOD_ID,
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
      { periodId: DEFAULT_ACTIVE_PERIOD_ID, nativeRevenueK: 60, currency: 'PLN', revenueK: 60, probability: 0.65 },
      { periodId: '2026-07', nativeRevenueK: 60, currency: 'PLN', revenueK: 60, probability: 0.65 },
    ],
    invoices: [],
    notes: "Sanitized project note 2.",
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
    startPeriodId: DEFAULT_ACTIVE_PERIOD_ID,
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
        periodId: DEFAULT_ACTIVE_PERIOD_ID,
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

export const SEED_PLANNING_RULES: PlanningRule[] = [
  createPersonPairPlanningRule({
    periodId: DEFAULT_ACTIVE_PERIOD_ID,
    personAId: 'tomasz',
    personBId: 'anna',
    severity: 'hard',
    reason: "Sanitized planning constraint.",
    now: '2026-06-01T00:00:00.000Z',
  }),
];

export function createSeedAllocations(people: Person[] = SEED_PEOPLE): PersonTileAllocation[] {
  return people.flatMap((person) => createPersonPeriodAllocations(person, DEFAULT_ACTIVE_PERIOD_ID));
}

export function createSeedTrafficSnapshot(): TrafficSnapshot {
  return structuredClone({
    schemaVersion: TRAFFIC_SCHEMA_VERSION,
    skills: SEED_SKILLS,
    periods: SEED_PERIODS,
    tileUnits: SEED_TILE_UNITS,
    activePeriodId: DEFAULT_ACTIVE_PERIOD_ID,
    activeTileUnitId: DEFAULT_ACTIVE_TILE_UNIT_ID,
    people: SEED_PEOPLE,
    projects: SEED_PROJECTS,
    allocations: createSeedAllocations(SEED_PEOPLE),
    weeklyAllocations: [],
    planningRules: SEED_PLANNING_RULES,
  });
}
