import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { DropZone } from '../components/DropZone';
import { DragPayload, DropPayloadOptions } from '../components/types';
import {
  getContractTypeLabel,
  getPersonCostCoverage,
  getProjectPlanningStatusLabel,
  getProjectWorkTypeLabel,
  projectCountsForPersonCostCoverage,
  isTimeOffProject,
  getStageLabel,
  getTileLayer,
  Period,
  Person,
  PersonTileAllocation,
  ProjectFrame,
  Skill,
  SkillId,
  type PersonCostCoverageSummary,
} from '../models/traffic.model';
import {
  getAllocationRevenueK,
  getFrameBehavior,
  getFrameTypeLabel,
  getPooledFrameCapacityK,
  getProjectInventoryPatternClassName,
  getProjectInventoryPatternCode,
  getProjectInventoryPatterns,
  splitAllocationsByRevenueLimit,
} from '../utils/visualInventory';
import {
  getProjectSkillZoneSlots,
  getProjectSkillZones,
  type ProjectSkillZone,
  type ProjectSkillZoneSlot,
} from '../utils/projectSkillZones';
import { getVisualSkillGlyph } from '../utils/visualLegend';
import { getFrameCellCount, type DiabloProjectLayout } from './diabloLayout';
import {
  formatProjectCostMetricLabel,
  getAllocationMetricDisplay,
  getProjectFinancialMetricSummary,
  type TileMetricDisplayMode,
} from '../utils/tileMetricDisplay';

const MAX_VISIBLE_DIABLO_PROJECT_PATTERNS = 4;

interface DiabloProjectFrameProps {
  activeDragPayload: DragPayload | null;
  allAllocations: PersonTileAllocation[];
  allocations: PersonTileAllocation[];
  highlightedPersonId: string | null;
  isCanvasMoveMode?: boolean;
  isPersonFrameDropPreview: boolean;
  isSelected: boolean;
  isWeeklyPlanningMode?: boolean;
  layout: DiabloProjectLayout;
  peopleById: Map<string, Person>;
  periodAllocations: PersonTileAllocation[];
  periodId: string;
  periods: Period[];
  project: ProjectFrame;
  projectsById: Map<string, ProjectFrame>;
  skillsById: Map<string, Skill>;
  tileMetricMode?: TileMetricDisplayMode;
  isArchivePending: boolean;
  isDeletePending: boolean;
  onArchiveProject: (projectId: string, periodId: string) => void;
  onCycleWorkType: (project: ProjectFrame) => void;
  onDeleteProject: (projectId: string) => void;
  onDropPayload: (payload: DragPayload, target: string, periodId: string, options?: DropPayloadOptions) => void;
  onEditProject: (projectId: string) => void;
  onFramePointerDown: (event: ReactPointerEvent<HTMLElement>, projectId: string) => void;
  onResizeByGridStep: (projectId: string, delta: { width?: number; height?: number }) => void;
  onResizePointerDown: (event: ReactPointerEvent<HTMLElement>, projectId: string) => void;
  onTileClick: (event: ReactMouseEvent<HTMLButtonElement>, allocationId: string) => void;
  onTileDragStart: (event: React.DragEvent, payload: DragPayload) => void;
  selectedAllocationIds: Set<string>;
}

type FrameStyle = CSSProperties & {
  '--diablo-frame-fill': string;
  '--diablo-frame-columns': number;
  '--diablo-frame-rows': number;
};

type SkillZoneStyle = CSSProperties & {
  '--diablo-skill-color': string;
};

type PersonTileStyle = CSSProperties & {
  '--diablo-person-color': string;
  '--diablo-skill-color'?: string;
};

type ProjectTileCostCoverageState = 'covered' | 'pending' | 'non-covering' | 'time-off';
const MONEY_EPSILON_K = 0.05;

export function DiabloProjectFrame({
  activeDragPayload,
  allAllocations,
  allocations,
  highlightedPersonId,
  isCanvasMoveMode = false,
  isPersonFrameDropPreview,
  isSelected,
  isWeeklyPlanningMode = false,
  layout,
  peopleById,
  periodAllocations,
  periodId,
  periods,
  project,
  projectsById,
  skillsById,
  tileMetricMode = 'hours',
  isArchivePending,
  isDeletePending,
  onArchiveProject,
  onDeleteProject,
  onDropPayload,
  onEditProject,
  onFramePointerDown,
  onResizeByGridStep,
  onResizePointerDown,
  onTileClick,
  onTileDragStart,
  selectedAllocationIds,
}: DiabloProjectFrameProps) {
  const periodPlan = project.revenuePlan.find((entry) => entry.periodId === periodId);
  const periodBudgetK = periodPlan?.revenueK ?? project.budgetK;
  const frameBehavior = getFrameBehavior(project.contractType);
  const frameCapacityK = frameBehavior === 'pooled'
    ? getPooledFrameCapacityK(project, periodId, allAllocations, periods, periodBudgetK)
    : periodBudgetK;
  const frameCapacityCellCount = getFrameCellCount(frameCapacityK);
  const canvasSlotCount = Math.max(1, layout.width * layout.height);
  const isWeeklyFrame = allocations.some(isWeeklyDisplayAllocation);
  const allocatableSlotCount = isWeeklyFrame ? Math.min(canvasSlotCount, frameCapacityCellCount) : canvasSlotCount;
  const { visible, overflow, visibleRevenueK, overflowRevenueK } = isWeeklyFrame
    ? splitWeeklyAllocationsBySlotLimit(allocations, allocatableSlotCount)
    : splitAllocationsByRevenueLimit(
      allocations,
      frameBehavior === 'elastic' ? null : frameCapacityK
    );
  const visibleSlots = visible.slice(0, canvasSlotCount);
  const layoutOverflow = visible.slice(canvasSlotCount);
  const frameOverflow = [...layoutOverflow, ...overflow];
  const frameOverflowRevenueK = frameOverflow.reduce((sum, allocation) => sum + getAllocationRevenueK(allocation), 0);
  const filledRevenueK = visibleSlots.reduce((sum, allocation) => sum + getAllocationRevenueK(allocation), 0);
  const costBasis = isWeeklyFrame ? 'internal-hours' : 'cost-capacity';
  const financialSummary = getProjectFinancialMetricSummary(allocations, peopleById, { costBasis });
  const projectPlateMetric = tileMetricMode === 'cost'
    ? formatProjectCostMetricLabel(financialSummary)
    : `${filledRevenueK}/${frameCapacityK}k`;
  const emptySlotCount = Math.max(0, Math.min(canvasSlotCount, frameCapacityCellCount) - visibleSlots.length);
  const emptyRevenueK = frameBehavior === 'elastic' ? 0 : Math.max(0, frameCapacityK - visibleRevenueK);
  const frameFillPercent = frameBehavior === 'elastic'
    ? (filledRevenueK > 0 ? 100 : 0)
    : frameCapacityK > 0
      ? Math.min(100, Math.round((filledRevenueK / frameCapacityK) * 100))
      : 0;
  const riskCount = allocations.reduce((sum, allocation) => (
    sum + (allocation.validation || []).filter((validation) => validation.severity !== 'info').length
  ), 0);
  const positiveCount = allocations.reduce((sum, allocation) => (
    sum + (allocation.validation || []).filter((validation) => validation.severity === 'info').length
  ), 0);
  const frameStatus = frameOverflow.length
    ? 'overflow'
    : emptySlotCount > 0
      ? 'gap'
      : riskCount
        ? 'pressure'
        : positiveCount
          ? 'healthy'
          : 'neutral';
  const probability = Math.round((periodPlan?.probability ?? project.probability) * 100);
  const uniquePersonCount = new Set(visibleSlots.map((allocation) => allocation.personId)).size;
  const frameTypeLabel = getFrameTypeLabel(project.contractType);
  const personClusterClasses = getPersonClusterClasses(visibleSlots);
  const costCoverageByPersonId = new Map<string, PersonCostCoverageSummary>();
  [...visibleSlots, ...frameOverflow].forEach((allocation) => {
    if (costCoverageByPersonId.has(allocation.personId)) return;
    const person = peopleById.get(allocation.personId);
    if (!person) return;
    costCoverageByPersonId.set(
      allocation.personId,
      getPersonCostCoverage(person, periodId, periodAllocations, projectsById)
    );
  });
  const projectInventoryPatterns = getProjectInventoryPatterns({
    project,
    allocations,
    periodAllocations: periodAllocations || allocations,
    peopleById,
    projectsById,
    overflowRevenueK: frameOverflowRevenueK,
  });
  const visibleProjectInventoryPatterns = projectInventoryPatterns.slice(0, MAX_VISIBLE_DIABLO_PROJECT_PATTERNS);
  const hiddenProjectInventoryPatterns = projectInventoryPatterns.slice(MAX_VISIBLE_DIABLO_PROJECT_PATTERNS);
  const skillZones = getProjectSkillZones(project, skillsById, periodId, allocations, peopleById);
  const skillZoneSlots = getProjectSkillZoneSlots(skillZones, frameCapacityCellCount, canvasSlotCount);
  const shouldPrioritizeFrameGrab = isWeeklyPlanningMode && isCanvasMoveMode;
  const shouldShowFrameActions = isSelected && !shouldPrioritizeFrameGrab;
  const inventorySlots = getProjectInventorySlots({
    allocatableSlotCount,
    canvasSlotCount,
    skillZoneSlots,
    visibleSlots,
  });
  const projectSummary = [
    `${project.client} - ${project.name}`,
    `${filledRevenueK}/${frameCapacityK}k`,
    `koszt ${financialSummary.internalCostK}k`,
    financialSummary.marginK >= 0 ? `marża +${financialSummary.marginK}k` : `gap ${Math.abs(financialSummary.marginK)}k`,
    `${financialSummary.hours}h`,
    `${visibleSlots.length}/${canvasSlotCount} slotów`,
    `${uniquePersonCount} os.`,
    `${probability}%`,
    frameOverflowRevenueK > 0 ? `poza ramką +${frameOverflowRevenueK}k` : null,
    riskCount ? `ryzyka ${riskCount}` : null,
  ].filter(Boolean).join(', ');
  const isDropCandidate = Boolean(activeDragPayload || isPersonFrameDropPreview);
  const stopProjectToolbarPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <DropZone
      target={project.id}
      periodId={periodId}
      className={`diablo-project-frame is-${frameStatus} is-work-${project.workType || 'commercial'} is-contract-${frameBehavior} is-stage-${project.stage} ${project.planningStatus === 'ghost' ? 'is-ghost' : ''} ${isSelected ? 'is-selected' : ''} ${isDropCandidate ? 'is-drop-candidate' : ''} ${isPersonFrameDropPreview ? 'is-person-frame-drop-preview' : ''}`}
      collaborationTargetLabel={`${project.client} - ${project.name}`}
      collaborationTargetType="project"
      style={{
        gridColumn: `${layout.x} / span ${layout.width}`,
        gridRow: `${layout.y} / span ${layout.height}`,
        '--diablo-frame-fill': `${frameFillPercent}%`,
        '--diablo-frame-columns': layout.width,
        '--diablo-frame-rows': layout.height,
      } as FrameStyle}
      dropOptions={skillZoneSlots.length ? { disableRequirementSuggestion: true } : undefined}
      onDropPayload={onDropPayload}
    >
      <article
        className="diablo-project-frame-inner"
        aria-label={projectSummary}
        title={projectSummary}
        onPointerDown={(event) => onFramePointerDown(event, project.id)}
      >
        <div className="diablo-project-plate">
          <div>
            <strong>{project.client}</strong>
            <span>{projectPlateMetric}</span>
          </div>
          <div
            className="diablo-project-toolbar"
            aria-label={`Narzędzia projektu ${project.client}`}
            onPointerDown={stopProjectToolbarPointerDown}
          >
            <button
              className="diablo-frame-action-button"
              type="button"
              title="Edytuj projekt"
              onClick={() => onEditProject(project.id)}
            >
              Edit
            </button>
          </div>
        </div>

        {shouldShowFrameActions ? (
          <div
            className="diablo-selected-frame-actions"
            aria-label={`Akcje ramki ${project.client}`}
            onPointerDown={stopProjectToolbarPointerDown}
          >
            <button
              type="button"
              aria-label={`Otwórz szczegóły projektu ${project.client} - ${project.name}`}
              title="Otwórz szczegóły projektu"
              onClick={() => onEditProject(project.id)}
            >
              Pokaż
            </button>
            <div className="diablo-selected-frame-resize-actions" aria-label="Zmień zakres ramki">
              <button
                type="button"
                aria-label="Zmniejsz szerokość ramki o jedną kolumnę"
                title="Zmniejsz szerokość ramki o jedną kolumnę"
                onClick={() => onResizeByGridStep(project.id, { width: -1 })}
              >
                S-
              </button>
              <button
                type="button"
                aria-label="Zwiększ szerokość ramki o jedną kolumnę"
                title="Zwiększ szerokość ramki o jedną kolumnę"
                onClick={() => onResizeByGridStep(project.id, { width: 1 })}
              >
                S+
              </button>
              <button
                type="button"
                aria-label="Zmniejsz wysokość ramki o jeden wiersz"
                title="Zmniejsz wysokość ramki o jeden wiersz"
                onClick={() => onResizeByGridStep(project.id, { height: -1 })}
              >
                W-
              </button>
              <button
                type="button"
                aria-label="Zwiększ wysokość ramki o jeden wiersz"
                title="Zwiększ wysokość ramki o jeden wiersz"
                onClick={() => onResizeByGridStep(project.id, { height: 1 })}
              >
                W+
              </button>
            </div>
            <button
              className={isArchivePending ? 'is-confirming' : ''}
              type="button"
              aria-label={`${isArchivePending ? 'Potwierdź ukrycie projektu' : 'Ukryj projekt w aktywnym miesiącu'}: ${project.client} - ${project.name}`}
              title="Ukryj projekt w aktywnym miesiącu"
              onClick={() => onArchiveProject(project.id, periodId)}
            >
              {isArchivePending ? 'OK' : 'Ukryj'}
            </button>
            <button
              className={`is-danger ${isDeletePending ? 'is-confirming' : ''}`}
              type="button"
              aria-label={`${isDeletePending ? 'Potwierdź usunięcie projektu' : 'Usuń projekt i przenieś alokacje na ławkę'}: ${project.client} - ${project.name}`}
              title="Usuń projekt i przenieś jego alokacje na ławkę"
              onClick={() => onDeleteProject(project.id)}
            >
              {isDeletePending ? 'OK' : 'Usuń'}
            </button>
          </div>
        ) : null}

        <div className="diablo-project-signals" aria-label={`Sygnały projektu ${project.client}`}>
          {emptyRevenueK > 0 || emptySlotCount > 0 ? <i className="is-warning" title={`Luka ${emptyRevenueK}k / ${emptySlotCount} slotów`} /> : null}
          {frameOverflowRevenueK > 0 || overflowRevenueK > 0 ? <i className="is-danger" title={`Poza ramką +${frameOverflowRevenueK || overflowRevenueK}k`} /> : null}
          {riskCount ? <i className="is-danger" title={`${riskCount} ostrzeżeń`} /> : null}
          {positiveCount ? <i className="is-positive" title={`${positiveCount} dobrych sygnałów`} /> : null}
        </div>

        {skillZoneSlots.length ? (
          <div className="diablo-skill-zone-map" aria-label={`Strefy skillowe projektu ${project.client}`}>
            {skillZoneSlots.map(({ slotIndex, zone, isZoneStart }) => {
              const slotColumn = (slotIndex % layout.width) + 1;
              const slotRow = Math.floor(slotIndex / layout.width) + 1;

              return (
                <DropZone
                  className={`diablo-skill-zone is-${zone.isCovered ? 'covered' : 'open'} is-skill-${zone.skillId} ${isZoneStart ? 'is-zone-start' : ''}`}
                  dropOptions={{ requirementId: zone.requirementId, projectSlotIndex: slotIndex }}
                  key={`${zone.requirementId}-${slotIndex}`}
                  periodId={periodId}
                  style={{
                    gridColumn: slotColumn,
                    gridRow: slotRow,
                    '--diablo-skill-color': zone.color,
                  } as SkillZoneStyle}
                  target={project.id}
                  onDropPayload={onDropPayload}
                >
                  {isZoneStart ? <span>{zone.skillLabel}</span> : null}
                </DropZone>
              );
            })}
          </div>
        ) : null}

        <div
          className="diablo-inventory-grid"
          aria-label={`${project.client}: ${canvasSlotCount} pól inventory, ${visibleSlots.length} zajętych`}
        >
          {Array.from({ length: canvasSlotCount }, (_, slotIndex) => {
            const inventorySlot = inventorySlots[slotIndex];
            const allocation = inventorySlot?.allocation;
            const slotZone = inventorySlot?.zone;
            const skillZoneClassName = slotZone ? `has-skill-zone is-skill-${slotZone.skillId}` : '';
            const skillZoneStyle = slotZone
              ? { '--diablo-skill-color': slotZone.color } as SkillZoneStyle
              : undefined;

            if (!allocation) {
              return (
                <div
                  aria-label={slotIndex >= frameCapacityCellCount ? 'Pole poza budżetem projektu' : slotZone ? `Wolny slot projektu: ${slotZone.skillLabel}` : 'Wolny slot projektu'}
                  className={`diablo-inventory-cell ${slotIndex >= frameCapacityCellCount ? 'is-padding' : 'is-empty'} ${skillZoneClassName}`}
                  data-skill-zone={slotZone?.skillId}
                  key={`slot-${slotIndex}`}
                  role="img"
                  style={skillZoneStyle}
                />
              );
            }

            const person = peopleById.get(allocation.personId);
            if (!person) {
              return (
                <div
                  aria-label="Alokacja bez osoby"
                  className={`diablo-inventory-cell is-missing ${skillZoneClassName}`}
                  data-skill-zone={slotZone?.skillId}
                  key={allocation.id}
                  role="img"
                  style={skillZoneStyle}
                />
              );
            }

            return (
                <DiabloPersonInventoryTile
                  allocation={allocation}
                  className={`diablo-inventory-person-tile ${isWeeklyDisplayAllocation(allocation) ? 'is-weekly-slot' : ''} ${personClusterClasses.get(allocation.personId) || ''} ${getPersonHighlightClassName(allocation.personId, highlightedPersonId)}`}
                  key={allocation.id}
                  person={person}
                  project={project}
                  skillZone={slotZone}
                  costCoverage={costCoverageByPersonId.get(allocation.personId)}
                  frameTypeLabel={frameTypeLabel}
                  skillsById={skillsById}
                  tileMetricMode={tileMetricMode}
                  isSelected={selectedAllocationIds.has(allocation.id)}
                  onTileClick={onTileClick}
                  onTileDragStart={onTileDragStart}
                />
            );
          })}
        </div>

        {projectInventoryPatterns.length || frameOverflow.length ? (
          <div className="diablo-project-frame-footer">
            {projectInventoryPatterns.length ? (
              <div className="diablo-project-inventory-badges" aria-label={`Patterny projektu ${project.client}`}>
                {visibleProjectInventoryPatterns.map((pattern) => (
                  <span
                    aria-label={`${getProjectInventoryPatternCode(pattern.kind)}: ${pattern.label}. ${pattern.detail}`}
                    className={getProjectInventoryPatternClassName(pattern.kind)}
                    key={pattern.kind}
                    title={`${pattern.label}: ${pattern.detail}`}
                  >
                    {getProjectInventoryPatternCode(pattern.kind)}
                  </span>
                ))}
                {hiddenProjectInventoryPatterns.length ? (
                  <span
                    aria-label={`${hiddenProjectInventoryPatterns.length} dodatkowe patterny projektu: ${hiddenProjectInventoryPatterns.map((pattern) => pattern.label).join(', ')}`}
                    className="is-more"
                    title={hiddenProjectInventoryPatterns.map((pattern) => `${pattern.label}: ${pattern.detail}`).join('\n')}
                  >
                    +{hiddenProjectInventoryPatterns.length}
                  </span>
                ) : null}
              </div>
            ) : null}

            {frameOverflow.length ? (
              <div className="diablo-project-overflow-strip" aria-label={`Poza ramką ${frameOverflowRevenueK}k`}>
                {frameOverflow.slice(0, 12).map((allocation) => {
                  const person = peopleById.get(allocation.personId);
                  if (!person) return null;

                  return (
                    <DiabloPersonInventoryTile
                      allocation={allocation}
                      className={`diablo-overflow-person-tile ${isWeeklyDisplayAllocation(allocation) ? 'is-weekly-slot' : ''} ${getPersonHighlightClassName(allocation.personId, highlightedPersonId)}`}
                      key={allocation.id}
                      person={person}
                      project={project}
                      costCoverage={costCoverageByPersonId.get(allocation.personId)}
                      frameTypeLabel={frameTypeLabel}
                      skillsById={skillsById}
                      tileMetricMode={tileMetricMode}
                      isSelected={selectedAllocationIds.has(allocation.id)}
                      onTileClick={onTileClick}
                      onTileDragStart={onTileDragStart}
                    />
                  );
                })}
                {frameOverflow.length > 12 ? <span>+{frameOverflow.length - 12}</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {isSelected ? (
          <button
            aria-label={`Zmień rozmiar ramki projektu ${project.client} - ${project.name}`}
            className="diablo-frame-resize-handle"
            title="Przeciągnij, żeby zmienić zakres projektu"
            type="button"
            onPointerDown={(event) => onResizePointerDown(event, project.id)}
          />
        ) : null}
      </article>
    </DropZone>
  );
}

interface ProjectInventorySlot {
  allocation?: PersonTileAllocation;
  zone?: ProjectSkillZone;
}

function splitWeeklyAllocationsBySlotLimit(allocations: PersonTileAllocation[], slotLimit: number) {
  const normalizedSlotLimit = Math.max(0, Math.floor(slotLimit));
  const slots = Array.from<PersonTileAllocation | null>({ length: normalizedSlotLimit }).fill(null);
  const unplacedAllocations: PersonTileAllocation[] = [];
  const overflow: PersonTileAllocation[] = [];

  allocations.forEach((allocation) => {
    const manualSlotIndex = typeof allocation.projectSlotIndex === 'number'
      ? Math.floor(allocation.projectSlotIndex)
      : null;
    if (
      manualSlotIndex !== null &&
      manualSlotIndex >= 0 &&
      manualSlotIndex < normalizedSlotLimit &&
      !slots[manualSlotIndex]
    ) {
      slots[manualSlotIndex] = allocation;
      return;
    }

    unplacedAllocations.push(allocation);
  });

  unplacedAllocations.forEach((allocation) => {
    const openSlotIndex = slots.findIndex((slot) => slot === null);
    if (openSlotIndex === -1) {
      overflow.push(allocation);
      return;
    }

    slots[openSlotIndex] = allocation;
  });

  const visible = slots.filter((allocation): allocation is PersonTileAllocation => Boolean(allocation));

  return {
    visible,
    overflow,
    visibleRevenueK: visible.reduce((sum, allocation) => sum + getAllocationRevenueK(allocation), 0),
    overflowRevenueK: overflow.reduce((sum, allocation) => sum + getAllocationRevenueK(allocation), 0),
  };
}

interface ProjectInventorySlotsInput {
  allocatableSlotCount: number;
  canvasSlotCount: number;
  skillZoneSlots: ProjectSkillZoneSlot[];
  visibleSlots: PersonTileAllocation[];
}

function getProjectInventorySlots({
  allocatableSlotCount,
  canvasSlotCount,
  skillZoneSlots,
  visibleSlots,
}: ProjectInventorySlotsInput): ProjectInventorySlot[] {
  const slots = Array.from({ length: canvasSlotCount }, () => ({} as ProjectInventorySlot));
  const validSlotIndexes = Array.from(
    { length: Math.max(0, Math.min(allocatableSlotCount, canvasSlotCount)) },
    (_, index) => index
  );
  const zoneSlotIndexesByRequirementId = new Map<string, number[]>();

  skillZoneSlots.forEach(({ slotIndex, zone }) => {
    if (!validSlotIndexes.includes(slotIndex)) return;
    slots[slotIndex].zone = zone;
    const zoneSlots = zoneSlotIndexesByRequirementId.get(zone.requirementId) || [];
    zoneSlots.push(slotIndex);
    zoneSlotIndexesByRequirementId.set(zone.requirementId, zoneSlots);
  });

  const unplacedAllocations: PersonTileAllocation[] = [];
  const zoneMappedAllocations: PersonTileAllocation[] = [];

  visibleSlots.forEach((allocation) => {
    const manualSlotIndex = typeof allocation.projectSlotIndex === 'number'
      ? allocation.projectSlotIndex
      : undefined;
    if (
      typeof manualSlotIndex === 'number' &&
      manualSlotIndex >= 0 &&
      manualSlotIndex < validSlotIndexes.length &&
      !slots[manualSlotIndex]?.allocation
    ) {
      slots[manualSlotIndex].allocation = allocation;
      return;
    }

    zoneMappedAllocations.push(allocation);
  });

  zoneMappedAllocations.forEach((allocation) => {
    const requestedZoneSlots = allocation.requirementId
      ? zoneSlotIndexesByRequirementId.get(allocation.requirementId)
      : undefined;
    const requestedSlotIndex = takeFirstOpenSlot(requestedZoneSlots, slots);

    if (requestedSlotIndex !== null) {
      slots[requestedSlotIndex].allocation = allocation;
      return;
    }

    unplacedAllocations.push(allocation);
  });

  unplacedAllocations.forEach((allocation) => {
    const slotIndex = takeFirstOpenSlot(validSlotIndexes, slots);
    if (slotIndex !== null) slots[slotIndex].allocation = allocation;
  });

  return slots;
}

function takeFirstOpenSlot(
  slotIndexes: number[] | undefined,
  slots: ProjectInventorySlot[]
) {
  const slotIndex = slotIndexes?.find((index) => !slots[index]?.allocation);
  return typeof slotIndex === 'number' ? slotIndex : null;
}

interface DiabloPersonInventoryTileProps {
  allocation: PersonTileAllocation;
  className: string;
  frameTypeLabel: string;
  isSelected: boolean;
  person: Person;
  project: ProjectFrame;
  skillZone?: ProjectSkillZone;
  costCoverage?: PersonCostCoverageSummary;
  skillsById: Map<string, Skill>;
  tileMetricMode: TileMetricDisplayMode;
  onTileClick: (event: ReactMouseEvent<HTMLButtonElement>, allocationId: string) => void;
  onTileDragStart: (event: React.DragEvent, payload: DragPayload) => void;
}

function DiabloPersonInventoryTile({
  allocation,
  className,
  frameTypeLabel,
  isSelected,
  person,
  project,
  skillZone,
  costCoverage,
  skillsById,
  tileMetricMode,
  onTileClick,
  onTileDragStart,
}: DiabloPersonInventoryTileProps) {
  const layer = getTileLayer(person, allocation.tileIndex, allocation.periodId);
  const warningCount = (allocation.validation || []).filter((validation) => validation.severity !== 'info').length;
  const positiveCountForTile = (allocation.validation || []).filter((validation) => validation.severity === 'info').length;
  const seniorityCode = getSeniorityCode(person);
  const skillCode = getSkillCode(allocation.skillId || person.skillIds[0], skillsById);
  const costCoverageState = getProjectTileCostCoverageState(project, allocation, costCoverage);
  const costBasis = isWeeklyDisplayAllocation(allocation) ? 'internal-hours' : 'cost-capacity';
  const metric = getAllocationMetricDisplay(allocation, person, tileMetricMode, {
    costBasis,
  });
  const tileLabel = `${person.name}: ${metric.ariaDetail}, ${allocation.revenueK}k revenue/capacity${tileMetricMode === 'cost' ? `, ${allocation.hours}h` : ''}, ${frameTypeLabel}, ${getContractTypeLabel(project.contractType)}, ${getStageLabel(project.stage)}${project.planningStatus ? `, ${getProjectPlanningStatusLabel(project.planningStatus)}` : ''}, ${getProjectWorkTypeLabel(project.workType || 'commercial')}${getProjectTileCostCoverageLabel(costCoverageState)}${skillCode ? `, skill ${skillCode}` : ''}${seniorityCode ? `, seniority ${seniorityCode}` : ''}`;
  const tileStyle = {
    '--diablo-person-color': person.color,
    ...(skillZone ? { '--diablo-skill-color': skillZone.color } : {}),
  } as PersonTileStyle;

  return (
    <button
      aria-label={`${tileLabel}. ${isSelected ? 'Zaznaczony do przeniesienia grupowego.' : 'Kliknij, żeby edytować alokację. Shift+klik zaznacza do przeniesienia grupowego.'}`}
      aria-pressed={isSelected}
      className={`${className} ${skillZone ? `has-skill-zone is-skill-${skillZone.skillId}` : ''} ${warningCount ? 'has-warning' : ''} ${positiveCountForTile && !warningCount ? 'has-positive' : ''} ${isSelected ? 'is-multi-selected' : ''}`}
      data-collaboration-target-id={allocation.id}
      data-collaboration-target-label={`${person.name} · ${project.client}`}
      data-collaboration-target-type="allocation"
      data-cost-coverage={costCoverageState}
      data-layer={layer}
      data-skill-zone={skillZone?.skillId}
      draggable
      style={tileStyle}
      tabIndex={-1}
      title={tileLabel}
      type="button"
      onClick={(event) => onTileClick(event, allocation.id)}
      onDragStart={(event) => {
        event.stopPropagation();
        onTileDragStart(event, { type: 'tile', tileId: allocation.id });
      }}
    >
      <span className="diablo-tile-initials">{person.initials}</span>
      {skillCode || seniorityCode ? (
        <span className="diablo-tile-micro-badges" aria-hidden="true">
          {skillCode ? <small>{skillCode}</small> : null}
          {seniorityCode ? <small>{seniorityCode}</small> : null}
        </span>
      ) : null}
      <span className="diablo-tile-metric-value">{metric.shortLabel}</span>
    </button>
  );
}

function isWeeklyDisplayAllocation(allocation: Pick<PersonTileAllocation, 'id'>) {
  return allocation.id.startsWith('weekly:') || allocation.id.startsWith('weekly-free:');
}

function getProjectTileCostCoverageState(
  project: ProjectFrame,
  allocation: PersonTileAllocation,
  costCoverage: PersonCostCoverageSummary | undefined
): ProjectTileCostCoverageState {
  if (isTimeOffProject(project)) return 'time-off';
  if (!projectCountsForPersonCostCoverage(project)) return 'non-covering';
  if (!costCoverage || costCoverage.periodCostK <= 0) return 'pending';

  const isFullyCoveredByCommercialProjects = (
    costCoverage.coveredCostK + MONEY_EPSILON_K >= costCoverage.periodCostK &&
    costCoverage.uncoveredCostK <= MONEY_EPSILON_K &&
    costCoverage.benchRevenueK <= MONEY_EPSILON_K &&
    costCoverage.nonCoveringCostK <= MONEY_EPSILON_K
  );
  const coversThisAllocation = costCoverage.projectSegments.some((segment) => (
    segment.allocationIds.includes(allocation.id)
  ));

  return isFullyCoveredByCommercialProjects && coversThisAllocation ? 'covered' : 'pending';
}

function getProjectTileCostCoverageLabel(state: ProjectTileCostCoverageState) {
  switch (state) {
    case 'covered':
      return ', pełne komercyjne pokrycie kosztu osoby';
    case 'non-covering':
      return ', poza pokryciem kosztu osoby';
    case 'time-off':
      return ', urlop poza przychodem';
    default:
      return ', komercyjny kafelek, ale osoba nie ma jeszcze pełnego pokrycia kosztu';
  }
}

function getSkillCode(skillId: SkillId | undefined, skillsById: Map<string, Skill>) {
  if (!skillId) return null;
  return getVisualSkillGlyph(skillId, skillsById.get(skillId)?.label);
}

function getSeniorityCode(person: Person) {
  if (person.seniority === 'junior') return 'Jr';
  if (person.seniority === 'mid') return 'Mid';
  if (person.seniority === 'senior') return 'Sr';
  if (person.seniority === 'lead') return 'Lead';
  return null;
}

function getPersonHighlightClassName(personId: string, highlightedPersonId: string | null) {
  if (!highlightedPersonId) return '';
  return highlightedPersonId === personId ? 'is-person-highlighted' : 'is-person-muted';
}

function getPersonClusterClasses(allocations: PersonTileAllocation[]) {
  const classesByPersonId = new Map<string, string[]>();

  allocations.forEach((allocation) => {
    const classes = classesByPersonId.get(allocation.personId) || [];
    if (allocation.previousTarget && allocation.previousTarget !== allocation.target) classes.push('has-cluster-changed');
    if (allocation.meetingState?.changedThisWeek) classes.push('has-cluster-changed');
    if (allocation.meetingState?.handoffRequired) classes.push('has-cluster-handoff');
    if (allocation.meetingState?.planB) classes.push('has-cluster-plan-b');
    if (allocation.meetingState?.mentoring) classes.push('has-cluster-mentoring');
    if (allocation.meetingState?.backup) classes.push('has-cluster-backup');
    classesByPersonId.set(allocation.personId, classes);
  });

  return new Map(
    Array.from(classesByPersonId.entries()).map(([personId, classNames]) => [
      personId,
      Array.from(new Set(classNames)).join(' '),
    ])
  );
}
