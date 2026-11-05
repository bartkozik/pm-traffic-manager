import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { HelpTopicId } from '../help/helpContent';
import { useAccessibleDialogKeyboard } from '../hooks/useAccessibleDialogKeyboard';
import { useOnClickOutside } from '../hooks/useOnClickOutside';
import {
  AllocationTarget,
  AllocationWeeklyOverride,
  AllocationMeetingState,
  Period,
  Person,
  PersonTileAllocation,
  ProjectFrame,
  Skill,
  SkillId,
  getEffectiveAllocationSkillId,
} from '../models/traffic.model';
import {
  getAllocationWeekHours,
  getWeeksForMonth,
} from '../utils/weeklyDrilldown';
import {
  calculateHoursToInternalCostK,
  calculateAllocationInternalMarginGapK,
  calculateAllocationTargetGapK,
  calculateHoursToRequiredRevenueK,
  calculateRevenueToHours,
  getRequiredRevenueRate,
  getRevenueToHoursRate,
} from '../utils/allocationCalculations';
import { validateAllocation } from '../utils/allocationValidation';
import { HelpButton } from './HelpButton';
import { HelpSectionHeader } from './HelpSectionHeader';
import { PersonVisualBadge } from './PersonVisualBadge';
import './TrafficEditors.css';

interface AllocationEditorProps {
  allocation: PersonTileAllocation;
  allocations: PersonTileAllocation[];
  peopleById: Map<string, Person>;
  projects: ProjectFrame[];
  periods: Period[];
  skills: Skill[];
  onClose: () => void;
  onOpenHelp: (topicId: HelpTopicId) => void;
  onSave: (
    allocation: PersonTileAllocation,
    groupAllocationIds: string[],
    meetingState: AllocationMeetingState | undefined
  ) => void;
}

export function AllocationEditor({
  allocation,
  allocations,
  peopleById,
  projects,
  periods,
  skills,
  onClose,
  onOpenHelp,
  onSave,
}: AllocationEditorProps) {
  const editorRef = useRef<HTMLFormElement | null>(null);
  const [draft, setDraft] = useState<PersonTileAllocation>(() => structuredClone(allocation));
  const [groupMeetingStateDraft, setGroupMeetingStateDraft] = useState<AllocationMeetingState | undefined>(() => undefined);
  const [groupPreviousTargetDraft, setGroupPreviousTargetDraft] = useState<AllocationTarget | undefined>(() => undefined);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  useOnClickOutside(editorRef, onClose, { ignoreSelectors: ['.traffic-help-overlay'] });
  useAccessibleDialogKeyboard(editorRef, onClose, {
    ignoreSelectors: ['.traffic-help-overlay'],
    initialFocusSelector: 'select, input',
  });

  useEffect(() => {
    setDraft(structuredClone(allocation));
  }, [allocation]);

  const person = peopleById.get(draft.personId);
  const project = projects.find((item) => item.id === draft.target);
  const skillsById = useMemo(() => new Map(skills.map((skill) => [skill.id, skill])), [skills]);
  const availableRequirements = project?.requirements || [];
  const selectedRequirement = availableRequirements.find((requirement) => requirement.id === draft.requirementId);
  const monthPeriod = periods.find((period) => period.id === draft.periodId && period.granularity === 'month');
  const weeks = monthPeriod ? getWeeksForMonth(periods, monthPeriod) : [];
  const monthDays = monthPeriod ? getInclusiveDays(monthPeriod.startsOn, monthPeriod.endsOn) : 0;
  const projectAllocations = useMemo(() => {
    return allocations
      .filter((item) => item.periodId === draft.periodId && item.target === draft.target)
      .map((item) => (item.id === draft.id ? draft : item));
  }, [allocations, draft]);
  const persistedAssignmentGroupAllocations = useMemo(() => {
    return allocations
      .filter((item) => (
        item.periodId === allocation.periodId &&
        item.target === allocation.target &&
        item.personId === allocation.personId
      ));
  }, [allocation, allocations]);
  const assignmentGroupAllocations = useMemo(() => {
    return persistedAssignmentGroupAllocations.map((item) => (item.id === draft.id ? draft : item));
  }, [draft, persistedAssignmentGroupAllocations]);
  const validation = validateAllocation(draft, person, project, projectAllocations, peopleById);
  const effectiveSkillId = getEffectiveAllocationSkillId(draft, project, person);
  const revenueToHoursRate = getRevenueToHoursRate(project, effectiveSkillId, allocation.periodId);
  const requiredRevenueRate = getRequiredRevenueRate(project, effectiveSkillId);
  const internalCostK = calculateHoursToInternalCostK(person, draft.periodId, draft.hours);
  const requiredRevenueK = calculateHoursToRequiredRevenueK(draft.hours, requiredRevenueRate);
  const internalMarginGapK = calculateAllocationInternalMarginGapK(draft, person);
  const targetGapK = calculateAllocationTargetGapK(draft, project, person);
  const targetLabel = project ? `${project.client} / ${project.name}` : 'Bench / unassigned target';
  const tileNumber = draft.tileIndex + 1;
  const weeklyProjectedTotal = monthDays > 0
    ? roundHours(weeks.reduce((sum, week) => (
      sum + getAllocationWeekHours(draft, week, weeks, monthDays)
    ), 0))
    : draft.hours;
  const explicitWeeklyHours = (draft.weeklyOverrides || []).reduce((sum, override) => (
    sum + (typeof override.hours === 'number' ? override.hours : 0)
  ), 0);
  const weeklyMismatch = Math.abs(weeklyProjectedTotal - draft.hours) > 0.1;
  const quickStatus = getQuickAllocationStatus(validation, targetGapK, internalMarginGapK);
  const previousTargetOptions = useMemo(() => {
    const options = [
      { id: 'bench' as AllocationTarget, label: 'Bench / no project' },
      ...projects.map((item) => ({
        id: item.id as AllocationTarget,
        label: `${item.client} / ${item.name}`,
      })),
    ].filter((item) => item.id !== draft.target);

    if (groupPreviousTargetDraft && !options.some((item) => item.id === groupPreviousTargetDraft)) {
      options.push({
        id: groupPreviousTargetDraft,
        label: getAllocationTargetLabel(groupPreviousTargetDraft, projects),
      });
    }

    return options;
  }, [draft.target, groupPreviousTargetDraft, projects]);

  useEffect(() => {
    setGroupMeetingStateDraft(getGroupMeetingState(persistedAssignmentGroupAllocations));
    setGroupPreviousTargetDraft(getGroupPreviousTarget(persistedAssignmentGroupAllocations, allocation.target));
  }, [allocation.target, persistedAssignmentGroupAllocations]);

  const skillOptions = useMemo(() => {
    const personSkillIds = new Set(person?.skillIds || []);
    return skills.map((skill) => ({
      ...skill,
      isPersonSkill: personSkillIds.has(skill.id),
    }));
  }, [person, skills]);

  const patchAllocationInputs = (patch: Partial<PersonTileAllocation>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      const nextProject = projects.find((item) => item.id === next.target);
      const nextSkillId = getEffectiveAllocationSkillId(next, nextProject, person);

      if (next.mode === 'revenue_first' && !next.hoursOverridden) {
        const nextHours = calculateRevenueToHours(next.revenueK, getRevenueToHoursRate(nextProject, nextSkillId, next.periodId));
        if (typeof nextHours === 'number') return { ...next, hours: nextHours };
      }

      if (next.mode === 'hours_first' && !next.revenueOverridden) {
        const nextRevenueK = calculateHoursToRequiredRevenueK(next.hours, getRequiredRevenueRate(nextProject, nextSkillId));
        if (typeof nextRevenueK === 'number') return { ...next, revenueK: nextRevenueK };
      }

      return next;
    });
  };

  const handleRequirementChange = (requirementId: string) => {
    const requirement = availableRequirements.find((item) => item.id === requirementId);
    patchAllocationInputs({
      requirementId: requirement?.id,
      skillId: requirement?.skillId || draft.skillId,
    });
  };

  const patchMeetingState = (key: keyof AllocationMeetingState, value: boolean) => {
    setGroupMeetingStateDraft((current) => {
      const nextMeetingState = {
        ...(current || {}),
        [key]: value || undefined,
      };
      if (key === 'unchanged' && value) {
        nextMeetingState.changedThisWeek = undefined;
        nextMeetingState.handoffRequired = undefined;
      }
      if ((key === 'changedThisWeek' || key === 'handoffRequired') && value) {
        nextMeetingState.unchanged = undefined;
      }
      const hasAnyMeetingState = Object.values(nextMeetingState).some(Boolean);
      return hasAnyMeetingState ? nextMeetingState : undefined;
    });
  };

  const updateWeeklyOverride = (periodId: string, value: string) => {
    const parsedHours = value === '' ? undefined : Number(value);
    setDraft((current) => {
      const nextOverrides = upsertWeeklyOverride(current.weeklyOverrides || [], {
        periodId,
        hours: Number.isFinite(parsedHours) ? parsedHours : undefined,
      });
      return {
        ...current,
        weeklyOverrides: nextOverrides.length ? nextOverrides : undefined,
      };
    });
  };
  const saveAllocation = () => {
    onSave(
      {
        ...draft,
        previousTarget: groupPreviousTargetDraft && groupPreviousTargetDraft !== draft.target
          ? groupPreviousTargetDraft
          : undefined,
        meetingState: groupMeetingStateDraft,
        validation,
      },
      assignmentGroupAllocations.map((item) => item.id),
      groupMeetingStateDraft
    );
    onClose();
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveAllocation();
  };

  return (
    <form
      aria-label="Allocation editor"
      aria-modal="true"
      className="traffic-editor"
      ref={editorRef}
      role="dialog"
      tabIndex={-1}
      onSubmit={handleSubmit}
    >
      <div className="traffic-editor-header">
        <div>
          <h2>Quick tile adjustment</h2>
          <p>
            {person?.name || draft.personId} · tile #{tileNumber}
          </p>
        </div>
        <div className="traffic-editor-header-actions">
          <HelpButton
            label="Explain how tiles map to requirements"
            topicId="allocation-mapping"
            onOpenHelp={onOpenHelp}
          />
          <button aria-label="Close allocation editor" className="traffic-icon-button" type="button" onClick={onClose}>
            x
          </button>
        </div>
      </div>

      <div className="traffic-allocation-context">
        <div>
          <span>Person</span>
          <strong>{person?.name || draft.personId}</strong>
          {person ? <PersonVisualBadge compact person={person} skillsById={skillsById} /> : null}
        </div>
        <div>
          <span>Destination</span>
          <strong>{targetLabel}</strong>
        </div>
        <div>
          <span>This tile</span>
          <strong>{draft.revenueK}k PLN · {formatHours(draft.hours)}h</strong>
        </div>
        <p>
          This panel adjusts the mapping of one tile. Meeting markers apply to all allocations for this person at this destination.
        </p>
      </div>

      <div className={`traffic-allocation-status is-${quickStatus.tone}`}>
        <strong>{quickStatus.label}</strong>
        <span>{quickStatus.detail}</span>
      </div>

      <section className="traffic-editor-section is-first">
        <HelpSectionHeader title="Mapping" topicId="allocation-mapping" onOpenHelp={onOpenHelp} />
        <div className="traffic-form-grid">
          <label>
            Skill
            <select
              value={draft.skillId || ''}
              onChange={(event) =>
                patchAllocationInputs({
                  skillId: event.target.value ? (event.target.value as SkillId) : undefined,
                  requirementId: undefined,
                })
              }
            >
              <option value="">no skill mapping</option>
              {skillOptions.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.label}{skill.isPersonSkill ? '' : ' (outside this person\'s profile)'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Project requirement
            <select
              disabled={!project}
              value={draft.requirementId || ''}
              onChange={(event) => handleRequirementChange(event.target.value)}
            >
              <option value="">no specific requirement</option>
              {availableRequirements.map((requirement) => (
                <option key={requirement.id} value={requirement.id}>
                  {requirement.skillId}
                  {requirement.seniority ? ` ${requirement.seniority}` : ''} · {requirement.estimatedHours}h
                  {requirement.phaseLabel ? ` · ${requirement.phaseLabel}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selectedRequirement ? (
          <p className="traffic-editor-section-note">
            The selected requirement sets the allocation skill to {selectedRequirement.skillId}.
          </p>
        ) : null}
      </section>

      <section className="traffic-editor-section">
        <HelpSectionHeader title="Meeting markers" topicId="allocation-validation" onOpenHelp={onOpenHelp} />
        <p className="traffic-editor-section-note">
          Applies to the allocation of {person?.name || draft.personId} to {targetLabel}: {assignmentGroupAllocations.length} tiles.
        </p>
        <div className="traffic-meeting-marker-grid">
          <label className="traffic-meeting-marker-field">
            <span>
              <strong>Moved from</strong>
              <small>Manual marker linking the previous destination to the current frame.</small>
            </span>
            <select
              value={groupPreviousTargetDraft || ''}
              onChange={(event) => {
                setGroupPreviousTargetDraft(event.target.value ? event.target.value as AllocationTarget : undefined);
              }}
            >
              <option value="">no move / no marker</option>
              {previousTargetOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              checked={Boolean(groupMeetingStateDraft?.unchanged)}
              type="checkbox"
              onChange={(event) => patchMeetingState('unchanged', event.target.checked)}
            />
            <span>
              <strong>Unchanged / staying</strong>
              <small>Confirmed allocation from the previous agreement.</small>
            </span>
          </label>
          <label>
            <input
              checked={Boolean(groupMeetingStateDraft?.changedThisWeek)}
              type="checkbox"
              onChange={(event) => patchMeetingState('changedThisWeek', event.target.checked)}
            />
            <span>
              <strong>Changed this week</strong>
              <small>Agreed during the current traffic review.</small>
            </span>
          </label>
          <label>
            <input
              checked={Boolean(groupMeetingStateDraft?.handoffRequired)}
              type="checkbox"
              onChange={(event) => patchMeetingState('handoffRequired', event.target.checked)}
            />
            <span>
              <strong>Handoff needed</strong>
              <small>Someone needs context after the change.</small>
            </span>
          </label>
          <label>
            <input
              checked={Boolean(groupMeetingStateDraft?.planB)}
              type="checkbox"
              onChange={(event) => patchMeetingState('planB', event.target.checked)}
            />
            <span>
              <strong>Plan B</strong>
              <small>Fallback plan for absence or risk.</small>
            </span>
          </label>
          <label>
            <input
              checked={Boolean(groupMeetingStateDraft?.mentoring)}
              type="checkbox"
              onChange={(event) => patchMeetingState('mentoring', event.target.checked)}
            />
            <span>
              <strong>Mentoring</strong>
              <small>This person leads or supports someone on the project.</small>
            </span>
          </label>
          <label>
            <input
              checked={Boolean(groupMeetingStateDraft?.backup)}
              type="checkbox"
              onChange={(event) => patchMeetingState('backup', event.target.checked)}
            />
            <span>
              <strong>Backup</strong>
              <small>Another person knows the context or code.</small>
            </span>
          </label>
        </div>
      </section>

      {isDetailsOpen ? (
        <div className="traffic-allocation-advanced">
          <section className="traffic-editor-section">
            <HelpSectionHeader title="Calculation" topicId="allocation-calculation" onOpenHelp={onOpenHelp} />
            <div className="traffic-allocation-summary">
              <span>Allocation rate: {revenueToHoursRate ? `${revenueToHoursRate} PLN/h` : 'none'}</span>
              <span>Required rate: {requiredRevenueRate ? `${requiredRevenueRate} PLN/h` : 'none'}</span>
              <span>Internal cost: {typeof internalCostK === 'number' ? `${internalCostK}k PLN` : 'no data'}</span>
              <span>Required revenue: {typeof requiredRevenueK === 'number' ? `${requiredRevenueK}k PLN` : 'no data'}</span>
              <span>Margin shortfall: {internalMarginGapK > 0 ? `${internalMarginGapK}k PLN` : 'none'}</span>
              <span>Target shortfall: {targetGapK > 0 ? `${targetGapK}k PLN` : 'none'}</span>
            </div>
          </section>

          <section className="traffic-editor-section">
            <HelpSectionHeader title="Why this status" topicId="allocation-validation" onOpenHelp={onOpenHelp} />
            {validation.length ? (
              <div className="traffic-validation-list">
                {validation.map((item) => (
                  <div className={`traffic-validation-item is-${item.severity}`} key={`${item.code}-${item.message}`}>
                    {item.message}
                  </div>
                ))}
              </div>
            ) : (
              <p className="traffic-editor-section-note">No warnings for this allocation.</p>
            )}
          </section>

          {project && weeks.length ? (
            <section className="traffic-editor-section">
              <HelpSectionHeader title="Weekly breakdown" topicId="allocation-weekly-hours" onOpenHelp={onOpenHelp}>
                <p className="traffic-editor-section-note">
                  This is a detailed weekly view. The month remains the financial source of truth.
                </p>
              </HelpSectionHeader>
              <div className="traffic-weekly-editor">
                {weeks.map((week) => {
                  const override = draft.weeklyOverrides?.find((item) => item.periodId === week.id);
                  const projectedHours = monthDays > 0 ? getAllocationWeekHours(draft, week, weeks, monthDays) : 0;

                  return (
                    <label className="traffic-weekly-editor-row" key={week.id}>
                      <span>
                        <strong>{week.label.replace(`${monthPeriod?.label || ''} `, '')}</strong>
                        <small>{week.startsOn} - {week.endsOn}</small>
                      </span>
                      <input
                        min={0}
                        placeholder={`${formatHoursInput(projectedHours)}h auto`}
                        step={0.01}
                        type="number"
                        value={typeof override?.hours === 'number' ? formatHoursInput(override.hours) : ''}
                        onChange={(event) => updateWeeklyOverride(week.id, event.target.value)}
                      />
                      <em>{formatHours(projectedHours)}h</em>
                    </label>
                  );
                })}
              </div>
              <div className={`traffic-weekly-total ${weeklyMismatch ? 'is-warning' : ''}`}>
                <span>Manual: {formatHours(explicitWeeklyHours)}h</span>
                <span>Weekly total: {formatHours(weeklyProjectedTotal)}h</span>
                <span>Monthly allocation: {formatHours(draft.hours)}h</span>
              </div>
              {weeklyMismatch ? (
                <p className="traffic-editor-section-note">
                  The weekly total differs from the monthly allocation. Clear excess overrides or change the monthly hours.
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}

      <div className="traffic-editor-actions">
        <button
          aria-expanded={isDetailsOpen}
          className="traffic-button"
          type="button"
          onClick={() => setIsDetailsOpen((current) => !current)}
        >
          {isDetailsOpen ? 'Hide details' : 'Show details'}
        </button>
        <button className="traffic-button" type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="traffic-button is-primary"
          type="submit"
          onClick={(event) => {
            event.preventDefault();
            saveAllocation();
          }}
        >
          Save allocation
        </button>
      </div>
    </form>
  );
}

function upsertWeeklyOverride(
  overrides: AllocationWeeklyOverride[],
  patch: AllocationWeeklyOverride
) {
  return [
    ...overrides.filter((override) => override.periodId !== patch.periodId),
    patch,
  ].filter((override) => typeof override.hours === 'number');
}

function getGroupMeetingState(allocations: PersonTileAllocation[]): AllocationMeetingState | undefined {
  const state = allocations.reduce<AllocationMeetingState>((result, allocation) => ({
    unchanged: result.unchanged || allocation.meetingState?.unchanged || undefined,
    changedThisWeek: result.changedThisWeek || allocation.meetingState?.changedThisWeek || undefined,
    handoffRequired: result.handoffRequired || allocation.meetingState?.handoffRequired || undefined,
    planB: result.planB || allocation.meetingState?.planB || undefined,
    mentoring: result.mentoring || allocation.meetingState?.mentoring || undefined,
    backup: result.backup || allocation.meetingState?.backup || undefined,
  }), {});

  return Object.values(state).some(Boolean) ? state : undefined;
}

function getGroupPreviousTarget(
  allocations: PersonTileAllocation[],
  currentTarget: AllocationTarget
): AllocationTarget | undefined {
  return allocations.find((allocation) => (
    allocation.previousTarget && allocation.previousTarget !== currentTarget
  ))?.previousTarget;
}

function getAllocationTargetLabel(target: AllocationTarget, projects: ProjectFrame[]) {
  if (target === 'bench') return 'Bench / no project';
  const project = projects.find((item) => item.id === target);
  return project ? `${project.client} / ${project.name}` : target;
}

function getInclusiveDays(startsOn: string, endsOn: string) {
  const start = new Date(`${startsOn}T00:00:00.000Z`);
  const end = new Date(`${endsOn}T00:00:00.000Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function formatHours(value: number) {
  return roundHours(value).toLocaleString('en-GB', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function formatHoursInput(value: number) {
  return roundHours(value).toFixed(2).replace(/\.?0+$/, '');
}

function getQuickAllocationStatus(
  validation: ReturnType<typeof validateAllocation>,
  targetGapK: number,
  internalMarginGapK: number
) {
  const invalid = validation.find((item) => item.severity === 'invalid');
  if (invalid) {
    return {
      tone: 'invalid',
      label: 'Needs adjustment',
      detail: invalid.message,
    };
  }

  if (targetGapK > 0) {
    return {
      tone: 'warning',
      label: `Below target by ${targetGapK}k`,
      detail: 'This tile does not meet the target for its planned hours.',
    };
  }

  if (internalMarginGapK > 0) {
    return {
      tone: 'warning',
      label: `Below cost by ${internalMarginGapK}k`,
      detail: 'Revenue from this tile does not cover the internal labour cost.',
    };
  }

  const warning = validation.find((item) => item.severity === 'warning');
  if (warning) {
    return {
      tone: 'warning',
      label: 'Needs review',
      detail: warning.message,
    };
  }

  const info = validation.find((item) => item.severity === 'info');
  if (info) {
    return {
      tone: 'ok',
      label: 'Healthy signal',
      detail: info.message,
    };
  }

  return {
    tone: 'neutral',
    label: 'No warnings',
    detail: 'This tile\'s mapping currently generates no additional signal.',
  };
}
