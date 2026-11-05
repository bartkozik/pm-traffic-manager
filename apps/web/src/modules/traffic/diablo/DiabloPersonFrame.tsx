import {
  type CSSProperties,
  type DragEvent,
  type FocusEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { DropZone } from '../components/DropZone';
import { PersonVisualBadge } from '../components/PersonVisualBadge';
import { DragPayload, DropPayloadOptions } from '../components/types';
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
import {
  getAllocationCostCapacityHours,
  getAllocationMetricDisplay,
  getPersonFreeCostCapacityHours,
  getPersonFreeMetricLabel,
  type TileMetricDisplayMode,
} from '../utils/tileMetricDisplay';
import {
  DIABLO_PERSON_FRAME_HEADER_ROWS,
  DIABLO_PERSON_TILE_COLUMNS,
  type DiabloPersonLayout,
} from './diabloLayout';

interface DiabloPersonFrameProps {
  activeDragPayload: DragPayload | null;
  canDragPersonToProject?: boolean;
  highlightedPersonId: string | null;
  isCanvasMoveMode: boolean;
  isCoveredByExpandedDetails?: boolean;
  isDragPreview?: boolean;
  isSelected: boolean;
  layout: DiabloPersonLayout;
  person: Person;
  personBench: PersonTileAllocation[];
  periodAllocations: PersonTileAllocation[];
  periodId: string;
  projectsById: Map<string, ProjectFrame>;
  skillsById: Map<string, Skill>;
  tileMetricMode?: TileMetricDisplayMode;
  selectedAllocationIds: Set<string>;
  onDropPayload: (payload: DragPayload, target: string, periodId: string, options?: DropPayloadOptions) => void;
  onEditPerson: (personId: string) => void;
  onDetailsExpandedChange?: (personId: string, isExpanded: boolean) => void;
  onFramePointerDown: (event: ReactPointerEvent<HTMLElement>, personId: string) => void;
  onHighlightPersonAllocations: (personId: string | null) => void;
  onPersonDragStart: (event: DragEvent, payload: DragPayload) => void;
  onResetPersonAllocations: (personId: string) => void;
  allocationResetScope?: 'month' | 'week';
  onTileClick: (event: ReactMouseEvent<HTMLButtonElement>, allocationId: string) => void;
  onTileDragStart: (event: DragEvent, payload: DragPayload) => void;
}

type PersonFrameStyle = CSSProperties & {
  '--diablo-frame-columns': number;
  '--diablo-frame-rows': number;
  '--diablo-person-tile-columns': number;
  '--diablo-person-tile-rows': number;
  '--diablo-person-color': string;
};

type PersonTileStyle = CSSProperties & {
  '--diablo-person-color': string;
};

type ResolvedBenchAlertSeverity = Exclude<BenchAlertSeverity, 'auto'>;

const PERSON_FRAME_DRAG_EXCLUDED_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'summary',
  'details',
  '.diablo-person-frame-tile-section',
  '.diablo-inventory-person-tile',
].join(', ');

export function DiabloPersonFrame({
  activeDragPayload,
  canDragPersonToProject: canDragPersonToProjectOverride,
  highlightedPersonId,
  isCanvasMoveMode,
  isCoveredByExpandedDetails = false,
  isDragPreview = false,
  isSelected,
  layout,
  person,
  personBench,
  periodAllocations,
  periodId,
  projectsById,
  skillsById,
  tileMetricMode = 'hours',
  selectedAllocationIds,
  onDropPayload,
  onEditPerson,
  onDetailsExpandedChange,
  onFramePointerDown,
  onHighlightPersonAllocations,
  onPersonDragStart,
  onResetPersonAllocations,
  allocationResetScope = 'month',
  onTileClick,
  onTileDragStart,
}: DiabloPersonFrameProps) {
  const [isPointerOverFrame, setIsPointerOverFrame] = useState(false);
  const [hasFocusWithinFrame, setHasFocusWithinFrame] = useState(false);
  const lastPointerDownAtRef = useRef(0);
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
  const tileColumnCount = Math.max(1, Math.min(DIABLO_PERSON_TILE_COLUMNS, layout.width));
  const tileRowCount = Math.max(0, layout.height - DIABLO_PERSON_FRAME_HEADER_ROWS);
  const tileSlotCount = Math.max(0, tileColumnCount * tileRowCount);
  const visibleTileBench = personBench.slice(0, tileSlotCount);
  const emptySlotCount = Math.max(0, tileSlotCount - visibleTileBench.length);
  const hasFreeTiles = personBench.length > 0;
  const hasVisibleFreeTiles = visibleTileBench.length > 0;
  const hasAssignedTiles = periodAllocations.some((allocation) => (
    allocation.personId === person.id &&
    allocation.periodId === periodId &&
    allocation.target !== 'bench'
  ));
  const isWeeklyBench = personBench.some(isWeeklyDisplayAllocation);
  const freeHoursOverride = isWeeklyBench
    ? undefined
    : getPersonFreeCostCapacityHours(personBench, person);
  const canDragPersonToProject = canDragPersonToProjectOverride ?? hasFreeTiles;
  const canGrabPersonFrame = isCanvasMoveMode || canDragPersonToProject;
  const canDropActivePayloadOnPerson = activeDragPayload
    ? activeDragPayload.type !== 'person' && doesPayloadBelongToPerson(activeDragPayload, person.id, periodAllocations)
    : false;
  const freeTilesLabel = getPersonFreeMetricLabel({
    allocations: personBench,
    costBasis: isWeeklyBench ? 'internal-hours' : 'cost-capacity',
    isWeekly: isWeeklyBench,
    mode: tileMetricMode,
    person,
    totalHoursOverride: freeHoursOverride,
  });
  const frameSummary = [
    person.name,
    `${costCoverage.coveredCostK}/${periodCostK}k cost`,
    freeTilesLabel,
    assignments.length ? `${assignments.length} allocations` : null,
    alert.severity !== 'none' ? alert.label : null,
  ].filter(Boolean).join(', ');
  const isHighlighted = highlightedPersonId === person.id;
  const isHoverDetailsExpanded = isPointerOverFrame || hasFocusWithinFrame;

  useEffect(() => {
    onDetailsExpandedChange?.(person.id, isHoverDetailsExpanded);
  }, [isHoverDetailsExpanded, onDetailsExpandedChange, person.id]);

  useEffect(() => (
    () => onDetailsExpandedChange?.(person.id, false)
  ), [onDetailsExpandedChange, person.id]);

  const handleDropToPersonBench = (payload: DragPayload) => {
    if (!doesPayloadBelongToPerson(payload, person.id, periodAllocations)) return;
    onDropPayload(payload, 'bench', periodId);
  };

  const handlePersonDragStart = (event: DragEvent) => {
    const target = event.target as HTMLElement;
    if (!canDragPersonToProject || target.closest(PERSON_FRAME_DRAG_EXCLUDED_SELECTOR)) {
      event.preventDefault();
      return;
    }
    onPersonDragStart(event, { type: 'person', personId: person.id });
  };

  const handlePersonFrameBlur = (event: FocusEvent<HTMLElement>) => {
    const nextFocusedElement = event.relatedTarget;
    if (nextFocusedElement && event.currentTarget.contains(nextFocusedElement as Node)) return;
    setHasFocusWithinFrame(false);
  };

  const handlePersonFrameFocus = () => {
    const isPointerFocus = Date.now() - lastPointerDownAtRef.current < 500;
    setHasFocusWithinFrame(!isPointerFocus);
  };

  return (
    <DropZone
      target={person.id}
      periodId={periodId}
      className={`diablo-project-frame diablo-person-frame is-bench-${alert.severity} ${alert.isIdle ? 'is-idle' : ''} ${alert.isSuspiciousAssignment ? 'is-suspicious-assignment' : ''} ${isSelected ? 'is-selected' : ''} ${isDragPreview ? 'is-person-drag-preview' : ''} ${canDropActivePayloadOnPerson ? 'is-drop-candidate' : ''} ${canGrabPersonFrame ? 'has-person-grab-zone' : ''} ${canDragPersonToProject ? '' : 'has-person-drag-disabled'} ${isHoverDetailsExpanded ? 'has-expanded-person-details' : ''} ${isCoveredByExpandedDetails ? 'is-covered-by-expanded-person-details' : ''}`}
      collaborationTargetLabel={person.name}
      collaborationTargetType="person"
      style={{
        gridColumn: `${layout.x} / span ${layout.width}`,
        gridRow: `${layout.y} / span ${layout.height}`,
        '--diablo-frame-columns': layout.width,
        '--diablo-frame-rows': layout.height,
        '--diablo-person-tile-columns': tileColumnCount,
        '--diablo-person-tile-rows': tileRowCount,
        '--diablo-person-color': person.color,
      } as PersonFrameStyle}
      onDropPayload={handleDropToPersonBench}
    >
      <article
        className={`diablo-project-frame-inner diablo-person-frame-inner ${hasFreeTiles ? 'has-free-tiles' : 'has-no-free-tiles'} ${isHoverDetailsExpanded ? 'has-expanded-hover-details' : ''}`}
        draggable={!isCanvasMoveMode && canDragPersonToProject}
        aria-label={frameSummary}
        title={frameSummary}
        onBlurCapture={handlePersonFrameBlur}
        onDragStart={handlePersonDragStart}
        onFocusCapture={handlePersonFrameFocus}
        onMouseEnter={() => setIsPointerOverFrame(true)}
        onMouseLeave={() => setIsPointerOverFrame(false)}
        onPointerDownCapture={() => {
          lastPointerDownAtRef.current = Date.now();
        }}
        onPointerDown={(event) => onFramePointerDown(event, person.id)}
      >
        <div
          className="diablo-person-plate"
          title={canDragPersonToProject
            ? `${person.name}: drag onto a project to allocate available tiles`
            : `${person.name}: all tiles are already allocated`}
        >
          <div className="diablo-person-frame-summary">
            <button className="diablo-person-frame-identity" type="button" onClick={() => onEditPerson(person.id)}>
              <span className="diablo-person-avatar">
                {person.initials}
              </span>
              <span>
                <strong>{person.name}</strong>
                <small>{person.role}</small>
              </span>
            </button>
            <div className="diablo-project-toolbar diablo-person-frame-actions" aria-label={`Person tools ${person.name}`}>
              <button className="diablo-frame-action-button" type="button" title="Edit person" onClick={() => onEditPerson(person.id)}>
                Edit
              </button>
              {hasAssignedTiles ? (
                <button
                  className="diablo-frame-action-button diablo-person-reset-button"
                  type="button"
                  title={allocationResetScope === 'week'
                    ? 'Reset person\'s allocations in the active week'
                    : 'Reset person\'s allocations this month'}
                  onClick={() => onResetPersonAllocations(person.id)}
                >
                  Reset
                </button>
              ) : null}
              {assignments.length ? (
                <button
                  aria-label={`Show tiles for ${person.name} on canvas`}
                  aria-pressed={isHighlighted}
                  className={`diablo-frame-action-button diablo-person-highlight-button ${isHighlighted ? 'is-active' : ''}`}
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
              ) : null}
            </div>
          </div>

          <div className="diablo-person-frame-meta">
            <span className={hasFreeTiles ? 'diablo-person-free-status' : 'diablo-person-free-status is-empty'}>
              {freeTilesLabel}
            </span>
            {alert.severity !== 'none' ? (
              <span className="diablo-bench-alert-badge">{alert.label}</span>
            ) : null}
          </div>

          <div className="diablo-person-hover-details" aria-hidden={!isHoverDetailsExpanded}>
            {alert.detail ? (
              <p className="diablo-bench-alert-detail">{alert.detail}</p>
            ) : null}

            <div className="diablo-person-frame-footer">
              <details
                className="diablo-person-cost-summary"
                aria-label={`Cost coverage ${person.name}: ${costCoverage.coveredCostK} of ${periodCostK}k, ${costCoverage.coveragePercent}%`}
                open={isHoverDetailsExpanded}
              >
                <summary
                  onClick={(event) => event.preventDefault()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
                  }}
                >
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
            </div>
          </div>
        </div>

        <div className={`diablo-person-frame-tile-section ${hasVisibleFreeTiles ? 'has-free-tiles' : 'has-no-free-tiles'}`}>
          {hasVisibleFreeTiles ? (
            <div className="diablo-inventory-grid diablo-person-frame-grid">
              {visibleTileBench.map((allocation) => (
                <PersonBenchTile
                  allocation={allocation}
                  isSelected={selectedAllocationIds.has(allocation.id)}
                  key={allocation.id}
                  person={person}
                  tileMetricMode={tileMetricMode}
                  onTileClick={onTileClick}
                  onTileDragStart={onTileDragStart}
                />
              ))}
              {Array.from({ length: emptySlotCount }, (_, index) => (
                <div className="diablo-inventory-cell is-person-empty" key={`empty-${index}`} />
              ))}
            </div>
          ) : (
            <span className="diablo-person-empty">
              no available tiles to allocate
            </span>
          )}
        </div>

        <div className="diablo-person-skill-badge-footer" aria-label={`Person's skills ${person.name}`}>
          <PersonVisualBadge compact person={person} skillsById={skillsById} />
        </div>
      </article>
    </DropZone>
  );
}

function isWeeklyDisplayAllocation(allocation: Pick<PersonTileAllocation, 'id'>) {
  return allocation.id.startsWith('weekly:') || allocation.id.startsWith('weekly-free:');
}

function PersonBenchTile({
  allocation,
  isSelected,
  person,
  tileMetricMode,
  onTileClick,
  onTileDragStart,
}: {
  allocation: PersonTileAllocation;
  isSelected: boolean;
  person: Person;
  tileMetricMode: TileMetricDisplayMode;
  onTileClick: (event: ReactMouseEvent<HTMLButtonElement>, allocationId: string) => void;
  onTileDragStart: (event: DragEvent, payload: DragPayload) => void;
}) {
  const isWeeklySlot = isWeeklyDisplayAllocation(allocation);
  const costBasis = isWeeklySlot ? 'internal-hours' : 'cost-capacity';
  const metric = getAllocationMetricDisplay(allocation, person, tileMetricMode, {
    costBasis,
    hoursOverride: isWeeklySlot ? undefined : getAllocationCostCapacityHours(allocation, person),
  });

  return (
    <button
      aria-label={`${person.name}: available tile, ${metric.ariaDetail}, ${tileMetricMode === 'cost' ? `${allocation.hours}h, ` : ''}${allocation.revenueK}k capacity. ${isSelected ? 'Selected for a group move.' : 'Click to edit the allocation. Shift+click selects it for a group move.'}`}
      aria-pressed={isSelected}
      className={`diablo-inventory-person-tile diablo-person-bench-tile ${isWeeklySlot ? 'is-weekly-slot' : ''} ${isSelected ? 'is-multi-selected' : ''}`}
      data-cost-coverage="unassigned"
      data-layer={getTileLayer(person, allocation.tileIndex, allocation.periodId)}
      draggable
      style={{ '--diablo-person-color': person.color } as PersonTileStyle}
      tabIndex={-1}
      title={`${person.name}: ${metric.titleLabel}${tileMetricMode === 'cost' ? ` · ${allocation.hours}h` : ''} · ${allocation.revenueK}k capacity on the person card`}
      type="button"
      onClick={(event) => onTileClick(event, allocation.id)}
      onDragStart={(event) => {
        event.stopPropagation();
        onTileDragStart(event, { type: 'tile', tileId: allocation.id });
      }}
    >
      <span className="diablo-tile-initials">{person.initials}</span>
      <span className="diablo-tile-metric-value">{metric.shortLabel}</span>
    </button>
  );
}

function doesPayloadBelongToPerson(
  payload: DragPayload,
  personId: string,
  allocations: PersonTileAllocation[]
) {
  const allocationById = new Map(allocations.map((allocation) => [allocation.id, allocation]));

  if (payload.type === 'person') return payload.personId === personId;
  if (payload.type === 'tile') return allocationById.get(payload.tileId)?.personId === personId;
  if (payload.type === 'allocation-group') {
    return payload.allocationIds.every((allocationId) => allocationById.get(allocationId)?.personId === personId);
  }

  return false;
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
