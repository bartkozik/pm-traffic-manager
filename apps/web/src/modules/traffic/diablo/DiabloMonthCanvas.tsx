import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { TrafficTooltip } from '../components/TrafficTooltip';
import { DragPayload, DropPayloadOptions } from '../components/types';
import type { HelpTopicId } from '../help/helpContent';
import {
  getTileLayer,
  type MonthPlanPasteMode,
  type Period,
  type Person,
  type PersonTileAllocation,
  type ProjectFrame,
  type Skill,
} from '../models/traffic.model';
import { getPersonPeriodCostK, getPersonPeriodLayers } from '../utils/personPeriod';
import type { TileMetricDisplayMode } from '../utils/tileMetricDisplay';
import { DiabloFloatingPanels } from './DiabloFloatingPanels';
import { DiabloPersonFrame } from './DiabloPersonFrame';
import { DiabloProjectFrame } from './DiabloProjectFrame';
import {
  DIABLO_MIN_FRAME_HEIGHT,
  DIABLO_MIN_FRAME_WIDTH,
  DIABLO_PERSON_FRAME_HEADER_ROWS,
  DiabloBoardLayout,
  DiabloCanvasGrowth,
  DiabloCanvasSize,
  DiabloCanvasZoneId,
  DiabloPersonLayout,
  DiabloProjectLayout,
  DiabloSelection,
  arrangeDiabloPersonLayoutsInGrid,
  arrangeDiabloProjectPeopleLayouts,
  arrangeDiabloProjectLayoutsInGrid,
  clampPointToDiabloZone,
  clampSelectionToDiabloZone,
  clampCanvasStart,
  getDiabloCanvasZoneForPoint,
  getDiabloCanvasSize,
  getDiabloPanelGridSpan,
  getDiabloPeopleZoneColumns,
  getProjectPeriodRevenueK,
  growDiabloCanvasLayout,
  normalizeSelection,
  snapPersonFrameLayout,
  snapProjectFrameLayout,
} from './diabloLayout';

const DIABLO_CELL_SIZE = 48;
const DIABLO_CELL_GAP = 6;
const DIABLO_INTERACTION_GROWTH_BUFFER = 2;
const DIABLO_CONTROL_PANEL_VIEWPORT_GUTTER = 8;
const DIABLO_CONTROL_PANEL_COLLISION_GAP = 8;
const DIABLO_CONTROL_PANEL_MIN_VISIBLE_RANGE = 96;
const DIABLO_PEOPLE_CONTROL_PANEL_FALLBACK_WIDTH = 360;
const DIABLO_PROJECT_CONTROL_PANEL_FALLBACK_WIDTH = 460;
const DIABLO_PERSON_DETAILS_OVERLAY_DIM_ROWS = 4;
const DIABLO_MIN_ZOOM = 0.1;
const DIABLO_MIN_READABLE_FIT_ZOOM = 0.55;
const DIABLO_MAX_ZOOM = 2;
const DIABLO_DEFAULT_ZOOM = 1;
const DIABLO_OVERVIEW_GUTTER = 12;
const DIABLO_PROJECT_OVERVIEW_MIN_VISIBLE_WIDTH = 160;
const DIABLO_PROJECT_OVERVIEW_MIN_VISIBLE_HEIGHT = 80;
// Wheel/pinch zoom step buttons multiply the scale by this factor.
const DIABLO_ZOOM_BUTTON_FACTOR = 1.2;
// Pinch (ctrl/⌘ + wheel) sensitivity; higher = faster zoom per wheel delta.
const DIABLO_PINCH_SENSITIVITY = 0.0125;
const DIABLO_PERSON_FRAME_POINTER_EXCLUDED_SELECTOR = [
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

export type DiabloCanvasTool = 'create' | 'move';
type DiabloLayoutSyncScope = 'shared' | 'local';
type AllocationResetScope = 'month' | 'week';

type Interaction =
  | {
      type: 'move-frame';
      projectId: string;
      start: GridPoint;
      origin: DiabloProjectLayout;
    }
  | {
      type: 'move-person-frame';
      personId: string;
      projectDropOnly?: boolean;
      start: GridPoint;
      origin: DiabloPersonLayout;
    }
  | {
      type: 'resize-frame';
      projectId: string;
      start: GridPoint;
      origin: DiabloProjectLayout;
    }
  | {
      type: 'move-panel';
      panelId: 'legend';
      start: GridPoint;
      origin: { x: number; y: number };
    }
  | {
      type: 'selection';
      start: GridPoint;
      current: GridPoint;
      zone: DiabloCanvasZoneId;
    }
  | {
      type: 'pan-canvas';
      start: GridPoint;
    };

interface GridPoint {
  x: number;
  y: number;
}

interface ViewportTransform {
  scale: number;
  panX: number;
  panY: number;
}

interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasPixelBounds {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface ScreenRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

type CanvasGridStyle = CSSProperties & {
  '--diablo-cell': string;
  '--diablo-gap': string;
  '--diablo-pitch': string;
  '--diablo-major-pitch': string;
  '--diablo-canvas-zoom': number;
  '--diablo-grid-columns': number;
  '--diablo-grid-rows': number;
};

type CanvasScaleShellStyle = CSSProperties & {
  '--diablo-visual-pitch': string;
  '--diablo-visual-major-pitch': string;
};

type PeopleZoneBackdropStyle = CSSProperties & {
  '--diablo-people-zone-pitch': string;
  '--diablo-people-zone-major-pitch': string;
  '--diablo-people-zone-y': string;
};

type ProjectZoneBackdropStyle = CSSProperties & {
  '--diablo-project-zone-pitch': string;
  '--diablo-project-zone-major-pitch': string;
  '--diablo-project-zone-y': string;
};

type ToolIslandStyle = CSSProperties & {
  '--diablo-tool-island-center-x': string;
};

type PeopleControlPanelStyle = CSSProperties & {
  '--diablo-people-control-panel-right-x': string;
  '--diablo-people-control-panel-top': string;
};

type ProjectControlPanelStyle = CSSProperties & {
  '--diablo-project-control-panel-left-x': string;
  '--diablo-project-control-panel-top': string;
};

interface ScrollProxyState {
  hasOverflow: boolean;
}

interface PeopleControlPanelPosition {
  isVisible: boolean;
  rightX: number;
  top: number;
}

interface ProjectControlPanelPosition {
  isVisible: boolean;
  leftX: number;
  top: number;
}

interface ControlPanelsLayout {
  people: PeopleControlPanelPosition;
  projects: ProjectControlPanelPosition;
}

interface PersonFrameDragPreview {
  layout: DiabloPersonLayout;
  personId: string;
}

export interface DiabloMonthClipboardPreview {
  mode: MonthPlanPasteMode;
  sourcePeriodId: string;
  sourcePeriodLabel: string;
}

interface DiabloToolbarFeedback {
  id: number;
  panel: 'people' | 'projects';
  message: string;
}

interface DiabloMonthCanvasProps {
  activePeople: Person[];
  allAllocations: PersonTileAllocation[];
  benchAllocations: PersonTileAllocation[];
  layout: DiabloBoardLayout;
  peopleById: Map<string, Person>;
  period: Period;
  periodAllocations: PersonTileAllocation[];
  periods: Period[];
  projects: ProjectFrame[];
  projectsById: Map<string, ProjectFrame>;
  skillsById: Map<string, Skill>;
  tileMetricMode?: TileMetricDisplayMode;
  canvasTool: DiabloCanvasTool;
  monthClipboard: DiabloMonthClipboardPreview | null;
  hiddenProjectCount?: number;
  onCopyPeopleWithAllocations: () => void;
  onCopyPeopleWithoutAllocations: () => void;
  onCopyProjectsWithoutAllocations: () => void;
  onCreatePerson: () => void;
  onCreatePersonFromSelection: (selection: DiabloSelection) => void;
  onCreateProjectFromSelection: (selection: DiabloSelection) => void;
  onCycleWorkType: (project: ProjectFrame) => void;
  onDropPayload: (payload: DragPayload, target: string, periodId: string, options?: DropPayloadOptions) => void;
  onEditPerson: (personId: string) => void;
  onEditProject: (projectId: string) => void;
  onLayoutChange: (layout: DiabloBoardLayout, syncScope?: DiabloLayoutSyncScope) => void;
  onOpenAllocation: (allocationId: string) => void;
  onOpenHelp: (topicId: HelpTopicId) => void;
  onOpenHiddenProjects: () => void;
  onPastePeopleClipboard: (targetPeriodId: string) => boolean | void;
  onPasteProjectsClipboard: (targetPeriodId: string) => boolean | void;
  allowPersonFrameProjectDrop?: boolean;
  personProjectDragPersonIds?: Set<string>;
  onPersonDragStart: (event: React.DragEvent, payload: DragPayload) => void;
  onResetLayout: () => void;
  onResetPersonAllocations: (personId: string) => void;
  onResetProjectAllocations: () => void;
  allocationResetScope?: AllocationResetScope;
  onClearMonthPlan: () => void;
  onCanvasToolChange: (tool: DiabloCanvasTool) => void;
  onArchiveProject: (projectId: string, periodId: string) => void;
  onTileDragStart: (event: React.DragEvent, payload: DragPayload) => void;
  onDeleteProject: (projectId: string) => void;
  onProjectFrameResize: (projectId: string, layout: DiabloProjectLayout) => void;
  pendingArchiveProjectKey: string | null;
  pendingDeleteProjectId: string | null;
}

export function DiabloMonthCanvas({
  activePeople,
  allAllocations,
  benchAllocations,
  layout,
  peopleById,
  period,
  periodAllocations,
  periods,
  projects,
  projectsById,
  skillsById,
  tileMetricMode = 'hours',
  canvasTool,
  monthClipboard,
  onCopyPeopleWithAllocations,
  onCopyPeopleWithoutAllocations,
  onCopyProjectsWithoutAllocations,
  onCreatePerson,
  onCreatePersonFromSelection,
  onCreateProjectFromSelection,
  onCycleWorkType,
  onDropPayload,
  onEditPerson,
  onEditProject,
  onLayoutChange,
  onOpenAllocation,
  onOpenHelp,
  onOpenHiddenProjects,
  onPastePeopleClipboard,
  onPasteProjectsClipboard,
  allowPersonFrameProjectDrop = false,
  personProjectDragPersonIds,
  onPersonDragStart,
  onResetLayout,
  onResetPersonAllocations,
  onResetProjectAllocations,
  allocationResetScope = 'month',
  onClearMonthPlan,
  onCanvasToolChange,
  onArchiveProject,
  onTileDragStart,
  onDeleteProject,
  onProjectFrameResize,
  pendingArchiveProjectKey,
  pendingDeleteProjectId,
  hiddenProjectCount = 0,
}: DiabloMonthCanvasProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const peopleZoneBackdropRef = useRef<HTMLDivElement | null>(null);
  const projectZoneBackdropRef = useRef<HTMLDivElement | null>(null);
  const peopleControlPanelRef = useRef<HTMLDivElement | null>(null);
  const projectControlPanelRef = useRef<HTMLDivElement | null>(null);
  const peopleCopyMenuRef = useRef<HTMLDetailsElement | null>(null);
  const toolIslandRef = useRef<HTMLDivElement | null>(null);
  // Source-of-truth viewport transform, mutated synchronously by gesture handlers.
  const viewRef = useRef<ViewportTransform>({ scale: DIABLO_DEFAULT_ZOOM, panX: 0, panY: 0 });
  // Mirror used for render-time reads (zoom %, grid metrics, panel placement).
  // Committed only once a gesture settles so the heavy frame tree isn't
  // reconciled on every pan/zoom frame.
  const [view, setView] = useState<ViewportTransform>(viewRef.current);
  const viewCommitTimerRef = useRef<number | null>(null);
  const spaceHeldRef = useRef(false);
  const panPointerRef = useRef<GridPoint | null>(null);
  const suppressCanvasReframeUntilRef = useRef(0);
  const hasUserPositionedViewportRef = useRef(false);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedAllocationIds, setSelectedAllocationIds] = useState<string[]>([]);
  const [scrollProxy, setScrollProxy] = useState<ScrollProxyState>({ hasOverflow: false });
  const [toolIslandCenterX, setToolIslandCenterX] = useState<number | null>(null);
  const [peopleControlPanelPosition, setPeopleControlPanelPosition] = useState<PeopleControlPanelPosition | null>(null);
  const [projectControlPanelPosition, setProjectControlPanelPosition] = useState<ProjectControlPanelPosition | null>(null);
  const [highlightedPersonId, setHighlightedPersonId] = useState<string | null>(null);
  const [activeDragPayload, setActiveDragPayload] = useState<DragPayload | null>(null);
  const [personFrameDropProjectId, setPersonFrameDropProjectId] = useState<string | null>(null);
  const [personFrameDragPreview, setPersonFrameDragPreview] = useState<PersonFrameDragPreview | null>(null);
  const [expandedPersonDetailsId, setExpandedPersonDetailsId] = useState<string | null>(null);
  const [toolbarFeedback, setToolbarFeedback] = useState<DiabloToolbarFeedback | null>(null);
  const [clearMonthConfirmationPending, setClearMonthConfirmationPending] = useState(false);
  const [projectAllocationResetConfirmationPending, setProjectAllocationResetConfirmationPending] = useState(false);
  const selectedAllocationIdSet = useMemo(() => new Set(selectedAllocationIds), [selectedAllocationIds]);
  const isClipboardFromCurrentPeriod = monthClipboard?.sourcePeriodId === period.id;
  const canPastePeopleClipboard = Boolean(
    monthClipboard &&
    !isClipboardFromCurrentPeriod &&
    (monthClipboard.mode === 'people_with_allocations' || monthClipboard.mode === 'people_without_allocations')
  );
  const canPasteProjectsClipboard = Boolean(
    monthClipboard &&
    !isClipboardFromCurrentPeriod &&
    monthClipboard.mode === 'projects_without_allocations'
  );
  const peopleClipboardSourceLabel = canPastePeopleClipboard && monthClipboard
    ? `z: ${monthClipboard.sourcePeriodLabel}`
    : null;
  const projectsClipboardSourceLabel = canPasteProjectsClipboard && monthClipboard
    ? `z: ${monthClipboard.sourcePeriodLabel}`
    : null;
  const peoplePasteTitle = getClipboardPasteTitle(monthClipboard, canPastePeopleClipboard, 'ludzi');
  const projectsPasteTitle = getClipboardPasteTitle(monthClipboard, canPasteProjectsClipboard, 'projektów');
  const hasProjectAllocations = useMemo(
    () => periodAllocations.some((allocation) => allocation.target !== 'bench' && projectsById.has(allocation.target)),
    [periodAllocations, projectsById]
  );
  const periodAllocationsById = useMemo(
    () => new Map(periodAllocations.map((allocation) => [allocation.id, allocation])),
    [periodAllocations]
  );
  const canvasSize = useMemo(() => getDiabloCanvasSize(layout), [layout]);
  const peopleZoneColumns = getDiabloPeopleZoneColumns(layout);
  const canvasZoomMetrics = useMemo(() => getCanvasZoomMetrics(view.scale), [view.scale]);
  const canvasZoomPercent = Math.round(canvasZoomMetrics.zoom * 100);
  const isMinCanvasZoom = view.scale <= DIABLO_MIN_ZOOM + 1e-3;
  const isMaxCanvasZoom = view.scale >= DIABLO_MAX_ZOOM - 1e-3;
  const canvasBasePixelWidth = useMemo(
    () => getGridPixelSize(canvasSize.columns),
    [canvasSize.columns]
  );
  const canvasBasePixelHeight = useMemo(
    () => getGridPixelSize(canvasSize.rows),
    [canvasSize.rows]
  );
  const canvasScaleShellStyle = useMemo(() => ({
    width: formatPixelValue(canvasBasePixelWidth),
    height: formatPixelValue(canvasBasePixelHeight),
    transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.scale})`,
    '--diablo-visual-pitch': formatPixelValue(canvasZoomMetrics.basePitch),
    '--diablo-visual-major-pitch': formatPixelValue(canvasZoomMetrics.basePitch * 4),
  }) as CanvasScaleShellStyle, [
    canvasBasePixelHeight,
    canvasBasePixelWidth,
    canvasZoomMetrics.basePitch,
    view.panX,
    view.panY,
    view.scale,
  ]);
  const canvasCardContentBounds = useMemo(() => (
    getCanvasCardContentPixelBounds(layout, {
      personIds: new Set(activePeople.map((person) => person.id)),
      projectIds: new Set(projects.map((project) => project.id)),
    })
  ), [activePeople, layout, projects]);
  const canvasProjectContentBounds = useMemo(() => (
    getCanvasProjectContentPixelBounds(layout, new Set(projects.map((project) => project.id)))
  ), [layout, projects]);
  const canvasGridStyle = useMemo(() => ({
    width: formatPixelValue(canvasBasePixelWidth),
    height: formatPixelValue(canvasBasePixelHeight),
    minWidth: formatPixelValue(canvasBasePixelWidth),
    minHeight: formatPixelValue(canvasBasePixelHeight),
    gridTemplateColumns: `repeat(${canvasSize.columns}, var(--diablo-cell))`,
    gridTemplateRows: `repeat(${canvasSize.rows}, var(--diablo-cell))`,
    '--diablo-cell': formatPixelValue(DIABLO_CELL_SIZE),
    '--diablo-gap': formatPixelValue(DIABLO_CELL_GAP),
    '--diablo-pitch': formatPixelValue(canvasZoomMetrics.basePitch),
    '--diablo-major-pitch': formatPixelValue(canvasZoomMetrics.basePitch * 4),
    '--diablo-canvas-zoom': canvasZoomMetrics.zoom,
    '--diablo-grid-columns': canvasSize.columns,
    '--diablo-grid-rows': canvasSize.rows,
  }) as CanvasGridStyle, [
    canvasBasePixelHeight,
    canvasBasePixelWidth,
    canvasSize.columns,
    canvasSize.rows,
    canvasZoomMetrics.basePitch,
    canvasZoomMetrics.zoom,
  ]);
  const toolIslandStyle = useMemo(() => ({
    '--diablo-tool-island-center-x': toolIslandCenterX === null ? '50vw' : `${toolIslandCenterX}px`,
  }) as ToolIslandStyle, [toolIslandCenterX]);
  const peopleControlPanelStyle = useMemo(() => ({
    '--diablo-people-control-panel-right-x': peopleControlPanelPosition === null
      ? 'calc(100vw - 12px)'
      : `${peopleControlPanelPosition.rightX}px`,
    '--diablo-people-control-panel-top': peopleControlPanelPosition === null
      ? '12px'
      : `${peopleControlPanelPosition.top}px`,
  }) as PeopleControlPanelStyle, [peopleControlPanelPosition]);
  const projectControlPanelStyle = useMemo(() => ({
    '--diablo-project-control-panel-left-x': projectControlPanelPosition === null
      ? '12px'
      : `${projectControlPanelPosition.leftX}px`,
    '--diablo-project-control-panel-top': projectControlPanelPosition === null
      ? '12px'
      : `${projectControlPanelPosition.top}px`,
  }) as ProjectControlPanelStyle, [projectControlPanelPosition]);
  const isPeopleControlPanelHidden = peopleControlPanelPosition?.isVisible === false;
  const isProjectControlPanelHidden = projectControlPanelPosition?.isVisible === false;
  const canvasInteractionClassName = `is-tool-${canvasTool} ${interaction ? `is-${interaction.type}` : ''}`;
  const projectZoneBaseLeft = peopleZoneColumns * canvasZoomMetrics.basePitch;
  const peopleZoneBackdropStyle = useMemo(() => ({
    left: formatPixelValue(view.panX),
    width: formatPixelValue(getGridPixelSize(peopleZoneColumns) * view.scale),
    '--diablo-people-zone-pitch': formatPixelValue(canvasZoomMetrics.pitch),
    '--diablo-people-zone-major-pitch': formatPixelValue(canvasZoomMetrics.pitch * 4),
    '--diablo-people-zone-y': formatPixelValue(view.panY),
  }) as PeopleZoneBackdropStyle, [
    canvasZoomMetrics.pitch,
    peopleZoneColumns,
    view.panX,
    view.panY,
    view.scale,
  ]);
  const projectZoneBackdropStyle = useMemo(() => ({
    left: formatPixelValue(view.panX + projectZoneBaseLeft * view.scale),
    width: formatPixelValue(Math.max(0, canvasBasePixelWidth - projectZoneBaseLeft) * view.scale),
    '--diablo-project-zone-pitch': formatPixelValue(canvasZoomMetrics.pitch),
    '--diablo-project-zone-major-pitch': formatPixelValue(canvasZoomMetrics.pitch * 4),
    '--diablo-project-zone-y': formatPixelValue(view.panY),
  }) as ProjectZoneBackdropStyle, [
    canvasBasePixelWidth,
    canvasZoomMetrics.pitch,
    projectZoneBaseLeft,
    view.panX,
    view.panY,
    view.scale,
  ]);
  const expandedPersonDetailsLayout = expandedPersonDetailsId ? layout.people?.[expandedPersonDetailsId] || null : null;
  const handlePersonDetailsExpandedChange = useCallback((personId: string, isExpanded: boolean) => {
    setExpandedPersonDetailsId((currentPersonId) => {
      if (isExpanded) return currentPersonId === personId ? currentPersonId : personId;
      return currentPersonId === personId ? null : currentPersonId;
    });
  }, []);
  const isPersonCoveredByExpandedDetails = useCallback((personLayout: DiabloPersonLayout) => (
    isDiabloPersonLayoutCoveredByExpandedDetails(
      personLayout,
      expandedPersonDetailsLayout,
      expandedPersonDetailsId
    )
  ), [expandedPersonDetailsId, expandedPersonDetailsLayout]);
  const showToolbarFeedback = useCallback((panel: DiabloToolbarFeedback['panel'], message: string) => {
    setToolbarFeedback({
      id: Date.now(),
      panel,
      message,
    });
  }, []);
  const closePeopleCopyMenu = useCallback(() => {
    peopleCopyMenuRef.current?.removeAttribute('open');
  }, []);

  useEffect(() => {
    const handleDocumentPointerDown = (event: PointerEvent) => {
      const copyMenu = peopleCopyMenuRef.current;
      if (!copyMenu?.open) return;

      const target = event.target;
      if (target instanceof Node && copyMenu.contains(target)) return;

      closePeopleCopyMenu();
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown);

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
    };
  }, [closePeopleCopyMenu]);

  const handleCopyPeopleWithAllocations = useCallback(() => {
    onCopyPeopleWithAllocations();
    closePeopleCopyMenu();
    showToolbarFeedback('people', 'Skopiowano ludzi z alokacją');
  }, [closePeopleCopyMenu, onCopyPeopleWithAllocations, showToolbarFeedback]);
  const handleCopyPeopleWithoutAllocations = useCallback(() => {
    onCopyPeopleWithoutAllocations();
    closePeopleCopyMenu();
    showToolbarFeedback('people', 'Skopiowano ludzi bez alokacji');
  }, [closePeopleCopyMenu, onCopyPeopleWithoutAllocations, showToolbarFeedback]);
  const handleCopyProjectsWithoutAllocations = useCallback(() => {
    onCopyProjectsWithoutAllocations();
    showToolbarFeedback('projects', 'Skopiowano projekty');
  }, [onCopyProjectsWithoutAllocations, showToolbarFeedback]);
  const handlePastePeopleClipboard = useCallback(() => {
    const didPaste = onPastePeopleClipboard(period.id);
    if (didPaste === false) return;
    showToolbarFeedback('people', 'Wklejono ludzi');
  }, [onPastePeopleClipboard, period.id, showToolbarFeedback]);
  const handlePasteProjectsClipboard = useCallback(() => {
    const didPaste = onPasteProjectsClipboard(period.id);
    if (didPaste === false) return;
    showToolbarFeedback('projects', 'Wklejono projekty');
  }, [onPasteProjectsClipboard, period.id, showToolbarFeedback]);
  const handleResetProjectAllocations = useCallback(() => {
    if (!hasProjectAllocations) return;
    if (!projectAllocationResetConfirmationPending) {
      setProjectAllocationResetConfirmationPending(true);
      return;
    }

    onResetProjectAllocations();
    setSelectedAllocationIds([]);
    setProjectAllocationResetConfirmationPending(false);
    showToolbarFeedback('projects', allocationResetScope === 'week'
      ? 'Cofnięto przydziały tygodnia'
      : 'Cofnięto przydziały');
  }, [
    allocationResetScope,
    hasProjectAllocations,
    onResetProjectAllocations,
    projectAllocationResetConfirmationPending,
    showToolbarFeedback,
  ]);

  useEffect(() => {
    if (!toolbarFeedback) return undefined;

    const timeoutId = window.setTimeout(() => {
      setToolbarFeedback((current) => (
        current?.id === toolbarFeedback.id ? null : current
      ));
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [toolbarFeedback]);

  const benchAlertSummary = useMemo(() => {
    let severeCount = 0;
    let idleCostK = 0;
    let idleTargetK = 0;
    let suspiciousCount = 0;

    activePeople.forEach((person) => {
      const personBench = benchAllocations.filter((allocation) => allocation.personId === person.id);
      const assignedRevenueK = periodAllocations
        .filter((allocation) => allocation.personId === person.id && allocation.target !== 'bench')
        .reduce((sum, allocation) => sum + allocation.revenueK, 0);
      const benchRevenueK = personBench.reduce((sum, allocation) => sum + allocation.revenueK, 0);
      const periodCostK = Math.ceil(getPersonPeriodCostK(person, period.id));
      const isIdle = benchRevenueK > 0 && assignedRevenueK <= 0;
      const isSuspicious = assignedRevenueK > 0 && benchRevenueK > 0;

      if (isIdle && (person.seniority === 'senior' || person.seniority === 'lead' || periodCostK >= 18)) {
        severeCount += 1;
      }
      if (isIdle) {
        idleCostK += periodCostK;
        idleTargetK += Math.ceil(getPersonPeriodLayers(person, period.id).targetK);
      }
      if (isSuspicious) suspiciousCount += 1;
    });

    return { severeCount, idleCostK, idleTargetK, suspiciousCount };
  }, [activePeople, benchAllocations, period.id, periodAllocations]);
  const projectToolbarSummary = useMemo(() => {
    const projectIds = new Set(projects.map((project) => project.id));
    const allocationsByProjectId = new Map<string, number>();

    periodAllocations.forEach((allocation) => {
      if (!projectIds.has(allocation.target)) return;
      allocationsByProjectId.set(
        allocation.target,
        (allocationsByProjectId.get(allocation.target) || 0) + allocation.revenueK
      );
    });

    return projects.reduce((summary, project) => {
      const plannedCapacityK = getProjectPeriodRevenueK(project, period.id);
      const allocatedCapacityK = allocationsByProjectId.get(project.id) || 0;

      return {
        plannedCapacityK: summary.plannedCapacityK + plannedCapacityK,
        allocatedCapacityK: summary.allocatedCapacityK + allocatedCapacityK,
        gapK: summary.gapK + Math.max(0, plannedCapacityK - allocatedCapacityK),
        overflowK: summary.overflowK + Math.max(0, allocatedCapacityK - plannedCapacityK),
      };
    }, {
      allocatedCapacityK: 0,
      gapK: 0,
      overflowK: 0,
      plannedCapacityK: 0,
    });
  }, [period.id, periodAllocations, projects]);
  const hasVisibleMonthContent = activePeople.length > 0 || projects.length > 0 || periodAllocations.length > 0;

  useEffect(() => {
    if (!clearMonthConfirmationPending) return undefined;
    const timeoutId = window.setTimeout(() => setClearMonthConfirmationPending(false), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [clearMonthConfirmationPending]);

  useEffect(() => {
    if (!projectAllocationResetConfirmationPending) return undefined;
    const timeoutId = window.setTimeout(() => setProjectAllocationResetConfirmationPending(false), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [projectAllocationResetConfirmationPending]);

  useEffect(() => {
    if (!hasProjectAllocations && projectAllocationResetConfirmationPending) {
      setProjectAllocationResetConfirmationPending(false);
    }
  }, [hasProjectAllocations, projectAllocationResetConfirmationPending]);

  const handleClearMonthPlan = useCallback(() => {
    if (!hasVisibleMonthContent) return;
    if (!clearMonthConfirmationPending) {
      setClearMonthConfirmationPending(true);
      return;
    }

    onClearMonthPlan();
    setSelectedProjectId(null);
    setSelectedAllocationIds([]);
    setActiveDragPayload(null);
    setPersonFrameDropProjectId(null);
    setPersonFrameDragPreview(null);
    setClearMonthConfirmationPending(false);
  }, [clearMonthConfirmationPending, hasVisibleMonthContent, onClearMonthPlan]);

  const applyViewportTransform = useCallback(() => {
    const { scale, panX, panY } = viewRef.current;
    const world = worldRef.current;
    if (world) {
      world.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }
    const viewport = viewportRef.current;
    if (viewport) {
      // Infinite grid background tiled to match the world transform.
      const pitch = (DIABLO_CELL_SIZE + DIABLO_CELL_GAP) * scale;
      viewport.style.setProperty('--diablo-bg-pitch', `${pitch}px`);
      viewport.style.setProperty('--diablo-bg-major', `${pitch * 4}px`);
      viewport.style.setProperty('--diablo-bg-x', `${panX}px`);
      viewport.style.setProperty('--diablo-bg-y', `${panY}px`);

      const peopleZoneBackdrop = peopleZoneBackdropRef.current;
      if (peopleZoneBackdrop) {
        peopleZoneBackdrop.style.left = `${panX}px`;
        peopleZoneBackdrop.style.width = `${getGridPixelSize(peopleZoneColumns) * scale}px`;
        peopleZoneBackdrop.style.setProperty('--diablo-people-zone-pitch', `${pitch}px`);
        peopleZoneBackdrop.style.setProperty('--diablo-people-zone-major-pitch', `${pitch * 4}px`);
        peopleZoneBackdrop.style.setProperty('--diablo-people-zone-y', `${panY}px`);
      }
      const projectZoneBackdrop = projectZoneBackdropRef.current;
      if (projectZoneBackdrop) {
        const projectZoneLeft = peopleZoneColumns * (DIABLO_CELL_SIZE + DIABLO_CELL_GAP);
        projectZoneBackdrop.style.left = `${panX + projectZoneLeft * scale}px`;
        projectZoneBackdrop.style.width = `${Math.max(0, canvasBasePixelWidth - projectZoneLeft) * scale}px`;
        projectZoneBackdrop.style.setProperty('--diablo-project-zone-pitch', `${pitch}px`);
        projectZoneBackdrop.style.setProperty('--diablo-project-zone-major-pitch', `${pitch * 4}px`);
        projectZoneBackdrop.style.setProperty('--diablo-project-zone-y', `${panY}px`);
      }

      // Re-anchor screen-fixed overlays imperatively — no React render per frame.
      const viewportRect = viewport.getBoundingClientRect();
      const island = toolIslandRef.current;
      if (island) {
        island.style.setProperty('--diablo-tool-island-center-x', `${Math.round(viewportRect.left + viewportRect.width / 2)}px`);
      }
      // Re-anchor both screen-fixed control panels imperatively so they track
      // the canvas during pan/zoom without waiting for a React render.
      const canvas = canvasRef.current;
      if (canvas) {
        const canvasRect = canvas.getBoundingClientRect();
        const peoplePanel = peopleControlPanelRef.current;
        const projectPanel = projectControlPanelRef.current;

        if (viewportRect.width && canvasRect.width && peoplePanel && projectPanel) {
          const layout = getControlPanelsLayout({
            canvasRect,
            peoplePanelWidth: getControlPanelWidth(peoplePanel, DIABLO_PEOPLE_CONTROL_PANEL_FALLBACK_WIDTH),
            peopleZoneColumns,
            pitch: (DIABLO_CELL_SIZE + DIABLO_CELL_GAP) * scale,
            projectPanelWidth: getControlPanelWidth(projectPanel, DIABLO_PROJECT_CONTROL_PANEL_FALLBACK_WIDTH),
            scale,
            viewportRect,
          });
          applyControlPanelElementPosition(peoplePanel, layout.people, 'people');
          applyControlPanelElementPosition(projectPanel, layout.projects, 'projects');
        }
      }
    }
    // Let cursor-presence overlays reproject against the new transform.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('diablo-viewport-change'));
    }
  }, [canvasBasePixelWidth, peopleZoneColumns]);

  const commitViewport = useCallback(() => {
    // Re-render the (heavy) frame tree only once the gesture settles.
    if (viewCommitTimerRef.current != null) {
      window.clearTimeout(viewCommitTimerRef.current);
    }
    viewCommitTimerRef.current = window.setTimeout(() => {
      viewCommitTimerRef.current = null;
      if (typeof window === 'undefined') return;
      setView({ ...viewRef.current });
    }, 120);
  }, []);

  useEffect(() => () => {
    if (viewCommitTimerRef.current != null) {
      window.clearTimeout(viewCommitTimerRef.current);
      viewCommitTimerRef.current = null;
    }
  }, []);

  const setViewport = useCallback((next: ViewportTransform) => {
    viewRef.current = next;
    applyViewportTransform();
    commitViewport();
  }, [applyViewportTransform, commitViewport]);

  const markViewportUserPositioned = useCallback(() => {
    hasUserPositionedViewportRef.current = true;
  }, []);

  // Untransformed screen origin of the world layer, so pointer coords can be
  // mapped into world space regardless of padding/border/scroll.
  const getWorldOrigin = useCallback(() => {
    const world = worldRef.current;
    const { panX, panY } = viewRef.current;
    if (!world) return { x: 0, y: 0 };
    const rect = world.getBoundingClientRect();
    return { x: rect.left - panX, y: rect.top - panY };
  }, []);

  const zoomViewportAtClientPoint = useCallback((nextScaleRaw: number, clientX: number, clientY: number) => {
    const { scale, panX, panY } = viewRef.current;
    const nextScale = clamp(nextScaleRaw, DIABLO_MIN_ZOOM, DIABLO_MAX_ZOOM);
    if (nextScale === scale) return;
    markViewportUserPositioned();
    const origin = getWorldOrigin();
    const pointerX = clientX - origin.x;
    const pointerY = clientY - origin.y;
    const ratio = nextScale / scale;
    // Pin the world point under the cursor: pan' = pointer - (pointer - pan) * ratio.
    setViewport({
      scale: nextScale,
      panX: pointerX - (pointerX - panX) * ratio,
      panY: pointerY - (pointerY - panY) * ratio,
    });
  }, [getWorldOrigin, markViewportUserPositioned, setViewport]);

  const zoomViewportByFactor = useCallback((factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    zoomViewportAtClientPoint(viewRef.current.scale * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [zoomViewportAtClientPoint]);

  const syncToolIslandPosition = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const nextCenterX = Math.round(rect.left + rect.width / 2);
    setToolIslandCenterX((current) => (current === nextCenterX ? current : nextCenterX));
  }, []);

  const syncControlPanelPositions = useCallback(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return;

    const viewportRect = viewport.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    if (!viewportRect.width || !canvasRect.width) return;

    const peoplePanelWidth = getControlPanelWidth(
      peopleControlPanelRef.current,
      DIABLO_PEOPLE_CONTROL_PANEL_FALLBACK_WIDTH
    );
    const projectPanelWidth = getControlPanelWidth(
      projectControlPanelRef.current,
      DIABLO_PROJECT_CONTROL_PANEL_FALLBACK_WIDTH
    );
    const layout = getControlPanelsLayout({
      canvasRect,
      peoplePanelWidth,
      peopleZoneColumns,
      pitch: canvasZoomMetrics.pitch,
      projectPanelWidth,
      scale: canvasZoomMetrics.zoom,
      viewportRect,
    });

    setPeopleControlPanelPosition((current) => (
      current &&
      current.rightX === layout.people.rightX &&
      current.top === layout.people.top &&
      current.isVisible === layout.people.isVisible
        ? current
      : layout.people
    ));

    setProjectControlPanelPosition((current) => (
      current &&
      current.leftX === layout.projects.leftX &&
      current.top === layout.projects.top &&
      current.isVisible === layout.projects.isVisible
        ? current
      : layout.projects
    ));
  }, [canvasZoomMetrics.pitch, canvasZoomMetrics.zoom, peopleZoneColumns]);

  const syncScrollProxy = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const left = clamp(viewport.scrollLeft, 0, max);
    const contentBounds = getHorizontalContentPixelBounds(layout, canvasZoomMetrics.visualCellSize, canvasZoomMetrics.visualGap);
    const viewportLeft = left;
    const viewportRight = left + viewport.clientWidth;
    const hasHiddenContent = Boolean(
      contentBounds &&
      max > 0 &&
      (
        contentBounds.left < viewportLeft ||
        contentBounds.right > viewportRight
      )
    );
    const nextState = { hasOverflow: hasHiddenContent };

    setScrollProxy((current) => (
      current.hasOverflow === nextState.hasOverflow
        ? current
      : nextState
    ));
  }, [canvasZoomMetrics.visualCellSize, canvasZoomMetrics.visualGap, layout]);

  const getProjectDropTargetAtPointer = useCallback((clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY);
    const projectElement = element?.closest('[data-collaboration-target-type="project"]') as HTMLElement | null;
    return projectElement?.dataset.collaborationTargetId || null;
  }, []);

  const preserveViewportAfterLeftTopGrowth = useCallback((growth: DiabloCanvasGrowth) => {
    const left = growth.left || 0;
    const top = growth.top || 0;
    if (!left && !top) return;

    // Growing the grid at the left/top shifts all content; counter-pan so the
    // view stays visually fixed (screen shift = grownCells * basePitch * scale).
    window.requestAnimationFrame(() => {
      const basePitch = DIABLO_CELL_SIZE + DIABLO_CELL_GAP;
      const { scale, panX, panY } = viewRef.current;
      setViewport({
        scale,
        panX: panX - left * basePitch * scale,
        panY: panY - top * basePitch * scale,
      });
    });
  }, [setViewport]);

  const updateProjectLayout = useCallback((projectId: string, projectLayout: DiabloProjectLayout) => {
    const rect = {
      x: Math.round(projectLayout.x),
      y: Math.round(projectLayout.y),
      width: Math.round(projectLayout.width),
      height: Math.round(projectLayout.height),
    };
    const growth = {
      ...getCanvasGrowthForRect(rect, canvasSize),
      left: 0,
    };
    const grownLayout = hasCanvasGrowth(growth) ? growDiabloCanvasLayout(layout, growth) : layout;
    const grownCanvasSize = hasCanvasGrowth(growth) ? getDiabloCanvasSize(grownLayout, 0) : canvasSize;
    const shiftedProjectLayout = {
      ...projectLayout,
      x: projectLayout.x + (growth.left || 0),
      y: projectLayout.y + (growth.top || 0),
    };

    const snappedProjectLayout = snapProjectFrameLayout(shiftedProjectLayout, grownLayout, 0, grownCanvasSize);

    onLayoutChange({
      ...grownLayout,
      projects: {
        ...grownLayout.projects,
        [projectId]: snappedProjectLayout,
      },
    });
    preserveViewportAfterLeftTopGrowth(growth);
    return snappedProjectLayout;
  }, [canvasSize, layout, onLayoutChange, preserveViewportAfterLeftTopGrowth]);

  const updatePersonLayout = useCallback((personId: string, personLayout: DiabloPersonLayout) => {
    const rect = {
      x: Math.round(personLayout.x),
      y: Math.round(personLayout.y),
      width: Math.round(personLayout.width),
      height: Math.round(personLayout.height),
    };
    const rawGrowth = getCanvasGrowthForRect(rect, canvasSize);
    const growth = {
      left: rawGrowth.left,
      top: rawGrowth.top,
      bottom: rawGrowth.bottom,
      right: 0,
    };
    const grownLayout = hasCanvasGrowth(growth) ? growDiabloCanvasLayout(layout, growth) : layout;
    const grownCanvasSize = hasCanvasGrowth(growth) ? getDiabloCanvasSize(grownLayout, 0) : canvasSize;
    const shiftedPersonLayout = {
      ...personLayout,
      x: personLayout.x + (growth.left || 0),
      y: personLayout.y + (growth.top || 0),
    };

    onLayoutChange({
      ...grownLayout,
      people: {
        ...(grownLayout.people || {}),
        [personId]: snapPersonFrameLayout(shiftedPersonLayout, grownLayout, 0, grownCanvasSize),
      },
    });
    preserveViewportAfterLeftTopGrowth(growth);
  }, [canvasSize, layout, onLayoutChange, preserveViewportAfterLeftTopGrowth]);

  const updatePanelLayout = useCallback((panelId: 'legend', next: { x: number; y: number }) => {
    const currentPanelLayout = layout.panels[panelId];
    const panelSpan = getDiabloPanelGridSpan(panelId, currentPanelLayout);
    const nextX = Math.max(1, Math.round(next.x));
    const nextY = Math.max(1, Math.round(next.y));
    const nextCanvasSize = {
      columns: Math.max(canvasSize.columns, nextX + panelSpan.columns - 1),
      rows: Math.max(canvasSize.rows, nextY + panelSpan.rows - 1),
    };
    const safePosition = getViewportSafePanelPosition({
      canvasSize: nextCanvasSize,
      panelSpan,
      position: { x: nextX, y: nextY },
      view: viewRef.current,
      viewport: viewportRef.current,
    });

    onLayoutChange({
      ...layout,
      panels: {
        ...layout.panels,
        [panelId]: {
          ...layout.panels[panelId],
          x: safePosition.x,
          y: safePosition.y,
        },
      },
    }, 'local');
  }, [canvasSize, layout, onLayoutChange]);

  const ensureLegendPanelInViewport = useCallback(() => {
    if (interaction?.type === 'move-panel' || Date.now() < suppressCanvasReframeUntilRef.current) return;

    const legendLayout = layout.panels.legend;
    const panelSpan = getDiabloPanelGridSpan('legend', legendLayout);
    const safePosition = getViewportSafePanelPosition({
      canvasSize,
      panelSpan,
      position: legendLayout,
      view: viewRef.current,
      viewport: viewportRef.current,
    });

    if (safePosition.x === legendLayout.x && safePosition.y === legendLayout.y) return;

    onLayoutChange({
      ...layout,
      panels: {
        ...layout.panels,
        legend: {
          ...legendLayout,
          x: safePosition.x,
          y: safePosition.y,
        },
      },
    }, 'local');
  }, [canvasSize, interaction?.type, layout, onLayoutChange]);

  const toggleLegendCollapsed = useCallback(() => {
    onLayoutChange({
      ...layout,
      panels: {
        ...layout.panels,
        legend: {
          ...layout.panels.legend,
          collapsed: !layout.panels.legend.collapsed,
        },
      },
    }, 'local');
  }, [layout, onLayoutChange]);

  const resizeProjectFrameByStep = useCallback((
    projectId: string,
    delta: { width?: number; height?: number }
  ) => {
    const origin = layout.projects[projectId];
    if (!origin) return;

    const nextLayout = snapProjectFrameLayout({
      ...origin,
      width: clamp(
        origin.width + (delta.width || 0),
        DIABLO_MIN_FRAME_WIDTH,
        canvasSize.columns - origin.x + 1
      ),
      height: clamp(
        origin.height + (delta.height || 0),
        DIABLO_MIN_FRAME_HEIGHT,
        canvasSize.rows - origin.y + 1
      ),
    }, layout, 0, canvasSize);

    setSelectedProjectId(projectId);
    const snappedLayout = updateProjectLayout(projectId, nextLayout);
    onProjectFrameResize(projectId, snappedLayout);
  }, [canvasSize, layout.projects, onProjectFrameResize, updateProjectLayout]);

  const getResizedProjectLayout = useCallback((origin: DiabloProjectLayout, start: GridPoint, current: GridPoint) => {
    const width = Math.max(
      DIABLO_MIN_FRAME_WIDTH,
      origin.width + current.x - start.x,
    );
    const height = Math.max(
      DIABLO_MIN_FRAME_HEIGHT,
      origin.height + current.y - start.y,
    );
    return {
      ...origin,
      width,
      height,
    };
  }, []);

  const getGridPoint = useCallback((clientX: number, clientY: number, clampToCanvas = true): GridPoint => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 1, y: 1 };
    const pitch = (DIABLO_CELL_SIZE + DIABLO_CELL_GAP) * viewRef.current.scale;
    const x = Math.floor((clientX - rect.left) / pitch) + 1;
    const y = Math.floor((clientY - rect.top) / pitch) + 1;
    if (!clampToCanvas) return { x, y };

    return {
      x: clamp(x, 1, canvasSize.columns),
      y: clamp(y, 1, canvasSize.rows),
    };
  }, [canvasSize.columns, canvasSize.rows]);

  const reframeCanvasForReadableOverview = useCallback(() => {
    if (hasUserPositionedViewportRef.current || Date.now() < suppressCanvasReframeUntilRef.current) return;

    const bounds = canvasCardContentBounds;
    const viewport = viewportRef.current;
    if (!bounds || !viewport) return;

    const viewportSize = getViewportSize(viewport);
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return;

    const contentRect = getScreenRectForCanvasBounds(bounds, viewRef.current);
    const projectRect = canvasProjectContentBounds
      ? getScreenRectForCanvasBounds(canvasProjectContentBounds, viewRef.current)
      : null;
    const contentIsOffscreen = isRectFullyOffscreen(contentRect, viewportSize, DIABLO_OVERVIEW_GUTTER);
    const projectNeedsPreview = Boolean(
      projectRect &&
      !isRectMeaningfullyVisible(projectRect, viewportSize, {
        minHeight: Math.min(DIABLO_PROJECT_OVERVIEW_MIN_VISIBLE_HEIGHT, projectRect.height),
        minWidth: Math.min(DIABLO_PROJECT_OVERVIEW_MIN_VISIBLE_WIDTH, projectRect.width),
      })
    );

    if (!contentIsOffscreen && !projectNeedsPreview) return;

    const nextViewport = getReadableOverviewViewport({
      bounds,
      projectBounds: canvasProjectContentBounds,
      viewportSize,
    });

    if (areViewportTransformsClose(nextViewport, viewRef.current)) return;
    setViewport(nextViewport);
  }, [canvasCardContentBounds, canvasProjectContentBounds, setViewport]);

  useEffect(() => {
    hasUserPositionedViewportRef.current = false;
    const frameId = window.requestAnimationFrame(reframeCanvasForReadableOverview);
    return () => window.cancelAnimationFrame(frameId);
  }, [period.id, reframeCanvasForReadableOverview]);

  useEffect(() => {
    const syncViewportUi = () => {
      syncScrollProxy();
      syncToolIslandPosition();
      syncControlPanelPositions();
      ensureLegendPanelInViewport();
      reframeCanvasForReadableOverview();
    };
    const frameId = window.requestAnimationFrame(syncViewportUi);
    const resizeObserver = typeof ResizeObserver === 'undefined' || !viewportRef.current
      ? null
      : new ResizeObserver(syncViewportUi);

    if (resizeObserver && viewportRef.current) {
      resizeObserver.observe(viewportRef.current);
    }
    window.addEventListener('resize', syncViewportUi);
    window.addEventListener('scroll', syncViewportUi, { passive: true });

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', syncViewportUi);
      window.removeEventListener('scroll', syncViewportUi);
    };
  }, [
    canvasSize.columns,
    canvasSize.rows,
    ensureLegendPanelInViewport,
    reframeCanvasForReadableOverview,
    syncControlPanelPositions,
    syncScrollProxy,
    syncToolIslandPosition,
    view.panX,
    view.panY,
    view.scale,
  ]);

  useEffect(() => {
    if (!selectedAllocationIds.length) return;
    const activeAllocationIds = new Set(periodAllocations.map((allocation) => allocation.id));
    setSelectedAllocationIds((current) => {
      if (!current.length) return current;
      const next = current.filter((allocationId) => activeAllocationIds.has(allocationId));
      return next.length === current.length ? current : next;
    });
  }, [periodAllocations, selectedAllocationIds.length]);

  useEffect(() => {
    const clearActiveDragPayload = () => setActiveDragPayload(null);
    window.addEventListener('dragend', clearActiveDragPayload);
    window.addEventListener('drop', clearActiveDragPayload);

    return () => {
      window.removeEventListener('dragend', clearActiveDragPayload);
      window.removeEventListener('drop', clearActiveDragPayload);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const handleWheel = (event: WheelEvent) => {
      // Trackpad pinch arrives as wheel + ctrlKey; ⌘/ctrl + wheel zooms too.
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * DIABLO_PINCH_SENSITIVITY);
        zoomViewportAtClientPoint(viewRef.current.scale * factor, event.clientX, event.clientY);
        return;
      }
      // Two-finger trackpad scroll / shift+wheel pans the canvas 1:1.
      const { scale, panX, panY } = viewRef.current;
      markViewportUserPositioned();
      setViewport({ scale, panX: panX - event.deltaX, panY: panY - event.deltaY });
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [markViewportUserPositioned, setViewport, zoomViewportAtClientPoint]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      spaceHeldRef.current = true;
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceHeldRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    reframeCanvasForReadableOverview();
  }, [reframeCanvasForReadableOverview]);

  useLayoutEffect(() => {
    // Re-assert the live transform + overlay anchoring after committed viewport
    // changes and layout metric changes. Gesture handlers still apply transforms
    // imperatively, so this should not run on unrelated frame-tree renders.
    applyViewportTransform();
  }, [applyViewportTransform, view.panX, view.panY, view.scale]);

  const hasPersonFreeBenchTiles = useCallback((personId: string) => (
    personProjectDragPersonIds
      ? personProjectDragPersonIds.has(personId)
      : periodAllocations.some((allocation) => (
        allocation.periodId === period.id &&
        allocation.personId === personId &&
        allocation.target === 'bench'
      ))
  ), [period.id, periodAllocations, personProjectDragPersonIds]);

  const growCanvasForViewportTransform = useCallback((nextView: ViewportTransform) => {
    const viewport = viewportRef.current;
    if (!viewport) return nextView;

    const { width, height } = getViewportSize(viewport);
    const pitch = (DIABLO_CELL_SIZE + DIABLO_CELL_GAP) * nextView.scale;
    const scaledCanvasWidth = canvasBasePixelWidth * nextView.scale;
    const scaledCanvasHeight = canvasBasePixelHeight * nextView.scale;
    const growth = {
      bottom: nextView.panY + scaledCanvasHeight < height
        ? Math.ceil((height - (nextView.panY + scaledCanvasHeight)) / pitch) + DIABLO_INTERACTION_GROWTH_BUFFER
        : 0,
      left: nextView.panX > 0
        ? Math.ceil(nextView.panX / pitch) + DIABLO_INTERACTION_GROWTH_BUFFER
        : 0,
      right: nextView.panX + scaledCanvasWidth < width
        ? Math.ceil((width - (nextView.panX + scaledCanvasWidth)) / pitch) + DIABLO_INTERACTION_GROWTH_BUFFER
        : 0,
      top: nextView.panY > 0
        ? Math.ceil(nextView.panY / pitch) + DIABLO_INTERACTION_GROWTH_BUFFER
        : 0,
    };

    if (!hasCanvasGrowth(growth)) return nextView;

    suppressCanvasReframeUntilRef.current = Date.now() + 500;
    onLayoutChange(growDiabloCanvasLayout(layout, growth));
    return {
      ...nextView,
      panX: nextView.panX - growth.left * pitch,
      panY: nextView.panY - growth.top * pitch,
    };
  }, [canvasBasePixelHeight, canvasBasePixelWidth, layout, onLayoutChange]);

  const handleCanvasViewportScroll = useCallback(() => {
    markViewportUserPositioned();
    syncScrollProxy();
    syncControlPanelPositions();
  }, [markViewportUserPositioned, syncControlPanelPositions, syncScrollProxy]);

  const handleFitCanvasToContent = useCallback(() => {
    markViewportUserPositioned();
    setSelectedProjectId(null);
    setSelectedAllocationIds([]);

    const viewport = viewportRef.current;
    const bounds = canvasCardContentBounds;
    if (!viewport || !bounds) {
      setViewport({ scale: DIABLO_DEFAULT_ZOOM, panX: 0, panY: 0 });
      return;
    }
    // Continuous fit: keep content readable and ensure project context is visible when the full layout is too wide.
    const { width, height } = getViewportSize(viewport);
    setViewport(getReadableOverviewViewport({
      bounds,
      projectBounds: canvasProjectContentBounds,
      viewportSize: { width, height },
    }));
  }, [canvasCardContentBounds, canvasProjectContentBounds, markViewportUserPositioned, setViewport]);

  const handleSortPeopleGrid = useCallback(() => {
    const sortedPersonIds = [...activePeople]
      .sort((firstPerson, secondPerson) => comparePeopleForCanvasSort(firstPerson, secondPerson, skillsById))
      .map((person) => person.id);

    onLayoutChange(arrangeDiabloPersonLayoutsInGrid(layout, sortedPersonIds));
    setSelectedProjectId(null);
    setSelectedAllocationIds([]);

    window.requestAnimationFrame(syncScrollProxy);
  }, [activePeople, layout, onLayoutChange, skillsById, syncScrollProxy]);

  const handleSortProjectsGrid = useCallback(() => {
    const sortedProjectIds = [...projects]
      .sort(compareProjectsForCanvasSort)
      .map((project) => project.id);

    onLayoutChange(arrangeDiabloProjectLayoutsInGrid(layout, sortedProjectIds));
    setSelectedProjectId(null);
    setSelectedAllocationIds([]);

    window.requestAnimationFrame(syncScrollProxy);
  }, [layout, onLayoutChange, projects, syncScrollProxy]);

  const handleSortProjectsByPeople = useCallback(() => {
    const sortedProjects = [...projects].sort(compareProjectsForCanvasSort);
    const sortedPeople = [...activePeople].sort((firstPerson, secondPerson) => (
      comparePeopleForCanvasSort(firstPerson, secondPerson, skillsById)
    ));

    onLayoutChange(arrangeDiabloProjectPeopleLayouts(
      layout,
      sortedProjects,
      sortedPeople,
      periodAllocations
    ));
    setSelectedProjectId(null);
    setSelectedAllocationIds([]);

    window.requestAnimationFrame(syncScrollProxy);
  }, [activePeople, layout, onLayoutChange, periodAllocations, projects, skillsById, syncScrollProxy]);

  const handleCanvasZoomChange = useCallback((direction: -1 | 1) => {
    zoomViewportByFactor(direction === 1 ? DIABLO_ZOOM_BUTTON_FACTOR : 1 / DIABLO_ZOOM_BUTTON_FACTOR);
  }, [zoomViewportByFactor]);

  const autoScrollCanvasViewport = useCallback((clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const edgeSize = 72;
    const maxStep = 28;
    let left = 0;
    let top = 0;

    if (clientX > rect.right - edgeSize) {
      left = Math.ceil(((clientX - (rect.right - edgeSize)) / edgeSize) * maxStep);
    } else if (clientX < rect.left + edgeSize) {
      left = -Math.ceil((((rect.left + edgeSize) - clientX) / edgeSize) * maxStep);
    }

    if (clientY > rect.bottom - edgeSize) {
      top = Math.ceil(((clientY - (rect.bottom - edgeSize)) / edgeSize) * maxStep);
    } else if (clientY < rect.top + edgeSize) {
      top = -Math.ceil((((rect.top + edgeSize) - clientY) / edgeSize) * maxStep);
    }

    if (left !== 0 || top !== 0) {
      viewport.scrollBy({ left, top, behavior: 'auto' });
    }
  }, []);

  useEffect(() => {
    if (!interaction) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();

      if (interaction.type === 'pan-canvas') {
        const previousPointer = panPointerRef.current ?? interaction.start;
        const deltaX = event.clientX - previousPointer.x;
        const deltaY = event.clientY - previousPointer.y;
        const currentView = viewRef.current;
        panPointerRef.current = { x: event.clientX, y: event.clientY };

        setViewport(growCanvasForViewportTransform({
          scale: currentView.scale,
          panX: currentView.panX + deltaX,
          panY: currentView.panY + deltaY,
        }));
        return;
      }

      autoScrollCanvasViewport(event.clientX, event.clientY);

      if (interaction.type === 'selection') {
        const point = clampPointToDiabloZone(
          getGridPoint(event.clientX, event.clientY),
          interaction.zone,
          layout,
          canvasSize
        );
        setInteraction({ ...interaction, current: point });
        return;
      }

      const point = getGridPoint(event.clientX, event.clientY, false);
      const deltaX = point.x - interaction.start.x;
      const deltaY = point.y - interaction.start.y;

      if (interaction.type === 'move-frame') {
        updateProjectLayout(interaction.projectId, {
          ...interaction.origin,
          x: interaction.origin.x + deltaX,
          y: interaction.origin.y + deltaY,
        });
        return;
      }

      if (interaction.type === 'move-person-frame') {
        const nextPersonLayout = {
          ...interaction.origin,
          x: interaction.origin.x + deltaX,
          y: interaction.origin.y + deltaY,
        };
        const hasFreeTiles = hasPersonFreeBenchTiles(interaction.personId);
        const previewLayout = hasFreeTiles
          ? snapPersonFramePreviewLayout(nextPersonLayout, canvasSize)
          : snapPersonFrameLayout(nextPersonLayout, layout, 0, canvasSize);

        setPersonFrameDragPreview({
          personId: interaction.personId,
          layout: previewLayout,
        });
        setPersonFrameDropProjectId(
          hasFreeTiles
            ? getProjectDropTargetAtPointer(event.clientX, event.clientY)
            : null
        );
        return;
      }

      if (interaction.type === 'resize-frame') {
        updateProjectLayout(
          interaction.projectId,
          getResizedProjectLayout(interaction.origin, interaction.start, point)
        );
        return;
      }

      updatePanelLayout(interaction.panelId, {
        x: interaction.origin.x + deltaX,
        y: interaction.origin.y + deltaY,
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (interaction.type === 'selection') {
        const selection = clampSelectionToDiabloZone(
          normalizeSelection(interaction.start, interaction.current),
          interaction.zone,
          layout,
          canvasSize
        );
        if (interaction.zone === 'people') {
          onCreatePersonFromSelection(selection);
        } else if (selection.width * selection.height >= 4) {
          onCreateProjectFromSelection(selection);
        }
      }
      if (interaction.type === 'move-person-frame') {
        const targetProjectId = getProjectDropTargetAtPointer(event.clientX, event.clientY);
        const hasFreeTiles = hasPersonFreeBenchTiles(interaction.personId);
        const point = getGridPoint(event.clientX, event.clientY, false);
        const deltaX = point.x - interaction.start.x;
        const deltaY = point.y - interaction.start.y;
        const finalPersonLayout = {
          ...interaction.origin,
          x: interaction.origin.x + deltaX,
          y: interaction.origin.y + deltaY,
        };

        if (targetProjectId && hasFreeTiles) {
          const targetProject = projects.find((project) => project.id === targetProjectId);
          updatePersonLayout(interaction.personId, interaction.origin);
          onDropPayload(
            { type: 'person', personId: interaction.personId },
            targetProjectId,
            period.id,
            targetProject?.requirements.length ? { disableRequirementSuggestion: true } : undefined
          );
        } else if (interaction.projectDropOnly) {
          updatePersonLayout(interaction.personId, interaction.origin);
        } else if (!hasFreeTiles || isPersonFrameInsidePeopleZone(finalPersonLayout, layout)) {
          updatePersonLayout(interaction.personId, finalPersonLayout);
        } else {
          updatePersonLayout(interaction.personId, interaction.origin);
        }
      }
      if (interaction.type === 'resize-frame') {
        const layout = getResizedProjectLayout(
          interaction.origin,
          interaction.start,
          getGridPoint(event.clientX, event.clientY, false)
        );
        const snappedLayout = updateProjectLayout(interaction.projectId, layout);
        onProjectFrameResize(interaction.projectId, snappedLayout);
      }
      panPointerRef.current = null;
      setInteraction(null);
      setPersonFrameDropProjectId(null);
      setPersonFrameDragPreview(null);
    };

    const handlePointerCancel = () => {
      panPointerRef.current = null;
      setInteraction(null);
      setPersonFrameDropProjectId(null);
      setPersonFrameDragPreview(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    window.addEventListener('pointercancel', handlePointerCancel, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [
    autoScrollCanvasViewport,
    canvasSize,
    getGridPoint,
    getProjectDropTargetAtPointer,
    getResizedProjectLayout,
    hasPersonFreeBenchTiles,
    interaction,
    layout,
    onCreatePersonFromSelection,
    onCreateProjectFromSelection,
    onDropPayload,
    onProjectFrameResize,
    period.id,
    projects,
    growCanvasForViewportTransform,
    syncScrollProxy,
    updatePanelLayout,
    updatePersonLayout,
    updateProjectLayout,
  ]);

  const selection = interaction?.type === 'selection'
    ? clampSelectionToDiabloZone(
      normalizeSelection(interaction.start, interaction.current),
      interaction.zone,
      layout,
      canvasSize
    )
    : null;

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        'button, a, input, select, textarea, summary, .diablo-project-frame, .diablo-floating-panel, .diablo-people-control-panel, .diablo-project-control-panel'
      )
    ) {
      return;
    }

    // Pan the canvas with middle-mouse (any tool), space-held + left drag, or the move tool.
    const wantsPan =
      event.button === 1 ||
      (event.button === 0 && (spaceHeldRef.current || canvasTool === 'move'));
    if (wantsPan) {
      event.preventDefault();
      markViewportUserPositioned();
      setSelectedProjectId(null);
      setSelectedAllocationIds([]);
      panPointerRef.current = { x: event.clientX, y: event.clientY };
      setInteraction({
        type: 'pan-canvas',
        start: { x: event.clientX, y: event.clientY },
      });
      return;
    }

    if (event.button !== 0) return;

    markViewportUserPositioned();
    if (canvasTool !== 'create') {
      setSelectedProjectId(null);
      setSelectedAllocationIds([]);
      return;
    }
    const rawPoint = getGridPoint(event.clientX, event.clientY);
    const zone = getDiabloCanvasZoneForPoint(rawPoint, layout);
    const point = clampPointToDiabloZone(rawPoint, zone, layout, canvasSize);
    setSelectedProjectId(null);
    setSelectedAllocationIds([]);
    setInteraction({ type: 'selection', start: point, current: point, zone });
  };

  const handleTileClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>, allocationId: string) => {
    event.stopPropagation();
    if (event.shiftKey) {
      event.preventDefault();
      setSelectedAllocationIds((current) => (
        current.includes(allocationId)
          ? current.filter((selectedAllocationId) => selectedAllocationId !== allocationId)
          : [...current, allocationId]
      ));
      return;
    }

    setSelectedAllocationIds([]);
    onOpenAllocation(allocationId);
  }, [onOpenAllocation]);

  const handleTileDragStart = useCallback((event: ReactDragEvent, payload: DragPayload) => {
    if (payload.type !== 'tile' || !selectedAllocationIdSet.has(payload.tileId) || selectedAllocationIds.length <= 1) {
      setActiveDragPayload(payload);
      onTileDragStart(event, payload);
      return;
    }

    const selectedAllocations = selectedAllocationIds
      .map((allocationId) => periodAllocationsById.get(allocationId))
      .filter((allocation): allocation is PersonTileAllocation => Boolean(allocation));
    const selectedExistingAllocationIds = selectedAllocations.map((allocation) => allocation.id);

    if (selectedExistingAllocationIds.length <= 1) {
      setActiveDragPayload(payload);
      onTileDragStart(event, payload);
      return;
    }

    const groupPayload: DragPayload = {
      type: 'allocation-group',
      allocationIds: selectedExistingAllocationIds,
    };
    setAllocationGroupDragImage(event, selectedAllocations, peopleById);
    setActiveDragPayload(groupPayload);
    onTileDragStart(event, groupPayload);
  }, [onTileDragStart, peopleById, periodAllocationsById, selectedAllocationIdSet, selectedAllocationIds]);

  const handlePersonDragStart = useCallback((event: ReactDragEvent, payload: DragPayload) => {
    setActiveDragPayload(payload);
    onPersonDragStart(event, payload);
  }, [onPersonDragStart]);

  const handleDropPayload = useCallback((payload: DragPayload, target: string, periodId: string, options?: DropPayloadOptions) => {
    onDropPayload(payload, target, periodId, options);
    setSelectedAllocationIds([]);
    setActiveDragPayload(null);
  }, [onDropPayload]);

  const handleFramePointerDown = (event: ReactPointerEvent<HTMLElement>, projectId: string) => {
    const target = event.target as HTMLElement;
    if (
      event.button !== 0 ||
      target.closest('button, a, input, select, textarea, .traffic-person-tile-group, .traffic-tile, .diablo-frame-resize-handle, .diablo-project-frame-footer')
    ) {
      return;
    }

    const origin = layout.projects[projectId];
    if (!origin) return;
    event.stopPropagation();
    markViewportUserPositioned();
    setSelectedProjectId(projectId);
    if (canvasTool !== 'move') return;

    setInteraction({
      type: 'move-frame',
      projectId,
      start: getGridPoint(event.clientX, event.clientY),
      origin,
    });
  };

  const handlePersonFramePointerDown = (event: ReactPointerEvent<HTMLElement>, personId: string) => {
    const target = event.target as HTMLElement;
    if (
      event.button !== 0 ||
      target.closest(DIABLO_PERSON_FRAME_POINTER_EXCLUDED_SELECTOR)
    ) {
      return;
    }

    const origin = layout.people?.[personId];
    if (!origin) return;
    event.stopPropagation();
    markViewportUserPositioned();
    setSelectedProjectId(null);
    const canDropPersonFrameOnProject = allowPersonFrameProjectDrop && hasPersonFreeBenchTiles(personId);
    if (canvasTool !== 'move' && !canDropPersonFrameOnProject) return;
    event.preventDefault();

    setInteraction({
      type: 'move-person-frame',
      personId,
      projectDropOnly: canvasTool !== 'move',
      start: getGridPoint(event.clientX, event.clientY),
      origin,
    });
  };

  const handleFrameResizePointerDown = (event: ReactPointerEvent<HTMLElement>, projectId: string) => {
    if (event.button !== 0) return;
    const origin = layout.projects[projectId];
    if (!origin) return;
    event.preventDefault();
    event.stopPropagation();
    markViewportUserPositioned();
    setSelectedProjectId(projectId);
    setInteraction({
      type: 'resize-frame',
      projectId,
      start: getGridPoint(event.clientX, event.clientY),
      origin,
    });
  };

  const handlePanelPointerDown = (event: ReactPointerEvent<HTMLElement>, panelId: 'legend') => {
    if (canvasTool !== 'move') return;
    const target = event.target as HTMLElement;
    if (event.button !== 0 || target.closest('button, input, select, textarea, .traffic-tile')) return;
    event.stopPropagation();
    markViewportUserPositioned();
    setInteraction({
      type: 'move-panel',
      panelId,
      start: getGridPoint(event.clientX, event.clientY),
      origin: {
        x: layout.panels[panelId].x,
        y: layout.panels[panelId].y,
      },
    });
  };

  return (
    <section className="diablo-board-shell" aria-label={`Diablo Traffic Board: ${period.label}`}>
      <div className="diablo-canvas-layout">
        <div
          ref={viewportRef}
          aria-label="Zoomowalny canvas planowania Diablo"
          className={`diablo-canvas-viewport ${scrollProxy.hasOverflow ? 'has-horizontal-scroll' : 'has-no-horizontal-scroll'} ${canvasInteractionClassName}`}
          role="region"
          tabIndex={0}
          onScroll={handleCanvasViewportScroll}
          onPointerDown={handleCanvasPointerDown}
        >
          <div
            ref={peopleZoneBackdropRef}
            className="diablo-people-zone-backdrop"
            aria-hidden="true"
            style={peopleZoneBackdropStyle}
          />
          <div
            ref={projectZoneBackdropRef}
            className="diablo-project-zone-backdrop"
            aria-hidden="true"
            style={projectZoneBackdropStyle}
          />
          <div
            ref={peopleControlPanelRef}
            aria-label="Panel ludzi na canvasie"
            aria-hidden={isPeopleControlPanelHidden}
            className={`diablo-people-control-panel ${isPeopleControlPanelHidden ? 'is-hidden' : ''}`}
            style={peopleControlPanelStyle}
          >
            <strong>Ludzie</strong>
            <span>{activePeople.length} osób</span>
            <span>{benchAlertSummary.severeCount} alertów</span>
            <span>{benchAlertSummary.idleCostK}k idle</span>
            <details ref={peopleCopyMenuRef} className="diablo-control-menu">
              <summary aria-label="Kopiuj sekcję ludzi">Kopiuj</summary>
              <div className="diablo-control-menu-options" role="menu">
                <button type="button" role="menuitem" onClick={handleCopyPeopleWithAllocations}>Z alokacją</button>
                <button type="button" role="menuitem" onClick={handleCopyPeopleWithoutAllocations}>Bez alokacji</button>
              </div>
            </details>
            <button
              type="button"
              aria-label="Wklej skopiowaną sekcję ludzi"
              disabled={!canPastePeopleClipboard}
              title={peoplePasteTitle}
              onClick={handlePastePeopleClipboard}
            >
              Wklej
            </button>
            {peopleClipboardSourceLabel ? (
              <span
                className="diablo-clipboard-source"
                title={`Schowek ludzi: ${monthClipboard?.sourcePeriodLabel}`}
              >
                {peopleClipboardSourceLabel}
              </span>
            ) : null}
            {toolbarFeedback?.panel === 'people' ? (
              <output
                key={toolbarFeedback.id}
                aria-live="polite"
                className="diablo-toolbar-feedback"
                role="status"
              >
                {toolbarFeedback.message}
              </output>
            ) : null}
            <button type="button" aria-label="Sortuj osoby po skillach i nazwie" onClick={handleSortPeopleGrid}>Sortuj</button>
            <button type="button" onClick={() => onCreatePerson()}>+ Osoba</button>
            <button type="button" aria-label="Wyjaśnij paletę ludzi" onClick={() => onOpenHelp('people-palette')}>?</button>
          </div>
          <div
            ref={projectControlPanelRef}
            aria-label="Panel projektów na canvasie"
            aria-hidden={isProjectControlPanelHidden}
            className={`diablo-project-control-panel ${isProjectControlPanelHidden ? 'is-hidden' : ''}`}
            style={projectControlPanelStyle}
          >
            <strong>Projekty</strong>
            <span>{formatProjectFrameCount(projects.length)}</span>
            <span>{formatProjectMetricK(projectToolbarSummary.plannedCapacityK)} plan</span>
            <span>{formatProjectMetricK(projectToolbarSummary.allocatedCapacityK)} alok.</span>
            <span className={projectToolbarSummary.gapK > 0 ? 'is-warning' : undefined}>
              {formatProjectMetricK(projectToolbarSummary.gapK)} luka
            </span>
            <span className={projectToolbarSummary.overflowK > 0 ? 'is-danger' : undefined}>
              {projectToolbarSummary.overflowK > 0 ? '+' : ''}{formatProjectMetricK(projectToolbarSummary.overflowK)} poza
            </span>
            <button
              type="button"
              aria-label="Kopiuj projekty bez alokacji"
              onClick={handleCopyProjectsWithoutAllocations}
            >
              Kopiuj
            </button>
            <button
              type="button"
              aria-label="Wklej skopiowane projekty bez alokacji"
              disabled={!canPasteProjectsClipboard}
              title={projectsPasteTitle}
              onClick={handlePasteProjectsClipboard}
            >
              Wklej
            </button>
            {projectsClipboardSourceLabel ? (
              <span
                className="diablo-clipboard-source"
                title={`Schowek projektów: ${monthClipboard?.sourcePeriodLabel}`}
              >
                {projectsClipboardSourceLabel}
              </span>
            ) : null}
            {toolbarFeedback?.panel === 'projects' ? (
              <output
                key={toolbarFeedback.id}
                aria-live="polite"
                className="diablo-toolbar-feedback"
                role="status"
              >
                {toolbarFeedback.message}
              </output>
            ) : null}
            <button type="button" aria-label="Sortuj projekty w siatce po kliencie i nazwie" onClick={handleSortProjectsGrid}>Sortuj</button>
            <button
              type="button"
              aria-label={projectAllocationResetConfirmationPending
                ? allocationResetScope === 'week'
                  ? 'Potwierdź reset przydziałów do projektów w tym tygodniu'
                  : 'Potwierdź reset przydziałów do projektów w tym miesiącu'
                : allocationResetScope === 'week'
                  ? 'Resetuj przydziały do projektów w tym tygodniu'
                  : 'Resetuj przydziały do projektów w tym miesiącu'}
              className={projectAllocationResetConfirmationPending ? 'is-confirming' : undefined}
              disabled={!hasProjectAllocations}
              title={hasProjectAllocations
                ? projectAllocationResetConfirmationPending
                  ? allocationResetScope === 'week'
                    ? 'Kliknij ponownie, aby cofnąć kafelki z aktywnego tygodnia na ławkę'
                    : 'Kliknij ponownie, aby cofnąć wszystkie kafelki z projektów na ławkę'
                  : allocationResetScope === 'week'
                    ? 'Cofnij kafelki z aktywnego tygodnia na ławkę'
                    : 'Cofnij wszystkie kafelki z projektów na ławkę'
                : allocationResetScope === 'week'
                  ? 'Brak przydziałów do projektów w tym tygodniu'
                  : 'Brak przydziałów do projektów w tym miesiącu'}
              onClick={handleResetProjectAllocations}
            >
              {projectAllocationResetConfirmationPending ? 'Potwierdź' : 'Reset alok.'}
            </button>
          </div>
          <div ref={worldRef} className="diablo-canvas-scale-shell" style={canvasScaleShellStyle}>
            <div
              ref={canvasRef}
              className={`diablo-canvas-grid ${canvasInteractionClassName} ${highlightedPersonId ? 'is-person-highlight-active' : ''}`}
              style={canvasGridStyle}
              onDragEnd={() => setActiveDragPayload(null)}
              onDropCapture={() => setActiveDragPayload(null)}
            >
              {activePeople.map((person) => {
                const personLayout = layout.people?.[person.id];
                if (!personLayout) return null;
                const personBench = benchAllocations.filter((allocation) => allocation.personId === person.id);
                const dragPreviewLayout = personFrameDragPreview?.personId === person.id
                  ? personFrameDragPreview.layout
                  : null;

                return (
                  <DiabloPersonFrame
                    activeDragPayload={activeDragPayload}
                    canDragPersonToProject={personProjectDragPersonIds?.has(person.id)}
                    highlightedPersonId={highlightedPersonId}
                    isCanvasMoveMode={canvasTool === 'move'}
                    isCoveredByExpandedDetails={isPersonCoveredByExpandedDetails(personLayout)}
                    isDragPreview={Boolean(dragPreviewLayout)}
                    isSelected={false}
                    key={person.id}
                    layout={dragPreviewLayout || personLayout}
                    person={person}
                    personBench={personBench}
                    periodAllocations={periodAllocations}
                    periodId={period.id}
                    projectsById={projectsById}
                    selectedAllocationIds={selectedAllocationIdSet}
                    skillsById={skillsById}
                    tileMetricMode={tileMetricMode}
                    onDropPayload={handleDropPayload}
                    onDetailsExpandedChange={handlePersonDetailsExpandedChange}
                    onEditPerson={onEditPerson}
                    onFramePointerDown={handlePersonFramePointerDown}
                    onHighlightPersonAllocations={setHighlightedPersonId}
                    onPersonDragStart={handlePersonDragStart}
                    onResetPersonAllocations={onResetPersonAllocations}
                    allocationResetScope={allocationResetScope}
                    onTileClick={handleTileClick}
                    onTileDragStart={handleTileDragStart}
                  />
                );
              })}

              {selection ? (
                <div
                  className={`diablo-selection is-${interaction?.type === 'selection' ? interaction.zone : 'projects'}-selection`}
                  style={{
                    gridColumn: `${selection.x} / span ${selection.width}`,
                    gridRow: `${selection.y} / span ${selection.height}`,
                  }}
                >
                  <strong>{formatSelectionCapacityLabel(selection)}</strong>
                  <span>{interaction?.type === 'selection' && interaction.zone === 'people' ? 'nowa osoba' : 'nowa ramka'}</span>
                </div>
              ) : null}

              {projects.map((project) => {
                const projectLayout = layout.projects[project.id];
                if (!projectLayout) return null;

                return (
                  <DiabloProjectFrame
                    activeDragPayload={activeDragPayload}
                    allAllocations={allAllocations}
                    allocations={periodAllocations.filter((allocation) => allocation.target === project.id)}
                    isCanvasMoveMode={canvasTool === 'move'}
                    isSelected={selectedProjectId === project.id}
                    isPersonFrameDropPreview={personFrameDropProjectId === project.id}
                    isWeeklyPlanningMode={allocationResetScope === 'week'}
                    highlightedPersonId={highlightedPersonId}
                    key={project.id}
                    layout={projectLayout}
                    peopleById={peopleById}
                    periodAllocations={periodAllocations}
                    periodId={period.id}
                    periods={periods}
                    project={project}
                    projectsById={projectsById}
                    tileMetricMode={tileMetricMode}
                    onCycleWorkType={onCycleWorkType}
                    onDropPayload={handleDropPayload}
                    onEditProject={onEditProject}
                    onArchiveProject={onArchiveProject}
                    onDeleteProject={onDeleteProject}
                    onFramePointerDown={handleFramePointerDown}
                    onTileClick={handleTileClick}
                    onResizeByGridStep={resizeProjectFrameByStep}
                    onResizePointerDown={handleFrameResizePointerDown}
                    onTileDragStart={handleTileDragStart}
                    isArchivePending={pendingArchiveProjectKey === `${period.id}:${project.id}`}
                    isDeletePending={pendingDeleteProjectId === project.id}
                    selectedAllocationIds={selectedAllocationIdSet}
                    skillsById={skillsById}
                  />
                );
              })}

              <DiabloFloatingPanels
                layouts={layout.panels}
                onOpenHelp={onOpenHelp}
                onPanelPointerDown={handlePanelPointerDown}
                onToggleLegendCollapsed={toggleLegendCollapsed}
              />
            </div>
          </div>
        </div>
      </div>
      <div ref={toolIslandRef} className="diablo-tool-island" style={toolIslandStyle} aria-label="Tryb pracy na canvasie">
        <TrafficTooltip label="Tworzenie projektów przez zaznaczenie obszaru" placement="top" delayMs={90}>
          <button
            aria-label="Tworzenie projektów przez zaznaczenie obszaru"
            aria-pressed={canvasTool === 'create'}
            className={canvasTool === 'create' ? 'is-active' : ''}
            type="button"
            onClick={() => onCanvasToolChange('create')}
          >
            <span aria-hidden="true">+</span>
          </button>
        </TrafficTooltip>
        <TrafficTooltip label="Przesuwanie ramek i legendy" placement="top" delayMs={90}>
          <button
            aria-label="Przesuwanie ramek i legendy"
            aria-pressed={canvasTool === 'move'}
            className={canvasTool === 'move' ? 'is-active' : ''}
            type="button"
            onClick={() => onCanvasToolChange('move')}
          >
            <span aria-hidden="true">↕</span>
          </button>
        </TrafficTooltip>
        <TrafficTooltip label={`Oddal canvas (${canvasZoomPercent}%)`} placement="top" delayMs={90}>
          <button
            aria-label={`Oddal canvas (${canvasZoomPercent}%)`}
            disabled={isMinCanvasZoom}
            type="button"
            onClick={() => handleCanvasZoomChange(-1)}
          >
            <span aria-hidden="true">−</span>
          </button>
        </TrafficTooltip>
        <TrafficTooltip label={`Przybliż canvas (${canvasZoomPercent}%)`} placement="top" delayMs={90}>
          <button
            aria-label={`Przybliż canvas (${canvasZoomPercent}%)`}
            disabled={isMaxCanvasZoom}
            type="button"
            onClick={() => handleCanvasZoomChange(1)}
          >
            <span aria-hidden="true">+</span>
          </button>
        </TrafficTooltip>
        <TrafficTooltip label="Dopasuj widok do ludzi i projektów" placement="top" delayMs={90}>
          <button
            aria-label="Dopasuj widok do ludzi i projektów"
            type="button"
            onClick={handleFitCanvasToContent}
          >
            <span aria-hidden="true">□</span>
          </button>
        </TrafficTooltip>
        <TrafficTooltip label="Reset layoutu ramek w aktualnym miesiącu" placement="top" delayMs={90}>
          <button
            aria-label="Reset layoutu ramek w aktualnym miesiącu"
            type="button"
            onClick={onResetLayout}
          >
            <span aria-hidden="true">↺</span>
          </button>
        </TrafficTooltip>
        <TrafficTooltip label="Sortuj projekty per ludzie" placement="top" delayMs={90}>
          <button
            aria-label="Sortuj projekty per ludzie"
            className="diablo-project-people-sort-trigger"
            type="button"
            onClick={handleSortProjectsByPeople}
          >
            <span aria-hidden="true">P/L</span>
          </button>
        </TrafficTooltip>
        <TrafficTooltip
          label={hiddenProjectCount ? `Ukryte projekty w tym miesiącu: ${hiddenProjectCount}` : 'Brak ukrytych projektów w tym miesiącu'}
          placement="top"
          delayMs={90}
        >
          <button
            aria-label={`Pokaż ukryte projekty w miesiącu: ${hiddenProjectCount}`}
            className="diablo-hidden-projects-trigger"
            disabled={!hiddenProjectCount}
            type="button"
            onClick={onOpenHiddenProjects}
          >
            <span>Ukryte</span>
            <b aria-hidden="true">{hiddenProjectCount}</b>
          </button>
        </TrafficTooltip>
        <TrafficTooltip
          label={clearMonthConfirmationPending
            ? 'Kliknij ponownie, aby wyczyścić ludzi i projekty tylko w tym miesiącu'
            : 'Wyczyść ludzi i projekty tylko z aktualnego miesiąca'}
          placement="top"
          delayMs={90}
        >
          <button
            aria-label={clearMonthConfirmationPending
              ? 'Potwierdź wyczyszczenie aktualnego miesiąca'
              : 'Wyczyść aktualny miesiąc'}
            className={`diablo-clear-month-trigger ${clearMonthConfirmationPending ? 'is-confirming' : ''}`}
            disabled={!hasVisibleMonthContent}
            type="button"
            onClick={handleClearMonthPlan}
          >
            <span>{clearMonthConfirmationPending ? 'Potwierdź' : 'Wyczyść miesiąc'}</span>
          </button>
        </TrafficTooltip>
      </div>
    </section>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getCanvasZoomMetrics(zoom: number) {
  const basePitch = DIABLO_CELL_SIZE + DIABLO_CELL_GAP;

  return {
    basePitch,
    cellSize: DIABLO_CELL_SIZE,
    gap: DIABLO_CELL_GAP,
    pitch: basePitch * zoom,
    visualCellSize: DIABLO_CELL_SIZE * zoom,
    visualGap: DIABLO_CELL_GAP * zoom,
    zoom,
  };
}

function getGridPixelSize(trackCount: number, cellSize = DIABLO_CELL_SIZE, gap = DIABLO_CELL_GAP) {
  return trackCount * cellSize + Math.max(0, trackCount - 1) * gap;
}

function formatPixelValue(value: number) {
  return `${Number(value.toFixed(3))}px`;
}

function getViewportSize(viewport: HTMLElement) {
  const rect = viewport.getBoundingClientRect();
  return {
    width: viewport.clientWidth || Math.round(rect.width),
    height: viewport.clientHeight || Math.round(rect.height),
  };
}

function getCanvasCardContentPixelBounds(
  layout: DiabloBoardLayout,
  visibleIds?: {
    personIds?: ReadonlySet<string>;
    projectIds?: ReadonlySet<string>;
  }
) {
  const projectIds = visibleIds?.projectIds;
  const personIds = visibleIds?.personIds;
  const projects = projectIds
    ? Object.fromEntries(Object.entries(layout.projects).filter(([projectId]) => projectIds.has(projectId)))
    : layout.projects;
  const people = personIds
    ? Object.fromEntries(Object.entries(layout.people || {}).filter(([personId]) => personIds.has(personId)))
    : layout.people;

  return getCanvasContentPixelBounds({
    ...layout,
    projects,
    people,
  }, DIABLO_CELL_SIZE, DIABLO_CELL_GAP, false);
}

function getCanvasProjectContentPixelBounds(
  layout: DiabloBoardLayout,
  projectIds: ReadonlySet<string>
) {
  const projects = Object.fromEntries(
    Object.entries(layout.projects).filter(([projectId]) => projectIds.has(projectId))
  );

  return getCanvasContentPixelBounds({
    ...layout,
    projects,
    people: {},
  }, DIABLO_CELL_SIZE, DIABLO_CELL_GAP, false);
}

function getScreenRectForCanvasBounds(bounds: CanvasPixelBounds, view: ViewportTransform): ScreenRect {
  const left = view.panX + bounds.left * view.scale;
  const top = view.panY + bounds.top * view.scale;
  const right = view.panX + bounds.right * view.scale;
  const bottom = view.panY + bounds.bottom * view.scale;

  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  };
}

function isRectFullyOffscreen(
  rect: ScreenRect,
  viewportSize: { width: number; height: number },
  margin: number
) {
  return (
    rect.right < margin ||
    rect.left > viewportSize.width - margin ||
    rect.bottom < margin ||
    rect.top > viewportSize.height - margin
  );
}

function isRectMeaningfullyVisible(
  rect: ScreenRect,
  viewportSize: { width: number; height: number },
  minimum: { minHeight: number; minWidth: number }
) {
  const visibleWidth = getVisibleSpan(rect.left, rect.right, viewportSize.width);
  const visibleHeight = getVisibleSpan(rect.top, rect.bottom, viewportSize.height);

  return visibleWidth >= minimum.minWidth && visibleHeight >= minimum.minHeight;
}

function getVisibleSpan(start: number, end: number, viewportLength: number) {
  return Math.max(0, Math.min(end, viewportLength) - Math.max(start, 0));
}

function getReadableOverviewViewport({
  bounds,
  projectBounds,
  viewportSize,
}: {
  bounds: CanvasPixelBounds;
  projectBounds: CanvasPixelBounds | null;
  viewportSize: { width: number; height: number };
}): ViewportTransform {
  const availableWidth = Math.max(1, viewportSize.width - DIABLO_OVERVIEW_GUTTER * 2);
  const availableHeight = Math.max(1, viewportSize.height - DIABLO_OVERVIEW_GUTTER * 2);
  const fitScale = Math.min(
    DIABLO_DEFAULT_ZOOM,
    availableWidth / Math.max(1, bounds.width),
    availableHeight / Math.max(1, bounds.height)
  );
  const scale = clamp(fitScale, DIABLO_MIN_READABLE_FIT_ZOOM, DIABLO_DEFAULT_ZOOM);
  let panX = DIABLO_OVERVIEW_GUTTER - bounds.left * scale;
  let panY = DIABLO_OVERVIEW_GUTTER - bounds.top * scale;

  if (!projectBounds) {
    return { scale, panX, panY };
  }

  const projectRect = getScreenRectForCanvasBounds(projectBounds, { scale, panX, panY });
  const minProjectWidth = Math.min(DIABLO_PROJECT_OVERVIEW_MIN_VISIBLE_WIDTH, projectRect.width);
  const minProjectHeight = Math.min(DIABLO_PROJECT_OVERVIEW_MIN_VISIBLE_HEIGHT, projectRect.height);
  const projectVisibleWidth = getVisibleSpan(projectRect.left, projectRect.right, viewportSize.width);
  const projectVisibleHeight = getVisibleSpan(projectRect.top, projectRect.bottom, viewportSize.height);

  if (projectVisibleWidth < minProjectWidth) {
    const maxLeft = Math.max(
      DIABLO_OVERVIEW_GUTTER,
      viewportSize.width - DIABLO_OVERVIEW_GUTTER - minProjectWidth
    );
    const targetLeft = clamp(viewportSize.width * 0.62, DIABLO_OVERVIEW_GUTTER, maxLeft);
    panX = targetLeft - projectBounds.left * scale;
  }

  if (projectVisibleHeight < minProjectHeight) {
    panY = DIABLO_OVERVIEW_GUTTER - projectBounds.top * scale;
  }

  return { scale, panX, panY };
}

function areViewportTransformsClose(first: ViewportTransform, second: ViewportTransform) {
  return (
    Math.abs(first.scale - second.scale) < 0.001 &&
    Math.abs(first.panX - second.panX) < 0.5 &&
    Math.abs(first.panY - second.panY) < 0.5
  );
}

function getViewportSafePanelPosition({
  canvasSize,
  panelSpan,
  position,
  view,
  viewport,
}: {
  canvasSize: DiabloCanvasSize;
  panelSpan: { columns: number; rows: number };
  position: { x: number; y: number };
  view: ViewportTransform;
  viewport: HTMLElement | null;
}) {
  const roundedPosition = {
    x: clampCanvasStart(
      Math.max(1, Math.round(position.x)),
      panelSpan.columns,
      Math.max(canvasSize.columns, panelSpan.columns)
    ),
    y: clampCanvasStart(
      Math.max(1, Math.round(position.y)),
      panelSpan.rows,
      Math.max(canvasSize.rows, panelSpan.rows)
    ),
  };
  if (!viewport) return roundedPosition;

  const viewportSize = getViewportSize(viewport);
  const pitch = (DIABLO_CELL_SIZE + DIABLO_CELL_GAP) * view.scale;
  if (viewportSize.width <= 0 || viewportSize.height <= 0 || pitch <= 0) return roundedPosition;

  const panelWidth = getGridPixelSize(panelSpan.columns) * view.scale;
  const panelHeight = getGridPixelSize(panelSpan.rows) * view.scale;
  const visibleWidth = Math.max(1, viewportSize.width - DIABLO_OVERVIEW_GUTTER * 2);
  const visibleHeight = Math.max(1, viewportSize.height - DIABLO_OVERVIEW_GUTTER * 2);
  const currentLeft = view.panX + (roundedPosition.x - 1) * pitch;
  const currentTop = view.panY + (roundedPosition.y - 1) * pitch;
  const maxLeft = Math.max(
    DIABLO_OVERVIEW_GUTTER,
    viewportSize.width - DIABLO_OVERVIEW_GUTTER - Math.min(panelWidth, visibleWidth)
  );
  const maxTop = Math.max(
    DIABLO_OVERVIEW_GUTTER,
    viewportSize.height - DIABLO_OVERVIEW_GUTTER - Math.min(panelHeight, visibleHeight)
  );
  const safeLeft = clamp(currentLeft, DIABLO_OVERVIEW_GUTTER, maxLeft);
  const safeTop = clamp(currentTop, DIABLO_OVERVIEW_GUTTER, maxTop);

  return {
    x: clampCanvasStart(
      Math.round((safeLeft - view.panX) / pitch) + 1,
      panelSpan.columns,
      Math.max(canvasSize.columns, panelSpan.columns)
    ),
    y: clampCanvasStart(
      Math.round((safeTop - view.panY) / pitch) + 1,
      panelSpan.rows,
      Math.max(canvasSize.rows, panelSpan.rows)
    ),
  };
}

function getControlPanelWidth(element: HTMLElement | null, fallbackWidth: number) {
  const width = element?.getBoundingClientRect().width || 0;
  return Math.ceil(width || fallbackWidth);
}

function getHorizontalIntersection(
  zoneLeft: number,
  zoneRight: number,
  viewportRect: Pick<DOMRect, 'left' | 'right'>
) {
  const left = Math.max(zoneLeft, viewportRect.left);
  const right = Math.min(zoneRight, viewportRect.right);

  return {
    left,
    right,
    width: Math.max(0, right - left),
  };
}

function canShowControlPanelInRange(range: { width: number }) {
  return range.width >= DIABLO_CONTROL_PANEL_MIN_VISIBLE_RANGE;
}

function canFitControlPanelInRange(range: { width: number }, panelWidth: number) {
  return range.width >= panelWidth + DIABLO_CONTROL_PANEL_VIEWPORT_GUTTER * 2;
}

function getControlPanelsLayout({
  canvasRect,
  peoplePanelWidth,
  peopleZoneColumns,
  pitch,
  projectPanelWidth,
  scale,
  viewportRect,
}: {
  canvasRect: Pick<DOMRect, 'left' | 'right'>;
  peoplePanelWidth: number;
  peopleZoneColumns: number;
  pitch: number;
  projectPanelWidth: number;
  scale: number;
  viewportRect: Pick<DOMRect, 'left' | 'right' | 'top'>;
}): ControlPanelsLayout {
  const top = Math.round(viewportRect.top + 8);
  const peopleZoneLeftX = canvasRect.left;
  const peopleZoneRightX = canvasRect.left + getGridPixelSize(peopleZoneColumns) * scale;
  const projectZoneLeftX = canvasRect.left + peopleZoneColumns * pitch + 6;
  const projectZoneRightX = canvasRect.right;
  const visiblePeopleRange = getHorizontalIntersection(peopleZoneLeftX, peopleZoneRightX, viewportRect);
  const visibleProjectRange = getHorizontalIntersection(projectZoneLeftX, projectZoneRightX, viewportRect);
  const peopleCanFitInVisibleRange = canFitControlPanelInRange(visiblePeopleRange, peoplePanelWidth);
  const projectCanFitInVisibleRange = canFitControlPanelInRange(visibleProjectRange, projectPanelWidth);
  let people: PeopleControlPanelPosition = {
    isVisible: canShowControlPanelInRange(visiblePeopleRange),
    rightX: peopleCanFitInVisibleRange
      ? Math.round(clampControlPanelRight(
        peopleZoneRightX - 6,
        visiblePeopleRange.left + peoplePanelWidth + DIABLO_CONTROL_PANEL_VIEWPORT_GUTTER,
        visiblePeopleRange.right - DIABLO_CONTROL_PANEL_VIEWPORT_GUTTER
      ))
      : Math.round(clampControlPanelRight(
        peopleZoneRightX - 6,
        viewportRect.left + peoplePanelWidth + DIABLO_CONTROL_PANEL_VIEWPORT_GUTTER,
        viewportRect.right - DIABLO_CONTROL_PANEL_VIEWPORT_GUTTER
      )),
    top,
  };
  let projects: ProjectControlPanelPosition = {
    isVisible: canShowControlPanelInRange(visibleProjectRange),
    leftX: projectCanFitInVisibleRange
      ? Math.round(clampControlPanelLeft(
        projectZoneLeftX,
        visibleProjectRange.left + DIABLO_CONTROL_PANEL_VIEWPORT_GUTTER,
        visibleProjectRange.right - projectPanelWidth - DIABLO_CONTROL_PANEL_VIEWPORT_GUTTER
      ))
      : Math.round(clampControlPanelLeft(
        projectZoneLeftX,
        viewportRect.left + DIABLO_CONTROL_PANEL_VIEWPORT_GUTTER,
        viewportRect.right - projectPanelWidth - DIABLO_CONTROL_PANEL_VIEWPORT_GUTTER
      )),
    top,
  };

  if (people.isVisible && projects.isVisible) {
    const hasCollision = people.rightX + DIABLO_CONTROL_PANEL_COLLISION_GAP > projects.leftX;
    if (hasCollision) {
      if (!peopleCanFitInVisibleRange && projectCanFitInVisibleRange) {
        people = { ...people, isVisible: false };
      } else if (peopleCanFitInVisibleRange && !projectCanFitInVisibleRange) {
        projects = { ...projects, isVisible: false };
      } else if (!peopleCanFitInVisibleRange && !projectCanFitInVisibleRange) {
        if (visiblePeopleRange.width <= visibleProjectRange.width) {
          people = { ...people, isVisible: false };
        } else {
          projects = { ...projects, isVisible: false };
        }
      } else {
        const projectMinLeft = people.rightX + DIABLO_CONTROL_PANEL_COLLISION_GAP;
        const projectMaxLeft = visibleProjectRange.right - projectPanelWidth - DIABLO_CONTROL_PANEL_VIEWPORT_GUTTER;
        if (projectMinLeft <= projectMaxLeft) {
          projects = { ...projects, leftX: Math.max(projects.leftX, Math.round(projectMinLeft)) };
        } else {
          const peopleMaxRight = projects.leftX - DIABLO_CONTROL_PANEL_COLLISION_GAP;
          const peopleMinRight = visiblePeopleRange.left + peoplePanelWidth + DIABLO_CONTROL_PANEL_VIEWPORT_GUTTER;
          if (peopleMinRight <= peopleMaxRight) {
            people = { ...people, rightX: Math.min(people.rightX, Math.round(peopleMaxRight)) };
          } else if (visiblePeopleRange.width <= visibleProjectRange.width) {
            people = { ...people, isVisible: false };
          } else {
            projects = { ...projects, isVisible: false };
          }
        }
      }
    }
  }

  return { people, projects };
}

function applyControlPanelElementPosition(
  element: HTMLElement,
  position: PeopleControlPanelPosition | ProjectControlPanelPosition,
  side: 'people' | 'projects'
) {
  if (side === 'people' && 'rightX' in position) {
    element.style.setProperty('--diablo-people-control-panel-right-x', `${position.rightX}px`);
    element.style.setProperty('--diablo-people-control-panel-top', `${position.top}px`);
  }
  if (side === 'projects' && 'leftX' in position) {
    element.style.setProperty('--diablo-project-control-panel-left-x', `${position.leftX}px`);
    element.style.setProperty('--diablo-project-control-panel-top', `${position.top}px`);
  }
  element.classList.toggle('is-hidden', !position.isVisible);
  element.setAttribute('aria-hidden', String(!position.isVisible));
}

function clampControlPanelLeft(value: number, min: number, max: number) {
  return min > max ? min : clamp(value, min, max);
}

function clampControlPanelRight(value: number, min: number, max: number) {
  return min > max ? max : clamp(value, min, max);
}

function formatProjectMetricK(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')}k`;
}

function formatProjectFrameCount(count: number) {
  if (count === 1) return '1 ramka';
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  const noun = lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)
    ? 'ramki'
    : 'ramek';

  return `${count} ${noun}`;
}

function getClipboardPasteTitle(
  clipboard: DiabloMonthClipboardPreview | null,
  canPaste: boolean,
  sectionLabel: string
) {
  if (canPaste && clipboard) return `Wklej ${sectionLabel} ze schowka: ${clipboard.sourcePeriodLabel}`;
  if (clipboard?.sourcePeriodId) return `Schowek z ${clipboard.sourcePeriodLabel} nie pasuje do tej sekcji albo miesiąca.`;
  return 'Najpierw skopiuj wybraną sekcję z innego miesiąca.';
}

function snapPersonFramePreviewLayout(
  layout: DiabloPersonLayout,
  canvasSize: DiabloCanvasSize
): DiabloPersonLayout {
  const width = Math.max(DIABLO_MIN_FRAME_WIDTH, Math.round(layout.width));
  const height = Math.max(DIABLO_PERSON_FRAME_HEADER_ROWS, Math.round(layout.height));

  return {
    ...layout,
    width,
    height,
    x: clampCanvasStart(Math.round(layout.x), width, canvasSize.columns),
    y: clampCanvasStart(Math.round(layout.y), height, canvasSize.rows),
  };
}

function isPersonFrameInsidePeopleZone(
  layout: DiabloPersonLayout,
  boardLayout: Pick<DiabloBoardLayout, 'peopleZoneColumns'>
) {
  return Math.round(layout.x) + Math.round(layout.width) - 1 <= getDiabloPeopleZoneColumns(boardLayout);
}

function getCanvasContentPixelBounds(
  layout: DiabloBoardLayout,
  cellSize = DIABLO_CELL_SIZE,
  gap = DIABLO_CELL_GAP,
  includeLegend = true
): CanvasPixelBounds | null {
  const legendSpan = getDiabloPanelGridSpan('legend', layout.panels.legend);
  const items = [
    ...Object.values(layout.projects).map((projectLayout) => ({
      x: projectLayout.x,
      y: projectLayout.y,
      width: projectLayout.width,
      height: projectLayout.height,
    })),
    ...Object.values(layout.people || {}).map((personLayout) => ({
      x: personLayout.x,
      y: personLayout.y,
      width: personLayout.width,
      height: personLayout.height,
    })),
    ...(includeLegend ? [{
      x: layout.panels.legend.x,
      y: layout.panels.legend.y,
      width: legendSpan.columns,
      height: legendSpan.rows,
    }] : []),
  ];

  if (!items.length) return null;

  return items.reduce((bounds, item) => {
    const pitch = cellSize + gap;
    const left = Math.max(0, item.x - 1) * pitch;
    const top = Math.max(0, item.y - 1) * pitch;
    const right = left + getGridPixelSize(item.width, cellSize, gap);
    const bottom = top + getGridPixelSize(item.height, cellSize, gap);
    const nextLeft = Math.min(bounds.left, left);
    const nextTop = Math.min(bounds.top, top);
    const nextRight = Math.max(bounds.right, right);
    const nextBottom = Math.max(bounds.bottom, bottom);

    return {
      bottom: nextBottom,
      height: nextBottom - nextTop,
      left: nextLeft,
      right: nextRight,
      top: nextTop,
      width: nextRight - nextLeft,
    };
  }, {
    bottom: Number.NEGATIVE_INFINITY,
    height: 0,
    left: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    width: 0,
  });
}

function getHorizontalContentPixelBounds(layout: DiabloBoardLayout, cellSize = DIABLO_CELL_SIZE, gap = DIABLO_CELL_GAP) {
  const bounds = getCanvasContentPixelBounds(layout, cellSize, gap);
  if (!bounds) return null;

  return {
    left: bounds.left,
    right: bounds.right,
  };
}

function comparePeopleForCanvasSort(firstPerson: Person, secondPerson: Person, skillsById: Map<string, Skill>) {
  const firstKey = getPersonCanvasSortKey(firstPerson, skillsById);
  const secondKey = getPersonCanvasSortKey(secondPerson, skillsById);

  if (firstKey.hasSkills !== secondKey.hasSkills) return firstKey.hasSkills ? -1 : 1;

  const primarySkillComparison = firstKey.primarySkill.localeCompare(secondKey.primarySkill, 'pl', { sensitivity: 'base' });
  if (primarySkillComparison !== 0) return primarySkillComparison;

  const nameComparison = firstKey.name.localeCompare(secondKey.name, 'pl', { sensitivity: 'base' });
  if (nameComparison !== 0) return nameComparison;

  const skillComparison = firstKey.skillKey.localeCompare(secondKey.skillKey, 'pl', { sensitivity: 'base' });
  if (skillComparison !== 0) return skillComparison;

  return firstPerson.id.localeCompare(secondPerson.id, 'pl', { sensitivity: 'base' });
}

function isDiabloPersonLayoutCoveredByExpandedDetails(
  personLayout: DiabloPersonLayout,
  expandedLayout: DiabloPersonLayout | null,
  expandedPersonId: string | null
) {
  if (!expandedLayout || personLayout.personId === expandedPersonId) return false;

  const columnsOverlap = personLayout.x < expandedLayout.x + expandedLayout.width &&
    expandedLayout.x < personLayout.x + personLayout.width;
  if (!columnsOverlap) return false;

  const expandedFrameBottom = expandedLayout.y + expandedLayout.height;
  return personLayout.y >= expandedFrameBottom &&
    personLayout.y < expandedFrameBottom + DIABLO_PERSON_DETAILS_OVERLAY_DIM_ROWS;
}

function formatSelectionCapacityLabel(selection: DiabloSelection) {
  const squareCount = selection.width * selection.height;
  return `${squareCount} kw. / ${squareCount}k`;
}

function getPersonCanvasSortKey(person: Person, skillsById: Map<string, Skill>) {
  const skillLabels = person.skillIds
    .map((skillId) => skillsById.get(skillId)?.label || skillId)
    .sort((firstLabel, secondLabel) => firstLabel.localeCompare(secondLabel, 'pl', { sensitivity: 'base' }));

  return {
    hasSkills: skillLabels.length > 0,
    name: person.name,
    primarySkill: skillLabels[0] || '',
    skillKey: skillLabels.join(' / '),
  };
}

function compareProjectsForCanvasSort(firstProject: ProjectFrame, secondProject: ProjectFrame) {
  const firstLabel = `${firstProject.client} ${firstProject.name}`;
  const secondLabel = `${secondProject.client} ${secondProject.name}`;

  return firstLabel.localeCompare(secondLabel, 'pl', { sensitivity: 'base' }) ||
    firstProject.id.localeCompare(secondProject.id, 'pl', { sensitivity: 'base' });
}

function setAllocationGroupDragImage(
  event: ReactDragEvent,
  allocations: PersonTileAllocation[],
  peopleById: Map<string, Person>
) {
  if (allocations.length <= 1 || !event.dataTransfer?.setDragImage || typeof document === 'undefined') return;

  const preview = document.createElement('div');
  preview.className = 'diablo-allocation-group-drag-preview';
  preview.setAttribute('aria-hidden', 'true');

  allocations.slice(0, 12).forEach((allocation) => {
    const person = peopleById.get(allocation.personId);
    const tile = document.createElement('span');
    tile.dataset.layer = person ? getTileLayer(person, allocation.tileIndex, allocation.periodId) : 'work';
    tile.style.setProperty('--diablo-person-color', person?.color || '#64748b');
    tile.textContent = person?.initials || '?';
    preview.appendChild(tile);
  });

  if (allocations.length > 12) {
    const extra = document.createElement('b');
    extra.textContent = `+${allocations.length - 12}`;
    preview.appendChild(extra);
  }

  const label = document.createElement('strong');
  label.textContent = `${allocations.length} kaf.`;
  preview.appendChild(label);
  document.body.appendChild(preview);
  event.dataTransfer.setDragImage(preview, 28, 28);
  window.requestAnimationFrame(() => preview.remove());
}

function getCanvasGrowthForRect(rect: CanvasRect, canvasSize: DiabloCanvasSize): DiabloCanvasGrowth {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const leftOverflow = Math.max(0, 1 - x);
  const topOverflow = Math.max(0, 1 - y);
  const rightOverflow = Math.max(0, x + width - 1 - canvasSize.columns);
  const bottomOverflow = Math.max(0, y + height - 1 - canvasSize.rows);

  return {
    left: leftOverflow ? leftOverflow + DIABLO_INTERACTION_GROWTH_BUFFER : 0,
    top: topOverflow ? topOverflow + DIABLO_INTERACTION_GROWTH_BUFFER : 0,
    right: rightOverflow ? rightOverflow + DIABLO_INTERACTION_GROWTH_BUFFER : 0,
    bottom: bottomOverflow ? bottomOverflow + DIABLO_INTERACTION_GROWTH_BUFFER : 0,
  };
}

function hasCanvasGrowth(growth: DiabloCanvasGrowth) {
  return Boolean((growth.left || 0) || (growth.right || 0) || (growth.top || 0) || (growth.bottom || 0));
}
