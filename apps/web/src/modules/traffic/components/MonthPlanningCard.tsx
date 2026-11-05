import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './MonthPlanningCard.css';
import { DropZone } from './DropZone';
import { HelpButton } from './HelpButton';
import { ProjectCard } from './ProjectCard';
import { ScaledTileGrid } from './ScaledTileGrid';
import { WeeklyDrilldown } from './WeeklyDrilldown';
import { DragPayload, DropPayloadOptions } from './types';
import { HelpTopicId } from '../help/helpContent';
import {
  getContractTypeLabel,
  getStageLabel,
  AllocationTarget,
  Period,
  Person,
  PersonTileAllocation,
  ProjectFrame,
  Skill,
  TileUnit,
} from '../models/traffic.model';
import { getPersonPeriodStatus } from '../utils/personPeriod';
import { ProjectSortMode } from '../utils/projectOrdering';
import { getPersonPeriodUtilization } from '../utils/personUtilization';
import {
  areRelationshipConnectorCanvasesEqual,
  emptyRelationshipConnectorCanvas,
  getArchivedProjectsForPeriod,
  getProjectsForPeriod,
  getRelationshipConnectorPath,
  getRelationshipConnectorPoints,
  type RelationshipConnectorCanvas,
  setAllocationTargetElementRef,
} from '../utils/monthPlanning';
import {
  BoardVisualFocusMode,
  buildPersonAllocationGroupContext,
  getPeriodRelationshipConnectorSignals,
  getPeriodRelationshipOverlaySignals,
  getRelationshipSignalClassName,
} from '../utils/visualInventory';
import { TrafficReviewTrigger } from '../utils/trafficReview';

interface MonthPlanningCardProps {
  period: Period;
  isActive: boolean;
  people: Person[];
  peopleById: Map<string, Person>;
  periods: Period[];
  projects: ProjectFrame[];
  skillsById: Map<string, Skill>;
  allocationsByTarget: Map<string, PersonTileAllocation[]>;
  allAllocations: PersonTileAllocation[];
  tileUnit?: TileUnit;
  displayTileUnit?: TileUnit;
  visualFocusMode?: BoardVisualFocusMode;
  reviewTriggersByProjectId?: Map<string, TrafficReviewTrigger[]>;
  pendingArchiveProjectId: string | null;
  pendingDeleteArchivedProjectId: string | null;
  onActivate: (periodId: string) => void;
  onArchiveProject: (projectId: string, periodId: string) => void;
  onCreateProject: (periodId: string) => void;
  onDeleteArchivedProject: (projectId: string, periodId: string) => void;
  onDropPayload: (payload: DragPayload, target: string, periodId: string, options?: DropPayloadOptions) => void;
  onEditPerson: (personId: string, periodId: string) => void;
  onEditProject: (projectId: string, periodId: string) => void;
  onOpenHelp: (topicId: HelpTopicId) => void;
  onOpenAllocation: (allocationId: string) => void;
  onRestoreProject: (projectId: string, periodId: string) => void;
  onTileDragStart: (event: React.DragEvent, payload: DragPayload) => void;
}

export function MonthPlanningCard({
  period,
  isActive,
  people,
  peopleById,
  periods,
  projects,
  skillsById,
  allocationsByTarget,
  allAllocations,
  tileUnit,
  displayTileUnit,
  visualFocusMode = 'all',
  reviewTriggersByProjectId,
  pendingArchiveProjectId,
  pendingDeleteArchivedProjectId,
  onActivate,
  onArchiveProject,
  onCreateProject,
  onDeleteArchivedProject,
  onDropPayload,
  onEditPerson,
  onEditProject,
  onOpenHelp,
  onOpenAllocation,
  onRestoreProject,
  onTileDragStart,
}: MonthPlanningCardProps) {
  const projectGridRef = useRef<HTMLDivElement | null>(null);
  const targetElementRefs = useRef(new Map<AllocationTarget, HTMLElement>());
  const [relationshipConnectorCanvas, setRelationshipConnectorCanvas] = useState<RelationshipConnectorCanvas>(emptyRelationshipConnectorCanvas);
  const benchAllocations = allocationsByTarget.get('bench') || [];
  const [projectSortMode, setProjectSortMode] = useState<ProjectSortMode>('type');
  const [isPeopleCollapsed, setIsPeopleCollapsed] = useState(true);
  const [isWeeklyCollapsed, setIsWeeklyCollapsed] = useState(true);
  const [isBenchCollapsed, setIsBenchCollapsed] = useState(true);
  const [isRelationshipOverlayVisible, setIsRelationshipOverlayVisible] = useState(false);
  const visibleProjects = useMemo(
    () => getProjectsForPeriod(projects, period, allocationsByTarget, peopleById, projectSortMode),
    [allocationsByTarget, peopleById, period, projectSortMode, projects]
  );
  const archivedProjects = useMemo(
    () => getArchivedProjectsForPeriod(projects, period),
    [period, projects]
  );
  const periodAllocations = useMemo(() => Array.from(allocationsByTarget.values()).flat(), [allocationsByTarget]);
  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const personGroupContext = useMemo(
    () => buildPersonAllocationGroupContext(periodAllocations, peopleById, projectsById),
    [peopleById, periodAllocations, projectsById]
  );
  const relationshipOverlaySignals = useMemo(
    () => getPeriodRelationshipOverlaySignals(periodAllocations, peopleById, projectsById),
    [peopleById, periodAllocations, projectsById]
  );
  const relationshipConnectorSignals = useMemo(
    () => getPeriodRelationshipConnectorSignals(periodAllocations, peopleById, projectsById),
    [peopleById, periodAllocations, projectsById]
  );
  const setTargetElementRef = useCallback((target: AllocationTarget) => (element: HTMLElement | null) => {
    setAllocationTargetElementRef(targetElementRefs.current, target, element);
  }, []);
  const handleArchiveProject = useCallback(
    (projectId: string) => onArchiveProject(projectId, period.id),
    [onArchiveProject, period.id]
  );
  const handleEditProject = useCallback(
    (projectId: string) => onEditProject(projectId, period.id),
    [onEditProject, period.id]
  );

  useLayoutEffect(() => {
    if (!isRelationshipOverlayVisible || !relationshipConnectorSignals.length) {
      setRelationshipConnectorCanvas(emptyRelationshipConnectorCanvas);
      return undefined;
    }

    let animationFrame = 0;
    const measureConnectors = () => {
      const gridElement = projectGridRef.current;
      if (!gridElement) return;

      const gridRect = gridElement.getBoundingClientRect();
      const nextCanvas: RelationshipConnectorCanvas = {
        width: Math.round(gridRect.width),
        height: Math.round(gridElement.scrollHeight || gridRect.height),
        paths: relationshipConnectorSignals.flatMap((signal) => {
          const sourceElement = targetElementRefs.current.get(signal.sourceTarget);
          const targetElement = targetElementRefs.current.get(signal.targetTarget);
          if (!sourceElement || !targetElement) return [];

          const points = getRelationshipConnectorPoints(
            sourceElement.getBoundingClientRect(),
            targetElement.getBoundingClientRect(),
            gridRect
          );
          if (!points) return [];

          return [{
            ...signal,
            path: getRelationshipConnectorPath(points),
            ...points,
          }];
        }),
      };

      setRelationshipConnectorCanvas((current) => (
        areRelationshipConnectorCanvasesEqual(current, nextCanvas) ? current : nextCanvas
      ));
    };
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(measureConnectors);
    };

    scheduleMeasure();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    if (resizeObserver) {
      if (projectGridRef.current) resizeObserver.observe(projectGridRef.current);
      targetElementRefs.current.forEach((element) => resizeObserver.observe(element));
    }
    window.addEventListener('resize', scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', scheduleMeasure);
      resizeObserver?.disconnect();
    };
  }, [isRelationshipOverlayVisible, relationshipConnectorSignals, visibleProjects.length, benchAllocations.length, isBenchCollapsed]);

  return (
    <section className={`traffic-month ${isActive ? 'is-active' : ''}`}>
      <div className="traffic-month-header">
        <button className="traffic-month-title-button" type="button" onClick={() => onActivate(period.id)}>
          <h2>{period.label}</h2>
          <span>
            {period.startsOn} - {period.endsOn}
          </span>
        </button>
        <div className="traffic-month-header-actions">
          <label className="traffic-month-sort">
            Sort
            <select
              value={projectSortMode}
              onChange={(event) => setProjectSortMode(event.target.value as ProjectSortMode)}
            >
              <option value="type">Project type</option>
              <option value="profit_potential">Profit potential</option>
            </select>
          </label>
          <button
            aria-pressed={isRelationshipOverlayVisible}
            className={`traffic-button ${isRelationshipOverlayVisible ? 'is-primary' : ''}`}
            type="button"
            onClick={() => setIsRelationshipOverlayVisible((current) => !current)}
          >
            Relationships {relationshipOverlaySignals.length}
          </button>
          <button className="traffic-button is-primary" type="button" onClick={() => onCreateProject(period.id)}>
            + Add project
          </button>
        </div>
      </div>

      <div className={`traffic-project-grid ${isRelationshipOverlayVisible ? 'has-relationship-connectors' : ''}`} ref={projectGridRef}>
        {isRelationshipOverlayVisible && relationshipConnectorCanvas.paths.length ? (
          <svg
            aria-hidden="true"
            className="traffic-month-relationship-connectors"
            focusable="false"
            height={relationshipConnectorCanvas.height}
            viewBox={`0 0 ${relationshipConnectorCanvas.width} ${relationshipConnectorCanvas.height}`}
            width={relationshipConnectorCanvas.width}
          >
            <defs>
              <marker
                className="traffic-relationship-arrow-moved"
                id={`traffic-relationship-arrow-moved-${period.id}`}
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4"
                viewBox="0 0 8 8"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" />
              </marker>
              <marker
                className="traffic-relationship-arrow-fragmented"
                id={`traffic-relationship-arrow-fragmented-${period.id}`}
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4"
                viewBox="0 0 8 8"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" />
              </marker>
            </defs>
            {relationshipConnectorCanvas.paths.map((connector) => (
              <g
                className={`traffic-month-relationship-connector ${getRelationshipSignalClassName(connector.kind)}`}
                key={connector.id}
              >
                <path
                  d={connector.path}
                  markerEnd={`url(#traffic-relationship-arrow-${connector.kind === 'fragmented' ? 'fragmented' : 'moved'}-${period.id})`}
                />
                <circle cx={connector.startX} cy={connector.startY} r="3" />
                <circle cx={connector.endX} cy={connector.endY} r="3" />
              </g>
            ))}
          </svg>
        ) : null}
        {isRelationshipOverlayVisible ? (
          <div className="traffic-month-relationship-overlay" aria-label={`Allocation relationships for the month: ${period.label}`}>
            <div className="traffic-month-relationship-overlay-header">
              <div>
                <strong>
                  Relationships and moves
                  <HelpButton
                    label="Explain relationships and moves"
                    topicId="relationship-overlay"
                    onOpenHelp={onOpenHelp}
                  />
                </strong>
                <span>Changes, handoffs, backups, people split across targets, and relationship lines between visible frames.</span>
              </div>
              <em>{relationshipOverlaySignals.length} / {relationshipConnectorSignals.length}</em>
            </div>
            {relationshipOverlaySignals.length ? (
              <div className="traffic-month-relationship-list">
                {relationshipOverlaySignals.map((signal) => (
                  <article
                    className={`traffic-month-relationship-item ${getRelationshipSignalClassName(signal.kind)}`}
                    key={signal.id}
                    title={signal.detail}
                  >
                    <span className="traffic-month-relationship-dot" aria-hidden="true" />
                    <div>
                      <strong>{signal.personName}</strong>
                      <span>
                        {signal.sourceLabel} -&gt; {signal.targetLabel}
                      </span>
                    </div>
                    <b>{signal.label}</b>
                  </article>
                ))}
              </div>
            ) : (
              <p className="traffic-editor-section-note">
                No saved relationship markers this month.
              </p>
            )}
          </div>
        ) : null}

        {visibleProjects.map((project) => (
          <div className="traffic-project-grid-item" key={`${period.id}-${project.id}`} ref={setTargetElementRef(project.id)}>
            <ProjectCard
              activePeriodId={period.id}
              allocations={allocationsByTarget.get(project.id) || []}
              allAllocations={allAllocations}
              periodAllocations={periodAllocations}
              personGroupContext={personGroupContext}
              peopleById={peopleById}
              periods={periods}
              projectsById={projectsById}
              project={project}
              skillsById={skillsById}
              tileUnit={tileUnit}
              displayTileUnit={displayTileUnit}
              visualFocusMode={visualFocusMode}
              reviewTriggers={reviewTriggersByProjectId?.get(project.id) || []}
              isArchivePending={pendingArchiveProjectId === `${period.id}:${project.id}`}
              onArchive={handleArchiveProject}
              onDropPayload={onDropPayload}
              onEdit={handleEditProject}
              onOpenHelp={onOpenHelp}
              onOpenAllocation={onOpenAllocation}
              onTileDragStart={onTileDragStart}
            />
          </div>
        ))}

        {archivedProjects.length ? (
          <div className="traffic-archived-projects">
            <div className="traffic-section-title">
              <span>Archived this month</span>
              <span>{archivedProjects.length}</span>
            </div>
            <p className="traffic-editor-section-note">
              Restoring shows the project again this month. Allocations moved to the bench still need to be reassigned.
            </p>
            <div className="traffic-archived-table" role="table" aria-label={`Archived projects: ${period.label}`}>
              <div className="traffic-archived-row is-header" role="row">
                <span role="columnheader">Project</span>
                <span role="columnheader">Type / stage</span>
                <span role="columnheader">Plan</span>
                <span role="columnheader">Action</span>
              </div>
              {archivedProjects.map((project) => {
                const plan = project.revenuePlan.find((entry) => entry.periodId === period.id);
                const revenueK = plan?.revenueK ?? project.budgetK;

                return (
                  <div className="traffic-archived-row" role="row" key={`${period.id}:archived:${project.id}`}>
                    <span role="cell">
                      <strong>{project.client}</strong>
                      <small>{project.name}</small>
                    </span>
                    <span role="cell">
                      {getContractTypeLabel(project.contractType)} · {getStageLabel(project.stage)}
                    </span>
                    <span role="cell">{revenueK}k</span>
                    <span role="cell">
                      <div className="traffic-archived-actions">
                        <button
                          aria-label={`Restore project for the month: ${project.client} - ${project.name}`}
                          className="traffic-button"
                          type="button"
                          onClick={() => onRestoreProject(project.id, period.id)}
                        >
                          Restore
                        </button>
                        <button
                          aria-label={`${pendingDeleteArchivedProjectId === `${period.id}:${project.id}` ? 'Confirm project deletion' : 'Delete project'}: ${project.client} - ${project.name}`}
                          className={`traffic-button is-danger ${pendingDeleteArchivedProjectId === `${period.id}:${project.id}` ? 'is-confirming' : ''}`}
                          type="button"
                          onClick={() => onDeleteArchivedProject(project.id, period.id)}
                        >
                          {pendingDeleteArchivedProjectId === `${period.id}:${project.id}` ? 'Confirm' : 'Delete'}
                        </button>
                      </div>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="traffic-bench-grid-target" ref={setTargetElementRef('bench')}>
          <DropZone target="bench" periodId={period.id} className="traffic-bench" onDropPayload={onDropPayload}>
            <div className="traffic-collapsible-row">
              <button
                aria-expanded={!isBenchCollapsed}
                className="traffic-collapsible-header"
                type="button"
                onClick={() => setIsBenchCollapsed((current) => !current)}
              >
                <span>Bench / unassigned target</span>
                <em>{benchAllocations.length}k</em>
                <strong>{isBenchCollapsed ? 'Expand' : 'Collapse'}</strong>
              </button>
              <HelpButton
                label="Explain the bench and unassigned tiles"
                topicId="bench"
                onOpenHelp={onOpenHelp}
              />
            </div>
            {!isBenchCollapsed ? (
              <ScaledTileGrid
                allocations={benchAllocations.filter((allocation) => !peopleById.get(allocation.personId)?.archivedAt)}
                boardTileUnit={tileUnit}
                displayTileUnit={displayTileUnit}
                emptySlotKeyPrefix={`${period.id}-bench`}
                periodAllocations={periodAllocations}
                personGroupContext={personGroupContext}
                periods={periods}
                peopleById={peopleById}
                skillsById={skillsById}
                visualFocusMode={visualFocusMode}
                onOpenAllocation={onOpenAllocation}
                onTileDragStart={onTileDragStart}
              />
            ) : null}
          </DropZone>
        </div>
      </div>

      <div className="traffic-month-secondary">
        <section className="traffic-month-people">
          <div className="traffic-collapsible-row">
            <button
              aria-expanded={!isPeopleCollapsed}
              className="traffic-collapsible-header"
              type="button"
              onClick={() => setIsPeopleCollapsed((current) => !current)}
            >
              <span>People's capacity</span>
              <em>{people.length} people</em>
              <strong>{isPeopleCollapsed ? 'Expand' : 'Collapse'}</strong>
            </button>
            <HelpButton
              label="Explain people's monthly capacity"
              topicId="people-availability"
              onOpenHelp={onOpenHelp}
            />
          </div>
          {!isPeopleCollapsed ? (
            <div className="traffic-month-people-list">
              {people.map((person) => {
                const utilization = getPersonPeriodUtilization(person, period.id, periodAllocations, projectsById);
                const status = getPersonPeriodStatus(person, period.id);

                return (
                  <button
                    className={`traffic-month-person is-${utilization.status}`}
                    key={person.id}
                    type="button"
                    onClick={() => onEditPerson(person.id, period.id)}
                  >
                    <span className="traffic-person-dot" style={{ background: person.color }} />
                    <strong>{person.name}</strong>
                    <span>{utilization.costK}k cost</span>
                    <small>{utilization.allocatedRevenueK}/{utilization.targetK}k target · {utilization.allocatedHours}/{utilization.availableHours}h</small>
                    <div className="traffic-utilization-meter" aria-label={`${utilization.utilizationPercent}% utilisation`}>
                      <span style={{ width: `${Math.min(100, utilization.utilizationPercent)}%` }} />
                    </div>
                    <small>{utilization.utilizationPercent}% allocated · {utilization.targetCoveragePercent}% of target</small>
                    {status ? <em>{status}</em> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        {isActive ? (
          <section className="traffic-month-collapsible">
            <div className="traffic-collapsible-row">
              <button
                aria-expanded={!isWeeklyCollapsed}
                className="traffic-collapsible-header"
                type="button"
                onClick={() => setIsWeeklyCollapsed((current) => !current)}
              >
                <span>Weekly breakdown</span>
                <em>{period.label}</em>
                <strong>{isWeeklyCollapsed ? 'Expand' : 'Collapse'}</strong>
              </button>
              <HelpButton
                label="Explain the weekly breakdown"
                topicId="weekly-drilldown"
                onOpenHelp={onOpenHelp}
              />
            </div>
            {!isWeeklyCollapsed ? (
              <WeeklyDrilldown
                allocations={periodAllocations}
                people={people}
                peopleById={peopleById}
                period={period}
                periods={periods}
                projects={projects}
                skillsById={skillsById}
              />
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}
