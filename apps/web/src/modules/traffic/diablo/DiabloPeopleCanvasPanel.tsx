import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type UIEvent,
} from 'react';
import { HelpButton } from '../components/HelpButton';
import { PersonVisualBadge } from '../components/PersonVisualBadge';
import { TrafficTooltip } from '../components/TrafficTooltip';
import type { DragPayload } from '../components/types';
import type { HelpTopicId } from '../help/helpContent';
import {
  getPersonCostCoverage,
  getTileLayer,
  type BenchAlertSeverity,
  type Person,
  type PersonCostCoverageSummary,
  type PersonTileAllocation,
  type ProjectFrame,
  type Skill,
} from '../models/traffic.model';
import { getPersonPeriodCostK, getPersonPeriodLayers } from '../utils/personPeriod';

type PeopleSortField = 'name' | 'skill';
type PeopleSortDirection = 'asc' | 'desc';

const PEOPLE_SORT_COLLATOR = new Intl.Collator('en-GB', {
  numeric: true,
  sensitivity: 'base',
});

interface DiabloPeopleCanvasPanelProps {
  activePeople: Person[];
  benchAllocations: PersonTileAllocation[];
  highlightedPersonId: string | null;
  periodAllocations: PersonTileAllocation[];
  projectsById: Map<string, ProjectFrame>;
  skillsById: Map<string, Skill>;
  onCreatePerson: () => void;
  onEditPerson: (personId: string) => void;
  onHighlightPersonAllocations: (personId: string | null) => void;
  onOpenHelp: (topicId: HelpTopicId) => void;
  onPersonDragStart: (event: DragEvent, payload: DragPayload) => void;
  onResetPersonAllocations: (personId: string) => void;
  onTileClick: (event: ReactMouseEvent<HTMLButtonElement>, allocationId: string) => void;
  onTileDragStart: (event: DragEvent, payload: DragPayload) => void;
  periodId: string;
  selectedAllocationIds: Set<string>;
}

export function DiabloPeopleCanvasPanel({
  activePeople,
  benchAllocations,
  periodAllocations,
  projectsById,
  skillsById,
  onCreatePerson,
  onEditPerson,
  onHighlightPersonAllocations,
  onOpenHelp,
  onPersonDragStart,
  onResetPersonAllocations,
  onTileClick,
  onTileDragStart,
  periodId,
  selectedAllocationIds,
  highlightedPersonId,
}: DiabloPeopleCanvasPanelProps) {
  const [hasPeopleListTopFade, setHasPeopleListTopFade] = useState(false);
  const [peopleSortField, setPeopleSortField] = useState<PeopleSortField>('name');
  const [peopleSortDirection, setPeopleSortDirection] = useState<PeopleSortDirection>('asc');
  const handlePeopleListScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setHasPeopleListTopFade(event.currentTarget.scrollTop > 0);
  }, []);
  const personRows = useMemo(() => activePeople.map((person) => {
    const personBench = benchAllocations.filter((allocation) => allocation.personId === person.id);
    const costCoverage = getPersonCostCoverage(person, periodId, periodAllocations, projectsById);
    const assignments = getPersonAssignmentSummaries(person.id, periodAllocations, projectsById, costCoverage);
    const assignedRevenueK = assignments.reduce((sum, assignment) => sum + assignment.revenueK, 0);
    const benchRevenueK = personBench.reduce((sum, allocation) => sum + allocation.revenueK, 0);
    const periodCostK = getPersonPeriodCostK(person, periodId);
    const periodTargetK = getPersonPeriodLayers(person, periodId).targetK;
    const costCashflowK = roundPersonCardMoney(costCoverage.billableRevenueK - periodCostK);
    const alert = getBenchAlertState(person, {
      assignedRevenueK,
      benchRevenueK,
      costCoveredK: costCoverage.coveredCostK,
      nonCoveringRevenueK: costCoverage.nonCoveringRevenueK,
      periodCostK,
      periodTargetK,
      timeOffCostK: costCoverage.timeOffCostK,
    });

    return {
      alert,
      assignedRevenueK,
      assignments,
      benchRevenueK,
      costCashflowK,
      costCoverage,
      person,
      personBench,
      periodCostK,
      periodTargetK,
    };
  }), [activePeople, benchAllocations, periodAllocations, periodId, projectsById]);
  const sortedPersonRows = useMemo(() => (
    [...personRows].sort((first, second) => comparePeopleForSort(
      first.person,
      second.person,
      peopleSortField,
      peopleSortDirection,
      skillsById
    ))
  ), [peopleSortDirection, peopleSortField, personRows, skillsById]);
  const sortDirectionLabel = peopleSortDirection === 'asc' ? 'A-Z' : 'Z-A';
  const severeRows = personRows.filter((row) => row.alert.severity === 'critical' || row.alert.severity === 'warning');
  const idleCostK = personRows
    .filter((row) => row.alert.isIdle)
    .reduce((sum, row) => sum + row.periodCostK, 0);
  const idleTargetK = personRows
    .filter((row) => row.alert.isIdle)
    .reduce((sum, row) => sum + row.periodTargetK, 0);
  const suspiciousAssignmentCount = personRows.filter((row) => row.alert.isSuspiciousAssignment).length;

  return (
    <aside className="diablo-canvas-people-panel">
      <header>
        <div>
          <strong>People</strong>
          <span>{activePeople.length} people / drag onto a frame</span>
        </div>
        <div className="diablo-people-header-tools">
          <div className="diablo-people-sort-controls" aria-label="People list sorting">
            <TrafficTooltip label="Sort people alphabetically by name" placement="bottom" delayMs={90}>
              <button
                aria-label="Sort people by name"
                aria-pressed={peopleSortField === 'name'}
                className={peopleSortField === 'name' ? 'is-active' : ''}
                type="button"
                onClick={() => setPeopleSortField('name')}
              >
                N
              </button>
            </TrafficTooltip>
            <TrafficTooltip label="Sort people alphabetically by skills" placement="bottom" delayMs={90}>
              <button
                aria-label="Sort people by skills"
                aria-pressed={peopleSortField === 'skill'}
                className={peopleSortField === 'skill' ? 'is-active' : ''}
                type="button"
                onClick={() => setPeopleSortField('skill')}
              >
                Sk
              </button>
            </TrafficTooltip>
            <TrafficTooltip label={`Reverse sort direction (${sortDirectionLabel})`} placement="bottom" delayMs={90}>
              <button
                aria-label={`Change people sort direction: currently ${sortDirectionLabel}`}
                className="diablo-people-sort-direction"
                type="button"
                onClick={() => setPeopleSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
              >
                {peopleSortDirection === 'asc' ? '↑' : '↓'}
              </button>
            </TrafficTooltip>
          </div>
          <div className="diablo-panel-actions">
            <HelpButton label="Explain the people palette" topicId="people-palette" onOpenHelp={onOpenHelp} />
            <button type="button" onClick={onCreatePerson}>+ Person</button>
          </div>
        </div>
      </header>
      <div
        className={`diablo-bench-alert-summary ${severeRows.length ? 'has-severe-alerts' : ''}`}
        aria-label={`Bench alerts: ${severeRows.length} high, cost without project ${idleCostK}k, target without project ${idleTargetK}k`}
      >
        <span>
          <strong>{severeRows.length}</strong>
          bench alerts
        </span>
        <span>
          <strong>{idleCostK}k</strong>
          idle cost
        </span>
        <span>
          <strong>{idleTargetK}k</strong>
          opportunity
        </span>
        <span>
          <strong>{suspiciousAssignmentCount}</strong>
          low value
        </span>
      </div>
      <div
        className={`diablo-people-list ${hasPeopleListTopFade ? 'has-top-fade' : ''}`}
        onScroll={handlePeopleListScroll}
      >
        {sortedPersonRows.map(({
          alert,
          assignedRevenueK,
          assignments,
          benchRevenueK,
          costCashflowK,
          costCoverage,
          person,
          personBench,
          periodCostK,
        }) => (
          <article
            className={`diablo-person-card diablo-canvas-person-card is-bench-${alert.severity} ${alert.isIdle ? 'is-idle' : ''} ${alert.isSuspiciousAssignment ? 'is-suspicious-assignment' : ''}`}
            data-collaboration-target-id={person.id}
            data-collaboration-target-label={person.name}
            data-collaboration-target-type="person"
            draggable
            key={person.id}
            onDragStart={(event) => {
              const payload: DragPayload = event.shiftKey && personBench[0]
                ? { type: 'tile', tileId: personBench[0].id }
                : { type: 'person', personId: person.id };
              onPersonDragStart(event, payload);
            }}
          >
            <div className="diablo-person-card-header">
              <button type="button" onClick={() => onEditPerson(person.id)}>
                <span
                  className="diablo-person-avatar"
                  style={{ '--diablo-person-color': person.color } as CSSProperties}
                >
                  {person.initials}
                </span>
                <strong>{person.name}</strong>
                <small>{person.role}</small>
              </button>
              <div>
                <span>{costCoverage.coveredCostK}/{periodCostK}k cost</span>
                {alert.severity !== 'none' ? <b className="diablo-bench-alert-badge">{alert.label}</b> : null}
                {assignments.length ? (
                  <div className="diablo-person-card-actions">
                    <button
                      aria-label={`Show tiles for ${person.name} on canvas`}
                      aria-pressed={highlightedPersonId === person.id}
                      className={`diablo-person-highlight-button ${highlightedPersonId === person.id ? 'is-active' : ''}`}
                      title={`Highlight tiles for ${person.name} on canvas`}
                      type="button"
                      onBlur={() => onHighlightPersonAllocations(null)}
                      onClick={() => onHighlightPersonAllocations(person.id)}
                      onFocus={() => onHighlightPersonAllocations(person.id)}
                      onMouseEnter={() => onHighlightPersonAllocations(person.id)}
                      onMouseLeave={() => onHighlightPersonAllocations(null)}
                    >
                      Show
                    </button>
                    {assignedRevenueK ? (
                      <button type="button" onClick={() => onResetPersonAllocations(person.id)}>
                        Reset {assignedRevenueK}k
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            <PersonVisualBadge compact person={person} skillsById={skillsById} />
            <details
              className="diablo-person-cost-summary"
              aria-label={`Cost coverage ${person.name}: ${costCoverage.coveredCostK} of ${periodCostK}k, ${costCoverage.coveragePercent}%`}
            >
              <summary>
                <span>Cost coverage</span>
                <strong>{costCoverage.coveredCostK}/{periodCostK}k</strong>
                <em>{costCoverage.coveragePercent}%</em>
              </summary>
              <div className="diablo-person-cost-summary-details">
                <span>{costCoverage.billableRevenueK}k revenue</span>
                <span>{costCashflowK >= 0 ? '+' : ''}{costCashflowK}k balance</span>
                {costCoverage.nonCoveringRevenueK > 0 ? (
                  <span className="is-muted">{costCoverage.nonCoveringRevenueK}k uncovered</span>
                ) : null}
                {costCoverage.timeOffCostK > 0 ? (
                  <span className="is-time-off">{costCoverage.timeOffCostK}k leave</span>
                ) : null}
              </div>
            </details>
            {alert.detail ? <span className="diablo-bench-alert-detail">{alert.detail}</span> : null}
            {assignments.length ? (
              <div className="diablo-person-assignments" aria-label={`Person's allocations ${person.name}`}>
                {assignments.slice(0, 4).map((assignment) => (
                  <span
                    className={assignment.nonCoveringReason === 'time_off' ? 'is-time-off-cost' : assignment.nonCoveringReason ? 'is-non-covering-cost' : 'is-covering-cost'}
                    key={assignment.projectId}
                    title={assignment.nonCoveringReason
                      ? `${assignment.projectLabel}: ${assignment.revenueK}k of uncovered cost (${getNonCoveringReasonLabel(assignment.nonCoveringReason)})`
                      : `${assignment.projectLabel}: ${assignment.revenueK}k revenue / ${assignment.coveredCostK}k cost coverage`}
                  >
                    {assignment.projectLabel} {assignment.nonCoveringReason === 'time_off' ? 'leave' : assignment.nonCoveringReason ? 'uncovered' : `${assignment.revenueK}k`}
                  </span>
                ))}
                {assignments.length > 4 ? <span>+{assignments.length - 4}</span> : null}
              </div>
            ) : null}
            {personBench.length ? (
              <div
                className="diablo-person-bench-grid"
                aria-label={`Person's bench ${person.name}: ${benchRevenueK}k in ${personBench.length} tiles`}
              >
                {personBench.map((allocation) => (
                  <button
                    aria-label={`${person.name}: available tile ${allocation.revenueK}k, ${allocation.hours}h. ${selectedAllocationIds.has(allocation.id) ? 'Selected for a group move.' : 'Click to edit the allocation. Shift+click selects it for a group move.'}`}
                    aria-pressed={selectedAllocationIds.has(allocation.id)}
                    className={`diablo-inventory-person-tile diablo-person-bench-tile ${selectedAllocationIds.has(allocation.id) ? 'is-multi-selected' : ''}`}
                    data-cost-coverage="unassigned"
                    data-layer={getTileLayer(person, allocation.tileIndex, allocation.periodId)}
                    draggable
                    key={allocation.id}
                    style={{ '--diablo-person-color': person.color } as CSSProperties}
                    title={`${person.name}: ${allocation.revenueK}k / ${allocation.hours}h on the bench`}
                    type="button"
                    onClick={(event) => onTileClick(event, allocation.id)}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      onTileDragStart(event, { type: 'tile', tileId: allocation.id });
                    }}
                  >
                    <span className="diablo-tile-initials">{person.initials}</span>
                  </button>
                ))}
              </div>
            ) : (
              <span className="diablo-person-empty">no available tiles</span>
            )}
          </article>
        ))}
      </div>
    </aside>
  );
}

function comparePeopleForSort(
  first: Person,
  second: Person,
  sortField: PeopleSortField,
  sortDirection: PeopleSortDirection,
  skillsById: Map<string, Skill>
) {
  if (sortField === 'skill') {
    const emptySkillCompare = compareEmptySkillSets(first, second);
    if (emptySkillCompare !== 0) return emptySkillCompare;

    const skillCompare = comparePersonSkillLabels(first, second, skillsById);
    if (skillCompare !== 0) {
      return sortDirection === 'asc' ? skillCompare : -skillCompare;
    }

    return comparePeopleByName(first, second);
  }

  const nameCompare = comparePeopleByName(first, second);
  return sortDirection === 'asc' ? nameCompare : -nameCompare;
}

function compareEmptySkillSets(first: Person, second: Person) {
  const firstHasSkills = first.skillIds.length > 0;
  const secondHasSkills = second.skillIds.length > 0;

  if (firstHasSkills === secondHasSkills) return 0;
  return firstHasSkills ? -1 : 1;
}

function comparePersonSkillLabels(first: Person, second: Person, skillsById: Map<string, Skill>) {
  return PEOPLE_SORT_COLLATOR.compare(
    getPrimarySortedPersonSkillLabel(first, skillsById),
    getPrimarySortedPersonSkillLabel(second, skillsById)
  );
}

function getPrimarySortedPersonSkillLabel(person: Person, skillsById: Map<string, Skill>) {
  return person.skillIds
    .map((skillId) => skillsById.get(skillId)?.label || skillId)
    .sort((first, second) => PEOPLE_SORT_COLLATOR.compare(first, second))[0] || '';
}

function comparePeopleByName(first: Person, second: Person) {
  return PEOPLE_SORT_COLLATOR.compare(first.name, second.name);
}

function getPersonAssignmentSummaries(
  personId: string,
  periodAllocations: PersonTileAllocation[],
  projectsById: Map<string, ProjectFrame>,
  costCoverage: PersonCostCoverageSummary
) {
  const coveringByProjectId = new Map(costCoverage.projectSegments.map((segment) => [segment.projectId, segment]));
  const nonCoveringByTarget = new Map(costCoverage.nonCoveringTargets.map((target) => [target.target, target]));
  const assignments = new Map<string, {
    coveredCostK: number;
    nonCoveringReason?: string;
    projectId: string;
    projectLabel: string;
    revenueK: number;
  }>();

  periodAllocations.forEach((allocation) => {
    if (allocation.personId !== personId || allocation.target === 'bench') return;
    const project = projectsById.get(allocation.target);
    const projectLabel = project ? project.client : allocation.target;
    const coverageSegment = coveringByProjectId.get(allocation.target);
    const nonCoveringTarget = nonCoveringByTarget.get(allocation.target);
    const current = assignments.get(allocation.target) || {
      coveredCostK: coverageSegment?.coveredCostK || 0,
      nonCoveringReason: nonCoveringTarget?.reason,
      projectId: allocation.target,
      projectLabel,
      revenueK: 0,
    };

    current.revenueK += allocation.revenueK;
    assignments.set(allocation.target, current);
  });

  return Array.from(assignments.values()).sort((a, b) => b.revenueK - a.revenueK);
}

function roundPersonCardMoney(value: number) {
  return Math.round(value * 10) / 10;
}

function getNonCoveringReasonLabel(reason: string | undefined) {
  switch (reason) {
    case 'uncapped_time_materials':
      return 'Uncapped T&M';
    case 'non_commercial_work':
      return 'non-commercial work';
    case 'time_off':
      return 'leave / unavailability';
    case 'missing_project':
      return 'no project';
    default:
      return 'uncovered';
  }
}

type ResolvedBenchAlertSeverity = Exclude<BenchAlertSeverity, 'auto'>;

function getBenchAlertState(
  person: Person,
  values: {
    assignedRevenueK: number;
    benchRevenueK: number;
    costCoveredK: number;
    nonCoveringRevenueK: number;
    periodCostK: number;
    periodTargetK: number;
    timeOffCostK: number;
  }
): {
  detail: string | null;
  isIdle: boolean;
  isSuspiciousAssignment: boolean;
  label: string;
  severity: ResolvedBenchAlertSeverity;
} {
  const isIdle = values.benchRevenueK > 0 && values.costCoveredK <= 0;
  const isSuspiciousAssignment = values.assignedRevenueK > 0 && (
    values.costCoveredK < values.periodCostK ||
    values.costCoveredK < values.periodTargetK * 0.45
  );
  const manualSeverity = person.benchAlertSeverity || 'auto';

  if (manualSeverity === 'none' || (!isIdle && !isSuspiciousAssignment)) {
    return {
      detail: null,
      isIdle,
      isSuspiciousAssignment,
      label: 'OK',
      severity: 'none',
    };
  }

  const severity = manualSeverity !== 'auto'
    ? manualSeverity
    : resolveAutomaticBenchSeverity(person, values, isIdle, isSuspiciousAssignment);

  const label = severity === 'critical'
    ? 'CRITICAL'
    : severity === 'warning'
      ? 'ALERT'
      : 'WATCH';
  const detail = isIdle
    ? `No project: cost ${values.periodCostK}k / target ${values.periodTargetK}k.`
    : `Cost coverage: ${values.costCoveredK}k vs cost ${values.periodCostK}k${values.nonCoveringRevenueK > 0 ? `, ${values.nonCoveringRevenueK}k uncovered` : ''}${values.timeOffCostK > 0 ? `, ${values.timeOffCostK}k leave` : ''}.`;

  return {
    detail,
    isIdle,
    isSuspiciousAssignment,
    label,
    severity,
  };
}

function resolveAutomaticBenchSeverity(
  person: Person,
  values: {
    costCoveredK: number;
    periodCostK: number;
    periodTargetK: number;
  },
  isIdle: boolean,
  isSuspiciousAssignment: boolean
): ResolvedBenchAlertSeverity {
  if (isIdle) {
    if (
      person.seniority === 'lead' ||
      person.seniority === 'senior' ||
      values.periodCostK >= 30 ||
      values.periodTargetK >= 45
    ) {
      return 'critical';
    }

    if (person.seniority === 'mid' || values.periodCostK >= 18 || values.periodTargetK >= 28) {
      return 'warning';
    }

    return 'watch';
  }

  if (isSuspiciousAssignment && (
    person.seniority === 'lead' ||
    person.seniority === 'senior' ||
    values.costCoveredK < values.periodCostK
  )) {
    return 'warning';
  }

  return 'watch';
}
