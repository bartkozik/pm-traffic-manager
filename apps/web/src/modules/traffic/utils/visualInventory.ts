import {
  AllocationTarget,
  ContractType,
  getEffectiveAllocationSkillId,
  getProjectWorkType as getDomainProjectWorkType,
  isProductiveAllocationTarget,
  Period,
  Person,
  PersonTileAllocation,
  ProjectFrame,
} from '../models/traffic.model';
import { getPersonPeriodUtilization } from './personUtilization';

export interface AllocationRevenueGroup {
  allocations: PersonTileAllocation[];
  revenueK: number;
}

export interface PersonAllocationGroup {
  person: Person;
  allocations: PersonTileAllocation[];
  revenueK: number;
  hours: number;
  warningCount: number;
  positiveCount: number;
  fragmentCount: number;
  underloadSeverity: PersonUnderloadSeverity;
  meetingStateCounts: AllocationMeetingStateCounts;
}

export interface PersonAllocationGroupContext {
  targetCountsByPerson: Map<string, number>;
  underloadSeverityByPerson: Map<string, PersonUnderloadSeverity>;
}

export type ProjectRelationshipSignalKind =
  | 'unchanged'
  | 'moved'
  | 'changed'
  | 'handoff'
  | 'planB'
  | 'mentoring'
  | 'backup'
  | 'fragmented';

export interface ProjectRelationshipSignal {
  id: string;
  personId: string;
  personName: string;
  kind: ProjectRelationshipSignalKind;
  label: string;
  detail: string;
}

export interface ProjectRelationshipSignalSummary {
  kind: ProjectRelationshipSignalKind;
  label: string;
  count: number;
  peopleNames: string[];
  detail: string;
}

export interface PeriodRelationshipOverlaySignal extends ProjectRelationshipSignal {
  sourceLabel: string;
  targetLabel: string;
}

export interface PeriodRelationshipConnectorSignal extends PeriodRelationshipOverlaySignal {
  sourceTarget: AllocationTarget;
  targetTarget: AllocationTarget;
}

export type ProjectFrameGeometrySegmentKind = 'filled' | 'empty' | 'overflow' | 'poolRemaining';

export interface ProjectFrameGeometrySegment {
  kind: ProjectFrameGeometrySegmentKind;
  label: string;
  valueK: number;
  share: number;
}

export interface ProjectFrameGeometryCell {
  id: string;
  kind: ProjectFrameGeometrySegmentKind;
  label: string;
  segmentValueK: number;
  unitK: number;
}

export type ProjectInventoryPatternKind =
  | 'healthyTeam'
  | 'singlePersonProject'
  | 'peopleShortage'
  | 'emptyProject'
  | 'manyProjectPeople'
  | 'fragmentedCollaborators'
  | 'researchDevelopmentProject'
  | 'waitingRoomProject'
  | 'lowValueProject'
  | 'sourceMismatch';

export interface ProjectInventoryPattern {
  kind: ProjectInventoryPatternKind;
  label: string;
  detail: string;
}

export type FrameBehavior = 'elastic' | 'capped' | 'pooled';
export type BoardVisualFocusMode = 'all' | 'changes';
export type PersonGroupStatus = 'pressure' | 'healthy' | 'neutral';
export type PersonUnderloadSeverity = 'none' | 'bench' | 'low' | 'critical';
export type PersonGroupVisualClass =
  | 'has-fragmentation'
  | 'has-unavailable-context'
  | 'has-low-workload'
  | 'has-bench-only'
  | 'has-underloaded'
  | 'has-underloaded-critical'
  | 'has-rd-work'
  | 'has-waiting-room'
  | 'has-time-off'
  | 'has-low-value'
  | 'has-active-engagement'
  | 'has-moved'
  | 'has-handoff'
  | 'has-plan-b'
  | 'has-mentoring'
  | 'has-backup'
  | 'has-ownership';
export type AllocationMeetingStateKey =
  | 'unchanged'
  | 'changedThisWeek'
  | 'handoffRequired'
  | 'planB'
  | 'mentoring'
  | 'backup'
  | 'moved'
  | 'activeEngagement'
  | 'unavailableContext'
  | 'lowWorkload'
  | 'underloaded'
  | 'rdWork'
  | 'waitingRoomWork'
  | 'timeOffWork'
  | 'lowValueWork'
  | 'ownership';
export type AllocationMeetingStateCounts = Record<AllocationMeetingStateKey, number>;

const emptyMeetingStateCounts: AllocationMeetingStateCounts = {
  unchanged: 0,
  changedThisWeek: 0,
  handoffRequired: 0,
  planB: 0,
  mentoring: 0,
  backup: 0,
  moved: 0,
  activeEngagement: 0,
  unavailableContext: 0,
  lowWorkload: 0,
  underloaded: 0,
  rdWork: 0,
  waitingRoomWork: 0,
  timeOffWork: 0,
  lowValueWork: 0,
  ownership: 0,
};

export const MEANINGFUL_FRAGMENTATION_TARGET_HOURS = 20;

export function getFrameBehavior(contractType: ContractType): FrameBehavior {
  switch (contractType) {
    case 'hourly':
      return 'elastic';
    case 'time_materials_capped':
    case 'fixed_monthly':
      return 'capped';
    case 'fixed_phase':
    case 'multi_month_fixed':
      return 'pooled';
  }
}

export function getFrameTypeLabel(contractType: ContractType) {
  switch (contractType) {
    case 'hourly':
      return 'Uncapped T&M';
    case 'time_materials_capped':
      return 'Capped T&M';
    case 'fixed_monthly':
      return 'Monthly fixed fee';
    case 'fixed_phase':
    case 'multi_month_fixed':
      return 'Fixed price / pool';
  }
}

export function getFrameEmptySlotLabel(contractType: ContractType) {
  switch (getFrameBehavior(contractType)) {
    case 'elastic':
      return null;
    case 'capped':
      return contractType === 'time_materials_capped'
        ? 'Available cap'
        : 'Available capacity within cap';
    case 'pooled':
      return 'Unspent pool';
  }
}

export function getProjectFrameGeometrySegments({
  frameBehavior,
  visibleRevenueK,
  emptyRevenueK,
  overflowRevenueK,
  poolRemainingK,
}: {
  frameBehavior: FrameBehavior;
  visibleRevenueK: number;
  emptyRevenueK: number;
  overflowRevenueK: number;
  poolRemainingK?: number;
}): ProjectFrameGeometrySegment[] {
  const poolRemainingValue = frameBehavior === 'pooled' ? Math.max(0, poolRemainingK || 0) : 0;
  const values = [
    { kind: 'filled' as const, label: 'filled', valueK: Math.max(0, visibleRevenueK) },
    { kind: 'empty' as const, label: frameBehavior === 'pooled' ? 'window/pool' : 'free', valueK: Math.max(0, emptyRevenueK) },
    { kind: 'poolRemaining' as const, label: 'remaining pool', valueK: poolRemainingValue },
    { kind: 'overflow' as const, label: 'overflow', valueK: Math.max(0, overflowRevenueK) },
  ].filter((segment) => segment.valueK > 0);
  const totalK = values.reduce((sum, segment) => sum + segment.valueK, 0);

  return values.map((segment) => ({
    ...segment,
    share: totalK > 0 ? Math.max(6, Math.round((segment.valueK / totalK) * 100)) : 0,
  }));
}

export function getProjectFrameGeometryCells(segments: ProjectFrameGeometrySegment[], maxCells = 36): ProjectFrameGeometryCell[] {
  const visibleSegments = segments.filter((segment) => segment.valueK > 0);
  if (!visibleSegments.length || maxCells <= 0) return [];

  const totalK = visibleSegments.reduce((sum, segment) => sum + segment.valueK, 0);
  const unitK = Math.max(1, Math.ceil(totalK / maxCells));
  const segmentCounts = visibleSegments.map((segment) => ({
    segment,
    count: Math.max(1, Math.ceil(segment.valueK / unitK)),
  }));

  let totalCells = segmentCounts.reduce((sum, item) => sum + item.count, 0);
  while (totalCells > maxCells) {
    const next = segmentCounts
      .filter((item) => item.count > 1)
      .sort((a, b) => b.count - a.count)[0];
    if (!next) break;
    next.count -= 1;
    totalCells -= 1;
  }

  return segmentCounts.flatMap(({ segment, count }) => (
    Array.from({ length: count }, (_, index) => ({
      id: `${segment.kind}-${index}`,
      kind: segment.kind,
      label: segment.label,
      segmentValueK: segment.valueK,
      unitK,
    }))
  ));
}

export function splitAllocationsByRevenueLimit(
  allocations: PersonTileAllocation[],
  revenueLimitK: number | null
) {
  const visible: PersonTileAllocation[] = [];
  const overflow: PersonTileAllocation[] = [];
  let visibleRevenueK = 0;
  let overflowRevenueK = 0;

  allocations.forEach((allocation) => {
    const revenueK = getAllocationRevenueK(allocation);
    if (revenueLimitK === null || (visibleRevenueK < revenueLimitK && visibleRevenueK + revenueK <= revenueLimitK)) {
      visible.push(allocation);
      visibleRevenueK += revenueK;
      return;
    }

    overflow.push(allocation);
    overflowRevenueK += revenueK;
  });

  return { visible, overflow, visibleRevenueK, overflowRevenueK };
}

export function getPooledFrameCapacityK(
  project: ProjectFrame,
  activePeriodId: string,
  allAllocations: PersonTileAllocation[],
  periods: Period[],
  fallbackPeriodBudgetK: number
) {
  const totalPoolK = project.revenuePlan.reduce((sum, entry) => sum + entry.revenueK, 0) || project.budgetK;
  const activePeriod = periods.find((period) => period.id === activePeriodId);
  const allocatedBeforeK = allAllocations
    .filter((allocation) => (
      allocation.target === project.id &&
      isPeriodBefore(periods.find((period) => period.id === allocation.periodId), activePeriod)
    ))
    .reduce((sum, allocation) => sum + getAllocationRevenueK(allocation), 0);
  const remainingBeforeThisPeriodK = Math.max(0, totalPoolK - allocatedBeforeK);

  return Math.min(fallbackPeriodBudgetK, remainingBeforeThisPeriodK);
}

export function groupAllocationsByPerson(
  allocations: PersonTileAllocation[],
  peopleById: Map<string, Person>,
  periodAllocations: PersonTileAllocation[],
  projectsById?: Map<string, ProjectFrame>,
  context = buildPersonAllocationGroupContext(periodAllocations.length ? periodAllocations : allocations, peopleById, projectsById)
): PersonAllocationGroup[] {
  const grouped = allocations.reduce((result, allocation) => {
    const person = peopleById.get(allocation.personId);
    if (!person) return result;

    const current = result.get(person.id) || {
      person,
      allocations: [],
      revenueK: 0,
      hours: 0,
      warningCount: 0,
      positiveCount: 0,
      fragmentCount: context.targetCountsByPerson.get(person.id) || 1,
      underloadSeverity: 'none' as PersonUnderloadSeverity,
      meetingStateCounts: { ...emptyMeetingStateCounts },
    };

    const validation = allocation.validation || [];
    const meetingStateCounts = countMeetingStates(allocation, current.meetingStateCounts, person, projectsById, context);
    result.set(person.id, {
      ...current,
      allocations: [...current.allocations, allocation],
      revenueK: current.revenueK + getAllocationRevenueK(allocation),
      hours: current.hours + allocation.hours,
      warningCount: current.warningCount + validation.filter((item) => item.severity !== 'info').length,
      positiveCount: current.positiveCount + validation.filter((item) => item.severity === 'info').length,
      underloadSeverity: mergeUnderloadSeverity(
        current.underloadSeverity,
        context.underloadSeverityByPerson.get(person.id) || 'none'
      ),
      meetingStateCounts,
    });

    return result;
  }, new Map<string, PersonAllocationGroup>());

  return Array.from(grouped.values()).map((group) => ({
    ...group,
    allocations: [...group.allocations].sort((a, b) => a.tileIndex - b.tileIndex),
    meetingStateCounts: finalizeGroupMeetingStateCounts(group),
  }));
}

export function buildPersonAllocationGroupContext(
  periodAllocations: PersonTileAllocation[],
  peopleById: Map<string, Person>,
  projectsById = new Map<string, ProjectFrame>()
): PersonAllocationGroupContext {
  const allocationsByPerson = periodAllocations.reduce((result, allocation) => {
    const current = result.get(allocation.personId) || [];
    current.push(allocation);
    result.set(allocation.personId, current);
    return result;
  }, new Map<string, PersonTileAllocation[]>());
  const underloadSeverityByPerson = new Map<string, PersonUnderloadSeverity>();

  allocationsByPerson.forEach((personAllocations, personId) => {
    const person = peopleById.get(personId);
    if (!person) return;
    const severities = Array.from(new Set(personAllocations.map((allocation) => allocation.periodId)))
      .map((periodId) => getPersonUnderloadSeverity(person, periodId, periodAllocations, projectsById));
    underloadSeverityByPerson.set(
      personId,
      severities.reduce((current, next) => mergeUnderloadSeverity(current, next), 'none' as PersonUnderloadSeverity)
    );
  });

  return {
    targetCountsByPerson: getMeaningfulTargetCountsByPerson(periodAllocations, projectsById),
    underloadSeverityByPerson,
  };
}

export function getPersonGroupStatus(group: Pick<PersonAllocationGroup, 'positiveCount' | 'warningCount'>): PersonGroupStatus {
  if (group.warningCount > 0) return 'pressure';
  if (group.positiveCount > 0) return 'healthy';
  return 'neutral';
}

export function getPersonGroupVisualClasses(
  group: Pick<PersonAllocationGroup, 'fragmentCount' | 'meetingStateCounts' | 'underloadSeverity'>
): PersonGroupVisualClass[] {
  const classes: PersonGroupVisualClass[] = [];
  if (group.fragmentCount > 1) classes.push('has-fragmentation');
  if (group.meetingStateCounts.unavailableContext > 0) classes.push('has-unavailable-context');
  if (group.meetingStateCounts.lowWorkload > 0) classes.push('has-low-workload');
  if (group.underloadSeverity === 'bench') classes.push('has-bench-only');
  if (group.meetingStateCounts.underloaded > 0 && group.underloadSeverity !== 'bench') classes.push('has-underloaded');
  if (group.underloadSeverity === 'critical') classes.push('has-underloaded-critical');
  if (group.meetingStateCounts.rdWork > 0) classes.push('has-rd-work');
  if (group.meetingStateCounts.waitingRoomWork > 0) classes.push('has-waiting-room');
  if (group.meetingStateCounts.timeOffWork > 0) classes.push('has-time-off');
  if (group.meetingStateCounts.lowValueWork > 0) classes.push('has-low-value');
  if (group.meetingStateCounts.activeEngagement > 0) classes.push('has-active-engagement');
  if (group.meetingStateCounts.moved > 0) classes.push('has-moved');
  if (group.meetingStateCounts.handoffRequired > 0) classes.push('has-handoff');
  if (group.meetingStateCounts.planB > 0) classes.push('has-plan-b');
  if (group.meetingStateCounts.mentoring > 0) classes.push('has-mentoring');
  if (group.meetingStateCounts.backup > 0) classes.push('has-backup');
  if (group.meetingStateCounts.ownership > 0) classes.push('has-ownership');
  return classes;
}

export function getProjectRelationshipSignals(
  allocations: PersonTileAllocation[],
  peopleById: Map<string, Person>,
  periodAllocations: PersonTileAllocation[],
  projectsById = new Map<string, ProjectFrame>()
): ProjectRelationshipSignal[] {
  const targetCountsByPerson = getMeaningfulTargetCountsByPerson(periodAllocations, projectsById);
  const signals = new Map<string, ProjectRelationshipSignal>();

  allocations.forEach((allocation) => {
    const person = peopleById.get(allocation.personId);
    if (!person) return;
    addExplicitRelationshipSignals(signals, allocation, person, projectsById);

    const targetCount = targetCountsByPerson.get(person.id) || 0;
    if (targetCount > 1) {
      setRelationshipSignal(signals, {
        id: `${person.id}:fragmented`,
        personId: person.id,
        personName: person.name,
        kind: 'fragmented',
        label: 'across multiple projects',
        detail: `${person.name} is assigned to ${targetCount} targets in this period`,
      });
    }
  });

  return Array.from(signals.values()).sort((a, b) => (
    relationshipRank(a.kind) - relationshipRank(b.kind) || a.personName.localeCompare(b.personName)
  ));
}

export function summarizeProjectRelationshipSignals(
  signals: ProjectRelationshipSignal[]
): ProjectRelationshipSignalSummary[] {
  const grouped = signals.reduce((result, signal) => {
    const current = result.get(signal.kind) || {
      kind: signal.kind,
      label: signal.label,
      peopleNames: new Set<string>(),
    };
    current.peopleNames.add(signal.personName);
    result.set(signal.kind, current);
    return result;
  }, new Map<ProjectRelationshipSignalKind, {
    kind: ProjectRelationshipSignalKind;
    label: string;
    peopleNames: Set<string>;
  }>());

  return Array.from(grouped.values())
    .map((summary) => {
      const peopleNames = Array.from(summary.peopleNames).sort((a, b) => a.localeCompare(b));
      return {
        kind: summary.kind,
        label: summary.label,
        count: peopleNames.length,
        peopleNames,
        detail: `${summary.label}: ${peopleNames.join(', ')}`,
      };
    })
    .sort((a, b) => relationshipRank(a.kind) - relationshipRank(b.kind) || a.label.localeCompare(b.label));
}

export function getProjectInventoryPatterns({
  project,
  allocations,
  periodAllocations,
  peopleById,
  projectsById = new Map<string, ProjectFrame>([[project.id, project]]),
  overflowRevenueK,
}: {
  project: ProjectFrame;
  allocations: PersonTileAllocation[];
  periodAllocations: PersonTileAllocation[];
  peopleById: Map<string, Person>;
  projectsById?: Map<string, ProjectFrame>;
  overflowRevenueK: number;
}): ProjectInventoryPattern[] {
  const projectPersonIds = Array.from(new Set(allocations.map((allocation) => allocation.personId)));
  const targetCountsByPerson = getMeaningfulTargetCountsByPerson(periodAllocations, projectsById);
  const fragmentedPeople = projectPersonIds.filter((personId) => (targetCountsByPerson.get(personId) || 0) > 1);
  const stablePeople = projectPersonIds.filter((personId) => (targetCountsByPerson.get(personId) || 0) <= 1);
  const requiredGapHours = getRequiredGapHours(project, allocations, peopleById);
  const hasShortage = requiredGapHours > 0;
  const hasOverflow = overflowRevenueK > 0;
  const isLowValue = isLowValueWork(project);
  const isResearchDevelopment = getProjectWorkType(project) === 'research_development';
  const isWaitingRoom = getProjectWorkType(project) === 'waiting_room';
  const hasSourceMismatch = isProjectSourceMismatch(project);
  const patterns: ProjectInventoryPattern[] = [];

  if (projectPersonIds.length === 0) {
    patterns.push({
      kind: 'emptyProject',
      label: 'no people',
      detail: 'no person is assigned to the project this month',
    });
  } else if (hasShortage) {
    patterns.push({
      kind: 'peopleShortage',
      label: 'People shortage',
      detail: `${formatHours(requiredGapHours)}h missing from requirements`,
    });
  }

  if (projectPersonIds.length === 1) {
    patterns.push({
      kind: 'singlePersonProject',
      label: 'one person',
      detail: 'one-person project or single point of failure',
    });
  }

  if (fragmentedPeople.length > 0) {
    patterns.push({
      kind: 'manyProjectPeople',
      label: 'people across multiple projects',
      detail: `${fragmentedPeople.length} people also work outside this frame`,
    });
  }

  if (fragmentedPeople.length > 0 && stablePeople.length > 0) {
    patterns.push({
      kind: 'fragmentedCollaborators',
      label: 'mixed team',
      detail: 'a dedicated person works with people split across other projects',
    });
  }

  if (isResearchDevelopment) {
    patterns.push({
      kind: 'researchDevelopmentProject',
      label: 'R&D',
      detail: 'experimental or investment project without a direct commercial return',
    });
  } else if (isWaitingRoom) {
    patterns.push({
      kind: 'waitingRoomProject',
      label: 'waiting room',
      detail: 'waiting-room project: uses capacity without a clear deliverable or decision',
    });
  } else if (isLowValue) {
    patterns.push({
      kind: 'lowValueProject',
      label: 'low value',
      detail: getLowValueWorkDetail(project),
    });
  }

  if (hasSourceMismatch) {
    patterns.push({
      kind: 'sourceMismatch',
      label: 'source/scope',
      detail: getProjectSourceMismatchDetail(project),
    });
  }

  if (
    projectPersonIds.length >= 2
    && !hasShortage
    && !hasOverflow
    && !isLowValue
    && fragmentedPeople.length === 0
  ) {
    patterns.push({
      kind: 'healthyTeam',
      label: 'self-sufficient team',
      detail: 'several people cover the frame without visible gaps or fragmentation',
    });
  }

  return patterns.sort((a, b) => projectInventoryPatternRank(a.kind) - projectInventoryPatternRank(b.kind));
}

export function getProjectInventoryPatternClassName(kind: ProjectInventoryPatternKind) {
  switch (kind) {
    case 'healthyTeam':
      return 'is-healthy-team';
    case 'singlePersonProject':
      return 'is-single-person';
    case 'peopleShortage':
      return 'is-people-shortage';
    case 'emptyProject':
      return 'is-empty-project';
    case 'manyProjectPeople':
      return 'is-many-project-people';
    case 'fragmentedCollaborators':
      return 'is-fragmented-collaborators';
    case 'researchDevelopmentProject':
      return 'is-rd-project';
    case 'waitingRoomProject':
      return 'is-waiting-room-project';
    case 'lowValueProject':
      return 'is-low-value-project';
    case 'sourceMismatch':
      return 'is-source-mismatch';
  }
}

export function getProjectInventoryPatternCode(kind: ProjectInventoryPatternKind) {
  switch (kind) {
    case 'healthyTeam':
      return 'OK';
    case 'singlePersonProject':
      return '1P';
    case 'peopleShortage':
      return 'GAP';
    case 'emptyProject':
      return '0P';
    case 'manyProjectPeople':
      return 'MULTI';
    case 'fragmentedCollaborators':
      return 'MIX';
    case 'researchDevelopmentProject':
      return 'R&D';
    case 'waitingRoomProject':
      return 'WAIT';
    case 'lowValueProject':
      return 'LOW';
    case 'sourceMismatch':
      return 'SRC';
  }
}

export function getProjectInventoryCardClassNames(patterns: ProjectInventoryPattern[]) {
  return patterns.map((pattern) => `has-project-${getProjectInventoryPatternClassName(pattern.kind).replace(/^is-/, '')}`);
}

export function getPeriodRelationshipOverlaySignals(
  periodAllocations: PersonTileAllocation[],
  peopleById: Map<string, Person>,
  projectsById: Map<string, ProjectFrame>
): PeriodRelationshipOverlaySignal[] {
  const meaningfulTargetsByPerson = getMeaningfulTargetsByPerson(periodAllocations, projectsById);
  const allocationsByPerson = periodAllocations.reduce((result, allocation) => {
    const allocations = result.get(allocation.personId) || [];
    allocations.push(allocation);
    result.set(allocation.personId, allocations);
    return result;
  }, new Map<string, PersonTileAllocation[]>());
  const signals = new Map<string, PeriodRelationshipOverlaySignal>();

  allocationsByPerson.forEach((allocations, personId) => {
    const person = peopleById.get(personId);
    if (!person) return;

    const targetLabels = Array.from(meaningfulTargetsByPerson.get(personId)?.keys() || [])
      .map((target) => getTargetLabel(target, projectsById))
      .sort((a, b) => a.localeCompare(b));

    allocations.forEach((allocation) => {
      addExplicitPeriodRelationshipSignals(signals, allocation, person, projectsById);
    });

    if (targetLabels.length > 1) {
      setPeriodRelationshipSignal(signals, {
        id: `${person.id}:fragmented`,
        personId: person.id,
        personName: person.name,
        kind: 'fragmented',
        label: 'across multiple projects',
        sourceLabel: targetLabels[0],
        targetLabel: targetLabels.slice(1).join(' + '),
        detail: `${person.name} is split between: ${targetLabels.join(', ')}`,
      });
    }
  });

  return Array.from(signals.values()).sort((a, b) => (
    relationshipRank(a.kind) - relationshipRank(b.kind)
      || a.personName.localeCompare(b.personName)
      || a.targetLabel.localeCompare(b.targetLabel)
  ));
}

export function getPeriodRelationshipConnectorSignals(
  periodAllocations: PersonTileAllocation[],
  peopleById: Map<string, Person>,
  projectsById: Map<string, ProjectFrame>
): PeriodRelationshipConnectorSignal[] {
  const signals = new Map<string, PeriodRelationshipConnectorSignal>();
  const connectedPairs = new Set<string>();
  const meaningfulTargetsByPerson = getMeaningfulTargetsByPerson(periodAllocations, projectsById);
  const allocationsByPerson = periodAllocations.reduce((result, allocation) => {
    const allocations = result.get(allocation.personId) || [];
    allocations.push(allocation);
    result.set(allocation.personId, allocations);
    return result;
  }, new Map<string, PersonTileAllocation[]>());

  periodAllocations.forEach((allocation) => {
    const person = peopleById.get(allocation.personId);
    if (!person || !allocation.previousTarget || allocation.previousTarget === allocation.target) return;

    const pairKey = getRelationshipConnectorPairKey(person.id, allocation.previousTarget, allocation.target);
    connectedPairs.add(pairKey);
    setPeriodRelationshipConnectorSignal(signals, {
      id: `${person.id}:${allocation.previousTarget}->${allocation.target}:connector:moved`,
      personId: person.id,
      personName: person.name,
      kind: 'moved',
      label: 'move',
      sourceTarget: allocation.previousTarget,
      targetTarget: allocation.target,
      sourceLabel: getTargetLabel(allocation.previousTarget, projectsById),
      targetLabel: getTargetLabel(allocation.target, projectsById),
      detail: `${person.name}: move ${getTargetLabel(allocation.previousTarget, projectsById)} -> ${getTargetLabel(allocation.target, projectsById)}`,
    });
  });

  allocationsByPerson.forEach((_allocations, personId) => {
    const person = peopleById.get(personId);
    if (!person) return;

    const targets = Array.from(meaningfulTargetsByPerson.get(personId)?.keys() || [])
      .sort((a, b) => getTargetLabel(a, projectsById).localeCompare(getTargetLabel(b, projectsById)));
    if (targets.length <= 1) return;

    const sourceTarget = targets[0];
    targets.slice(1).forEach((targetTarget) => {
      const pairKey = getRelationshipConnectorPairKey(person.id, sourceTarget, targetTarget);
      if (connectedPairs.has(pairKey)) return;
      connectedPairs.add(pairKey);
      setPeriodRelationshipConnectorSignal(signals, {
        id: `${person.id}:${sourceTarget}->${targetTarget}:connector:fragmented`,
        personId: person.id,
        personName: person.name,
        kind: 'fragmented',
        label: 'across multiple projects',
        sourceTarget,
        targetTarget,
        sourceLabel: getTargetLabel(sourceTarget, projectsById),
        targetLabel: getTargetLabel(targetTarget, projectsById),
        detail: `${person.name}: relationship between ${getTargetLabel(sourceTarget, projectsById)} and ${getTargetLabel(targetTarget, projectsById)}`,
      });
    });
  });

  return Array.from(signals.values()).sort((a, b) => (
    relationshipRank(a.kind) - relationshipRank(b.kind)
      || a.personName.localeCompare(b.personName)
      || a.sourceLabel.localeCompare(b.sourceLabel)
      || a.targetLabel.localeCompare(b.targetLabel)
  ));
}

export function getRelationshipSignalClassName(kind: ProjectRelationshipSignalKind) {
  switch (kind) {
    case 'unchanged':
      return 'is-unchanged';
    case 'moved':
      return 'is-moved';
    case 'changed':
      return 'is-changed';
    case 'handoff':
      return 'is-handoff';
    case 'planB':
      return 'is-plan-b';
    case 'mentoring':
      return 'is-mentoring';
    case 'backup':
      return 'is-backup';
    case 'fragmented':
      return 'is-fragmented';
  }
}

export function isChangeFocusAllocation(allocation: Pick<PersonTileAllocation, 'meetingState' | 'previousTarget' | 'target'>) {
  return Boolean(
    allocation.meetingState?.changedThisWeek
    || allocation.meetingState?.handoffRequired
    || (allocation.previousTarget && allocation.previousTarget !== allocation.target)
  );
}

export function getPersonGroupVisualFocusClassName(
  group: Pick<PersonAllocationGroup, 'meetingStateCounts'>,
  focusMode: BoardVisualFocusMode
) {
  if (focusMode === 'all') return '';
  return group.meetingStateCounts.changedThisWeek > 0
    || group.meetingStateCounts.handoffRequired > 0
    || group.meetingStateCounts.moved > 0
    ? 'is-focus-target'
    : 'is-focus-muted';
}

export function groupAllocationsByMoneyUnit(allocations: PersonTileAllocation[], unitValue: number): AllocationRevenueGroup[] {
  const groups: AllocationRevenueGroup[] = [];
  let current: PersonTileAllocation[] = [];
  let currentRevenueK = 0;

  allocations.forEach((allocation) => {
    const allocationRevenueK = getAllocationRevenueK(allocation);
    if (current.length && currentRevenueK + allocationRevenueK > unitValue) {
      groups.push({ allocations: current, revenueK: currentRevenueK });
      current = [];
      currentRevenueK = 0;
    }

    current.push(allocation);
    currentRevenueK += allocationRevenueK;

    if (currentRevenueK >= unitValue) {
      groups.push({ allocations: current, revenueK: currentRevenueK });
      current = [];
      currentRevenueK = 0;
    }
  });

  if (current.length) {
    groups.push({ allocations: current, revenueK: currentRevenueK });
  }

  return groups;
}

export function getAllocationRevenueK(allocation: Pick<PersonTileAllocation, 'revenueK'>) {
  return Math.max(1, allocation.revenueK || 1);
}

export function getMeaningfulTargetCountsByPerson(
  periodAllocations: PersonTileAllocation[],
  projectsById = new Map<string, ProjectFrame>(),
  minTargetHours = MEANINGFUL_FRAGMENTATION_TARGET_HOURS
) {
  const targetsByPerson = getMeaningfulTargetsByPerson(periodAllocations, projectsById, minTargetHours);
  return new Map(Array.from(targetsByPerson.entries()).map(([personId, targets]) => [personId, targets.size]));
}

export function getMeaningfulFragmentedPersonCount(
  periodAllocations: PersonTileAllocation[],
  projectsById = new Map<string, ProjectFrame>(),
  minTargetHours = MEANINGFUL_FRAGMENTATION_TARGET_HOURS
) {
  return Array.from(getMeaningfulTargetCountsByPerson(periodAllocations, projectsById, minTargetHours).values())
    .filter((targetCount) => targetCount > 1).length;
}

function getRequiredGapHours(
  project: ProjectFrame,
  allocations: PersonTileAllocation[],
  peopleById: Map<string, Person>
) {
  const allocatedHoursBySkill = allocations.reduce<Record<string, number>>((result, allocation) => {
    const skillId = getEffectiveAllocationSkillId(allocation, project, peopleById.get(allocation.personId));
    if (!skillId) return result;
    result[skillId] = (result[skillId] || 0) + allocation.hours;
    return result;
  }, {});

  return project.requirements
    .filter((requirement) => requirement.required)
    .reduce((sum, requirement) => (
      sum + Math.max(0, requirement.estimatedHours - (allocatedHoursBySkill[requirement.skillId] || 0))
    ), 0);
}

function getMeaningfulTargetsByPerson(
  periodAllocations: PersonTileAllocation[],
  projectsById = new Map<string, ProjectFrame>(),
  minTargetHours = MEANINGFUL_FRAGMENTATION_TARGET_HOURS
) {
  const targetHoursByPerson = periodAllocations.reduce((result, allocation) => {
    if (!isProductiveAllocationTarget(allocation, projectsById)) return result;
    const targets = result.get(allocation.personId) || new Map<AllocationTarget, number>();
    targets.set(allocation.target, (targets.get(allocation.target) || 0) + allocation.hours);
    result.set(allocation.personId, targets);
    return result;
  }, new Map<string, Map<AllocationTarget, number>>());

  return new Map(Array.from(targetHoursByPerson.entries())
    .map(([personId, targets]) => [
      personId,
      new Map(Array.from(targets.entries()).filter(([, hours]) => hours >= minTargetHours)),
    ] as const)
    .filter(([, targets]) => targets.size > 0));
}

function formatHours(hours: number) {
  return Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 10) / 10);
}

function countMeetingStates(
  allocation: PersonTileAllocation,
  current: AllocationMeetingStateCounts,
  person: Person,
  projectsById: Map<string, ProjectFrame> | undefined,
  context: PersonAllocationGroupContext
): AllocationMeetingStateCounts {
  const next = { ...current };
  (['unchanged', 'changedThisWeek', 'handoffRequired', 'planB', 'mentoring', 'backup'] satisfies AllocationMeetingStateKey[]).forEach((key) => {
    if (allocation.meetingState?.[key]) next[key] = 1;
  });
  if (allocation.previousTarget && allocation.previousTarget !== allocation.target) next.moved = 1;
  if (hasUnavailableContext(person, allocation.periodId)) next.unavailableContext = 1;
  if (allocation.target === 'bench') next.lowWorkload = 1;
  if ((context.underloadSeverityByPerson.get(person.id) || 'none') !== 'none') next.underloaded = 1;
  if (person.skillIds.includes('pm')) next.ownership = 1;
  const project = projectsById?.get(allocation.target);
  if (getProjectWorkType(project) === 'research_development') next.rdWork = 1;
  if (getProjectWorkType(project) === 'waiting_room') next.waitingRoomWork = 1;
  if (getProjectWorkType(project) === 'time_off') next.timeOffWork = 1;
  if (isLowValueWork(project)) next.lowValueWork = 1;
  return next;
}

function finalizeGroupMeetingStateCounts(group: PersonAllocationGroup): AllocationMeetingStateCounts {
  return {
    ...group.meetingStateCounts,
    activeEngagement: group.hours >= 20 ? 1 : group.meetingStateCounts.activeEngagement,
  };
}

function hasUnavailableContext(person: Person, periodId: string) {
  const status = person.monthlyOverrides?.find((override) => override.periodId === periodId)?.status;
  return status === 'holiday' || status === 'unavailable' || status === 'notice_period';
}

export function getPersonUnderloadSeverity(
  person: Person,
  periodId: string,
  periodAllocations: PersonTileAllocation[],
  projectsById = new Map<string, ProjectFrame>()
): PersonUnderloadSeverity {
  const personPeriodAllocations = periodAllocations.filter((allocation) => (
    allocation.periodId === periodId && allocation.personId === person.id
  ));
  if (!personPeriodAllocations.length) return 'none';

  const productiveAllocations = personPeriodAllocations.filter((allocation) => (
    isProductiveAllocationTarget(allocation, projectsById)
  ));
  const benchAllocations = personPeriodAllocations.filter((allocation) => allocation.target === 'bench');
  const utilization = getPersonPeriodUtilization(person, periodId, periodAllocations, projectsById);

  if (productiveAllocations.length === 0 && benchAllocations.length > 0 && utilization.availableHours > 0) {
    return 'bench';
  }
  if (utilization.status !== 'under') return 'none';
  return utilization.utilizationPercent < 35 ? 'critical' : 'low';
}

function mergeUnderloadSeverity(
  current: PersonUnderloadSeverity,
  next: PersonUnderloadSeverity
): PersonUnderloadSeverity {
  return underloadSeverityRank(next) > underloadSeverityRank(current) ? next : current;
}

function underloadSeverityRank(severity: PersonUnderloadSeverity) {
  switch (severity) {
    case 'critical':
      return 3;
    case 'bench':
      return 2;
    case 'low':
      return 1;
    case 'none':
    default:
      return 0;
  }
}

function getProjectWorkType(project: ProjectFrame | undefined) {
  return getDomainProjectWorkType(project);
}

export function isLowValueWork(project: ProjectFrame | undefined) {
  if (!project) return false;
  if (getProjectWorkType(project) === 'time_off') return false;
  return (
    project.stage === 'defensive' ||
    project.planningStatus === 'ghost' ||
    project.stage === 'possible' ||
    getProjectWorkType(project) !== 'commercial'
  );
}

function getLowValueWorkDetail(project: ProjectFrame) {
  switch (getProjectWorkType(project)) {
    case 'research_development':
      return 'R&D / experiment without a direct commercial return';
    case 'waiting_room':
      return 'waiting-room project uses capacity without a clear decision';
    case 'defensive_maintenance':
      return 'defensive maintenance: revenue now, potential capacity constraint';
    case 'commercial':
    default:
      return 'project is defensive, ghost, or has lower confidence';
  }
}

export function isProjectSourceMismatch(project: ProjectFrame | undefined) {
  return project?.sourceStatus === 'scope_changed' || project?.sourceStatus === 'source_missing';
}

function getProjectSourceMismatchDetail(project: ProjectFrame) {
  if (project.sourceStatusNote?.trim()) return project.sourceStatusNote.trim();
  return project.sourceStatus === 'source_missing'
    ? 'missing entry or confirmation in the source/CRM'
    : 'scope changed but the source/CRM is outdated';
}

function addExplicitRelationshipSignals(
  signals: Map<string, ProjectRelationshipSignal>,
  allocation: PersonTileAllocation,
  person: Person,
  projectsById: Map<string, ProjectFrame>
) {
  if (allocation.previousTarget && allocation.previousTarget !== allocation.target) {
    const sourceLabel = getTargetLabel(allocation.previousTarget, projectsById);
    const targetLabel = getTargetLabel(allocation.target, projectsById);
    setRelationshipSignal(signals, {
      id: `${person.id}:moved:${allocation.previousTarget}->${allocation.target}`,
      personId: person.id,
      personName: person.name,
      kind: 'moved',
      label: 'move',
      detail: `${person.name}: ${sourceLabel} -> ${targetLabel}`,
    });
  }
  if (allocation.meetingState?.unchanged) {
    setRelationshipSignal(signals, {
      id: `${person.id}:unchanged`,
      personId: person.id,
      personName: person.name,
      kind: 'unchanged',
      label: 'unchanged',
      detail: `${person.name}: assignment confirmed as unchanged`,
    });
  }
  if (allocation.meetingState?.changedThisWeek) {
    setRelationshipSignal(signals, {
      id: `${person.id}:changed`,
      personId: person.id,
      personName: person.name,
      kind: 'changed',
      label: 'change',
      detail: `${person.name}: allocation agreed or changed this week`,
    });
  }
  if (allocation.meetingState?.handoffRequired) {
    setRelationshipSignal(signals, {
      id: `${person.id}:handoff`,
      personId: person.id,
      personName: person.name,
      kind: 'handoff',
      label: 'handoff',
      detail: `${person.name}: information must be handed off after the allocation change`,
    });
  }
  if (allocation.meetingState?.planB) {
    setRelationshipSignal(signals, {
      id: `${person.id}:planB`,
      personId: person.id,
      personName: person.name,
      kind: 'planB',
      label: 'Plan B',
      detail: `${person.name}: a fallback exists for this allocation`,
    });
  }
  if (allocation.meetingState?.mentoring) {
    setRelationshipSignal(signals, {
      id: `${person.id}:mentoring`,
      personId: person.id,
      personName: person.name,
      kind: 'mentoring',
      label: 'mentoring',
      detail: `${person.name}: mentoring relationship in the project`,
    });
  }
  if (allocation.meetingState?.backup) {
    setRelationshipSignal(signals, {
      id: `${person.id}:backup`,
      personId: person.id,
      personName: person.name,
      kind: 'backup',
      label: 'backup',
      detail: `${person.name}: another person or fallback has the context`,
    });
  }
}

function setRelationshipSignal(
  signals: Map<string, ProjectRelationshipSignal>,
  signal: ProjectRelationshipSignal
) {
  signals.set(signal.id, signal);
}

function addExplicitPeriodRelationshipSignals(
  signals: Map<string, PeriodRelationshipOverlaySignal>,
  allocation: PersonTileAllocation,
  person: Person,
  projectsById: Map<string, ProjectFrame>
) {
  const targetLabel = getTargetLabel(allocation.target, projectsById);
  const base = {
    personId: person.id,
    personName: person.name,
    sourceLabel: person.name,
    targetLabel,
  };

  if (allocation.previousTarget && allocation.previousTarget !== allocation.target) {
    const sourceLabel = getTargetLabel(allocation.previousTarget, projectsById);
    setPeriodRelationshipSignal(signals, {
      ...base,
      id: `${person.id}:${allocation.previousTarget}->${allocation.target}:moved`,
      kind: 'moved',
      label: 'move',
      sourceLabel,
      detail: `${person.name}: move ${sourceLabel} -> ${targetLabel}`,
    });
  }

  if (allocation.meetingState?.unchanged) {
    setPeriodRelationshipSignal(signals, {
      ...base,
      id: `${person.id}:${allocation.target}:unchanged`,
      kind: 'unchanged',
      label: 'unchanged',
      detail: `${person.name}: allocation in ${targetLabel} confirmed as unchanged`,
    });
  }
  if (allocation.meetingState?.changedThisWeek) {
    setPeriodRelationshipSignal(signals, {
      ...base,
      id: `${person.id}:${allocation.target}:changed`,
      kind: 'changed',
      label: 'change',
      detail: `${person.name}: allocation in ${targetLabel} agreed or changed this week`,
    });
  }
  if (allocation.meetingState?.handoffRequired) {
    setPeriodRelationshipSignal(signals, {
      ...base,
      id: `${person.id}:${allocation.target}:handoff`,
      kind: 'handoff',
      label: 'handoff',
      detail: `${person.name}: information about the allocation in ${targetLabel} must be handed off`,
    });
  }
  if (allocation.meetingState?.planB) {
    setPeriodRelationshipSignal(signals, {
      ...base,
      id: `${person.id}:${allocation.target}:planB`,
      kind: 'planB',
      label: 'Plan B',
      detail: `${person.name}: fallback for the allocation in ${targetLabel}`,
    });
  }
  if (allocation.meetingState?.mentoring) {
    setPeriodRelationshipSignal(signals, {
      ...base,
      id: `${person.id}:${allocation.target}:mentoring`,
      kind: 'mentoring',
      label: 'mentoring',
      detail: `${person.name}: mentoring relationship in ${targetLabel}`,
    });
  }
  if (allocation.meetingState?.backup) {
    setPeriodRelationshipSignal(signals, {
      ...base,
      id: `${person.id}:${allocation.target}:backup`,
      kind: 'backup',
      label: 'backup',
      detail: `${person.name}: backup or second context owner in ${targetLabel}`,
    });
  }
}

function setPeriodRelationshipSignal(
  signals: Map<string, PeriodRelationshipOverlaySignal>,
  signal: PeriodRelationshipOverlaySignal
) {
  signals.set(signal.id, signal);
}

function setPeriodRelationshipConnectorSignal(
  signals: Map<string, PeriodRelationshipConnectorSignal>,
  signal: PeriodRelationshipConnectorSignal
) {
  signals.set(signal.id, signal);
}

function getRelationshipConnectorPairKey(
  personId: string,
  sourceTarget: AllocationTarget,
  targetTarget: AllocationTarget
) {
  return `${personId}:${sourceTarget}->${targetTarget}`;
}

function getTargetLabel(target: AllocationTarget, projectsById: Map<string, ProjectFrame>) {
  if (target === 'bench') return 'Bench';
  const project = projectsById.get(target);
  if (!project) return target;
  return project.client || project.name;
}

function relationshipRank(kind: ProjectRelationshipSignalKind) {
  switch (kind) {
    case 'unchanged':
      return 0;
    case 'moved':
      return 1;
    case 'handoff':
      return 2;
    case 'changed':
      return 3;
    case 'planB':
      return 4;
    case 'mentoring':
      return 5;
    case 'backup':
      return 6;
    case 'fragmented':
      return 7;
  }
}

function projectInventoryPatternRank(kind: ProjectInventoryPatternKind) {
  switch (kind) {
    case 'emptyProject':
      return 0;
    case 'peopleShortage':
      return 1;
    case 'singlePersonProject':
      return 2;
    case 'manyProjectPeople':
      return 3;
    case 'fragmentedCollaborators':
      return 4;
    case 'researchDevelopmentProject':
      return 5;
    case 'waitingRoomProject':
      return 6;
    case 'lowValueProject':
      return 7;
    case 'sourceMismatch':
      return 8;
    case 'healthyTeam':
      return 9;
  }
}

function isPeriodBefore(candidate: Period | undefined, active: Period | undefined) {
  if (!candidate || !active) return false;
  return candidate.startsOn < active.startsOn;
}
