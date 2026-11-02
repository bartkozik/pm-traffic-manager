import {
  filterPersonCostCapacityAllocations,
  getProjectWorkType,
  getProjectWorkTypeLabel,
  isPersonActiveInPeriod,
  isProductiveAllocationTarget,
  Period,
  Person,
  PersonTileAllocation,
  ProjectFrame,
  Skill,
  SkillId,
} from '../models/traffic.model';
import { getPersonPeriodAvailableHours, getPersonPeriodCostK, getPersonPeriodProfile } from './personPeriod';
import { getPersonPeriodUtilization } from './personUtilization';
import { getVisualSkillGlyph, visualSkillLegend } from './visualLegend';

export type AnalyticSignalKind =
  | 'overload'
  | 'bench'
  | 'fragmentation'
  | 'lowValue'
  | 'researchDevelopment'
  | 'singlePersonProject'
  | 'changed'
  | 'risk';

export type AnalyticTone =
  | 'healthy'
  | 'warning'
  | 'danger'
  | 'purple'
  | 'orange'
  | 'dark'
  | 'blue'
  | 'bench'
  | 'neutral';

export type AnalyticFilterId =
  | 'overload'
  | 'bench'
  | 'fragmentation'
  | 'low-value'
  | 'rd'
  | 'single-person'
  | 'changes'
  | 'risks';

export type AnalyticSortAccessor =
  | 'personName'
  | 'rangeUtilizationPercent'
  | 'rangeProjectCount'
  | 'rangeBenchRevenueK'
  | 'rangeRevenueK'
  | 'rangeHours'
  | 'rangeRiskCount';

export interface AnalyticAssignment {
  id: string;
  targetId: string;
  label: string;
  detail: string;
  revenueK: number;
  hours: number;
  allocationCount: number;
  skillIds: SkillId[];
  skillCodes: string[];
  skillLabels: string[];
  warningCount: number;
  positiveCount: number;
  tone: AnalyticTone;
  signalKinds: AnalyticSignalKind[];
  signalCodes: string[];
}

export interface AnalyticPeriodCell {
  period: Period;
  assignments: AnalyticAssignment[];
  allocatedRevenueK: number;
  allocatedHours: number;
  productiveRevenueK: number;
  productiveHours: number;
  benchRevenueK: number;
  benchHours: number;
  availableHours: number;
  costK: number;
  utilizationPercent: number;
  projectCount: number;
  warningCount: number;
  signalKinds: AnalyticSignalKind[];
  signalCodes: string[];
}

export interface AnalyticBoardRow {
  id: string;
  person: Person;
  periodCells: AnalyticPeriodCell[];
  rangeRevenueK: number;
  rangeHours: number;
  rangeProductiveRevenueK: number;
  rangeProductiveHours: number;
  rangeBenchRevenueK: number;
  rangeBenchHours: number;
  rangeAvailableHours: number;
  rangeCostK: number;
  rangeUtilizationPercent: number;
  rangeProjectCount: number;
  rangeRiskCount: number;
  signalKinds: AnalyticSignalKind[];
  signalCodes: string[];
  searchText: string;
}

export interface BuildAnalyticBoardRowsInput {
  people: Person[];
  projects: ProjectFrame[];
  allocations: PersonTileAllocation[];
  periods: Period[];
  skills: Skill[];
}

export interface AnalyticBoardFilterOptions {
  search?: string;
  filters?: AnalyticFilterId[];
}

export interface AnalyticBoardSortStatus {
  columnAccessor: AnalyticSortAccessor | string;
  direction: 'asc' | 'desc';
}

export interface AnalyticLegendItem {
  className: string;
  code: string;
  detail: string;
  id: string;
  kind: 'tone' | 'frame' | 'marker' | 'person' | 'project' | 'metric' | 'glyph';
  label: string;
}

export interface AnalyticLegendSection {
  description: string;
  id: 'signals' | 'work' | 'skills' | 'metrics';
  items: AnalyticLegendItem[];
  label: string;
}

export const analyticFilterLabels: Record<AnalyticFilterId, string> = {
  overload: 'Overload',
  bench: 'Bench',
  fragmentation: 'Fragmentacja',
  'low-value': 'Low value',
  rd: 'R&D',
  'single-person': 'Single point',
  changes: 'Zmiany',
  risks: 'Ryzyka',
};

const analyticSignalLegendItems: AnalyticLegendItem[] = [
  { id: 'overload', kind: 'tone', className: 'is-overflow', code: 'OVER', label: 'Overload', detail: 'ponad dostępne godziny' },
  { id: 'risk', kind: 'tone', className: 'is-tone-red', code: 'RISK', label: 'Ryzyko', detail: 'walidacja albo alert' },
  { id: 'bench', kind: 'person', className: 'is-bench-footprint', code: 'BENCH', label: 'Bench', detail: 'capacity poza projektem' },
  { id: 'fragmentation', kind: 'tone', className: 'is-tone-mixed', code: 'FRAG', label: 'Fragmentacja', detail: 'osoba w kilku miejscach' },
  { id: 'lowValue', kind: 'marker', className: 'is-low-value', code: 'LOW', label: 'Low value', detail: 'niski komercyjny zwrot' },
  { id: 'researchDevelopment', kind: 'frame', className: 'is-work-research_development', code: 'R&D', label: 'R&D', detail: 'eksperyment / inwestycja' },
  { id: 'singlePersonProject', kind: 'project', className: 'is-single-person', code: '1P', label: 'Single point', detail: 'jedna osoba niesie kontekst' },
  { id: 'changed', kind: 'marker', className: 'is-moved', code: 'RUCH', label: 'Ruch', detail: 'zmiana lub handoff' },
];

const analyticSkillLegendItems: AnalyticLegendItem[] = visualSkillLegend.map((item) => ({
  id: `skill-${item.id}`,
  kind: 'glyph',
  className: `is-skill-${item.id}`,
  code: item.glyph,
  label: item.label,
  detail: 'kompetencja alokacji',
}));

export const analyticLegendSections: AnalyticLegendSection[] = [
  {
    id: 'signals',
    label: 'Sygnały',
    description: 'Ten sam słownik sygnałów co na Diablo Board.',
    items: analyticSignalLegendItems,
  },
  {
    id: 'work',
    label: 'Typ pracy',
    description: 'Ramki i assignmenty z tą samą semantyką koloru.',
    items: [
      { id: 'signed', kind: 'frame', className: 'is-healthy', code: 'OK', label: 'Zdrowe', detail: 'pokryta alokacja' },
      { id: 'uncertain', kind: 'frame', className: 'is-gap', code: '?', label: 'Niepewne', detail: 'luka albo weak confidence' },
      { id: 'rd', kind: 'frame', className: 'is-work-research_development', code: 'R&D', label: 'R&D', detail: 'eksperyment' },
      { id: 'waiting', kind: 'frame', className: 'is-work-waiting_room', code: 'WAIT', label: 'Poczekalnia', detail: 'capacity bez decyzji' },
      { id: 'defensive', kind: 'frame', className: 'is-work-defensive_maintenance', code: 'DEF', label: 'Defensive', detail: 'obrona relacji' },
      { id: 'future', kind: 'frame', className: 'is-ghost', code: 'GHOST', label: 'Ghost', detail: 'przyszła rezerwacja' },
      { id: 'time-off', kind: 'frame', className: 'is-work-time_off', code: 'OFF', label: 'Urlop', detail: 'niedostępność' },
    ],
  },
  {
    id: 'skills',
    label: 'Skille',
    description: 'Te same mikro-badge kompetencji co na Diablo Board.',
    items: analyticSkillLegendItems,
  },
  {
    id: 'metrics',
    label: 'Metryki',
    description: 'Metryki w tabeli bez osobnego systemu alertów.',
    items: [
      { id: 'util-ok', kind: 'metric', className: 'is-healthy', code: '85%', label: 'Zdrowo', detail: 'w dostępności' },
      { id: 'util-low', kind: 'metric', className: 'is-gap', code: '<65%', label: 'Niedociążenie', detail: 'za mało pracy' },
      { id: 'util-over', kind: 'metric', className: 'is-overflow', code: '>105%', label: 'Przeciążenie', detail: 'ponad dostępność' },
      { id: 'bench-cost', kind: 'person', className: 'is-bench-footprint', code: '12k', label: 'Bench koszt', detail: 'nieproduktywna capacity' },
    ],
  },
];

const filterSignals: Record<AnalyticFilterId, AnalyticSignalKind> = {
  overload: 'overload',
  bench: 'bench',
  fragmentation: 'fragmentation',
  'low-value': 'lowValue',
  rd: 'researchDevelopment',
  'single-person': 'singlePersonProject',
  changes: 'changed',
  risks: 'risk',
};

const analyticSignalMetaByKind = new Map<AnalyticSignalKind, AnalyticLegendItem>(
  analyticSignalLegendItems.map((item) => [item.id as AnalyticSignalKind, item])
);

const analyticSignalMetaByCode = new Map<string, AnalyticLegendItem>(
  analyticLegendSections
    .flatMap((section) => section.items)
    .map((item) => [item.code, item])
);

export function getAnalyticSignalCodeMeta(code: string) {
  return analyticSignalMetaByCode.get(code);
}

export function buildAnalyticBoardRows({
  people,
  projects,
  allocations,
  periods,
  skills,
}: BuildAnalyticBoardRowsInput): AnalyticBoardRow[] {
  const visiblePeriods = [...periods]
    .filter((period) => period.granularity === 'month')
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const activePeople = people.filter((person) => visiblePeriods.some((period) => isPersonActiveInPeriod(person, period.id)));
  const peopleById = new Map(activePeople.map((person) => [person.id, person]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const skillsById = new Map(skills.map((skill) => [skill.id, skill]));
  const visibleAllocations = filterPersonCostCapacityAllocations(allocations, peopleById)
    .filter((allocation) => peopleById.has(allocation.personId))
    .filter((allocation) => visiblePeriods.some((period) => period.id === allocation.periodId));
  const projectPeopleCountByPeriodTarget = getProjectPeopleCountByPeriodTarget(visibleAllocations);

  return activePeople
    .map((person) => buildPersonAnalyticRow({
      allocations: visibleAllocations,
      person,
      periods: visiblePeriods,
      projectPeopleCountByPeriodTarget,
      projectsById,
      skillsById,
    }))
    .sort((a, b) => a.person.name.localeCompare(b.person.name, 'pl'));
}

export function filterAnalyticBoardRows(
  rows: AnalyticBoardRow[],
  { search = '', filters = [] }: AnalyticBoardFilterOptions
) {
  const query = normalizeSearch(search);
  return rows.filter((row) => {
    if (query && !row.searchText.includes(query)) return false;
    return filters.every((filterId) => row.signalKinds.includes(filterSignals[filterId]));
  });
}

export function sortAnalyticBoardRows(
  rows: AnalyticBoardRow[],
  sortStatus: AnalyticBoardSortStatus
) {
  const direction = sortStatus.direction === 'asc' ? 1 : -1;
  return [...rows].sort((first, second) => {
    const result = compareAnalyticRows(first, second, sortStatus.columnAccessor);
    return result * direction || first.person.name.localeCompare(second.person.name, 'pl');
  });
}

function buildPersonAnalyticRow({
  allocations,
  person,
  periods,
  projectPeopleCountByPeriodTarget,
  projectsById,
  skillsById,
}: {
  allocations: PersonTileAllocation[];
  person: Person;
  periods: Period[];
  projectPeopleCountByPeriodTarget: Map<string, number>;
  projectsById: Map<string, ProjectFrame>;
  skillsById: Map<SkillId, Skill>;
}): AnalyticBoardRow {
  const periodCells = periods.map((period) => buildPersonPeriodCell({
    allocations,
    period,
    person,
    projectPeopleCountByPeriodTarget,
    projectsById,
    skillsById,
  }));
  const rangeRevenueK = sum(periodCells, (cell) => cell.allocatedRevenueK);
  const rangeHours = sum(periodCells, (cell) => cell.allocatedHours);
  const rangeProductiveRevenueK = sum(periodCells, (cell) => cell.productiveRevenueK);
  const rangeProductiveHours = sum(periodCells, (cell) => cell.productiveHours);
  const rangeBenchRevenueK = sum(periodCells, (cell) => cell.benchRevenueK);
  const rangeBenchHours = sum(periodCells, (cell) => cell.benchHours);
  const rangeAvailableHours = sum(periodCells, (cell) => cell.availableHours);
  const rangeCostK = sum(periodCells, (cell) => cell.costK);
  const rangeProjectCount = new Set(periodCells.flatMap((cell) => (
    cell.assignments
      .filter((assignment) => assignment.targetId !== 'bench')
      .map((assignment) => assignment.targetId)
  ))).size;
  const signalKinds = uniqueSignals(periodCells.flatMap((cell) => cell.signalKinds));
  const signalCodes = getSignalCodes(signalKinds);
  const periodProfiles = periods.map((period) => getPersonPeriodProfile(person, period.id));
  const displayPerson = periodProfiles.at(-1) || person;
  const searchableParts = [
    displayPerson.name,
    ...periodProfiles.flatMap((periodProfile) => [
      periodProfile.role,
      periodProfile.seniority || '',
      ...periodProfile.skillIds,
    ]),
    ...periodCells.flatMap((cell) => cell.assignments.flatMap((assignment) => [
      assignment.label,
      assignment.detail,
      ...assignment.skillCodes,
      ...assignment.skillLabels,
      ...assignment.signalCodes,
    ])),
  ];

  return {
    id: person.id,
    person: displayPerson,
    periodCells,
    rangeRevenueK,
    rangeHours,
    rangeProductiveRevenueK,
    rangeProductiveHours,
    rangeBenchRevenueK,
    rangeBenchHours,
    rangeAvailableHours,
    rangeCostK,
    rangeUtilizationPercent: rangeAvailableHours > 0 ? Math.round((rangeProductiveHours / rangeAvailableHours) * 100) : 0,
    rangeProjectCount,
    rangeRiskCount: sum(periodCells, (cell) => cell.warningCount) + (signalKinds.includes('overload') ? 1 : 0),
    signalKinds,
    signalCodes,
    searchText: normalizeSearch(searchableParts.join(' ')),
  };
}

function buildPersonPeriodCell({
  allocations,
  period,
  person,
  projectPeopleCountByPeriodTarget,
  projectsById,
  skillsById,
}: {
  allocations: PersonTileAllocation[];
  period: Period;
  person: Person;
  projectPeopleCountByPeriodTarget: Map<string, number>;
  projectsById: Map<string, ProjectFrame>;
  skillsById: Map<SkillId, Skill>;
}): AnalyticPeriodCell {
  if (!isPersonActiveInPeriod(person, period.id)) {
    return {
      period,
      assignments: [],
      allocatedRevenueK: 0,
      allocatedHours: 0,
      productiveRevenueK: 0,
      productiveHours: 0,
      benchRevenueK: 0,
      benchHours: 0,
      availableHours: 0,
      costK: 0,
      utilizationPercent: 0,
      projectCount: 0,
      warningCount: 0,
      signalKinds: [],
      signalCodes: [],
    };
  }

  const periodPerson = getPersonPeriodProfile(person, period.id);
  const periodAllocations = allocations.filter((allocation) => allocation.periodId === period.id);
  const personPeriodAllocations = periodAllocations.filter((allocation) => allocation.personId === person.id);
  const utilization = getPersonPeriodUtilization(periodPerson, period.id, periodAllocations, projectsById);
  const assignments = groupPersonPeriodAssignments({
    allocations: personPeriodAllocations,
    period,
    projectPeopleCountByPeriodTarget,
    projectsById,
    skillsById,
  });
  const productiveAssignments = assignments.filter((assignment) => (
    isProductiveAllocationTarget({ target: assignment.targetId }, projectsById)
  ));
  const benchAssignments = assignments.filter((assignment) => assignment.targetId === 'bench');
  const signalKinds = uniqueSignals([
    ...assignments.flatMap((assignment) => assignment.signalKinds),
    ...(utilization.status === 'over' ? ['overload' as const] : []),
    ...(productiveAssignments.length > 1 ? ['fragmentation' as const] : []),
    ...(benchAssignments.some((assignment) => assignment.revenueK > 0) ? ['bench' as const] : []),
  ]);

  return {
    period,
    assignments,
    allocatedRevenueK: sum(assignments, (assignment) => assignment.revenueK),
    allocatedHours: sum(assignments, (assignment) => assignment.hours),
    productiveRevenueK: utilization.allocatedRevenueK,
    productiveHours: utilization.allocatedHours,
    benchRevenueK: sum(benchAssignments, (assignment) => assignment.revenueK),
    benchHours: sum(benchAssignments, (assignment) => assignment.hours),
    availableHours: getPersonPeriodAvailableHours(periodPerson, period.id),
    costK: getPersonPeriodCostK(periodPerson, period.id),
    utilizationPercent: utilization.utilizationPercent,
    projectCount: productiveAssignments.length,
    warningCount: sum(assignments, (assignment) => assignment.warningCount),
    signalKinds,
    signalCodes: getSignalCodes(signalKinds),
  };
}

function groupPersonPeriodAssignments({
  allocations,
  period,
  projectPeopleCountByPeriodTarget,
  projectsById,
  skillsById,
}: {
  allocations: PersonTileAllocation[];
  period: Period;
  projectPeopleCountByPeriodTarget: Map<string, number>;
  projectsById: Map<string, ProjectFrame>;
  skillsById: Map<SkillId, Skill>;
}) {
  const grouped = allocations.reduce((result, allocation) => {
    const current = result.get(allocation.target) || [];
    current.push(allocation);
    result.set(allocation.target, current);
    return result;
  }, new Map<string, PersonTileAllocation[]>());

  return Array.from(grouped.entries())
    .map(([targetId, targetAllocations]) => buildAssignment({
      allocations: targetAllocations,
      projectPeopleCount: projectPeopleCountByPeriodTarget.get(`${period.id}:${targetId}`) || 0,
      project: projectsById.get(targetId),
      skillsById,
      targetId,
    }))
    .sort((a, b) => {
      if (a.targetId === 'bench') return 1;
      if (b.targetId === 'bench') return -1;
      return b.warningCount - a.warningCount || b.hours - a.hours || a.label.localeCompare(b.label, 'pl');
    });
}

function buildAssignment({
  allocations,
  project,
  projectPeopleCount,
  skillsById,
  targetId,
}: {
  allocations: PersonTileAllocation[];
  project?: ProjectFrame;
  projectPeopleCount: number;
  skillsById: Map<SkillId, Skill>;
  targetId: string;
}): AnalyticAssignment {
  const revenueK = sum(allocations, (allocation) => allocation.revenueK);
  const hours = sum(allocations, (allocation) => allocation.hours);
  const warningCount = sum(allocations, (allocation) => (
    (allocation.validation || []).filter((item) => item.severity !== 'info').length
  ));
  const positiveCount = sum(allocations, (allocation) => (
    (allocation.validation || []).filter((item) => item.severity === 'info').length
  ));
  const skillIds = Array.from(new Set(allocations.flatMap((allocation) => (
    allocation.skillId ? [allocation.skillId] : []
  ))));
  const skillCodes = skillIds.map((skillId) => (
    getVisualSkillGlyph(skillId, skillsById.get(skillId)?.label)
  )).filter((code): code is string => Boolean(code));
  const periodId = allocations[0]?.periodId || 'unknown-period';
  const signalKinds = getAssignmentSignalKinds({
    allocations,
    project,
    projectPeopleCount,
    targetId,
    warningCount,
  });
  const label = targetId === 'bench'
    ? 'Bench'
    : project
      ? project.client === project.name ? project.name : `${project.client}: ${project.name}`
      : targetId;

  return {
    id: `${periodId}:${targetId}`,
    targetId,
    label,
    detail: project ? `${getProjectWorkTypeLabel(project.workType)} · ${project.stage}` : targetId === 'bench' ? 'Nieprzypisana pojemność' : 'Brak projektu',
    revenueK,
    hours,
    allocationCount: allocations.length,
    skillIds,
    skillCodes,
    skillLabels: skillIds.map((skillId) => skillsById.get(skillId)?.label || skillId),
    warningCount,
    positiveCount,
    tone: getAssignmentTone({ project, signalKinds, targetId, warningCount }),
    signalKinds,
    signalCodes: getSignalCodes(signalKinds),
  };
}

function getAssignmentSignalKinds({
  allocations,
  project,
  projectPeopleCount,
  targetId,
  warningCount,
}: {
  allocations: PersonTileAllocation[];
  project?: ProjectFrame;
  projectPeopleCount: number;
  targetId: string;
  warningCount: number;
}): AnalyticSignalKind[] {
  const signals: AnalyticSignalKind[] = [];
  if (targetId === 'bench') signals.push('bench');
  if (warningCount > 0) signals.push('risk');
  if (allocations.some((allocation) => (
    allocation.previousTarget && allocation.previousTarget !== allocation.target
  ) || allocation.meetingState?.changedThisWeek || allocation.meetingState?.handoffRequired)) {
    signals.push('changed');
  }
  if (!project) return uniqueSignals(signals);

  const workType = getProjectWorkType(project);
  if (workType === 'research_development') signals.push('researchDevelopment');
  if (isLowValueProject(project)) signals.push('lowValue');
  if (projectPeopleCount === 1 && targetId !== 'bench' && workType !== 'time_off') {
    signals.push('singlePersonProject');
  }

  return uniqueSignals(signals);
}

function getAssignmentTone({
  project,
  signalKinds,
  targetId,
  warningCount,
}: {
  project?: ProjectFrame;
  signalKinds: AnalyticSignalKind[];
  targetId: string;
  warningCount: number;
}): AnalyticTone {
  if (warningCount > 0) return 'danger';
  if (targetId === 'bench') return 'bench';
  if (!project) return 'neutral';

  const workType = getProjectWorkType(project);
  if (workType === 'time_off') return 'dark';
  if (workType === 'defensive_maintenance' || project.stage === 'defensive') return 'orange';
  if (signalKinds.includes('researchDevelopment') || signalKinds.includes('lowValue') || workType === 'waiting_room') {
    return 'purple';
  }
  if (project.planningStatus === 'ghost' || project.stage === 'possible') return 'warning';
  if (project.stage === 'signed') return 'healthy';
  return 'blue';
}

function getProjectPeopleCountByPeriodTarget(allocations: PersonTileAllocation[]) {
  const peopleByPeriodTarget = allocations.reduce((result, allocation) => {
    if (allocation.target === 'bench') return result;
    const key = `${allocation.periodId}:${allocation.target}`;
    const current = result.get(key) || new Set<string>();
    current.add(allocation.personId);
    result.set(key, current);
    return result;
  }, new Map<string, Set<string>>());
  return new Map(Array.from(peopleByPeriodTarget.entries()).map(([key, personIds]) => [key, personIds.size]));
}

function isLowValueProject(project: ProjectFrame) {
  const workType = getProjectWorkType(project);
  if (workType === 'time_off') return false;
  return (
    workType !== 'commercial' ||
    project.stage === 'defensive' ||
    project.stage === 'possible' ||
    project.planningStatus === 'ghost'
  );
}

function getSignalCodes(signalKinds: AnalyticSignalKind[]) {
  return signalKinds.map((signal) => analyticSignalMetaByKind.get(signal)?.code || signal);
}

function uniqueSignals(signals: AnalyticSignalKind[]) {
  return Array.from(new Set(signals));
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase('pl');
}

function compareAnalyticRows(
  first: AnalyticBoardRow,
  second: AnalyticBoardRow,
  accessor: string
) {
  switch (accessor) {
    case 'personName':
      return first.person.name.localeCompare(second.person.name, 'pl');
    case 'rangeUtilizationPercent':
      return first.rangeUtilizationPercent - second.rangeUtilizationPercent;
    case 'rangeProjectCount':
      return first.rangeProjectCount - second.rangeProjectCount;
    case 'rangeBenchRevenueK':
      return first.rangeBenchRevenueK - second.rangeBenchRevenueK;
    case 'rangeRevenueK':
      return first.rangeProductiveRevenueK - second.rangeProductiveRevenueK;
    case 'rangeHours':
      return first.rangeProductiveHours - second.rangeProductiveHours;
    case 'rangeRiskCount':
      return first.rangeRiskCount - second.rangeRiskCount;
    default:
      return 0;
  }
}

function sum<T>(items: T[], selector: (item: T) => number) {
  return Math.round(items.reduce((total, item) => total + selector(item), 0) * 10) / 10;
}
