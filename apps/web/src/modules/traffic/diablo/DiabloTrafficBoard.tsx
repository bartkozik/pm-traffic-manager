import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AllocationEditor } from '../components/AllocationEditor';
import { CollaborationPresenceLayer } from '../components/CollaborationPresence';
import { HelpModal } from '../components/HelpModal';
import { ProjectEditor } from '../components/ProjectEditor';
import { PersonEditor } from '../components/PersonEditor';
import { PlanningRulesManager } from '../components/PlanningRulesManager';
import { PeriodTimelineNavigator } from '../components/PeriodTimelineNavigator';
import { TrafficHeader } from '../components/TrafficHeader';
import { DragPayload, DropPayloadOptions } from '../components/types';
import { lensLabels } from '../components/constants';
import type { HelpTopicId } from '../help/helpContent';
import {
  filterPersonCostCapacityAllocations,
  getPersonPeriodProfile,
  type MonthPlanAllocationCopy,
  type MonthPlanPasteMode,
  type MonthPlanPersonCopy,
  type MonthPlanProjectCopy,
  isPersonActiveInPeriod,
  isTimeOffProject,
  getPersonWeeklySlotCount,
  getWeeklyAllocationId,
  getWeeklySlotWeekId,
  type MoveTrafficAllocation,
  type Person,
  type PersonTileAllocation,
  type ProjectFrame,
  type ProjectWorkType,
  type TrafficBoardCommand,
  type TrafficSnapshot,
  type TileUnit,
} from '../models/traffic.model';
import { loadTrafficBoardSnapshot, moveTrafficBoardAllocations } from '../services/trafficBoardApi';
import { defaultSyncServerConfig } from '../services/trafficRuntimeConfig';
import { useTrafficStore } from '../stores/trafficStore';
import { generateBoardRisks } from '../utils/boardRisks';
import {
  createPersonDraft,
  createProjectDraft,
  getStoredTheme,
  getStoredTileMetricMode,
  sanitizeRoomName,
  type TrafficTheme,
} from '../utils/trafficBoardDrafts';
import { getPersonPeriodCostK, getPersonPeriodLayers } from '../utils/personPeriod';
import { isProjectActiveInPeriod } from '../utils/projectPeriod';
import { generateReviewSnapshot } from '../utils/reviewSnapshot';
import {
  getCollaborationCursorFromPointer,
  getCollaborationTargetHitFromElement,
  getPresenceClickActionLabel,
} from '../utils/collaborationDom';
import {
  CollaborationActionType,
  CollaborationCursor,
  CollaborationTarget,
  CollaborationViewState,
  filterCollaborationPeersForBoardView,
  getCollaborationTargetKey,
  getCollaborationTargetLabel,
  getVisibleCollaborationPeersForBoardView,
  getStoredCollaborationTrackingEnabled,
  getStoredFollowedCollaborationUserId,
  persistCollaborationTrackingEnabled,
  persistFollowedCollaborationUserId,
} from '../utils/collaborationPresence';
import {
  getMonthRangeStartId,
  getVisibleMonthPeriods,
  isMonthPeriodVisible,
} from '../components/periodRange';
import { DiabloHiddenProjectsModal } from './DiabloHiddenProjectsModal';
import { DiabloMonthCanvas, type DiabloCanvasTool } from './DiabloMonthCanvas';
import {
  areDiabloLayoutsEqual,
  areDiabloSharedProjectLayoutsEqual,
  clearDiabloLayout,
  cloneDiabloSharedProjectLayout,
  createEmptyDiabloLayout,
  createInitialDiabloLayout,
  createProjectDraftFromSelection,
  DIABLO_SHARED_LAYOUT_MAP,
  DiabloBoardLayout,
  DiabloPersonLayout,
  DiabloProjectLayout,
  DiabloSelection,
  ensureDiabloProjectLayouts,
  ensureDiabloPersonLayouts,
  getDiabloCanvasSize,
  getDiabloLayoutStorageKey,
  getFrameCellCount,
  getPersonFrameDimensionsForTileCount,
  getProjectPeriodRevenueK,
  getSelectionRevenueK,
  mergeDiabloSharedProjectLayout,
  parseDiabloLayout,
  readDiabloLayout,
  resolveDiabloLayoutSyncBase,
  snapPersonFrameLayout,
  snapFrameLayout,
  writeDiabloLayout,
} from './diabloLayout';
import { getBusinessWeeksForMonth } from '../utils/weeklyDrilldown';
import {
  buildWeeklyCanvasState,
  getEffectiveWeeklyAllocations,
  parseWeeklyTileId,
} from '../utils/weeklyCanvas';
import {
  getDiabloPlanningPerspectiveFromSearch,
  getDiabloPlanningSearchForPerspective,
} from './diabloPerspective';
import './DiabloTrafficBoard.css';

const roomPresets = [
  { id: 'ptm-mvp', label: 'Plan bazowy' },
  { id: 'ptm-sales-scenario', label: 'Scenariusz sprzedaży' },
  { id: 'ptm-delivery-risk', label: 'Ryzyko realizacji' },
];
const emptyPersonIdSet = new Set<string>();

const workTypeCycle: ProjectWorkType[] = [
  'commercial',
  'research_development',
  'waiting_room',
  'defensive_maintenance',
  'time_off',
];

const collaborationBoardView = 'diablo';
const emptyBenchAllocations: PersonTileAllocation[] = [];
type DiabloLayoutSyncScope = 'shared' | 'local';

interface DiabloMonthClipboard {
  mode: MonthPlanPasteMode;
  sourcePeriodId: string;
  sourcePeriodLabel: string;
  people: MonthPlanPersonCopy[];
  projects: MonthPlanProjectCopy[];
  allocations: MonthPlanAllocationCopy[];
  layout: {
    people?: Record<string, DiabloPersonLayout>;
    projects?: Record<string, DiabloProjectLayout>;
    peopleZoneColumns?: number;
  };
}

interface SharedDiabloLayoutMap {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  observe: (callback: () => void) => void;
  unobserve: (callback: () => void) => void;
}

interface ProviderWithSharedDoc {
  doc?: {
    getMap?: (name: string) => SharedDiabloLayoutMap;
  };
}

export default function DiabloTrafficBoard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId, host, wsPort, httpPort } = useParams<{
    projectId?: string;
    host?: string;
    wsPort?: string;
    httpPort?: string;
  }>();
  const roomName = projectId || 'ptm-mvp';
  const serverConfig = useMemo(() => {
    return host && wsPort ? { host, wsPort: Number(wsPort) } : defaultSyncServerConfig;
  }, [host, wsPort]);

  const {
    activePeriodId: sharedActivePeriodId,
    activeTileUnitId,
    allocations,
    applyBoardCommand,
    archiveProject,
    collaborationPeers,
    collaborationUser,
    createNextMonth,
    createPerson,
    durableError,
    durableLoadStatus,
    durableSaveStatus,
    durableUpdatedAt,
    initializeBoard,
    isConnected,
    isSynced,
    lens,
    moveTilesToTargets,
    planningRules = [],
    people,
    periods,
    provider,
    projects,
    deleteProject,
    archivePerson,
    replaceBoardSnapshot,
    resetBoard,
    resetPersonAllocations,
    restoreProject,
    revenueView,
    schemaVersion,
    ensurePlanningRange,
    ensurePeriodCapacity,
    setCollaborationActiveTarget,
    setCollaborationAction,
    setCollaborationCursor,
    setCollaborationEditingTarget,
    setCollaborationTrackingEnabled,
    setCollaborationUserName,
    setCollaborationView,
    setRevenueView,
    skills,
    tileUnits,
    updateAllocationWithGroupMeetingState,
    updatePerson,
    updateProject,
    upsertPlanningRules,
    deletePlanningRule,
    weeklyAllocations = [],
  } = useTrafficStore();

  const [customRoomName, setCustomRoomName] = useState(roomName);
  const [theme, setTheme] = useState<TrafficTheme>(() => getStoredTheme());
  const [tileMetricMode, setTileMetricMode] = useState(() => getStoredTileMetricMode());
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [resetConfirmationPending, setResetConfirmationPending] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [activeHelpTopicId, setActiveHelpTopicId] = useState<HelpTopicId | null>(null);
  const [isPlanningRulesOpen, setIsPlanningRulesOpen] = useState(false);
  const [planningRulesInitialProjectId, setPlanningRulesInitialProjectId] = useState<string | undefined>(undefined);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectPeriodId, setEditingProjectPeriodId] = useState<string | null>(null);
  const [newProjectDraft, setNewProjectDraft] = useState<ProjectFrame | null>(null);
  const [pendingNewProjectLayout, setPendingNewProjectLayout] = useState<DiabloProjectLayout | null>(null);
  const [pendingArchiveProjectKey, setPendingArchiveProjectKey] = useState<string | null>(null);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingPersonPeriodId, setEditingPersonPeriodId] = useState<string | null>(null);
  const [newPersonDraft, setNewPersonDraft] = useState<Person | null>(null);
  const [pendingNewPersonLayout, setPendingNewPersonLayout] = useState<DiabloPersonLayout | null>(null);
  const [monthClipboard, setMonthClipboard] = useState<DiabloMonthClipboard | null>(null);
  const [editingAllocationId, setEditingAllocationId] = useState<string | null>(null);
  const [isHiddenProjectsOpen, setIsHiddenProjectsOpen] = useState(false);
  const [activePeriodId, setLocalActivePeriodId] = useState(sharedActivePeriodId);
  const [layout, setLayout] = useState<DiabloBoardLayout>(() => createInitialDiabloLayout(roomName, activePeriodId));
  const [canvasTool, setCanvasTool] = useState<DiabloCanvasTool>('move');
  const [periodRangeStartId, setPeriodRangeStartId] = useState(activePeriodId);
  const [collaborationTrackingEnabled, setCollaborationTrackingEnabledState] = useState(() => getStoredCollaborationTrackingEnabled());
  const [followedCollaborationUserId, setFollowedCollaborationUserIdState] = useState<string | null>(() => getStoredFollowedCollaborationUserId());
  const [activeWeekId, setActiveWeekId] = useState<string | null>(null);
  const locationPlanningPerspective = getDiabloPlanningPerspectiveFromSearch(location.search);
  const [isWeekPerspective, setIsWeekPerspective] = useState(locationPlanningPerspective === 'week');
  const pendingPresenceRef = useRef<{ cursor: CollaborationCursor; target: CollaborationTarget | null } | null>(null);
  const presenceFrameRef = useRef<number | null>(null);
  const activePresenceTargetKeyRef = useRef<string | null>(null);
  const pendingLocalLayoutSyncRef = useRef(false);
  const activePeriodRoomNameRef = useRef(roomName);
  const sharedActivePeriodIdRef = useRef(sharedActivePeriodId);

  useEffect(() => {
    initializeBoard(roomName, serverConfig);
  }, [initializeBoard, roomName, serverConfig]);

  useEffect(() => {
    sharedActivePeriodIdRef.current = sharedActivePeriodId;
  }, [sharedActivePeriodId]);

  useEffect(() => {
    setIsWeekPerspective(locationPlanningPerspective === 'week');
  }, [locationPlanningPerspective]);

  useEffect(() => {
    setCustomRoomName(roomName);
    setSnapshotStatus('idle');
    setEditingProjectId(null);
    setEditingPersonId(null);
    setEditingAllocationId(null);
    setNewProjectDraft(null);
    setPendingNewProjectLayout(null);
    setPendingArchiveProjectKey(null);
    setPendingDeleteProjectId(null);
    setIsHiddenProjectsOpen(false);
    if (activePeriodRoomNameRef.current !== roomName) {
      activePeriodRoomNameRef.current = roomName;
      setLocalActivePeriodId(sharedActivePeriodIdRef.current);
      setPeriodRangeStartId(sharedActivePeriodIdRef.current);
    }
  }, [roomName]);

  useEffect(() => {
    window.localStorage.setItem('ptm-traffic-theme', theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('ptm-tile-metric-mode', tileMetricMode);
  }, [tileMetricMode]);

  useEffect(() => {
    if (!resetConfirmationPending) return undefined;
    const timeoutId = window.setTimeout(() => setResetConfirmationPending(false), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [resetConfirmationPending]);

  useEffect(() => {
    if (!pendingArchiveProjectKey && !pendingDeleteProjectId) return undefined;
    const timeoutId = window.setTimeout(() => {
      setPendingArchiveProjectKey(null);
      setPendingDeleteProjectId(null);
    }, 4000);
    return () => window.clearTimeout(timeoutId);
  }, [pendingArchiveProjectKey, pendingDeleteProjectId]);

  const activePeriod = periods.find((period) => period.id === activePeriodId && period.granularity === 'month');
  const monthPeriods = useMemo(
    () => periods.filter((period) => period.granularity === 'month').sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
    [periods]
  );

  useEffect(() => {
    if (!monthPeriods.length || monthPeriods.some((period) => period.id === activePeriodId)) return;
    const fallbackPeriodId = monthPeriods.find((period) => period.id === sharedActivePeriodId)?.id || monthPeriods[0].id;
    setLocalActivePeriodId(fallbackPeriodId);
    setPeriodRangeStartId(fallbackPeriodId);
  }, [activePeriodId, monthPeriods, sharedActivePeriodId]);

  const visibleMonthPeriods = useMemo(
    () => getVisibleMonthPeriods(monthPeriods, periodRangeStartId, 1),
    [monthPeriods, periodRangeStartId]
  );
  const activePeople = useMemo(
    () => people
      .filter((person) => isPersonActiveInPeriod(person, activePeriodId))
      .map((person) => getPersonPeriodProfile(person, activePeriodId)),
    [activePeriodId, people]
  );
  const activePeopleById = useMemo(() => new Map(activePeople.map((person) => [person.id, person])), [activePeople]);
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const skillsById = useMemo(() => new Map(skills.map((skill) => [skill.id, skill])), [skills]);
  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const rawPeriodAllocations = useMemo(
    () => allocations.filter((allocation) => allocation.periodId === activePeriodId),
    [activePeriodId, allocations]
  );
  const visibleAllocations = useMemo(
    () => filterPersonCostCapacityAllocations(allocations, peopleById),
    [allocations, peopleById]
  );
  const periodAllocations = useMemo(
    () => filterPersonCostCapacityAllocations(rawPeriodAllocations, peopleById),
    [peopleById, rawPeriodAllocations]
  );
  const allocationsByTarget = useMemo(() => {
    const result = new Map<string, typeof periodAllocations>();
    periodAllocations.forEach((allocation) => {
      const current = result.get(allocation.target) || [];
      current.push(allocation);
      result.set(allocation.target, current);
    });
    return result;
  }, [periodAllocations]);
  const visibleProjects = useMemo(() => {
    if (!activePeriod) return [];
    return projects
      .filter((project) => !project.archivedAt)
      .filter((project) => !(project.archivedPeriodIds || []).includes(activePeriod.id))
      .filter((project) => isProjectActiveInPeriod(project, activePeriod.id, allocationsByTarget));
  }, [activePeriod, allocationsByTarget, projects]);
  const hiddenProjects = useMemo(() => {
    if (!activePeriod) return [];
    return projects
      .filter((project) => !project.archivedAt)
      .filter((project) => (project.archivedPeriodIds || []).includes(activePeriod.id))
      .filter((project) => isProjectRelevantInPeriod(project, activePeriod.id, allocationsByTarget))
      .sort((first, second) => `${first.client} ${first.name}`.localeCompare(`${second.client} ${second.name}`, 'pl'));
  }, [activePeriod, allocationsByTarget, projects]);
  const benchAllocations = allocationsByTarget.get('bench') || emptyBenchAllocations;
  const activeProjects = visibleProjects;

  // Week perspective: month-clipped Mon–Fri business weeks for the active month.
  // A week that straddles a month boundary shows as a short stub here (its days in
  // the neighbouring month live under that month's own strip — the week is split).
  const businessWeeks = useMemo(
    () => (isWeekPerspective && activePeriod ? getBusinessWeeksForMonth(activePeriod) : []),
    [activePeriod, isWeekPerspective]
  );
  const monthWorkingDays = useMemo(
    () => businessWeeks.reduce((sum, week) => sum + week.workingDays, 0),
    [businessWeeks]
  );
  const todayWeekId = useMemo(() => {
    if (!businessWeeks.length) return null;
    const today = new Date().toISOString().slice(0, 10);
    return businessWeeks.find((week) => week.startsOn <= today && today <= week.endsOn)?.id || null;
  }, [businessWeeks]);
  useEffect(() => {
    if (!isWeekPerspective) return;
    if (!businessWeeks.length) {
      if (activeWeekId !== null) setActiveWeekId(null);
      return;
    }
    if (activeWeekId && businessWeeks.some((week) => week.id === activeWeekId)) return;
    setActiveWeekId(todayWeekId || businessWeeks[0].id);
  }, [activeWeekId, businessWeeks, isWeekPerspective, todayWeekId]);
  const activeWeek = businessWeeks.find((week) => week.id === activeWeekId) || null;
  const activeWeekShare = activeWeek && monthWorkingDays ? activeWeek.workingDays / monthWorkingDays : 0;
  const weeklyProjectCapacityKById = useMemo(() => {
    if (!isWeekPerspective || !activeWeek || !activeWeekShare) return undefined;

    return new Map(visibleProjects.map((project) => {
      const projectLayout = layout.projects[project.id];
      const monthlyCellCount = Math.max(
        1,
        projectLayout
          ? projectLayout.width * projectLayout.height
          : getFrameCellCount(getProjectPeriodRevenueK(project, activePeriodId))
      );
      const weeklyCellCount = Math.max(1, Math.ceil(monthlyCellCount * activeWeekShare));
      return [project.id, weeklyCellCount] as const;
    }));
  }, [
    activePeriodId,
    activeWeek,
    activeWeekShare,
    isWeekPerspective,
    layout.projects,
    visibleProjects,
  ]);
  const canvasWeeklyAllocations = useMemo(() => {
    if (!isWeekPerspective || !activePeriod) return weeklyAllocations;

    const snapshot: TrafficSnapshot = {
      schemaVersion,
      activePeriodId: sharedActivePeriodId,
      activeTileUnitId,
      skills,
      periods,
      tileUnits,
      people,
      projects,
      allocations,
      weeklyAllocations,
      planningRules,
    };
    return getEffectiveWeeklyAllocations(snapshot, activePeriod.id);
  }, [
    activePeriod,
    activePeriodId,
    activeTileUnitId,
    allocations,
    isWeekPerspective,
    people,
    periods,
    planningRules,
    projects,
    schemaVersion,
    sharedActivePeriodId,
    skills,
    tileUnits,
    weeklyAllocations,
  ]);
  const activeWeekAllocatedHours = useMemo(() => {
    if (!activeWeek) return 0;
    return canvasWeeklyAllocations
      .filter((allocation) => (
        allocation.monthPeriodId === activePeriodId &&
        allocation.weekPeriodId === activeWeek.id &&
        allocation.target !== 'bench'
      ))
      .reduce((sum, allocation) => sum + (allocation.hours || 0), 0);
  }, [activePeriodId, activeWeek, canvasWeeklyAllocations]);

  const weeklyCanvasState = useMemo(() => {
    if (!isWeekPerspective || !activePeriod || !activeWeek) return null;
    return buildWeeklyCanvasState({
      activePeople,
      activePeriod,
      activeWeek,
      monthWorkingDays,
      visibleProjects,
      weeklyAllocations: canvasWeeklyAllocations,
      weeklyProjectCapacityKById,
    });
  }, [
    activePeople,
    activePeriod,
    activeWeek,
    canvasWeeklyAllocations,
    isWeekPerspective,
    monthWorkingDays,
    visibleProjects,
    weeklyProjectCapacityKById,
  ]);
  const canvasPeriodAllocations = weeklyCanvasState?.periodAllocations || periodAllocations;
  const canvasBenchAllocations = weeklyCanvasState?.benchAllocations || benchAllocations;
  const canvasProjects = weeklyCanvasState?.projects || visibleProjects;
  const canvasProjectsById = weeklyCanvasState?.projectsById || projectsById;
  const weeklyActiveFreeSlotIndexesByPersonId = useMemo(() => {
    if (!isWeekPerspective || !activePeriod || !activeWeek) return undefined;
    const assignedSlotIds = new Set(
      canvasWeeklyAllocations
        .filter((allocation) => (
          allocation.monthPeriodId === activePeriod.id &&
          allocation.target !== 'bench'
        ))
        .map((allocation) => allocation.id)
    );
    const result = new Map<string, number[]>();

    activePeople.forEach((person) => {
      const periodPerson = getPersonPeriodProfile(person, activePeriod.id);
      const slotCount = getPersonWeeklySlotCount(periodPerson, activePeriod.id);
      const freeSlotIndexes = Array.from({ length: slotCount }, (_, slotIndex) => slotIndex)
        .filter((slotIndex) => (
          getWeeklySlotWeekId(businessWeeks, slotCount, slotIndex) === activeWeek.id &&
          !assignedSlotIds.has(getWeeklyAllocationId(activePeriod.id, person.id, slotIndex))
        ));
      if (freeSlotIndexes.length) result.set(person.id, freeSlotIndexes);
    });

    return result;
  }, [
    activePeople,
    activePeriod,
    activeWeek,
    businessWeeks,
    canvasWeeklyAllocations,
    isWeekPerspective,
  ]);
  const weeklyPersonProjectDragPersonIds = useMemo(() => (
    weeklyActiveFreeSlotIndexesByPersonId
      ? new Set(weeklyActiveFreeSlotIndexesByPersonId.keys())
      : undefined
  ), [weeklyActiveFreeSlotIndexesByPersonId]);
  const canvasLayout = useMemo(() => (
    weeklyCanvasState
      ? createWeeklyRenderLayout(layout, canvasProjects, activePeriodId)
      : layout
  ), [activePeriodId, canvasProjects, layout, weeklyCanvasState]);

  const projectLayoutInputs = useMemo(
    () => visibleProjects.map((project) => {
      const projectAllocations = periodAllocations.filter((allocation) => allocation.target === project.id);
      return {
        id: project.id,
        revenueK: getProjectPeriodRevenueK(project, activePeriodId),
        contractType: project.contractType,
        workType: project.workType,
        allocatedTileCount: projectAllocations.length,
        allocatedPeopleCount: new Set(projectAllocations.map((allocation) => allocation.personId)).size,
      };
    }),
    [activePeriodId, periodAllocations, visibleProjects]
  );
  const personLayoutInputs = useMemo(
    () => activePeople.map((person) => ({
      id: person.id,
      tileCount: canvasBenchAllocations.filter((allocation) => (
        allocation.personId === person.id &&
        allocation.periodId === activePeriodId
      )).length,
    })),
    [activePeople, activePeriodId, canvasBenchAllocations]
  );
  const projectLayoutSignature = useMemo(
    () => [
      ...projectLayoutInputs.map((project) => `project:${project.id}:${project.revenueK}:${project.allocatedTileCount}:${project.allocatedPeopleCount}:${project.contractType}:${project.workType}`),
      ...personLayoutInputs.map((person) => `person:${person.id}:${person.tileCount}`),
    ].join('|'),
    [personLayoutInputs, projectLayoutInputs]
  );
  const sharedLayoutMap = useMemo(() => getSharedDiabloLayoutMap(provider), [provider]);
  const sharedLayoutKey = activePeriod ? getDiabloLayoutStorageKey(roomName, activePeriod.id) : null;

  useEffect(() => {
    const normalizedRangeStartId = getMonthRangeStartId(monthPeriods, periodRangeStartId, 1);
    if (normalizedRangeStartId !== periodRangeStartId) {
      setPeriodRangeStartId(normalizedRangeStartId);
      return;
    }

    if (!isMonthPeriodVisible(monthPeriods, periodRangeStartId, 1, activePeriodId)) {
      setPeriodRangeStartId(activePeriodId);
    }
  }, [activePeriodId, monthPeriods, periodRangeStartId]);

  useEffect(() => {
    ensurePlanningRange(periodRangeStartId, 1);
  }, [ensurePlanningRange, monthPeriods.length, periodRangeStartId]);

  useEffect(() => {
    visibleMonthPeriods.forEach((period) => ensurePeriodCapacity(period.id));
  }, [ensurePeriodCapacity, visibleMonthPeriods]);

  useEffect(() => {
    if (!activePeriod) return;
    setLayout((current) => {
      const isSameBoardPeriod = current.roomName === roomName && current.periodId === activePeriod.id;
      const sharedLayout = sharedLayoutKey && sharedLayoutMap
        ? parseDiabloLayout(sharedLayoutMap.get(sharedLayoutKey), roomName, activePeriod.id)
        : null;
      const localLayout = isSameBoardPeriod
        ? current
        : readDiabloLayout(roomName, activePeriod.id) || createEmptyDiabloLayout(roomName, activePeriod.id);
      const shouldKeepPendingLocalLayout = pendingLocalLayoutSyncRef.current && isSameBoardPeriod;
      const baseLayout = resolveDiabloLayoutSyncBase(sharedLayout, localLayout, shouldKeepPendingLocalLayout);
      const nextLayout = ensureDiabloPersonLayouts(
        ensureDiabloProjectLayouts(baseLayout, projectLayoutInputs),
        personLayoutInputs
      );
      return areDiabloLayoutsEqual(current, nextLayout) ? current : nextLayout;
    });
  }, [activePeriod, personLayoutInputs, projectLayoutInputs, projectLayoutSignature, roomName, sharedLayoutKey, sharedLayoutMap]);

  useEffect(() => {
    if (!activePeriod || !sharedLayoutKey || !sharedLayoutMap) return undefined;

    const applySharedLayout = () => {
      const sharedLayout = parseDiabloLayout(sharedLayoutMap.get(sharedLayoutKey), roomName, activePeriod.id);
      if (!sharedLayout) return;
      if (pendingLocalLayoutSyncRef.current) return;

      setLayout((current) => {
        const nextLayout = ensureDiabloPersonLayouts(
          ensureDiabloProjectLayouts(
            mergeDiabloSharedProjectLayout(sharedLayout, current),
            projectLayoutInputs
          ),
          personLayoutInputs
        );
        return areDiabloSharedProjectLayoutsEqual(current, nextLayout) ? current : nextLayout;
      });
    };

    applySharedLayout();
    sharedLayoutMap.observe(applySharedLayout);
    return () => sharedLayoutMap.unobserve(applySharedLayout);
  }, [activePeriod, personLayoutInputs, projectLayoutInputs, projectLayoutSignature, roomName, sharedLayoutKey, sharedLayoutMap]);

  useEffect(() => {
    if (!activePeriod || layout.roomName !== roomName || layout.periodId !== activePeriod.id) return;
    writeDiabloLayout(layout);

    if (!sharedLayoutKey || !sharedLayoutMap || !isSynced) return;

    const sharedLayout = parseDiabloLayout(sharedLayoutMap.get(sharedLayoutKey), roomName, activePeriod.id);
    const shouldSeedSharedLayout = !sharedLayout;
    const shouldPublishLocalLayout = pendingLocalLayoutSyncRef.current && !areDiabloSharedProjectLayoutsEqual(sharedLayout, layout);

    if (shouldSeedSharedLayout || shouldPublishLocalLayout) {
      sharedLayoutMap.set(sharedLayoutKey, cloneDiabloSharedProjectLayout(layout));
    }

    if (pendingLocalLayoutSyncRef.current) {
      pendingLocalLayoutSyncRef.current = false;
    }
  }, [activePeriod, isSynced, layout, roomName, sharedLayoutKey, sharedLayoutMap]);

  const handleLayoutChange = useCallback((nextLayout: DiabloBoardLayout, syncScope: DiabloLayoutSyncScope = 'shared') => {
    if (syncScope === 'shared') {
      pendingLocalLayoutSyncRef.current = true;
    }
    setLayout((current) => (
      isWeekPerspective
        ? mergeWeeklyRenderLayoutChangeIntoMonthlyLayout(current, nextLayout)
        : nextLayout
    ));
  }, [isWeekPerspective]);

  const publishPresenceAction = useCallback((
    type: CollaborationActionType,
    label: string,
    target?: CollaborationTarget | null
  ) => {
    if (!collaborationTrackingEnabled) return;
    setCollaborationAction({
      type,
      label,
      target: target || undefined,
      at: Date.now(),
    });
  }, [collaborationTrackingEnabled, setCollaborationAction]);

  useEffect(() => {
    const viewState: CollaborationViewState = {
      boardView: collaborationBoardView,
      boardViewLabel: 'Diablo board',
      activePeriodId,
      activePeriodLabel: activePeriod?.label,
      lens,
      lensLabel: lensLabels[lens],
      revenueView,
      revenueViewLabel: revenueView === 'expected' ? 'Prognoza' : 'Tylko podpisane',
      focusMode: 'diablo',
      focusModeLabel: 'Diablo canvas',
    };

    setCollaborationTrackingEnabled(collaborationTrackingEnabled);
    setCollaborationView(viewState);
  }, [
    activePeriod?.label,
    activePeriodId,
    collaborationTrackingEnabled,
    lens,
    revenueView,
    setCollaborationTrackingEnabled,
    setCollaborationView,
  ]);

  const metrics = useMemo(() => {
    const totalCost = activePeople.reduce((sum, person) => sum + getPersonPeriodCostK(person, activePeriodId), 0);
    const targetRevenue = activePeople.reduce((sum, person) => sum + getPersonPeriodLayers(person, activePeriodId).targetK, 0);
    const revenueProjects = activeProjects.filter((project) => !isTimeOffProject(project));
    const committedRevenue = revenueProjects.reduce((sum, project) => {
      const plan = project.revenuePlan.find((entry) => entry.periodId === activePeriodId);
      const allocated = (allocationsByTarget.get(project.id) || []).reduce((total, allocation) => total + allocation.revenueK, 0);
      return sum + Math.min(plan?.committedRevenueK || 0, allocated);
    }, 0);
    const expectedRevenue = revenueProjects.reduce((sum, project) => {
      const plan = project.revenuePlan.find((entry) => entry.periodId === activePeriodId);
      const plannedRevenue = plan?.revenueK ?? project.budgetK;
      const probability = plan?.probability ?? project.probability;
      const allocated = (allocationsByTarget.get(project.id) || []).reduce((total, allocation) => total + allocation.revenueK, 0);
      return sum + Math.min(allocated || plannedRevenue, plannedRevenue) * probability;
    }, 0);
    const activeRevenue = revenueView === 'committed' ? committedRevenue : expectedRevenue;

    return {
      totalCost,
      targetRevenue,
      committedRevenue,
      expectedRevenue,
      pressureToTarget: Math.max(0, targetRevenue - activeRevenue),
      loss: 0,
    };
  }, [activePeople, activePeriodId, activeProjects, allocationsByTarget, revenueView]);

  const boardRisks = useMemo(() => generateBoardRisks({
    activePeriodId,
    allocations,
    pressureToTargetK: metrics.pressureToTarget,
    projects: activeProjects,
    peopleById: activePeopleById,
  }), [activePeopleById, activePeriodId, activeProjects, allocations, metrics.pressureToTarget]);

  const editingProject = newProjectDraft || (editingProjectId ? projects.find((project) => project.id === editingProjectId) : undefined);
  const editingPerson = newPersonDraft || (editingPersonId ? people.find((person) => person.id === editingPersonId) : undefined);
  const editingAllocation = editingAllocationId ? allocations.find((allocation) => allocation.id === editingAllocationId) : undefined;
  const localEditingTarget = useMemo<CollaborationTarget | null>(() => {
    if (editingAllocation) {
      const person = peopleById.get(editingAllocation.personId);
      return {
        type: 'allocation',
        id: editingAllocation.id,
        label: person ? `alokacja ${person.name}` : `alokacja ${editingAllocation.id}`,
      };
    }
    if (editingProject) {
      return {
        type: 'project',
        id: editingProject.id,
        label: `${editingProject.client} - ${editingProject.name}`,
      };
    }
    if (editingPerson) {
      return {
        type: 'person',
        id: editingPerson.id,
        label: editingPerson.name,
      };
    }
    return null;
  }, [editingAllocation, editingPerson, editingProject, peopleById]);
  const canOpenCustomRoom = sanitizeRoomName(customRoomName) !== '' && sanitizeRoomName(customRoomName) !== roomName;
  const headerSyncLabel = isConnected && isSynced ? 'Online' : isConnected ? 'Łączenie' : 'Offline';
  const headerSyncDetail = isConnected && isSynced ? 'współpraca' : isConnected ? 'sync' : 'lokalnie';
  const syncDetail = isConnected && isSynced
    ? 'Współpraca online działa. Diablo korzysta z tego samego pokoju i danych co Analytic Board.'
    : 'Możesz planować lokalnie; dane zostaną zsynchronizowane, gdy połączenie wróci.';
  const isBackendBusy = durableLoadStatus === 'loading' || durableSaveStatus === 'saving';
  const shouldShowBackendPanel = isBackendBusy || durableLoadStatus === 'failed' || durableSaveStatus === 'failed';
  const classicBoardPath = host && wsPort
    ? `/server/${host}/${wsPort}/${httpPort || String(defaultSyncServerConfig.httpPort)}/board/${roomName}`
    : `/board/${roomName}`;
  const diabloBoardPath = host && wsPort
    ? `/server/${host}/${wsPort}/${httpPort || String(defaultSyncServerConfig.httpPort)}/diablo-board/${roomName}`
    : `/diablo-board/${roomName}`;
  const aiPlanningPath = `${diabloBoardPath}/ai-planning`;
  const weekViewPath = diabloBoardPath;
  const monthViewPath = `${diabloBoardPath}?view=month`;
  const handleWeekViewSwitch = useCallback(() => {
    const nextIsWeekPerspective = !isWeekPerspective;
    setIsWeekPerspective(nextIsWeekPerspective);
    navigate({
      pathname: diabloBoardPath,
      search: getDiabloPlanningSearchForPerspective(nextIsWeekPerspective ? 'week' : 'month'),
    });
  }, [diabloBoardPath, isWeekPerspective, navigate]);
  const weekViewLink = isWeekPerspective
    ? {
        label: 'Widok miesiąca',
        onClick: handleWeekViewSwitch,
        title: 'Wróć do miesięcznego widoku Diablo Board',
        to: monthViewPath,
      }
    : {
        label: 'Plan tygodnia',
        onClick: handleWeekViewSwitch,
        title: 'Zarządzaj pracą tygodniowo (Pn–Pt), z tygodniami na styku miesięcy',
        to: weekViewPath,
      };
  const sameBoardCollaborationPeers = useMemo(
    () => filterCollaborationPeersForBoardView(collaborationPeers, collaborationBoardView, activePeriodId),
    [activePeriodId, collaborationPeers]
  );
  const visibleCollaborationPeers = useMemo(() => (
    getVisibleCollaborationPeersForBoardView(
      collaborationPeers,
      collaborationBoardView,
      activePeriodId,
      followedCollaborationUserId,
      localEditingTarget
    )
  ), [activePeriodId, collaborationPeers, followedCollaborationUserId, localEditingTarget]);

  useEffect(() => {
    if (!collaborationTrackingEnabled) {
      setCollaborationEditingTarget(null);
      return;
    }

    setCollaborationEditingTarget(localEditingTarget);
    if (localEditingTarget) {
      publishPresenceAction('edit', `Otworzył edycję: ${getCollaborationTargetLabel(localEditingTarget)}`, localEditingTarget);
    }
  }, [collaborationTrackingEnabled, localEditingTarget, publishPresenceAction, setCollaborationEditingTarget]);

  const handleNavigateToRoom = (nextRoomName: string) => {
    const sanitizedRoomName = sanitizeRoomName(nextRoomName);
    if (!sanitizedRoomName || sanitizedRoomName === roomName) return;

    if (host && wsPort) {
      navigate(`/server/${host}/${wsPort}/${httpPort || String(defaultSyncServerConfig.httpPort)}/diablo-board/${sanitizedRoomName}`);
      return;
    }

    navigate(`/diablo-board/${sanitizedRoomName}`);
  };

  const handleCustomRoomSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (canOpenCustomRoom) handleNavigateToRoom(customRoomName);
  };

  const handleCreateNextMonth = () => {
    const nextPeriodId = createNextMonth(false);
    if (!nextPeriodId) return;
    setLocalActivePeriodId(nextPeriodId);
    setPeriodRangeStartId(nextPeriodId);
  };

  const handleDragStart = (event: React.DragEvent, payload: DragPayload) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
  };

  const applyBackendAllocationMoves = useCallback(async (moves: MoveTrafficAllocation[], periodId: string) => {
    if (!moves.length) return;
    const optimisticSnapshot = moveTilesToTargets(moves, periodId, { persistDurably: false });
    if (!optimisticSnapshot) return;

    try {
      const response = await moveTrafficBoardAllocations(roomName, periodId, moves);
      replaceBoardSnapshot(response.snapshot, response.updatedAt, response.version);
    } catch (error) {
      try {
        const response = await loadTrafficBoardSnapshot(roomName);
        replaceBoardSnapshot(response.snapshot, response.updatedAt, response.version);
      } catch {
        // Keep the optimistic live state visible when backend recovery also fails.
      }
      throw error;
    }
  }, [moveTilesToTargets, replaceBoardSnapshot, roomName]);

  const handleDropPayload = (payload: DragPayload, target: string, periodId: string, options?: DropPayloadOptions) => {
    if (isWeekPerspective && activeWeek) {
      const toMove = (tileId: string, slotOffset = 0) => {
        const parsedTileId = parseWeeklyTileId(tileId);
        if (!parsedTileId || parsedTileId.monthPeriodId !== periodId) return null;

        return {
          personId: parsedTileId.personId,
          slotIndex: parsedTileId.slotIndex,
          target,
          ...(typeof options?.projectSlotIndex === 'number'
            ? { projectSlotIndex: options.projectSlotIndex + slotOffset }
            : {}),
          ...(options?.requirementId ? { requirementId: options.requirementId } : {}),
          ...(options?.disableRequirementSuggestion ? { skipRequirementSuggestion: true } : {}),
        };
      };

      const getPersonFreeSlotMoves = (personId: string) => {
        const person = activePeopleById.get(personId);
        if (!person) return [];
        const activeWeekFreeSlotIndexes = weeklyActiveFreeSlotIndexesByPersonId?.get(personId) || [];

        return activeWeekFreeSlotIndexes.map((slotIndex, index) => {
          return {
            personId,
            slotIndex,
            target,
            ...(typeof options?.projectSlotIndex === 'number'
              ? { projectSlotIndex: options.projectSlotIndex + index }
              : {}),
            ...(options?.requirementId ? { requirementId: options.requirementId } : {}),
            ...(options?.disableRequirementSuggestion ? { skipRequirementSuggestion: true } : {}),
          };
        });
      };

      const moves = payload.type === 'person'
        ? getPersonFreeSlotMoves(payload.personId)
        : payload.type === 'allocation-group'
          ? payload.allocationIds.map((tileId, index) => toMove(tileId, index)).filter((move): move is NonNullable<ReturnType<typeof toMove>> => Boolean(move))
          : [toMove(payload.tileId)].filter((move): move is NonNullable<ReturnType<typeof toMove>> => Boolean(move));

      if (!moves.length) return;
      const nextSnapshot = applyBoardCommand({
        type: 'weeklyAllocations.move',
        monthPeriodId: periodId,
        weekPeriodId: activeWeek.id,
        moves,
      });
      setSnapshotStatus(nextSnapshot ? 'idle' : 'failed');
      return;
    }

    const toMove = (tileId: string, slotOffset = 0): MoveTrafficAllocation => ({
      tileId,
      target,
      ...(typeof options?.projectSlotIndex === 'number'
        ? { projectSlotIndex: options.projectSlotIndex + slotOffset }
        : {}),
      ...(options?.requirementId ? { requirementId: options.requirementId } : {}),
      ...(options?.disableRequirementSuggestion ? { skipRequirementSuggestion: true } : {}),
    });

    if (payload.type === 'person') {
      const moves = periodAllocations
        .filter((allocation) => allocation.periodId === periodId && allocation.personId === payload.personId && allocation.target === 'bench')
        .map((allocation, index) => toMove(allocation.id, index));
      void applyBackendAllocationMoves(moves, periodId).catch(() => setSnapshotStatus('failed'));
      return;
    }

    if (payload.type === 'allocation-group') {
      void applyBackendAllocationMoves(payload.allocationIds.map((tileId, index) => toMove(tileId, index)), periodId)
        .catch(() => setSnapshotStatus('failed'));
      return;
    }

    void applyBackendAllocationMoves([toMove(payload.tileId)], periodId)
      .catch(() => setSnapshotStatus('failed'));
  };

  const handleResetProjectAllocations = useCallback(() => {
    if (!activePeriod) return;
    const moves = periodAllocations
      .filter((allocation) => allocation.target !== 'bench' && projectsById.has(allocation.target))
      .map((allocation): MoveTrafficAllocation => ({
        tileId: allocation.id,
        target: 'bench',
      }));
    if (!moves.length) return;

    void applyBackendAllocationMoves(moves, activePeriod.id)
      .catch(() => setSnapshotStatus('failed'));
  }, [activePeriod, applyBackendAllocationMoves, periodAllocations, projectsById]);

  const handleResetWeeklyProjectAllocations = useCallback(() => {
    if (!activePeriod || !activeWeek) return;
    const moves = canvasWeeklyAllocations
      .filter((allocation) => (
        allocation.monthPeriodId === activePeriod.id &&
        allocation.weekPeriodId === activeWeek.id &&
        allocation.target !== 'bench'
      ))
      .map((allocation) => ({
        personId: allocation.personId,
        slotIndex: allocation.slotIndex,
        target: 'bench',
      }));
    if (!moves.length) return;

    const nextSnapshot = applyBoardCommand({
      type: 'weeklyAllocations.move',
      monthPeriodId: activePeriod.id,
      weekPeriodId: activeWeek.id,
      moves,
    });
    setSnapshotStatus(nextSnapshot ? 'idle' : 'failed');
  }, [activePeriod, activeWeek, applyBoardCommand, canvasWeeklyAllocations]);

  const handleResetWeeklyPersonAllocations = useCallback((personId: string) => {
    if (!activePeriod || !activeWeek) return;
    const moves = canvasWeeklyAllocations
      .filter((allocation) => (
        allocation.monthPeriodId === activePeriod.id &&
        allocation.weekPeriodId === activeWeek.id &&
        allocation.personId === personId &&
        allocation.target !== 'bench'
      ))
      .map((allocation) => ({
        personId: allocation.personId,
        slotIndex: allocation.slotIndex,
        target: 'bench',
      }));
    if (!moves.length) return;

    const nextSnapshot = applyBoardCommand({
      type: 'weeklyAllocations.move',
      monthPeriodId: activePeriod.id,
      weekPeriodId: activeWeek.id,
      moves,
    });
    setSnapshotStatus(nextSnapshot ? 'idle' : 'failed');
  }, [activePeriod, activeWeek, applyBoardCommand, canvasWeeklyAllocations]);

  const handleClearMonthPlan = useCallback(() => {
    if (!activePeriod) return;

    const nextSnapshot = applyBoardCommand({
      type: 'period.clearMonthPlan',
      periodId: activePeriod.id,
    });
    if (!nextSnapshot) {
      setSnapshotStatus('failed');
      return;
    }

    setEditingProjectId(null);
    setEditingProjectPeriodId(null);
    setNewProjectDraft(null);
    setPendingNewProjectLayout(null);
    setEditingPersonId(null);
    setEditingPersonPeriodId(null);
    setNewPersonDraft(null);
    setPendingNewPersonLayout(null);
    setEditingAllocationId(null);
    setPendingArchiveProjectKey(null);
    setPendingDeleteProjectId(null);
    setIsHiddenProjectsOpen(false);
    setSnapshotStatus('idle');
  }, [activePeriod, applyBoardCommand]);

  const handleCreatePerson = (options?: { monthlyCostK?: number; layout?: DiabloPersonLayout }) => {
    const draft = createPersonDraft(people.length + 1, options);
    setPendingNewPersonLayout(options?.layout ? {
      ...options.layout,
      personId: draft.id,
    } : null);
    setEditingPersonPeriodId(activePeriodId);
    setEditingPersonId(null);
    setNewPersonDraft(draft);
  };

  const handleCreatePersonFromSelection = (selection: DiabloSelection) => {
    const monthlyCostK = getSelectionRevenueK(selection);
    const dimensions = getPersonFrameDimensionsForTileCount(monthlyCostK);
    handleCreatePerson({
      monthlyCostK,
      layout: snapPersonFrameLayout({
        personId: 'pending-person',
        x: selection.x,
        y: selection.y,
        width: dimensions.width,
        height: dimensions.height,
      }, layout, 0, getDiabloCanvasSize(layout)),
    });
  };

  const handleEditPerson = (personId: string) => {
    setEditingPersonPeriodId(activePeriodId);
    setNewPersonDraft(null);
    setPendingNewPersonLayout(null);
    setEditingPersonId(personId);
  };

  const handleSavePerson = (person: Person) => {
    const targetPeriodId = editingPersonPeriodId || activePeriodId;
    if (newPersonDraft && person.id === newPersonDraft.id) {
      const personId = createPerson(targetPeriodId, { person });
      if (personId && pendingNewPersonLayout?.personId === person.id) {
        pendingLocalLayoutSyncRef.current = true;
        setLayout((current) => ({
          ...current,
          people: {
            ...(current.people || {}),
            [personId]: {
              ...pendingNewPersonLayout,
              personId,
            },
          },
        }));
      }
      setNewPersonDraft(null);
      setPendingNewPersonLayout(null);
      return;
    }

    updatePerson(person, targetPeriodId);
    setNewPersonDraft(null);
    setPendingNewPersonLayout(null);
  };

  const handleEditProject = (projectId: string) => {
    setEditingProjectPeriodId(activePeriodId);
    setEditingProjectId(projectId);
    setNewProjectDraft(null);
    setPendingArchiveProjectKey(null);
    setPendingDeleteProjectId(null);
  };

  const handleCreateProjectFromSelection = (selection: DiabloSelection) => {
    if (!activePeriod) return;
    const baseDraft = createProjectDraft(activePeriod.id, periods, projects.length + 1);
    const draft = createProjectDraftFromSelection(selection, activePeriod, baseDraft);
    setPendingNewProjectLayout(snapFrameLayout({
      projectId: draft.id,
      x: selection.x,
      y: selection.y,
      width: selection.width,
      height: selection.height,
    }, 0, getDiabloCanvasSize(layout)));
    setEditingProjectPeriodId(activePeriod.id);
    setEditingProjectId(null);
    setNewProjectDraft(draft);
  };

  const handleSaveProject = (project: ProjectFrame) => {
    updateProject(project);
    if (pendingNewProjectLayout?.projectId === project.id) {
      pendingLocalLayoutSyncRef.current = true;
      setLayout((current) => ({
        ...current,
        projects: {
          ...current.projects,
          [project.id]: pendingNewProjectLayout,
        },
      }));
    }
    setPendingNewProjectLayout(null);
  };

  const handleProjectFrameResize = (projectId: string, projectLayout: DiabloProjectLayout) => {
    if (isWeekPerspective && activePeriod && activeWeek) {
      const revenueK = getSelectionRevenueK({
        x: projectLayout.x,
        y: projectLayout.y,
        width: projectLayout.width,
        height: projectLayout.height,
      });
      const nextSnapshot = applyBoardCommand({
        type: 'project.updateWeeklyRevenuePlan',
        projectId,
        monthPeriodId: activePeriod.id,
        weekPeriodId: activeWeek.id,
        revenueK,
      });
      setSnapshotStatus(nextSnapshot ? 'idle' : 'failed');
      return;
    }
    // Resizing a project frame no longer changes its revenue — the money value
    // is owned by the project editor. (Auto-sized R&D / T&M-no-CAP frames track
    // their allocations; fixed / capped frames keep the size you set.)
  };

  const handleArchiveProject = (projectId: string, periodId: string) => {
    const archiveKey = `${periodId}:${projectId}`;
    if (pendingArchiveProjectKey !== archiveKey) {
      setPendingArchiveProjectKey(archiveKey);
      setPendingDeleteProjectId(null);
      return;
    }

    archiveProject(projectId, periodId);
    setPendingArchiveProjectKey(null);
    if (editingProjectId === projectId && (editingProjectPeriodId || activePeriodId) === periodId) {
      setEditingProjectPeriodId(null);
      setEditingProjectId(null);
      setNewProjectDraft(null);
    }
  };

  const handleRestoreHiddenProject = (projectId: string) => {
    if (!activePeriod) return;
    restoreProject(projectId, activePeriod.id);
  };

  const handleDeleteProject = (projectId: string) => {
    if (pendingDeleteProjectId !== projectId) {
      setPendingDeleteProjectId(projectId);
      setPendingArchiveProjectKey(null);
      return;
    }

    deleteProject(projectId);
    setPendingDeleteProjectId(null);
    setPendingArchiveProjectKey(null);
    if (editingProjectId === projectId) {
      setEditingProjectPeriodId(null);
      setEditingProjectId(null);
      setNewProjectDraft(null);
    }
  };

  const handleCycleWorkType = (project: ProjectFrame) => {
    const currentIndex = workTypeCycle.indexOf(project.workType || 'commercial');
    const nextWorkType = workTypeCycle[(currentIndex + 1) % workTypeCycle.length];
    updateProject({ ...project, workType: nextWorkType });
  };

  const handleResetLayout = () => {
    if (!activePeriod) return;
    clearDiabloLayout(roomName, activePeriod.id);
    const nextLayout = ensureDiabloProjectLayouts(
      createEmptyDiabloLayout(roomName, activePeriod.id),
      projectLayoutInputs
    );
    handleLayoutChange(ensureDiabloPersonLayouts(nextLayout, personLayoutInputs));
  };

  const copyMonthSectionToClipboard = useCallback((mode: MonthPlanPasteMode) => {
    if (!activePeriod) return;
    const shouldCopyPeople = mode === 'people_with_allocations' || mode === 'people_without_allocations';
    const shouldCopyProjects = mode === 'people_with_allocations' || mode === 'projects_without_allocations';
    const visiblePersonIds = new Set(activePeople.map((person) => person.id));
    const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));

    setMonthClipboard({
      mode,
      sourcePeriodId: activePeriod.id,
      sourcePeriodLabel: activePeriod.label,
      people: shouldCopyPeople
        ? activePeople.map((person) => ({
          personId: person.id,
          monthlyOverride: copyPersonMonthlyOverride(person, activePeriod.id),
        }))
        : [],
      projects: shouldCopyProjects
        ? visibleProjects.map((project) => ({
          projectId: project.id,
          revenuePlan: copyProjectMonthlyRevenuePlan(project, activePeriod.id),
        }))
        : [],
      allocations: shouldCopyPeople
        ? periodAllocations
          .filter((allocation) => visiblePersonIds.has(allocation.personId))
          .map(copyMonthAllocation)
        : [],
      layout: {
        people: shouldCopyPeople ? pickPersonLayouts(layout.people || {}, visiblePersonIds) : undefined,
        projects: shouldCopyProjects ? pickProjectLayouts(layout.projects || {}, visibleProjectIds) : undefined,
        peopleZoneColumns: shouldCopyPeople ? layout.peopleZoneColumns : undefined,
      },
    });
    setSnapshotStatus('idle');
  }, [activePeople, activePeriod, layout, periodAllocations, visibleProjects]);

  const pasteMonthClipboard = useCallback((target: 'people' | 'projects', targetPeriodId: string) => {
    const targetPeriod = periods.find((period) => period.id === targetPeriodId && period.granularity === 'month');
    if (!targetPeriod || !monthClipboard || monthClipboard.sourcePeriodId === targetPeriod.id) return false;
    if (
      target === 'people' &&
      monthClipboard.mode !== 'people_with_allocations' &&
      monthClipboard.mode !== 'people_without_allocations'
    ) {
      return false;
    }
    if (target === 'projects' && monthClipboard.mode !== 'projects_without_allocations') return false;

    const command = {
      type: 'period.pasteMonthPlan',
      sourcePeriodId: monthClipboard.sourcePeriodId,
      targetPeriodId: targetPeriod.id,
      mode: monthClipboard.mode,
      people: monthClipboard.people,
      projects: monthClipboard.projects,
      allocations: monthClipboard.allocations,
    } satisfies TrafficBoardCommand;
    const nextSnapshot = applyBoardCommand(command);
    if (!nextSnapshot) {
      setSnapshotStatus('failed');
      return false;
    }

    pendingLocalLayoutSyncRef.current = true;
    setLayout((current) => pasteClipboardLayout(current, monthClipboard, targetPeriod.id, roomName));
    setSnapshotStatus('idle');
    return true;
  }, [applyBoardCommand, monthClipboard, periods, roomName]);

  const handleCopySnapshot = async () => {
    if (!activePeriod) return;
    const snapshot = generateReviewSnapshot({
      allocations,
      aiOpportunityCheck: null,
      metrics,
      people: activePeople,
      period: activePeriod,
      projects: activeProjects,
      risks: boardRisks,
    });

    try {
      await navigator.clipboard.writeText(snapshot);
      setSnapshotStatus('copied');
    } catch {
      setSnapshotStatus('failed');
    }
  };

  const handleResetBoard = () => {
    if (!resetConfirmationPending) {
      setResetConfirmationPending(true);
      return;
    }

    resetBoard();
    setResetConfirmationPending(false);
    setSnapshotStatus('idle');
  };

  const handleTrackingEnabledChange = useCallback((enabled: boolean) => {
    setCollaborationTrackingEnabledState(enabled);
    persistCollaborationTrackingEnabled(enabled);
    setCollaborationTrackingEnabled(enabled);
    if (!enabled) {
      pendingPresenceRef.current = null;
      activePresenceTargetKeyRef.current = null;
    }
  }, [setCollaborationTrackingEnabled]);

  const handleFollowedCollaborationUserIdChange = useCallback((userId: string | null) => {
    setFollowedCollaborationUserIdState(userId);
    persistFollowedCollaborationUserId(userId);
  }, []);

  const handlePresencePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!collaborationTrackingEnabled) return;
    const targetHit = getCollaborationTargetHitFromElement(event.target);
    pendingPresenceRef.current = {
      cursor: getCollaborationCursorFromPointer(event, targetHit),
      target: targetHit?.target || null,
    };
    if (presenceFrameRef.current) return;
    presenceFrameRef.current = window.requestAnimationFrame(() => {
      presenceFrameRef.current = null;
      const pending = pendingPresenceRef.current;
      if (!pending) return;
      setCollaborationCursor(pending.cursor);
      const nextTargetKey = pending.target ? getCollaborationTargetKey(pending.target) : null;
      if (nextTargetKey !== activePresenceTargetKeyRef.current) {
        activePresenceTargetKeyRef.current = nextTargetKey;
        setCollaborationActiveTarget(pending.target);
      }
    });
  }, [collaborationTrackingEnabled, setCollaborationActiveTarget, setCollaborationCursor]);

  const handlePresenceClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!collaborationTrackingEnabled) return;
    const targetHit = getCollaborationTargetHitFromElement(event.target);
    const actionLabel = getPresenceClickActionLabel(event.target, targetHit?.target || null);
    if (!actionLabel) return;
    publishPresenceAction('click', actionLabel, targetHit?.target || null);
  }, [collaborationTrackingEnabled, publishPresenceAction]);

  const handlePresencePointerLeave = useCallback(() => {
    pendingPresenceRef.current = null;
    activePresenceTargetKeyRef.current = null;
    setCollaborationCursor(null);
    setCollaborationActiveTarget(null);
  }, [setCollaborationActiveTarget, setCollaborationCursor]);

  if (!activePeriod) {
    return (
      <div className={`traffic-app diablo-app is-${theme}`}>
        <Helmet><title>Diablo Traffic Board</title></Helmet>
        <div className="diablo-empty-state">Ładuję miesiąc planowania...</div>
      </div>
    );
  }

  return (
    <div
      className={`traffic-app diablo-app is-${theme}`}
      onClickCapture={handlePresenceClickCapture}
      onPointerLeave={handlePresencePointerLeave}
      onPointerMove={handlePresencePointerMove}
    >
      <Helmet>
        <title>Diablo Traffic Board</title>
      </Helmet>

      <TrafficHeader
        activeTileMetricMode={tileMetricMode}
        weekViewLink={weekViewLink}
        aiPlanningLink={{
          label: 'Asystent planowania',
          title: 'Otwórz asystenta planowania jako osobny moduł (poza planszą)',
          to: aiPlanningPath,
        }}
        boardViewLink={{
          label: 'Analytic Board',
          title: 'Przejdź do tabelarycznego Analytic Board dla tej samej tablicy',
          to: classicBoardPath,
        }}
        canOpenCustomRoom={canOpenCustomRoom}
        collapsibleActions
        collaborationPeers={sameBoardCollaborationPeers}
        collaborationTrackingEnabled={collaborationTrackingEnabled}
        collaborationUser={collaborationUser}
        customRoomName={customRoomName}
        followedCollaborationUserId={followedCollaborationUserId}
        headerSyncDetail={headerSyncDetail}
        headerSyncLabel={headerSyncLabel}
        isConnected={isConnected}
        isHeaderMenuOpen={isHeaderMenuOpen}
        isSynced={isSynced}
        resetConfirmationPending={resetConfirmationPending}
        revenueView={revenueView}
        roomName={roomName}
        roomPresets={roomPresets}
        snapshotStatus={snapshotStatus}
        syncDetail={syncDetail}
        theme={theme}
        onCopySnapshot={handleCopySnapshot}
        onCustomRoomNameChange={setCustomRoomName}
        onCustomRoomSubmit={handleCustomRoomSubmit}
        onFollowedUserIdChange={handleFollowedCollaborationUserIdChange}
        onHeaderMenuOpenChange={setIsHeaderMenuOpen}
        onNavigateToRoom={handleNavigateToRoom}
        onOpenHelp={setActiveHelpTopicId}
        onOpenPlanningRules={() => {
          setPlanningRulesInitialProjectId(undefined);
          setIsPlanningRulesOpen(true);
        }}
        onResetBoard={handleResetBoard}
        onResetConfirmationCancel={() => setResetConfirmationPending(false)}
        onRevenueViewChange={setRevenueView}
        onSetTileMetricMode={setTileMetricMode}
        onThemeChange={setTheme}
        onTrackingEnabledChange={handleTrackingEnabledChange}
        onUserNameChange={setCollaborationUserName}
      />

      {shouldShowBackendPanel ? (
        <section className={`traffic-backend-panel is-${durableLoadStatus === 'failed' || durableSaveStatus === 'failed' ? 'danger' : 'loading'}`}>
          <div className="traffic-backend-panel__content">
            {isBackendBusy ? <span className="traffic-backend-spinner" aria-hidden="true" /> : null}
            <div>
              <strong>
                {durableLoadStatus === 'loading'
                  ? 'Ładuję dane z backendu'
                  : durableSaveStatus === 'saving'
                    ? 'Zapisuję zmiany'
                    : 'Backend wymaga uwagi'}
              </strong>
              <span>{durableError || syncDetail}</span>
              {durableUpdatedAt ? <span>Ostatni zapis: {new Date(durableUpdatedAt).toLocaleTimeString('pl-PL')}</span> : null}
            </div>
          </div>
          <button className="traffic-button" type="button" onClick={() => initializeBoard(roomName, serverConfig)}>
            Odśwież
          </button>
        </section>
      ) : null}

      <main className="diablo-main">
        <section className="diablo-topbar" aria-label="Zakres planowania Diablo">
          <PeriodTimelineNavigator
            activePeriodId={activePeriodId}
            addAction={{ label: '+ Miesiąc', onClick: handleCreateNextMonth }}
            ariaLabel="Zakres czasu Diablo Board"
            className="diablo-period-timeline"
            collapsible
            defaultOpen
            heading="Zakres planowania"
            monthPeriods={monthPeriods}
            rangeMonths={1}
            rangeStartPeriodId={periodRangeStartId}
            onActivePeriodChange={setLocalActivePeriodId}
            onRangeStartChange={setPeriodRangeStartId}
          />
        </section>

        {isWeekPerspective ? (
          <section className="diablo-week-strip" aria-label="Wybór tygodnia">
            <div className="diablo-week-strip-chips">
              {businessWeeks.map((week) => (
                <button
                  key={week.id}
                  type="button"
                  className={`diablo-week-chip ${week.id === activeWeekId ? 'is-active' : ''} ${week.id === todayWeekId ? 'is-today' : ''}`}
                  onClick={() => setActiveWeekId(week.id)}
                >
                  <strong>{week.label}</strong>
                  <small>{week.workingDays} dni{week.workingDays < 5 ? ' · styk mies.' : ''}</small>
                </button>
              ))}
              {businessWeeks.length === 0 ? <span className="diablo-week-strip-empty">Brak tygodni dla tego miesiąca.</span> : null}
            </div>
            {activeWeek ? (
              <div className="diablo-week-strip-summary">
                <strong>{activeWeek.label}</strong>
                <span>~{activeWeekAllocatedHours}h pracy · {Math.round(activeWeekShare * 100)}% miesiąca</span>
                {activeWeek.workingDays < 5 ? <span className="is-cross">tydzień na styku miesięcy — reszta dni w sąsiednim miesiącu</span> : null}
              </div>
            ) : null}
          </section>
        ) : null}

        <DiabloMonthCanvas
          activePeople={activePeople}
          allAllocations={weeklyCanvasState?.periodAllocations || visibleAllocations}
          benchAllocations={canvasBenchAllocations}
          layout={canvasLayout}
          peopleById={activePeopleById}
          period={activePeriod}
          periodAllocations={canvasPeriodAllocations}
          periods={periods}
          projects={canvasProjects}
          projectsById={canvasProjectsById}
          skillsById={skillsById}
          tileMetricMode={tileMetricMode}
          canvasTool={canvasTool}
          monthClipboard={monthClipboard ? {
            mode: monthClipboard.mode,
            sourcePeriodId: monthClipboard.sourcePeriodId,
            sourcePeriodLabel: monthClipboard.sourcePeriodLabel,
          } : null}
          hiddenProjectCount={hiddenProjects.length}
          onCopyPeopleWithAllocations={() => copyMonthSectionToClipboard('people_with_allocations')}
          onCopyPeopleWithoutAllocations={() => copyMonthSectionToClipboard('people_without_allocations')}
          onCopyProjectsWithoutAllocations={() => copyMonthSectionToClipboard('projects_without_allocations')}
          onCreatePerson={() => handleCreatePerson()}
          onCreatePersonFromSelection={handleCreatePersonFromSelection}
          onCreateProjectFromSelection={handleCreateProjectFromSelection}
          onCycleWorkType={handleCycleWorkType}
          onDropPayload={handleDropPayload}
          onEditPerson={handleEditPerson}
          onEditProject={handleEditProject}
          onArchiveProject={handleArchiveProject}
          onDeleteProject={handleDeleteProject}
          onLayoutChange={handleLayoutChange}
          onOpenAllocation={(allocationId) => {
            if (isWeekPerspective && parseWeeklyTileId(allocationId)) return;
            setEditingAllocationId(allocationId);
          }}
          onOpenHelp={setActiveHelpTopicId}
          onOpenHiddenProjects={() => setIsHiddenProjectsOpen(true)}
          onPastePeopleClipboard={(targetPeriodId) => pasteMonthClipboard('people', targetPeriodId)}
          onPasteProjectsClipboard={(targetPeriodId) => pasteMonthClipboard('projects', targetPeriodId)}
          allowPersonFrameProjectDrop={isWeekPerspective && Boolean(activeWeek)}
          personProjectDragPersonIds={isWeekPerspective ? (weeklyPersonProjectDragPersonIds || emptyPersonIdSet) : undefined}
          onPersonDragStart={handleDragStart}
          onProjectFrameResize={handleProjectFrameResize}
          onResetLayout={handleResetLayout}
          onResetPersonAllocations={(personId) => {
            if (isWeekPerspective) {
              handleResetWeeklyPersonAllocations(personId);
              return;
            }
            resetPersonAllocations(personId, activePeriod.id);
          }}
          onResetProjectAllocations={isWeekPerspective ? handleResetWeeklyProjectAllocations : handleResetProjectAllocations}
          allocationResetScope={isWeekPerspective ? 'week' : 'month'}
          onClearMonthPlan={handleClearMonthPlan}
          onCanvasToolChange={setCanvasTool}
          onTileDragStart={handleDragStart}
          pendingArchiveProjectKey={pendingArchiveProjectKey}
          pendingDeleteProjectId={pendingDeleteProjectId}
        />
      </main>

      {editingProject ? (
        <ProjectEditor
          isNew={Boolean(newProjectDraft)}
          activePeriodId={editingProjectPeriodId || activePeriodId}
          planningRules={planningRules}
          people={activePeople}
          periods={periods}
          project={editingProject}
          skills={skills}
          onOpenPlanningRules={() => {
            setPlanningRulesInitialProjectId(editingProject.id);
            setIsPlanningRulesOpen(true);
          }}
          onClose={() => {
            setEditingProjectId(null);
            setEditingProjectPeriodId(null);
            setNewProjectDraft(null);
            setPendingNewProjectLayout(null);
          }}
          onOpenHelp={setActiveHelpTopicId}
          onSave={handleSaveProject}
        />
      ) : null}

      {editingPerson ? (
        <PersonEditor
          activePeriodId={editingPersonPeriodId || activePeriodId}
          people={people}
          periods={periods}
          person={editingPerson}
          skills={skills}
          isNew={Boolean(newPersonDraft && newPersonDraft.id === editingPerson.id)}
          onClose={() => {
            setEditingPersonId(null);
            setEditingPersonPeriodId(null);
            setNewPersonDraft(null);
            setPendingNewPersonLayout(null);
          }}
          onArchive={archivePerson}
          onOpenHelp={setActiveHelpTopicId}
          onSave={handleSavePerson}
        />
      ) : null}

      {editingAllocation ? (
        <AllocationEditor
          allocation={editingAllocation}
          allocations={allocations}
          peopleById={activePeopleById}
          periods={periods}
          projects={projects}
          skills={skills}
          onClose={() => setEditingAllocationId(null)}
          onOpenHelp={setActiveHelpTopicId}
          onSave={updateAllocationWithGroupMeetingState}
        />
      ) : null}

      {isPlanningRulesOpen ? (
        <PlanningRulesManager
          activePeriodId={activePeriodId}
          initialProjectId={planningRulesInitialProjectId}
          people={people}
          periods={periods}
          planningRules={planningRules}
          projects={projects}
          onClose={() => {
            setPlanningRulesInitialProjectId(undefined);
            setIsPlanningRulesOpen(false);
          }}
          onDelete={deletePlanningRule}
          onSave={upsertPlanningRules}
        />
      ) : null}

      {isHiddenProjectsOpen && activePeriod ? (
        <DiabloHiddenProjectsModal
          period={activePeriod}
          projects={hiddenProjects}
          onClose={() => setIsHiddenProjectsOpen(false)}
          onRestoreProject={handleRestoreHiddenProject}
        />
      ) : null}

      {activeHelpTopicId ? (
        <HelpModal
          activeTopicId={activeHelpTopicId}
          onClose={() => setActiveHelpTopicId(null)}
          onSelectTopic={setActiveHelpTopicId}
        />
      ) : null}
      <CollaborationPresenceLayer peers={visibleCollaborationPeers} localEditingTarget={localEditingTarget} />
    </div>
  );
}

function getSharedDiabloLayoutMap(provider: unknown): SharedDiabloLayoutMap | null {
  const sharedDoc = (provider as ProviderWithSharedDoc | null)?.doc;
  return sharedDoc?.getMap?.(DIABLO_SHARED_LAYOUT_MAP) || null;
}

function isProjectRelevantInPeriod(
  project: ProjectFrame,
  periodId: string,
  allocationsByTarget: Map<string, PersonTileAllocation[]>
) {
  const hasRevenuePlan = project.revenuePlan.some((plan) => plan.periodId === periodId);
  const hasAllocations = Boolean(allocationsByTarget.get(project.id)?.length);
  return hasRevenuePlan || hasAllocations || project.startPeriodId === periodId;
}

function copyPersonMonthlyOverride(person: Person, periodId: string): MonthPlanPersonCopy['monthlyOverride'] {
  const override = person.monthlyOverrides?.find((item) => item.periodId === periodId);
  if (!override) return undefined;

  return {
    ...override,
    layers: override.layers ? { ...override.layers } : undefined,
  };
}

function copyProjectMonthlyRevenuePlan(project: ProjectFrame, periodId: string): MonthPlanProjectCopy['revenuePlan'] {
  const plan = project.revenuePlan.find((item) => item.periodId === periodId);
  if (plan) {
    return {
      ...plan,
      fx: plan.fx ? { ...plan.fx } : undefined,
    };
  }

  return {
    periodId,
    revenueK: getProjectPeriodRevenueK(project, periodId),
    probability: project.probability,
  };
}

function createWeeklyRenderLayout(
  layout: DiabloBoardLayout,
  projects: ProjectFrame[],
  periodId: string,
  tileUnit?: TileUnit
): DiabloBoardLayout {
  const nextProjects = { ...layout.projects };

  projects.forEach((project) => {
    const currentLayout = layout.projects[project.id];
    if (!currentLayout) return;

    const weeklyCapacityK = project.revenuePlan.find((plan) => plan.periodId === periodId)?.revenueK ?? project.budgetK;
    const weeklyCellCount = getFrameCellCount(weeklyCapacityK, tileUnit);
    const dimensions = getWeeklyProjectFrameDimensions(currentLayout, weeklyCellCount);
    nextProjects[project.id] = {
      ...currentLayout,
      width: dimensions.width,
      height: dimensions.height,
    };
  });

  return {
    ...layout,
    projects: nextProjects,
  };
}

function getWeeklyProjectFrameDimensions(
  monthlyLayout: Pick<DiabloProjectLayout, 'width' | 'height'>,
  weeklyCellCount: number
) {
  const normalizedCellCount = Math.max(1, Math.ceil(weeklyCellCount));
  const width = Math.max(1, Math.min(monthlyLayout.width, normalizedCellCount));
  return {
    width,
    height: Math.max(1, Math.ceil(normalizedCellCount / width)),
  };
}

function mergeWeeklyRenderLayoutChangeIntoMonthlyLayout(
  current: DiabloBoardLayout,
  next: DiabloBoardLayout
): DiabloBoardLayout {
  const projects = { ...current.projects };
  Object.entries(next.projects).forEach(([projectId, nextProjectLayout]) => {
    const currentProjectLayout = current.projects[projectId];
    projects[projectId] = currentProjectLayout
      ? {
          ...currentProjectLayout,
          x: nextProjectLayout.x,
          y: nextProjectLayout.y,
        }
      : { ...nextProjectLayout };
  });

  const people = { ...(current.people || {}) };
  Object.entries(next.people || {}).forEach(([personId, nextPersonLayout]) => {
    const currentPersonLayout = current.people?.[personId];
    people[personId] = currentPersonLayout
      ? {
          ...currentPersonLayout,
          x: nextPersonLayout.x,
          y: nextPersonLayout.y,
        }
      : { ...nextPersonLayout };
  });

  return {
    ...current,
    roomName: next.roomName,
    periodId: next.periodId,
    canvasSize: next.canvasSize,
    peopleZoneColumns: next.peopleZoneColumns,
    panels: next.panels,
    projects,
    people,
  };
}

function copyMonthAllocation(allocation: PersonTileAllocation): MonthPlanAllocationCopy {
  return {
    personId: allocation.personId,
    tileIndex: allocation.tileIndex,
    target: allocation.target,
    mode: allocation.mode,
    revenueK: allocation.revenueK,
    hours: allocation.hours,
    skillId: allocation.skillId,
    requirementId: allocation.requirementId,
    projectSlotIndex: allocation.projectSlotIndex,
    hoursOverridden: allocation.hoursOverridden,
    revenueOverridden: allocation.revenueOverridden,
    meetingState: allocation.meetingState ? { ...allocation.meetingState } : undefined,
  };
}

function pickPersonLayouts(
  layouts: Record<string, DiabloPersonLayout>,
  personIds: Set<string>
) {
  return Object.fromEntries(
    Object.entries(layouts)
      .filter(([personId]) => personIds.has(personId))
      .map(([personId, personLayout]) => [personId, { ...personLayout }])
  );
}

function pickProjectLayouts(
  layouts: Record<string, DiabloProjectLayout>,
  projectIds: Set<string>
) {
  return Object.fromEntries(
    Object.entries(layouts)
      .filter(([projectId]) => projectIds.has(projectId))
      .map(([projectId, projectLayout]) => [projectId, { ...projectLayout }])
  );
}

function pasteClipboardLayout(
  current: DiabloBoardLayout,
  clipboard: DiabloMonthClipboard,
  targetPeriodId: string,
  roomName: string
): DiabloBoardLayout {
  const shouldPastePeople = clipboard.mode === 'people_with_allocations' || clipboard.mode === 'people_without_allocations';
  const shouldPasteProjects = clipboard.mode === 'people_with_allocations' || clipboard.mode === 'projects_without_allocations';

  return {
    ...current,
    roomName,
    periodId: targetPeriodId,
    peopleZoneColumns: shouldPastePeople
      ? clipboard.layout.peopleZoneColumns ?? current.peopleZoneColumns
      : current.peopleZoneColumns,
    people: shouldPastePeople
      ? clonePersonLayouts(clipboard.layout.people || {})
      : current.people,
    projects: shouldPasteProjects
      ? cloneProjectLayouts(clipboard.layout.projects || {})
      : current.projects,
  };
}

function clonePersonLayouts(layouts: Record<string, DiabloPersonLayout>) {
  return Object.fromEntries(
    Object.entries(layouts).map(([personId, personLayout]) => [personId, { ...personLayout }])
  );
}

function cloneProjectLayouts(layouts: Record<string, DiabloProjectLayout>) {
  return Object.fromEntries(
    Object.entries(layouts).map(([projectId, projectLayout]) => [projectId, { ...projectLayout }])
  );
}
