import { MantineProvider } from '@mantine/core';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useParams } from 'react-router-dom';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { CollaborationPresenceLayer } from '../components/CollaborationPresence';
import { PeriodTimelineNavigator } from '../components/PeriodTimelineNavigator';
import { TrafficTooltip } from '../components/TrafficTooltip';
import { TrafficHeader } from '../components/TrafficHeader';
import type { Person } from '../models/traffic.model';
import {
  getMonthRangeStartId,
  getVisibleMonthPeriods,
  isMonthPeriodVisible,
} from '../components/periodRange';
import type { PeriodRangeMonths } from '../components/periodRange';
import { lensLabels } from '../components/constants';
import { defaultSyncServerConfig } from '../services/trafficRuntimeConfig';
import { useTrafficStore } from '../stores/trafficStore';
import { getStoredTheme, sanitizeRoomName, type TrafficTheme } from '../utils/trafficBoardDrafts';
import {
  analyticFilterLabels,
  analyticLegendSections,
  buildAnalyticBoardRows,
  filterAnalyticBoardRows,
  getAnalyticSignalCodeMeta,
  sortAnalyticBoardRows,
  type AnalyticAssignment,
  type AnalyticBoardRow,
  type AnalyticFilterId,
  type AnalyticLegendSection,
  type AnalyticPeriodCell,
} from '../utils/analyticBoard';
import {
  getCollaborationCursorFromPointer,
  getCollaborationTargetHitFromElement,
  getPresenceClickActionLabel,
} from '../utils/collaborationDom';
import {
  type CollaborationActionType,
  type CollaborationCursor,
  type CollaborationTarget,
  filterCollaborationPeersForBoardView,
  getCollaborationTargetKey,
  getVisibleCollaborationPeersForBoardView,
  getStoredCollaborationTrackingEnabled,
  getStoredFollowedCollaborationUserId,
  persistCollaborationTrackingEnabled,
  persistFollowedCollaborationUserId,
} from '../utils/collaborationPresence';
import './AnalyticBoard.css';

const roomPresets = [
  { id: 'ptm-mvp', label: 'Plan bazowy' },
  { id: 'ptm-sales-scenario', label: 'Scenariusz sprzedaży' },
  { id: 'ptm-delivery-risk', label: 'Ryzyko realizacji' },
];

type AnalyticPeriodRangeMonths = Extract<PeriodRangeMonths, 1 | 3>;

const rangeOptions: Array<{ label: string; value: AnalyticPeriodRangeMonths }> = [
  { label: 'Miesiąc', value: 1 },
  { label: 'Kwartał', value: 3 },
];

const filterOrder: AnalyticFilterId[] = [
  'overload',
  'bench',
  'fragmentation',
  'low-value',
  'rd',
  'single-person',
  'changes',
  'risks',
];

const collaborationBoardView = 'analytic';
const detailedTableMediaQuery = '(min-width: 1900px)';

export default function AnalyticBoard() {
  const navigate = useNavigate();
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
    activePeriodId,
    allocations,
    collaborationPeers,
    collaborationUser,
    durableLoadStatus,
    durableSaveStatus,
    ensurePeriodCapacity,
    ensurePlanningRange,
    initializeBoard,
    isConnected,
    isSynced,
    lens,
    people,
    periods,
    projects,
    revenueView,
    restorePerson,
    setActivePeriod,
    setCollaborationAction,
    setCollaborationActiveTarget,
    setCollaborationCursor,
    setCollaborationEditingTarget,
    setCollaborationTrackingEnabled,
    setCollaborationUserName,
    setCollaborationView,
    setRevenueView,
    skills,
  } = useTrafficStore();

  const [customRoomName, setCustomRoomName] = useState(roomName);
  const [theme, setTheme] = useState<TrafficTheme>(() => getStoredTheme());
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [periodRangeMonths, setPeriodRangeMonths] = useState<AnalyticPeriodRangeMonths>(3);
  const [periodRangeStartId, setPeriodRangeStartId] = useState(activePeriodId);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<AnalyticFilterId[]>([]);
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isLegendCollapsed, setIsLegendCollapsed] = useState(false);
  const [activeLegendSectionId, setActiveLegendSectionId] = useState<AnalyticLegendSection['id']>(analyticLegendSections[0].id);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<AnalyticBoardRow>>({
    columnAccessor: 'rangeRiskCount',
    direction: 'desc',
  });
  const [collaborationTrackingEnabled, setCollaborationTrackingEnabledState] = useState(() => getStoredCollaborationTrackingEnabled());
  const [followedCollaborationUserId, setFollowedCollaborationUserIdState] = useState<string | null>(() => getStoredFollowedCollaborationUserId());
  const roomNameRef = useRef(roomName);
  const pendingPresenceRef = useRef<{ cursor: CollaborationCursor; target: CollaborationTarget | null } | null>(null);
  const presenceFrameRef = useRef<number | null>(null);
  const activePresenceTargetKeyRef = useRef<string | null>(null);

  useEffect(() => {
    initializeBoard(roomName, serverConfig);
  }, [initializeBoard, roomName, serverConfig]);

  useEffect(() => {
    setCustomRoomName(roomName);
    if (roomNameRef.current !== roomName) {
      roomNameRef.current = roomName;
      setPeriodRangeStartId(activePeriodId);
      setSearchQuery('');
      setActiveFilters([]);
      setIsContextPanelOpen(false);
    }
  }, [activePeriodId, roomName]);

  useEffect(() => {
    window.localStorage.setItem('ptm-traffic-theme', theme);
    document.body.dataset.theme = theme === 'day' ? 'light' : 'dark';
  }, [theme]);

  const monthPeriods = useMemo(
    () => periods.filter((period) => period.granularity === 'month').sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
    [periods]
  );
  const activePeriod = monthPeriods.find((period) => period.id === activePeriodId);
  const visibleMonthPeriods = useMemo(
    () => getVisibleMonthPeriods(monthPeriods, periodRangeStartId, periodRangeMonths),
    [monthPeriods, periodRangeMonths, periodRangeStartId]
  );
  useEffect(() => {
    if (!monthPeriods.length) return;
    const normalizedRangeStartId = getMonthRangeStartId(monthPeriods, periodRangeStartId, periodRangeMonths);
    if (normalizedRangeStartId !== periodRangeStartId) {
      setPeriodRangeStartId(normalizedRangeStartId);
      return;
    }

    if (!isMonthPeriodVisible(monthPeriods, periodRangeStartId, periodRangeMonths, activePeriodId)) {
      setPeriodRangeStartId(activePeriodId);
    }
  }, [activePeriodId, monthPeriods, periodRangeMonths, periodRangeStartId]);

  useEffect(() => {
    ensurePlanningRange(periodRangeStartId, periodRangeMonths);
  }, [ensurePlanningRange, periodRangeMonths, periodRangeStartId]);

  useEffect(() => {
    visibleMonthPeriods.forEach((period) => ensurePeriodCapacity(period.id));
  }, [ensurePeriodCapacity, visibleMonthPeriods]);

  useEffect(() => {
    setCollaborationTrackingEnabled(collaborationTrackingEnabled);
    setCollaborationView({
      boardView: collaborationBoardView,
      boardViewLabel: 'Analytic Board',
      activePeriodId,
      activePeriodLabel: activePeriod?.label,
      lens,
      lensLabel: lensLabels[lens],
      revenueView,
      revenueViewLabel: revenueView === 'expected' ? 'Prognoza' : 'Tylko podpisane',
      focusMode: periodRangeMonths === 3 ? 'quarter-table' : 'month-table',
      focusModeLabel: periodRangeMonths === 3 ? 'Tabela kwartalna' : 'Tabela miesięczna',
    });
    setCollaborationEditingTarget(null);
  }, [
    activePeriod?.label,
    activePeriodId,
    collaborationTrackingEnabled,
    lens,
    periodRangeMonths,
    revenueView,
    setCollaborationEditingTarget,
    setCollaborationTrackingEnabled,
    setCollaborationView,
  ]);

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
    return () => {
      if (presenceFrameRef.current) {
        window.cancelAnimationFrame(presenceFrameRef.current);
      }
      pendingPresenceRef.current = null;
      activePresenceTargetKeyRef.current = null;
      setCollaborationCursor(null);
      setCollaborationActiveTarget(null);
      setCollaborationEditingTarget(null);
    };
  }, [setCollaborationActiveTarget, setCollaborationCursor, setCollaborationEditingTarget]);

  const analyticRows = useMemo(() => buildAnalyticBoardRows({
    people,
    projects,
    allocations,
    periods: visibleMonthPeriods,
    skills,
  }), [allocations, people, projects, skills, visibleMonthPeriods]);
  const archivedPeople = useMemo(() => (
    people
      .filter((person) => person.archivedAt)
      .sort((first, second) => first.name.localeCompare(second.name, 'pl'))
  ), [people]);
  const visibleArchivePeriodIds = useMemo(
    () => visibleMonthPeriods.map((period) => period.id),
    [visibleMonthPeriods]
  );

  const visibleRows = useMemo(() => {
    const filteredRows = filterAnalyticBoardRows(analyticRows, {
      search: searchQuery,
      filters: activeFilters,
    });
    return sortAnalyticBoardRows(filteredRows, sortStatus);
  }, [activeFilters, analyticRows, searchQuery, sortStatus]);

  const summary = useMemo(() => {
    const revenueK = sum(visibleRows, (row) => row.rangeProductiveRevenueK);
    const hours = sum(visibleRows, (row) => row.rangeProductiveHours);
    const benchK = sum(visibleRows, (row) => row.rangeBenchRevenueK);
    const signalCount = sum(visibleRows, (row) => row.signalCodes.length);
    const utilizationBase = sum(visibleRows, (row) => row.rangeAvailableHours);
    return {
      revenueK,
      hours,
      benchK,
      signalCount,
      utilizationPercent: utilizationBase > 0 ? Math.round((hours / utilizationBase) * 100) : 0,
    };
  }, [visibleRows]);

  const filterCounts = useMemo(() => {
    return filterOrder.reduce((result, filterId) => {
      result[filterId] = filterAnalyticBoardRows(analyticRows, { filters: [filterId] }).length;
      return result;
    }, {} as Record<AnalyticFilterId, number>);
  }, [analyticRows]);
  const canResetFilters = activeFilters.length > 0 || searchQuery.trim().length > 0;
  const shouldUseDetailedTable = useMediaQuery(detailedTableMediaQuery);

  const columns = useMemo<DataTableColumn<AnalyticBoardRow>[]>(() => [
    {
      accessor: 'personName',
      title: 'Osoba',
      sortable: true,
      width: shouldUseDetailedTable ? 260 : 220,
      render: (row) => <PersonCell row={row} />,
    },
    ...(shouldUseDetailedTable ? [
      {
        accessor: 'rangeUtilizationPercent',
        title: 'Utyl.',
        sortable: true,
        width: 92,
        textAlign: 'right',
        render: (row: AnalyticBoardRow) => <MetricPill tone={getUtilizationTone(row.rangeUtilizationPercent)} label={`${row.rangeUtilizationPercent}%`} />,
      },
      {
        accessor: 'rangeRevenueK',
        title: 'Revenue',
        sortable: true,
        width: 112,
        textAlign: 'right',
        render: (row: AnalyticBoardRow) => <strong>{formatMoneyK(row.rangeProductiveRevenueK)}</strong>,
      },
      {
        accessor: 'rangeHours',
        title: 'Godz.',
        sortable: true,
        width: 96,
        textAlign: 'right',
        render: (row: AnalyticBoardRow) => `${formatNumber(row.rangeProductiveHours)}h`,
      },
      {
        accessor: 'rangeProjectCount',
        title: 'Projekty',
        sortable: true,
        width: 104,
        textAlign: 'right',
        render: (row: AnalyticBoardRow) => <MetricPill tone={row.rangeProjectCount > 1 ? 'warning' : 'neutral'} label={String(row.rangeProjectCount)} />,
      },
      {
        accessor: 'rangeBenchRevenueK',
        title: 'Bench',
        sortable: true,
        width: 98,
        textAlign: 'right',
        render: (row: AnalyticBoardRow) => row.rangeBenchRevenueK > 0 ? <MetricPill tone="bench" label={formatMoneyK(row.rangeBenchRevenueK)} /> : '0k',
      },
      {
        accessor: 'rangeRiskCount',
        title: 'Sygnały',
        sortable: true,
        width: 172,
        render: (row: AnalyticBoardRow) => <SignalStrip codes={row.signalCodes} />,
      },
    ] satisfies DataTableColumn<AnalyticBoardRow>[] : [
      {
        accessor: 'rangeRiskCount',
        title: 'Status',
        sortable: true,
        width: 164,
        render: (row: AnalyticBoardRow) => <RangeStatusCell row={row} />,
      },
    ] satisfies DataTableColumn<AnalyticBoardRow>[]),
    ...visibleMonthPeriods.map((period) => ({
      accessor: `period:${period.id}`,
      title: period.label,
      width: shouldUseDetailedTable ? 300 : periodRangeMonths === 3 ? 220 : 300,
      render: (row: AnalyticBoardRow) => {
        const cell = row.periodCells.find((item) => item.period.id === period.id);
        return cell ? <PeriodCell cell={cell} compact={!shouldUseDetailedTable} /> : null;
      },
    } satisfies DataTableColumn<AnalyticBoardRow>)),
  ], [periodRangeMonths, shouldUseDetailedTable, visibleMonthPeriods]);

  const canOpenCustomRoom = sanitizeRoomName(customRoomName) !== '' && sanitizeRoomName(customRoomName) !== roomName;
  const headerSyncLabel = isConnected && isSynced ? 'Online' : isConnected ? 'Łączenie' : 'Offline';
  const headerSyncDetail = isConnected && isSynced ? 'współpraca' : isConnected ? 'sync' : 'lokalnie';
  const syncDetail = isConnected && isSynced
    ? 'Współpraca online działa. Analytic Board używa tych samych danych trwałych co Diablo Board.'
    : 'Możesz analizować lokalny snapshot; dane zostaną zsynchronizowane, gdy połączenie wróci.';
  const isBackendBusy = durableLoadStatus === 'loading' || durableSaveStatus === 'saving';
  const shouldShowBackendPanel = isBackendBusy || durableLoadStatus === 'failed' || durableSaveStatus === 'failed';
  const diabloBoardPath = host && wsPort
    ? `/server/${host}/${wsPort}/${httpPort || String(defaultSyncServerConfig.httpPort)}/diablo-board/${roomName}`
    : `/diablo-board/${roomName}`;
  const sameBoardCollaborationPeers = useMemo(
    () => filterCollaborationPeersForBoardView(collaborationPeers, collaborationBoardView, activePeriodId),
    [activePeriodId, collaborationPeers]
  );
  const localEditingTarget = null;
  const visibleCollaborationPeers = useMemo(() => (
    getVisibleCollaborationPeersForBoardView(
      collaborationPeers,
      collaborationBoardView,
      activePeriodId,
      followedCollaborationUserId,
      localEditingTarget
    )
  ), [activePeriodId, collaborationPeers, followedCollaborationUserId]);

  const handleNavigateToRoom = (nextRoomName: string) => {
    const sanitizedRoomName = sanitizeRoomName(nextRoomName);
    if (!sanitizedRoomName || sanitizedRoomName === roomName) return;

    if (host && wsPort) {
      navigate(`/server/${host}/${wsPort}/${httpPort || String(defaultSyncServerConfig.httpPort)}/board/${sanitizedRoomName}`);
      return;
    }

    navigate(`/board/${sanitizedRoomName}`);
  };

  const handleCustomRoomSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canOpenCustomRoom) handleNavigateToRoom(customRoomName);
  };

  const handlePeriodRangeChange = (range: AnalyticPeriodRangeMonths) => {
    setPeriodRangeMonths(range);
    setPeriodRangeStartId(activePeriodId);
  };

  const handleCollaborationTrackingEnabledChange = (enabled: boolean) => {
    persistCollaborationTrackingEnabled(enabled);
    setCollaborationTrackingEnabledState(enabled);
    setCollaborationTrackingEnabled(enabled);
    if (!enabled) {
      pendingPresenceRef.current = null;
      activePresenceTargetKeyRef.current = null;
    }
  };

  const handleFollowedCollaborationUserIdChange = (userId: string | null) => {
    persistFollowedCollaborationUserId(userId);
    setFollowedCollaborationUserIdState(userId);
  };

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

  const toggleFilter = (filterId: AnalyticFilterId) => {
    setActiveFilters((current) => (
      current.includes(filterId)
        ? current.filter((item) => item !== filterId)
        : [...current, filterId]
    ));
  };

  const handleRestorePerson = (personId: string, personName: string) => {
    restorePerson(personId, visibleArchivePeriodIds);
    publishPresenceAction('edit', `Przywrócił osobę: ${personName}`, {
      type: 'person',
      id: personId,
      label: personName,
    });
  };

  const handleCloseArchiveModal = () => {
    setIsArchiveModalOpen(false);
  };

  if (!activePeriod) {
    return (
      <MantineProvider forceColorScheme={theme === 'day' ? 'light' : 'dark'}>
        <div className={`traffic-app analytic-app is-${theme}`}>
          <Helmet><title>Analytic Board</title></Helmet>
          <div className="analytic-empty-state">Ładuję zakres planowania...</div>
        </div>
      </MantineProvider>
    );
  }

  return (
    <MantineProvider forceColorScheme={theme === 'day' ? 'light' : 'dark'}>
      <div
        className={`traffic-app analytic-app is-${theme}`}
        onClickCapture={handlePresenceClickCapture}
        onPointerLeave={handlePresencePointerLeave}
        onPointerMove={handlePresencePointerMove}
      >
        <Helmet>
          <title>Analytic Board</title>
        </Helmet>

        <TrafficHeader
          boardViewLink={{
            label: 'Diablo Board',
            title: 'Przejdź do Diablo Board dla tej samej tablicy',
            to: diabloBoardPath,
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
          resetConfirmationPending={false}
          revenueView={revenueView}
          roomName={roomName}
          roomPresets={roomPresets}
          showDisplayControls={false}
          showToolActions={false}
          snapshotStatus="idle"
          syncDetail={syncDetail}
          theme={theme}
          onCopySnapshot={() => undefined}
          onCustomRoomNameChange={setCustomRoomName}
          onCustomRoomSubmit={handleCustomRoomSubmit}
          onFollowedUserIdChange={handleFollowedCollaborationUserIdChange}
          onHeaderMenuOpenChange={setIsHeaderMenuOpen}
          onNavigateToRoom={handleNavigateToRoom}
          onOpenHelp={() => undefined}
          onOpenPlanningRules={() => undefined}
          onResetBoard={() => undefined}
          onResetConfirmationCancel={() => undefined}
          onRevenueViewChange={setRevenueView}
          onThemeChange={setTheme}
          onTrackingEnabledChange={handleCollaborationTrackingEnabledChange}
          onUserNameChange={setCollaborationUserName}
        />

        {shouldShowBackendPanel ? (
          <section className={`traffic-backend-panel is-${durableLoadStatus === 'failed' || durableSaveStatus === 'failed' ? 'danger' : 'loading'}`}>
            {durableLoadStatus === 'loading' ? 'Ładuję trwały snapshot z API.' : durableSaveStatus === 'saving' ? 'Synchronizuję ostatnie zmiany.' : 'Backend nie potwierdził aktualnego stanu.'}
          </section>
        ) : null}

        <main className="analytic-main">
          <section
            className="analytic-toolbar"
            aria-label="Zakres Analytic Board"
            data-collaboration-target-id="analytic-toolbar"
            data-collaboration-target-label="Zakres Analytic Board"
            data-collaboration-target-type="section"
          >
            <PeriodTimelineNavigator
              activePeriodId={activePeriodId}
              ariaLabel="Zakres czasu Analytic Board"
              className="analytic-period-timeline"
              collapsible
              defaultOpen
              description={`Read-only podgląd alokacji ludzi: ${periodRangeMonths === 3 ? '3 miesiące' : '1 miesiąc'}`}
              heading="Analytic Board"
              monthPeriods={monthPeriods}
              rangeMonths={periodRangeMonths}
              rangeOptions={rangeOptions}
              rangeStartPeriodId={periodRangeStartId}
              onActivePeriodChange={setActivePeriod}
              onRangeMonthsChange={handlePeriodRangeChange}
              onRangeStartChange={setPeriodRangeStartId}
            />
          </section>

          <details
            className="analytic-context-panel"
            open={isContextPanelOpen}
            onToggle={(event) => setIsContextPanelOpen(event.currentTarget.open)}
          >
            <summary>
              <div className="analytic-context-copy">
                <strong>Ustawienia i sygnały</strong>
                <span>
                  {activeFilters.length || searchQuery.trim()
                    ? `${activeFilters.length} filtrów${searchQuery.trim() ? ' + szukanie' : ''}`
                    : 'podsumowanie, filtry i legenda'}
                </span>
              </div>
              <div className="analytic-context-summary">
                <span>{visibleRows.length}/{analyticRows.length} osób</span>
                <span>{formatMoneyK(summary.revenueK)}</span>
                <span>{summary.signalCount} sygnałów</span>
              </div>
              <span className="analytic-context-toggle">{isContextPanelOpen ? 'Zwiń' : 'Rozwiń'}</span>
            </summary>

            <div className="analytic-context-panel-body">
              <section
                className="analytic-summary"
                aria-label="Podsumowanie widocznej tabeli"
                data-collaboration-target-id="analytic-summary"
                data-collaboration-target-label="Podsumowanie Analytic Board"
                data-collaboration-target-type="section"
              >
                <SummaryMetric label="Osoby" value={`${visibleRows.length}/${analyticRows.length}`} />
                <SummaryMetric label="Revenue" value={formatMoneyK(summary.revenueK)} />
                <SummaryMetric label="Godziny" value={`${formatNumber(summary.hours)}h`} />
                <SummaryMetric label="Utylizacja" value={`${summary.utilizationPercent}%`} />
                <SummaryMetric label="Bench" value={formatMoneyK(summary.benchK)} />
                <SummaryMetric label="Sygnały" value={String(summary.signalCount)} />
              </section>

              <section
                className="analytic-filters"
                aria-label="Filtry wzorców"
                data-collaboration-target-id="analytic-filters"
                data-collaboration-target-label="Filtry wzorców Analytic Board"
                data-collaboration-target-type="section"
              >
                <div className="analytic-filter-list">
                  {filterOrder.map((filterId) => (
                    <button
                      key={filterId}
                      className={`${getFilterClassName(filterId)} ${activeFilters.includes(filterId) ? 'is-active' : ''}`}
                      type="button"
                      onClick={() => toggleFilter(filterId)}
                    >
                      {analyticFilterLabels[filterId]}
                      <span>{filterCounts[filterId] || 0}</span>
                    </button>
                  ))}
                </div>
                {canResetFilters ? (
                  <div className="analytic-filter-actions">
                    <button className="analytic-filter-reset" type="button" onClick={() => {
                      setActiveFilters([]);
                      setSearchQuery('');
                    }}>
                      Wyczyść filtry
                    </button>
                  </div>
                ) : null}
              </section>

              <AnalyticLegend
                activeSectionId={activeLegendSectionId}
                isCollapsed={isLegendCollapsed}
                onActiveSectionChange={setActiveLegendSectionId}
                onToggleCollapsed={() => setIsLegendCollapsed((current) => !current)}
              />
            </div>
          </details>

          <section
            className="analytic-table-controls"
            aria-label="Wyszukiwarka tabeli Analytic Board"
            data-collaboration-target-id="analytic-table-search"
            data-collaboration-target-label="Wyszukiwarka tabeli Analytic Board"
            data-collaboration-target-type="section"
          >
            <label className="analytic-search">
              <span>Szukaj</span>
              <input
                type="search"
                placeholder="osoba, projekt, skill, sygnał"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
            <div className="analytic-table-tools">
              <button
                aria-controls="analytic-archive-modal"
                aria-expanded={isArchiveModalOpen}
                className={`analytic-archive-toggle ${isArchiveModalOpen ? 'is-active' : ''}`}
                type="button"
                onClick={() => setIsArchiveModalOpen(true)}
              >
                Zarchiwizowani
                <span>{archivedPeople.length}</span>
              </button>
            </div>
          </section>

          {isArchiveModalOpen ? (
            <ArchivedPeopleModal
              people={archivedPeople}
              onClose={handleCloseArchiveModal}
              onRestorePerson={handleRestorePerson}
            />
          ) : null}

          <section
            className={`analytic-table-shell ${shouldUseDetailedTable ? 'is-detailed' : 'is-compact'}`}
            aria-label="Tabela Analytic Board"
            data-collaboration-target-id="analytic-table"
            data-collaboration-target-label="Tabela alokacji Analytic Board"
            data-collaboration-target-type="section"
          >
            <DataTable
              className={`analytic-data-table ${shouldUseDetailedTable ? 'is-detailed' : 'is-compact'}`}
              columns={columns}
              height="100%"
              highlightOnHover
              horizontalSpacing="sm"
              idAccessor="id"
              minHeight={420}
              noRecordsText="Brak osób spełniających filtry."
              pinFirstColumn
              records={visibleRows}
              rowClassName={(row) => getRowClassName(row)}
              sortStatus={sortStatus}
              striped
              textSelectionDisabled
              verticalAlign="top"
              withTableBorder
              withColumnBorders
              onSortStatusChange={setSortStatus}
            />
          </section>

          <AnalyticCardList
            rows={visibleRows}
            periods={visibleMonthPeriods}
          />
        </main>
        <CollaborationPresenceLayer peers={visibleCollaborationPeers} localEditingTarget={localEditingTarget} />
      </div>
    </MantineProvider>
  );
}

function useMediaQuery(query: string) {
  const getMatches = useCallback(() => (
    typeof window === 'undefined' ? false : window.matchMedia(query).matches
  ), [query]);
  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQueryList = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQueryList.matches);
    handleChange();
    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

function PersonCell({ row }: { row: AnalyticBoardRow }) {
  return (
    <div
      className="analytic-person-cell"
      data-collaboration-target-id={row.person.id}
      data-collaboration-target-label={row.person.name}
      data-collaboration-target-type="person"
    >
      <span className="analytic-avatar" style={{ background: row.person.color }}>
        {row.person.initials}
      </span>
      <div>
        <strong>{row.person.name}</strong>
        <span>{row.person.role}{row.person.seniority ? ` · ${row.person.seniority}` : ''}</span>
        <div className="analytic-skill-strip">
          {row.person.skillIds.map((skillId) => <em key={skillId}>{skillId}</em>)}
        </div>
      </div>
    </div>
  );
}

function RangeStatusCell({ row }: { row: AnalyticBoardRow }) {
  return (
    <div className="analytic-status-cell">
      <div className="analytic-status-metrics">
        <MetricPill tone={getUtilizationTone(row.rangeUtilizationPercent)} label={`${row.rangeUtilizationPercent}%`} />
        <strong>{formatMoneyK(row.rangeProductiveRevenueK)}</strong>
        <span>{formatNumber(row.rangeProductiveHours)}h</span>
        <MetricPill tone={row.rangeProjectCount > 1 ? 'warning' : 'neutral'} label={`${row.rangeProjectCount} proj.`} />
        {row.rangeBenchRevenueK > 0 ? <MetricPill tone="bench" label={`bench ${formatMoneyK(row.rangeBenchRevenueK)}`} /> : null}
      </div>
      <SignalStrip codes={row.signalCodes} compact />
    </div>
  );
}

function PeriodCell({ cell, compact = false }: { cell: AnalyticPeriodCell; compact?: boolean }) {
  return (
    <div
      className={`analytic-period-cell ${compact ? 'is-compact' : ''}`}
      data-collaboration-target-id={`analytic-period:${cell.period.id}`}
      data-collaboration-target-label={cell.period.label}
      data-collaboration-target-type="section"
    >
      <div className="analytic-period-metrics">
        <MetricPill tone={getUtilizationTone(cell.utilizationPercent)} label={`${cell.utilizationPercent}%`} />
        <span>{formatNumber(cell.productiveHours)}/{formatNumber(cell.availableHours)}h</span>
        {cell.benchRevenueK > 0 ? <MetricPill tone="bench" label={`bench ${formatMoneyK(cell.benchRevenueK)}`} /> : null}
      </div>
      <div className="analytic-assignment-list">
        {cell.assignments.length ? cell.assignments.map((assignment) => (
          <AssignmentChip key={assignment.id} assignment={assignment} compact={compact} />
        )) : <span className="analytic-empty-cell">Brak alokacji</span>}
      </div>
    </div>
  );
}

function AssignmentChip({ assignment, compact = false }: { assignment: AnalyticAssignment; compact?: boolean }) {
  const targetType = assignment.targetId === 'bench' ? 'section' : 'project';
  const targetId = assignment.targetId === 'bench' ? assignment.id : assignment.targetId;
  return (
    <div
      className={`analytic-assignment-chip is-${assignment.tone} ${compact ? 'is-compact' : ''}`}
      title={assignment.detail}
      data-collaboration-target-id={targetId}
      data-collaboration-target-label={assignment.label}
      data-collaboration-target-type={targetType}
    >
      <div>
        <strong>{assignment.label}</strong>
        <span>{formatMoneyK(assignment.revenueK)} / {formatNumber(assignment.hours)}h</span>
      </div>
      <SignalStrip codes={[...assignment.skillCodes, ...assignment.signalCodes].slice(0, 5)} compact />
    </div>
  );
}

function ArchivedPeopleModal({
  people,
  onClose,
  onRestorePerson,
}: {
  people: Person[];
  onClose: () => void;
  onRestorePerson: (personId: string, personName: string) => void;
}) {
  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
  const normalizedArchiveSearchQuery = normalizeArchiveSearchValue(archiveSearchQuery);
  const filteredPeople = useMemo(() => {
    if (!normalizedArchiveSearchQuery) return people;

    return people.filter((person) => {
      const searchableValues = [
        person.name,
        person.initials,
        person.role,
        person.seniority ?? '',
        person.archivedAt ? formatArchivedAt(person.archivedAt) : '',
        ...person.skillIds,
      ];
      return searchableValues.some((value) => (
        normalizeArchiveSearchValue(value).includes(normalizedArchiveSearchQuery)
      ));
    });
  }, [normalizedArchiveSearchQuery, people]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="analytic-archive-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="analytic-archive-modal-title"
        aria-modal="true"
        className="analytic-archive-modal"
        id="analytic-archive-modal"
        role="dialog"
        data-collaboration-target-id="analytic-archive-modal"
        data-collaboration-target-label="Zarchiwizowane osoby Analytic Board"
        data-collaboration-target-type="section"
      >
        <header>
          <div>
            <strong id="analytic-archive-modal-title">Zarchiwizowane osoby</strong>
            <span>{people.length ? `${people.length} poza aktywnymi KPI i tabelą` : 'Archiwum jest puste'}</span>
          </div>
          <button className="analytic-archive-close" type="button" onClick={onClose}>
            Zamknij
          </button>
        </header>
        {people.length ? (
          <div className="analytic-archive-search">
            <label htmlFor="analytic-archive-search-input">
              Szukaj
              <input
                autoComplete="off"
                id="analytic-archive-search-input"
                placeholder="Imię, rola, skill..."
                type="search"
                value={archiveSearchQuery}
                onChange={(event) => setArchiveSearchQuery(event.target.value)}
              />
            </label>
            <span>
              {normalizedArchiveSearchQuery
                ? `${filteredPeople.length} z ${people.length} pasuje`
                : `${people.length} w archiwum`}
            </span>
          </div>
        ) : null}
        {filteredPeople.length ? (
          <div className="analytic-archive-table-wrap">
            <table className="analytic-archive-table">
              <thead>
                <tr>
                  <th>Osoba</th>
                  <th>Rola</th>
                  <th>Skille</th>
                  <th>Status</th>
                  <th aria-label="Akcje" />
                </tr>
              </thead>
              <tbody>
                {filteredPeople.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <div className="analytic-archive-person-row">
                        <span
                          className="analytic-archive-avatar"
                          style={{ borderColor: person.color }}
                        >
                          {person.initials}
                        </span>
                        <strong>{person.name}</strong>
                      </div>
                    </td>
                    <td>
                      <span className="analytic-archive-role">{person.role}{person.seniority ? ` · ${person.seniority}` : ''}</span>
                    </td>
                    <td>
                      <div className="analytic-skill-strip">
                        {person.skillIds.length
                          ? person.skillIds.map((skillId) => <em key={skillId}>{skillId}</em>)
                          : <span className="analytic-muted">Brak</span>}
                      </div>
                    </td>
                    <td>
                      <span className="analytic-archive-badge">
                        Zarchiwizowana{person.archivedAt ? ` ${formatArchivedAt(person.archivedAt)}` : ''}
                      </span>
                    </td>
                    <td>
                      <button
                        className="analytic-restore-person-button"
                        type="button"
                        onClick={() => onRestorePerson(person.id, person.name)}
                      >
                        Przywróć
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="analytic-archive-empty">
            {people.length
              ? 'Brak zarchiwizowanych osób pasujących do wyszukiwania.'
              : 'Nie ma żadnych zarchiwizowanych osób w tej tablicy.'}
          </div>
        )}
      </section>
    </div>
  );
}

function AnalyticCardList({ rows, periods }: { rows: AnalyticBoardRow[]; periods: AnalyticPeriodCell['period'][] }) {
  return (
    <section className="analytic-card-list" aria-label="Lista Analytic Board">
      {rows.length ? rows.map((row) => (
        <article className={`analytic-row-card ${getRowClassName(row)}`} key={row.id}>
          <header>
            <PersonCell row={row} />
            <RangeStatusCell row={row} />
          </header>
          <div className="analytic-card-periods">
            {periods.map((period) => {
              const cell = row.periodCells.find((item) => item.period.id === period.id);
              return cell ? (
                <section className="analytic-card-period" key={period.id} aria-label={`${row.person.name}: ${period.label}`}>
                  <strong>{period.label}</strong>
                  <PeriodCell cell={cell} compact />
                </section>
              ) : null;
            })}
          </div>
        </article>
      )) : (
        <div className="analytic-empty-state">Brak osób spełniających filtry.</div>
      )}
    </section>
  );
}

function SignalStrip({ codes, compact = false }: { codes: string[]; compact?: boolean }) {
  if (!codes.length) return <span className="analytic-muted">OK</span>;
  const visibleCodeLimit = compact ? 4 : 6;
  const hiddenCodes = codes.slice(visibleCodeLimit);
  const hiddenSignalSummary = ['Ukryte sygnały:', ...hiddenCodes.map(formatHiddenSignalCode)].join('\n');
  const hiddenSignalAriaLabel = hiddenCodes.map(formatHiddenSignalCode).join('; ');

  return (
    <div className={`analytic-signal-strip ${compact ? 'is-compact' : ''}`}>
      {codes.slice(0, visibleCodeLimit).map((code, index) => {
        const meta = getAnalyticSignalCodeMeta(code);
        return (
          <span className={meta ? `is-kind-${meta.kind} ${meta.className}` : 'is-kind-glyph'} key={`${code}-${index}`}>
            {code}
          </span>
        );
      })}
      {hiddenCodes.length ? (
        <TrafficTooltip
          className="analytic-signal-overflow-tooltip"
          delayMs={40}
          label={hiddenSignalSummary}
          placement="top"
        >
          <button
            aria-label={`Ukryte sygnały: ${hiddenSignalAriaLabel}`}
            className="analytic-signal-overflow-button"
            type="button"
          >
            +{hiddenCodes.length}
          </button>
        </TrafficTooltip>
      ) : null}
    </div>
  );
}

function formatHiddenSignalCode(code: string) {
  const meta = getAnalyticSignalCodeMeta(code);
  if (!meta) return code;
  return `${code}: ${meta.label} - ${meta.detail}`;
}

function AnalyticLegend({
  activeSectionId,
  isCollapsed,
  onActiveSectionChange,
  onToggleCollapsed,
}: {
  activeSectionId: AnalyticLegendSection['id'];
  isCollapsed: boolean;
  onActiveSectionChange: (sectionId: AnalyticLegendSection['id']) => void;
  onToggleCollapsed: () => void;
}) {
  const activeSection = analyticLegendSections.find((section) => section.id === activeSectionId) || analyticLegendSections[0];
  return (
    <section
      className={`analytic-legend ${isCollapsed ? 'is-collapsed' : ''}`}
      aria-label="Legenda sygnałów Analytic Board"
      data-collaboration-target-id="analytic-legend"
      data-collaboration-target-label="Legenda Analytic Board"
      data-collaboration-target-type="section"
    >
      <header>
        <div>
          <strong>Legenda</strong>
          <span>{isCollapsed ? 'zwinięta' : activeSection.description}</span>
        </div>
        <button
          aria-controls="analytic-legend-content"
          aria-expanded={!isCollapsed}
          className="analytic-legend-toggle"
          type="button"
          onClick={onToggleCollapsed}
        >
          {isCollapsed ? 'Rozwiń' : 'Zwiń'}
        </button>
      </header>
      {!isCollapsed ? (
        <div id="analytic-legend-content" className="analytic-legend-content">
          <div className="analytic-legend-tabs" role="tablist" aria-label="Sekcje legendy Analytic Board">
            {analyticLegendSections.map((section) => (
              <button
                aria-selected={activeSection.id === section.id}
                className={activeSection.id === section.id ? 'is-active' : ''}
                key={section.id}
                role="tab"
                type="button"
                onClick={() => onActiveSectionChange(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
          <div className="analytic-legend-items" role="tabpanel" aria-label={`Legenda: ${activeSection.label}`}>
            {activeSection.items.map((item) => (
              <article className={`analytic-legend-item is-kind-${item.kind} ${item.className}`} key={item.id}>
                <i aria-hidden="true">{item.code}</i>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MetricPill({ label, tone }: { label: string; tone: 'healthy' | 'warning' | 'danger' | 'bench' | 'neutral' }) {
  return <span className={`analytic-metric-pill is-${tone}`}>{label}</span>;
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="analytic-summary-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getUtilizationTone(utilizationPercent: number): 'healthy' | 'warning' | 'danger' | 'neutral' {
  if (utilizationPercent > 105) return 'danger';
  if (utilizationPercent < 65) return 'warning';
  if (utilizationPercent > 0) return 'healthy';
  return 'neutral';
}

function getRowClassName(row: AnalyticBoardRow) {
  if (row.signalKinds.includes('overload') || row.signalKinds.includes('risk')) return 'is-pressure';
  if (row.signalKinds.includes('bench')) return 'has-bench';
  return '';
}

function getFilterClassName(filterId: AnalyticFilterId) {
  const classes: Record<AnalyticFilterId, string> = {
    overload: 'is-overflow',
    bench: 'is-bench-footprint',
    fragmentation: 'is-tone-mixed',
    'low-value': 'is-low-value',
    rd: 'is-work-research_development',
    'single-person': 'is-single-person',
    changes: 'is-moved',
    risks: 'is-tone-red',
  };
  return classes[filterId];
}

function formatMoneyK(value: number) {
  return `${formatNumber(value)}k`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function formatArchivedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function normalizeArchiveSearchValue(value: string) {
  return value
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function sum<T>(items: T[], selector: (item: T) => number) {
  return Math.round(items.reduce((total, item) => total + selector(item), 0) * 10) / 10;
}
