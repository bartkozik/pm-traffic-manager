import { useCallback, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import {
  filterPersonCostCapacityAllocations,
  getPersonPeriodProfile,
  isPersonActiveInPeriod,
  type MoveTrafficAllocation,
} from '../models/traffic.model';
import { loadTrafficBoardSnapshot, moveTrafficBoardAllocations } from '../services/trafficBoardApi';
import { defaultSyncServerConfig } from '../services/trafficRuntimeConfig';
import { useTrafficStore } from '../stores/trafficStore';
import { getStoredTheme } from '../utils/trafficBoardDrafts';
import { isProjectActiveInPeriod } from '../utils/projectPeriod';
import './DiabloTrafficBoard.css';
import { DiabloAiPlanningPanel } from './DiabloAiPlanningPanel';

export default function DiabloAiPlanningView() {
  const { projectId, host, wsPort, httpPort } = useParams<{
    projectId?: string;
    host?: string;
    wsPort?: string;
    httpPort?: string;
  }>();
  const roomName = projectId || 'ptm-mvp';
  const serverConfig = useMemo(
    () => (host && wsPort ? { host, wsPort: Number(wsPort) } : defaultSyncServerConfig),
    [host, wsPort]
  );
  const theme = useMemo(() => getStoredTheme(), []);

  const {
    activePeriodId,
    allocations,
    durableLoadStatus,
    initializeBoard,
    moveTilesToTargets,
    people,
    periods,
    planningRules = [],
    projects,
    replaceBoardSnapshot,
    setActivePeriod,
  } = useTrafficStore();

  useEffect(() => {
    initializeBoard(roomName, serverConfig);
  }, [initializeBoard, roomName, serverConfig]);

  const monthPeriods = useMemo(
    () => periods
      .filter((period) => period.granularity === 'month')
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
    [periods]
  );
  const activePeriod = monthPeriods.find((period) => period.id === activePeriodId) || monthPeriods[0];
  const activeMonthId = activePeriod?.id;

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const activePeople = useMemo(
    () => (activeMonthId
      ? people
          .filter((person) => isPersonActiveInPeriod(person, activeMonthId))
          .map((person) => getPersonPeriodProfile(person, activeMonthId))
      : []),
    [activeMonthId, people]
  );
  const periodAllocations = useMemo(
    () => filterPersonCostCapacityAllocations(
      allocations.filter((allocation) => allocation.periodId === activeMonthId),
      peopleById
    ),
    [activeMonthId, allocations, peopleById]
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
  const activeProjects = useMemo(() => {
    if (!activePeriod) return [];
    return projects
      .filter((project) => !project.archivedAt)
      .filter((project) => !(project.archivedPeriodIds || []).includes(activePeriod.id))
      .filter((project) => isProjectActiveInPeriod(project, activePeriod.id, allocationsByTarget));
  }, [activePeriod, allocationsByTarget, projects]);

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

  const boardPath = host && wsPort
    ? `/server/${host}/${wsPort}/${httpPort || String(defaultSyncServerConfig.httpPort)}/diablo-board/${roomName}`
    : `/diablo-board/${roomName}`;

  return (
    <div className={`diablo-app traffic-app is-${theme} diablo-ai-view`}>
      <Helmet><title>AI planning assistant</title></Helmet>

      <header className="diablo-ai-view-header">
        <div className="diablo-ai-view-heading">
          <Link className="traffic-view-switch-link" to={boardPath}>← Diablo Board</Link>
          <strong>AI planning assistant</strong>
          <small>Standalone module · compatible with MCP planning tools</small>
        </div>
        <label className="diablo-ai-view-period">
          <span>Month</span>
          <select
            className="traffic-pill"
            value={activeMonthId || ''}
            onChange={(event) => setActivePeriod(event.target.value)}
          >
            {monthPeriods.map((period) => (
              <option key={period.id} value={period.id}>{period.label}</option>
            ))}
          </select>
        </label>
      </header>

      <main className="diablo-ai-view-main">
        {durableLoadStatus === 'loading' && !monthPeriods.length ? (
          <p className="diablo-ai-view-loading">Loading board data…</p>
        ) : activePeriod ? (
          <DiabloAiPlanningPanel
            allocations={periodAllocations}
            people={activePeople}
            period={activePeriod}
            planningRules={planningRules}
            projects={activeProjects}
            roomName={roomName}
            defaultOpen
            onActiveCheckChange={() => {}}
            onApplyAllocationMoves={applyBackendAllocationMoves}
          />
        ) : (
          <p className="diablo-ai-view-loading">No months on this board.</p>
        )}
      </main>
    </div>
  );
}
