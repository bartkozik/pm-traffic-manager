import { memo, useMemo, useState, type CSSProperties } from 'react';
import { HelpTopicId } from '../help/helpContent';
import {
  getContractTypeLabel,
  getEffectiveAllocationSkillId,
  getProjectPlanningStatusLabel,
  getStageLabel,
  Period,
  Person,
  PersonTileAllocation,
  ProjectFrame,
  Skill,
  TileUnit,
} from '../models/traffic.model';
import { DropZone } from './DropZone';
import { HelpButton } from './HelpButton';
import { ReviewTriggerPulses } from './ReviewTriggerPulses';
import { ScaledTileGrid } from './ScaledTileGrid';
import { DragPayload, DropPayloadOptions } from './types';
import { calculateProjectPressure } from '../utils/projectPressure';
import {
  BoardVisualFocusMode,
  buildPersonAllocationGroupContext,
  getFrameBehavior,
  getFrameEmptySlotLabel,
  getFrameTypeLabel,
  getPooledFrameCapacityK,
  getProjectInventoryCardClassNames,
  getProjectInventoryPatternClassName,
  getProjectInventoryPatternCode,
  getProjectInventoryPatterns,
  getProjectFrameGeometryCells,
  getProjectFrameGeometrySegments,
  getProjectRelationshipSignals,
  getRelationshipSignalClassName,
  isChangeFocusAllocation,
  splitAllocationsByRevenueLimit,
  summarizeProjectRelationshipSignals,
  type PersonAllocationGroupContext,
} from '../utils/visualInventory';
import {
  formatHours,
  formatRevenueK,
  getFrameBehaviorLabel,
  getMissingRequirementPlaceholders,
  getProjectValidationSummaryItems,
} from '../utils/projectCardView';
import { getProjectSkillZones } from '../utils/projectSkillZones';
import type { TrafficReviewTrigger } from '../utils/trafficReview';
import './ProjectCard.css';

const MAX_VISIBLE_PROJECT_INVENTORY_PATTERNS = 4;
const MAX_VISIBLE_PROJECT_RELATIONSHIP_DETAILS = 2;
const MAX_VISIBLE_PROJECT_REVIEW_TRIGGERS = 2;

interface ProjectCardProps {
  project: ProjectFrame;
  activePeriodId: string;
  allocations: PersonTileAllocation[];
  allAllocations: PersonTileAllocation[];
  periodAllocations?: PersonTileAllocation[];
  personGroupContext?: PersonAllocationGroupContext;
  peopleById: Map<string, Person>;
  periods: Period[];
  projectsById: Map<string, ProjectFrame>;
  skillsById: Map<string, Skill>;
  tileUnit?: TileUnit;
  displayTileUnit?: TileUnit;
  visualFocusMode?: BoardVisualFocusMode;
  reviewTriggers?: TrafficReviewTrigger[];
  isArchivePending: boolean;
  onArchive: (projectId: string) => void;
  onDropPayload: (payload: DragPayload, target: string, periodId: string, options?: DropPayloadOptions) => void;
  onEdit: (projectId: string) => void;
  onOpenHelp: (topicId: HelpTopicId) => void;
  onOpenAllocation: (allocationId: string) => void;
  onTileDragStart: (event: React.DragEvent, payload: DragPayload) => void;
}

function ProjectCardComponent({
  project,
  activePeriodId,
  allocations,
  allAllocations,
  periodAllocations,
  personGroupContext,
  peopleById,
  periods,
  projectsById,
  skillsById,
  tileUnit,
  displayTileUnit,
  visualFocusMode = 'all',
  reviewTriggers = [],
  isArchivePending,
  onArchive,
  onDropPayload,
  onEdit,
  onOpenHelp,
  onOpenAllocation,
  onTileDragStart,
}: ProjectCardProps) {
  const [areRisksExpanded, setAreRisksExpanded] = useState(false);
  const periodPlan = project.revenuePlan.find((entry) => entry.periodId === activePeriodId);
  const periodBudgetK = periodPlan?.revenueK ?? project.budgetK;
  const frameBehavior = getFrameBehavior(project.contractType);
  const frameCapacityK = frameBehavior === 'pooled'
    ? getPooledFrameCapacityK(project, activePeriodId, allAllocations, periods, periodBudgetK)
    : periodBudgetK;
  const { visible, overflow, visibleRevenueK, overflowRevenueK } = splitAllocationsByRevenueLimit(
    allocations,
    frameBehavior === 'elastic' ? null : frameCapacityK
  );
  const emptySlots = frameBehavior === 'elastic' ? 0 : Math.max(0, frameCapacityK - visibleRevenueK);
  const riskCount = allocations.reduce((sum, allocation) => (
    sum + (allocation.validation || []).filter((validation) => validation.severity !== 'info').length
  ), 0);
  const positiveSignalCount = allocations.reduce((sum, allocation) => (
    sum + (allocation.validation || []).filter((validation) => validation.severity === 'info').length
  ), 0);
  const validationItems = useMemo(
    () => getProjectValidationSummaryItems({ allocations, peopleById, project, skillsById }),
    [allocations, peopleById, project, skillsById]
  );
  const visibleValidationItems = areRisksExpanded ? validationItems : validationItems.slice(0, 3);
  const effectivePeriodAllocations = useMemo(
    () => periodAllocations || allAllocations.filter((allocation) => allocation.periodId === activePeriodId),
    [activePeriodId, allAllocations, periodAllocations]
  );
  const effectivePersonGroupContext = useMemo(
    () => personGroupContext || buildPersonAllocationGroupContext(effectivePeriodAllocations, peopleById, projectsById),
    [effectivePeriodAllocations, peopleById, personGroupContext, projectsById]
  );
  const pressure = useMemo(
    () => calculateProjectPressure(project, activePeriodId, allAllocations),
    [activePeriodId, allAllocations, project]
  );
  const isGhostProject = project.planningStatus === 'ghost';
  const frameTypeLabel = getFrameTypeLabel(project.contractType);
  const frameBehaviorLabel = getFrameBehaviorLabel(frameBehavior);
  const emptySlotLabel = getFrameEmptySlotLabel(project.contractType);
  const periodProbability = periodPlan?.probability ?? project.probability;
  const expectedPeriodRevenueK = Math.round(periodBudgetK * periodProbability * 10) / 10;
  const frameFillPercent = frameBehavior === 'elastic'
    ? (visibleRevenueK > 0 ? 100 : 0)
    : frameCapacityK > 0
      ? Math.min(100, Math.round((visibleRevenueK / frameCapacityK) * 100))
      : 0;
  const frameStatus = overflow.length
    ? 'overflow'
    : frameBehavior !== 'elastic' && emptySlots > 0
      ? 'gap'
      : riskCount
        ? 'pressure'
        : positiveSignalCount
          ? 'healthy'
          : 'neutral';
  const frameCapacityLabel = frameBehavior === 'elastic'
    ? `${visibleRevenueK}k planned`
    : `${visibleRevenueK}/${frameCapacityK}k allocated`;
  const allocatedHoursBySkill = allocations.reduce<Record<string, number>>((result, allocation) => {
    const skillId = getEffectiveAllocationSkillId(allocation, project, peopleById.get(allocation.personId));
    if (!skillId) return result;
    result[skillId] = (result[skillId] || 0) + allocation.hours;
    return result;
  }, {});
  const shouldShowMissingRequirementPlaceholders = frameBehavior === 'elastic' && !visible.length && !overflow.length;
  const missingRequirementPlaceholders = shouldShowMissingRequirementPlaceholders
    ? getMissingRequirementPlaceholders(project, skillsById, allocatedHoursBySkill)
    : [];
  const hasProjectCanvas = Boolean(visible.length || overflow.length || emptySlots > 0 || missingRequirementPlaceholders.length);
  const hasFrameDetails = Boolean(
    pressure || project.requirements.length || validationItems.length || project.notes
  );
  const frameDetailsSummary = [
    project.requirements.length ? `${project.requirements.length} req.` : null,
    validationItems.length ? `${validationItems.length} signals` : null,
    project.notes ? 'note' : null,
  ].filter(Boolean).join(' · ');
  const uniquePersonCount = new Set(visible.map((allocation) => allocation.personId)).size;
  const projectFrameInventoryLabel = frameBehavior === 'elastic'
    ? `${uniquePersonCount} people, ${visibleRevenueK}k planned`
    : `${uniquePersonCount} people, ${emptySlots}k available, ${overflowRevenueK}k beyond the frame`;
  const poolRemainingK = frameBehavior === 'pooled' && pressure ? Math.max(0, pressure.totalGapK) : 0;
  const frameGeometrySegments = useMemo(() => getProjectFrameGeometrySegments({
    frameBehavior,
    visibleRevenueK,
    emptyRevenueK: emptySlots,
    overflowRevenueK,
    poolRemainingK,
  }), [emptySlots, frameBehavior, overflowRevenueK, poolRemainingK, visibleRevenueK]);
  const frameGeometryCells = useMemo(
    () => getProjectFrameGeometryCells(frameGeometrySegments),
    [frameGeometrySegments]
  );
  const canvasAllocations = useMemo(() => [...visible, ...overflow], [overflow, visible]);
  const relationshipSignals = useMemo(
    () => getProjectRelationshipSignals(canvasAllocations, peopleById, effectivePeriodAllocations, projectsById),
    [canvasAllocations, effectivePeriodAllocations, peopleById, projectsById]
  );
  const relationshipSummaries = useMemo(
    () => summarizeProjectRelationshipSignals(relationshipSignals),
    [relationshipSignals]
  );
  const visibleRelationshipSignals = relationshipSignals.slice(0, MAX_VISIBLE_PROJECT_RELATIONSHIP_DETAILS);
  const hiddenRelationshipSignalCount = Math.max(0, relationshipSignals.length - visibleRelationshipSignals.length);
  const projectInventoryPatterns = useMemo(() => getProjectInventoryPatterns({
    project,
    allocations: canvasAllocations,
    periodAllocations: effectivePeriodAllocations,
    peopleById,
    projectsById,
    overflowRevenueK,
  }), [canvasAllocations, effectivePeriodAllocations, overflowRevenueK, peopleById, project, projectsById]);
  const visibleProjectInventoryPatterns = projectInventoryPatterns.slice(0, MAX_VISIBLE_PROJECT_INVENTORY_PATTERNS);
  const hiddenProjectInventoryPatternCount = Math.max(0, projectInventoryPatterns.length - visibleProjectInventoryPatterns.length);
  const projectInventoryClassNames = getProjectInventoryCardClassNames(projectInventoryPatterns).join(' ');
  const focusSignalCount = [...visible, ...overflow].filter(isChangeFocusAllocation).length;
  const isFocusModeDimmed = visualFocusMode === 'changes' && focusSignalCount === 0;
  const skillZones = useMemo(
    () => getProjectSkillZones(project, skillsById, activePeriodId, allocations, peopleById),
    [activePeriodId, allocations, peopleById, project, skillsById]
  );

  return (
    <DropZone
      target={project.id}
      periodId={activePeriodId}
      collaborationTargetLabel={`${project.client} - ${project.name}`}
      collaborationTargetType="project"
      className={`traffic-project is-${project.stage} is-contract-${project.contractType} is-frame-${frameStatus} ${projectInventoryClassNames} ${isGhostProject ? 'is-ghost' : ''} ${isFocusModeDimmed ? 'is-focus-muted' : ''} ${focusSignalCount > 0 ? 'is-focus-target' : ''}`}
      dropOptions={skillZones.length ? { disableRequirementSuggestion: true } : undefined}
      onDropPayload={onDropPayload}
    >
      <div className="traffic-project-header">
        <div>
          <div className="traffic-project-name">{project.client}</div>
          <div className="traffic-project-meta">
            <span className="traffic-project-meta-text">
              {project.name} · {getContractTypeLabel(project.contractType)} · {getStageLabel(project.stage)}{' '}
              {Math.round(project.probability * 100)}%
            </span>
            <span
              aria-label={`Project frame behaviour: ${frameBehaviorLabel}. Contract type: ${frameTypeLabel}`}
              className={`traffic-project-frame-chip is-${frameBehavior}`}
              title={`Project frame behaviour: ${frameBehaviorLabel}. Contract type: ${frameTypeLabel}`}
            >
              <i aria-hidden="true" />
              {frameBehaviorLabel}
            </span>
          </div>
        </div>
        <div className="traffic-project-actions">
          <div className="traffic-project-budget">{periodBudgetK}k</div>
          <button
            aria-label={`Edit project: ${project.client} - ${project.name}`}
            className="traffic-icon-button"
            type="button"
            onClick={() => onEdit(project.id)}
          >
            Edit
          </button>
          <button
            aria-label={`${isArchivePending ? 'Confirm hiding project' : 'Hide project this month'}: ${project.client} - ${project.name}`}
            className={`traffic-icon-button ${isArchivePending ? 'is-danger' : ''}`}
            type="button"
            onClick={() => onArchive(project.id)}
          >
            {isArchivePending ? 'Confirm' : 'Hide'}
          </button>
        </div>
      </div>

      <div className="traffic-project-frame-summary">
        <div
          aria-label={frameBehavior === 'elastic'
            ? `Uncapped T&M project has ${visibleRevenueK}k of work planned this month`
            : `Project frame usage: ${visibleRevenueK} of ${frameCapacityK}k`}
          className={`traffic-project-frame-meter is-${frameStatus}`}
          style={{ '--traffic-frame-fill': `${frameFillPercent}%` } as CSSProperties}
        >
          <span />
        </div>
        <div className="traffic-project-signals">
          <div
            className="traffic-project-badge"
            title={frameBehavior === 'elastic'
              ? 'Uncapped hourly project: shows planned work without empty capacity slots'
              : frameBehavior === 'capped'
                ? `Capped T&M / fixed limit: work fills the maximum capacity ${frameCapacityK}k`
                : `Fixed price: work uses a shared budget; available this month ${frameCapacityK}k`}
          >
            {frameCapacityLabel}
          </div>
          {emptySlots > 0 ? (
            <div className="traffic-project-warning" title={emptySlotLabel || 'Empty space in project frame'}>
              {emptySlotLabel ? `${emptySlotLabel} ${emptySlots}k` : `gap ${emptySlots}k`}
            </div>
          ) : null}
          {overflow.length ? (
            <div className="traffic-project-warning" title="Allocations exceed project funding">
              beyond frame +{formatRevenueK(overflowRevenueK)}
            </div>
          ) : null}
          {frameBehavior === 'pooled' && pressure ? (
            <div
              className={pressure.totalGapK >= 0 ? 'traffic-project-positive' : 'traffic-project-warning'}
              title="Remaining shared fixed-price budget after project allocations"
            >
              budget {pressure.totalGapK >= 0 ? `remaining ${formatRevenueK(pressure.totalGapK)}` : `overspent ${formatRevenueK(Math.abs(pressure.totalGapK))}`}
            </div>
          ) : null}
          {isGhostProject ? (
            <div className="traffic-project-badge" title={`Forecast this month: ${expectedPeriodRevenueK}k PLN`}>
              {getProjectPlanningStatusLabel(project.planningStatus)}
            </div>
          ) : null}
          {riskCount ? (
            <div className="traffic-project-risk-summary">
              <div className="traffic-project-warning">{riskCount} risks</div>
              <HelpButton
                label={`Explain project risks: ${project.client}`}
                topicId="project-risks"
                onOpenHelp={onOpenHelp}
              />
            </div>
          ) : null}
          {positiveSignalCount ? (
            <div className="traffic-project-positive">{positiveSignalCount} positive signals</div>
          ) : null}
        </div>
        {projectInventoryPatterns.length ? (
          <div className="traffic-project-inventory-rail" aria-label={`Project visual patterns: ${project.client}`}>
            {visibleProjectInventoryPatterns.map((pattern) => (
              <span
                aria-label={`${pattern.label}: ${pattern.detail}`}
                className={getProjectInventoryPatternClassName(pattern.kind)}
                key={pattern.kind}
                title={pattern.detail}
              >
                <i aria-hidden="true">{getProjectInventoryPatternCode(pattern.kind)}</i>
                <b>{pattern.label}</b>
                <small>{pattern.detail}</small>
              </span>
            ))}
            {hiddenProjectInventoryPatternCount ? (
              <span
                aria-label={`${hiddenProjectInventoryPatternCount} additional project patterns: ${projectInventoryPatterns.slice(MAX_VISIBLE_PROJECT_INVENTORY_PATTERNS).map((pattern) => pattern.label).join(', ')}`}
                className="is-more"
                title={`${hiddenProjectInventoryPatternCount} more patterns are available in the legend and detail panels`}
              >
                <i aria-hidden="true">+{hiddenProjectInventoryPatternCount}</i>
                <b>more</b>
                <small>remaining patterns in details</small>
              </span>
            ) : null}
          </div>
        ) : null}
        <ReviewTriggerPulses
          ariaLabel={`Traffic Review triggers for project: ${project.client}`}
          className="traffic-project-review-pulse"
          maxVisible={MAX_VISIBLE_PROJECT_REVIEW_TRIGGERS}
          triggers={reviewTriggers}
        />
      </div>

      {hasProjectCanvas ? (
        <div className="traffic-project-section-slot is-body">
          <div className="traffic-project-canvas-label">
            <span>Allocation frame</span>
            <strong>
              {projectFrameInventoryLabel}
              {visualFocusMode === 'changes' ? ` · ${focusSignalCount} changes/handoffs` : ''}
            </strong>
          </div>
          {frameGeometrySegments.length ? (
            <div className="traffic-project-frame-geometry" aria-label={`Frame geometry: ${frameGeometrySegments.map((segment) => `${segment.label} ${formatRevenueK(segment.valueK)}`).join(', ')}`}>
              <div className="traffic-project-frame-geometry-bar">
                {frameGeometrySegments.map((segment) => (
                  <span
                    className={`is-${segment.kind}`}
                    key={segment.kind}
                    style={{ '--traffic-frame-segment-share': `${segment.share}%` } as CSSProperties}
                    title={`${segment.label}: ${formatRevenueK(segment.valueK)}`}
                  />
                ))}
              </div>
              <div className="traffic-project-frame-geometry-legend">
                {frameGeometrySegments.map((segment) => (
                  <span className={`is-${segment.kind}`} key={segment.kind}>
                    <i aria-hidden="true" />
                    {segment.label} {formatRevenueK(segment.valueK)}
                  </span>
                ))}
              </div>
              <div
                className="traffic-project-frame-map"
                aria-label={`Frame slot map: ${frameGeometrySegments.map((segment) => `${segment.label} ${formatRevenueK(segment.valueK)}`).join(', ')}${frameGeometryCells[0]?.unitK && frameGeometryCells[0].unitK > 1 ? `. Each square represents approximately ${formatRevenueK(frameGeometryCells[0].unitK)}` : ''}`}
              >
                {frameGeometryCells.map((cell) => (
                  <span
                    className={`is-${cell.kind}`}
                    key={cell.id}
                    title={`${cell.label}: ${formatRevenueK(cell.segmentValueK)}${cell.unitK > 1 ? `, each square ~${formatRevenueK(cell.unitK)}` : ''}`}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {relationshipSignals.length ? (
            <>
              <div className="traffic-project-relationship-summary" aria-label={`Allocation relationships and changes summary: ${project.client}`}>
                {relationshipSummaries.map((summary) => (
                  <span
                    className={getRelationshipSignalClassName(summary.kind)}
                    key={summary.kind}
                    title={summary.detail}
                  >
                    <b>{summary.label}</b>
                    <small>{summary.count}</small>
                  </span>
                ))}
              </div>
              <div className="traffic-project-relationship-rail" aria-label={`Allocation relationships and changes: ${project.client}`}>
              {visibleRelationshipSignals.map((signal) => (
                <span className={getRelationshipSignalClassName(signal.kind)} key={signal.id} title={signal.detail}>
                  <b>{signal.label}</b>
                  <small>{signal.personName}</small>
                </span>
              ))}
                {hiddenRelationshipSignalCount ? (
                  <span className="is-more" title={`${hiddenRelationshipSignalCount} more relationships visible in the monthly overlay`}>
                    <b>more</b>
                    <small>+{hiddenRelationshipSignalCount}</small>
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
          <div className="traffic-project-body">
            {skillZones.length ? (
              <div className="traffic-project-skill-zone-map" aria-label={`Project skill zones ${project.client}`}>
                {skillZones.map((zone) => (
                  <DropZone
                    className={`traffic-project-skill-zone is-${zone.isCovered ? 'covered' : 'open'}`}
                    dropOptions={{ requirementId: zone.requirementId }}
                    key={zone.requirementId}
                    periodId={activePeriodId}
                    style={{
                      '--traffic-zone-share': `${zone.share}%`,
                      '--traffic-skill-color': zone.color,
                    } as CSSProperties}
                    target={project.id}
                    onDropPayload={onDropPayload}
                  >
                    <span>{zone.skillLabel}</span>
                  </DropZone>
                ))}
              </div>
            ) : null}
            <ScaledTileGrid
              allocations={visible}
              boardTileUnit={tileUnit}
              displayTileUnit={displayTileUnit}
              emptyRevenueK={emptySlots}
              emptySlotLabel={emptySlotLabel}
              emptySlotKeyPrefix={`${project.id}-visible`}
              emptySlotTone={frameBehavior === 'pooled' ? 'pooled' : 'capped'}
              periodAllocations={effectivePeriodAllocations}
              personGroupContext={effectivePersonGroupContext}
              periods={periods}
              peopleById={peopleById}
              projectsById={projectsById}
              skillsById={skillsById}
              visualFocusMode={visualFocusMode}
              onOpenAllocation={onOpenAllocation}
              onTileDragStart={onTileDragStart}
            />
            {missingRequirementPlaceholders.length ? (
              <div className="traffic-missing-person-slots" aria-label={`Missing requirements without allocations: ${project.client}`}>
                {missingRequirementPlaceholders.map((placeholder) => (
                  <section
                    className="traffic-person-tile-group is-missing is-unassigned"
                    key={placeholder.id}
                    style={{ '--traffic-person-color': 'var(--traffic-blue)' } as CSSProperties}
                  >
                    <div className="traffic-person-tile-handle is-placeholder" aria-hidden="true">
                      <span>?</span>
                    </div>
                    <div className="traffic-person-tile-group-body">
                      <div className="traffic-person-tile-group-meta">
                        <strong>Unassigned requirement</strong>
                        <span>missing {formatHours(placeholder.missingHours)}h</span>
                      </div>
                      <div className="traffic-person-tile-group-signals">
                        <span className="is-missing">{placeholder.skillLabel}</span>
                        <span className="is-missing">{placeholder.slotCount} empty tiles</span>
                      </div>
                      <div className="traffic-person-tile-group-tiles">
                        {Array.from({ length: placeholder.slotCount }, (_, index) => (
                          <div
                            className="traffic-person-missing-tile"
                            key={`${placeholder.id}-${index}`}
                            title={`No allocations: ${placeholder.skillLabel}`}
                          />
                        ))}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            ) : null}
            {overflow.length ? (
              <div className="traffic-overflow">
                <div className="traffic-overflow-title">
                  <span>Beyond frame</span>
                  <strong>+{formatRevenueK(overflowRevenueK)}</strong>
                </div>
                <ScaledTileGrid
                  allocations={overflow}
                  boardTileUnit={tileUnit}
                  className="traffic-overflow-grid"
                  displayTileUnit={displayTileUnit}
                  emptySlotKeyPrefix={`${project.id}-overflow`}
                  periodAllocations={effectivePeriodAllocations}
                  personGroupContext={effectivePersonGroupContext}
                  periods={periods}
                  peopleById={peopleById}
                  projectsById={projectsById}
                  skillsById={skillsById}
                  visualFocusMode={visualFocusMode}
                  onOpenAllocation={onOpenAllocation}
                  onTileDragStart={onTileDragStart}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="traffic-project-section-slot is-empty">
          <div className="traffic-project-empty-state">
            <strong>No allocated tiles</strong>
            <span>Drag a person's tiles here or use allocation suggestions.</span>
          </div>
        </div>
      )}

      {hasFrameDetails ? (
        <details className="traffic-project-details">
          <summary>
            <span>Project summary</span>
            {frameDetailsSummary ? <small>{frameDetailsSummary}</small> : null}
          </summary>
          {pressure ? (
            <div className="traffic-project-pressure">
              <span className={pressure.monthlyGapK > 0 ? 'is-warning' : 'is-ok'}>
                Month: {pressure.monthlyAllocatedK}/{pressure.monthlyPlannedK}k
                {pressure.monthlyGapK > 0 ? ` · shortfall ${pressure.monthlyGapK}k` : ''}
              </span>
              <span className={pressure.totalGapK > 0 ? 'is-warning' : 'is-ok'}>
                Total: {pressure.totalAllocatedK}/{pressure.totalPlannedK}k
                {pressure.totalGapK > 0 ? ` · shortfall ${pressure.totalGapK}k` : ''}
              </span>
            </div>
          ) : null}
          {project.requirements.length ? (
            <details className="traffic-project-detail-panel">
              <summary>
                <span>Requirements</span>
                <strong>{project.requirements.length}</strong>
              </summary>
              <div className="traffic-project-mini-title">
                <span>Required hours coverage</span>
                <HelpButton
                  label={`Explain project requirements: ${project.client}`}
                  topicId="project-requirements"
                  onOpenHelp={onOpenHelp}
                />
              </div>
              <div className="traffic-project-requirement-section">
              <div className="traffic-requirements">
                {project.requirements.map((requirement) => {
                  const skill = skillsById.get(requirement.skillId);
                  const coveredHours = allocatedHoursBySkill[requirement.skillId] || 0;
                  const isCovered = coveredHours >= requirement.estimatedHours;
                  return (
                    <span
                      className={`traffic-requirement ${isCovered ? 'is-covered' : 'is-invalid'}`}
                      key={requirement.id}
                      title={`${coveredHours}/${requirement.estimatedHours}h planned`}
                    >
                      {skill?.label || requirement.skillId}
                      {requirement.seniority ? ` ${requirement.seniority}` : ''}: {coveredHours}/
                      {requirement.estimatedHours}h
                    </span>
                  );
                })}
              </div>
              </div>
            </details>
          ) : null}
          {validationItems.length ? (
            <details className="traffic-project-detail-panel">
              <summary>
                <span>Allocation signals</span>
                <strong>{validationItems.length}</strong>
              </summary>
              <div className="traffic-project-risk-list" aria-label={`Project signals: ${project.client}`}>
                {visibleValidationItems.map((item) => (
                  <div className={`traffic-project-risk-item is-${item.severity}`} key={item.id}>
                    <strong>
                      {item.personName}
                      {item.count > 1 ? (
                        <em>
                          {item.details.length > 1
                            ? `${item.details.length} types · ${item.count} occurrences`
                            : `${item.severity === 'info' ? 'This signal' : 'This risk'} occurs ${item.count} times`}
                        </em>
                      ) : null}
                    </strong>
                    <div className="traffic-project-risk-details">
                      {item.details.map((detail) => (
                        <span key={detail.key}>
                          <b>{detail.requirementLabel}</b>
                          {detail.count > 1 ? ` (${detail.count}x)` : ''}: {detail.message}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {validationItems.length > 3 ? (
                  <button
                    aria-expanded={areRisksExpanded}
                    className="traffic-project-risk-more"
                    type="button"
                    onClick={() => setAreRisksExpanded((current) => !current)}
                  >
                    {areRisksExpanded ? 'Show fewer signals' : `Show all signals (${validationItems.length})`}
                  </button>
                ) : null}
              </div>
            </details>
          ) : null}
          {project.notes ? (
            <details className="traffic-project-detail-panel">
              <summary>
                <span>Note</span>
                <strong>1</strong>
              </summary>
              <div className="traffic-project-note">{project.notes}</div>
            </details>
          ) : null}
        </details>
      ) : null}
    </DropZone>
  );
}

export const ProjectCard = memo(ProjectCardComponent);
