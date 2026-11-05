import { FormEvent, useMemo, useRef, useState } from 'react';
import './PlanningRulesManager.css';
import './TrafficEditors.css';
import { useAccessibleDialogKeyboard } from '../hooks/useAccessibleDialogKeyboard';
import {
  createPersonPairPlanningRule,
  getPlanningRuleTimeScope,
  isPlanningRuleActiveInPeriod,
  normalizePersonPair,
  Period,
  Person,
  PlanningRule,
  ProjectFrame,
} from '../models/traffic.model';

interface PlanningRulesManagerProps {
  activePeriodId: string;
  people: Person[];
  periods: Period[];
  planningRules: PlanningRule[];
  projects: ProjectFrame[];
  initialProjectId?: string;
  onClose: () => void;
  onDelete: (planningRuleId: string) => void;
  onSave: (planningRules: PlanningRule[]) => void;
}

type RuleTimeScope = NonNullable<PlanningRule['timeScope']>;

export function PlanningRulesManager({
  activePeriodId,
  people,
  periods,
  planningRules,
  projects,
  initialProjectId,
  onClose,
  onDelete,
  onSave,
}: PlanningRulesManagerProps) {
  const modalRef = useRef<HTMLElement | null>(null);
  const monthPeriods = periods.filter((period) => period.granularity === 'month');
  const activePeople = people.filter((person) => !person.archivedAt);
  const activeProjects = projects.filter((project) => !project.archivedAt);
  const [activeRulesPeriodId, setActiveRulesPeriodId] = useState(activePeriodId);
  const [rulePeriodId, setRulePeriodId] = useState(activePeriodId);
  const [projectFilterId, setProjectFilterId] = useState(initialProjectId || 'all');
  const [personFilterId, setPersonFilterId] = useState('all');
  const [query, setQuery] = useState('');
  const [personAQuery, setPersonAQuery] = useState('');
  const [personBQuery, setPersonBQuery] = useState('');
  const [personAId, setPersonAId] = useState(activePeople[0]?.id || '');
  const [personBIds, setPersonBIds] = useState<string[]>([]);
  const [ruleTimeScope, setRuleTimeScope] = useState<RuleTimeScope>('permanent');
  const [ruleProjectId, setRuleProjectId] = useState(initialProjectId || '');
  const [reason, setReason] = useState('');
  const [severity, setSeverity] = useState<PlanningRule['severity']>('hard');

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedPersonAQuery = personAQuery.trim().toLowerCase();
  const normalizedPersonBQuery = personBQuery.trim().toLowerCase();
  const personPairRules = planningRules.filter((rule) => rule.type === 'person_pair_block');
  const hasAnyRules = personPairRules.length > 0;
  const activeRules = personPairRules.filter((rule) => isPlanningRuleActiveInPeriod(rule, activeRulesPeriodId));
  const hasActiveRules = activeRules.length > 0;
  const filteredRules = activeRules
    .filter((rule) => projectFilterId === 'all' || (projectFilterId === 'global' ? !rule.projectId : !rule.projectId || rule.projectId === projectFilterId))
    .filter((rule) => personFilterId === 'all' || rule.personAId === personFilterId || rule.personBId === personFilterId)
    .filter((rule) => {
      if (!normalizedQuery) return true;
      const personA = peopleById.get(rule.personAId);
      const personB = peopleById.get(rule.personBId);
      const project = rule.projectId ? projectsById.get(rule.projectId) : undefined;
      return [
        personA?.name,
        personA?.role,
        personB?.name,
        personB?.role,
        project?.client,
        project?.name,
        rule.reason,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    });

  const selectedPersonA = peopleById.get(personAId);
  const personAOptions = activePeople.filter((person) => matchesPersonQuery(person, normalizedPersonAQuery));
  const visiblePersonAOptions = selectedPersonA && !personAOptions.some((person) => person.id === selectedPersonA.id)
    ? [selectedPersonA, ...personAOptions]
    : personAOptions;
  const personBOptions = activePeople
    .filter((person) => person.id !== personAId)
    .filter((person) => matchesPersonQuery(person, normalizedPersonBQuery));
  const selectedPersonBNames = personBIds
    .map((personId) => peopleById.get(personId)?.name)
    .filter(Boolean);
  const canCreate = Boolean(personAId && personBIds.length && (ruleTimeScope === 'permanent' || rulePeriodId));

  useAccessibleDialogKeyboard(modalRef, onClose, {
    initialFocusSelector: 'input, select',
  });

  const saveRules = () => {
    if (!canCreate) return;
    const now = new Date().toISOString();
    const nextRules = personBIds
      .filter((personBId) => personBId !== personAId)
      .map((personBId) => createPersonPairPlanningRule({
        timeScope: ruleTimeScope,
        periodId: ruleTimeScope === 'period' ? rulePeriodId : undefined,
        personAId,
        personBId,
        projectId: ruleProjectId || undefined,
        reason,
        severity,
        now,
      }));

    if (!nextRules.length) return;
    onSave(nextRules);
    if (ruleTimeScope === 'period') setActiveRulesPeriodId(rulePeriodId);
    if (ruleProjectId) setProjectFilterId(ruleProjectId);
    setPersonFilterId('all');
    setQuery('');
    setPersonBIds([]);
    setReason('');
  };
  const handleCreateRuleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveRules();
  };

  return (
    <div className="traffic-rules-overlay" role="dialog" aria-modal="true" aria-label="Manage planning rules">
      <section className="traffic-rules-modal" ref={modalRef} tabIndex={-1}>
        <div className="traffic-editor-header">
          <div>
            <h2>Manage rules</h2>
            <p>Rules affect validation and the AI planning assistant. Manual moves remain possible but will receive a warning.</p>
          </div>
          <button aria-label="Close planning rules" className="traffic-icon-button" type="button" onClick={onClose}>
            x
          </button>
        </div>

        <section className="traffic-rules-create" aria-label="Add rule">
          <div className="traffic-rules-section-heading">
            <h3>Keep people apart</h3>
            <p>A permanent rule has no end date. A temporary rule applies only to the selected month. The project is optional.</p>
          </div>
          <form
            aria-label="Add rule form"
            className="traffic-rules-form"
            onSubmit={handleCreateRuleSubmit}
          >
            <div className="traffic-rules-person-panel">
              <div className="traffic-rules-people-picker">
                <span>Person A</span>
                <input
                  aria-label="Filter person A"
                  value={personAQuery}
                  onChange={(event) => setPersonAQuery(event.target.value)}
                  placeholder="filter by name, role or skill"
                />
                <div className="traffic-rules-person-options is-single" role="radiogroup" aria-label="Person A">
                  {visiblePersonAOptions.length ? visiblePersonAOptions.map((person) => {
                    const isSelected = personAId === person.id;
                    return (
                      <label className={`traffic-rules-person-option ${isSelected ? 'is-selected' : ''}`} key={person.id}>
                        <input
                          checked={isSelected}
                          className="traffic-rules-choice-input"
                          name="planning-rule-person-a"
                          type="radio"
                          onChange={() => {
                            setPersonAId(person.id);
                            setPersonBIds((current) => current.filter((id) => id !== person.id));
                            setPersonBQuery('');
                          }}
                        />
                        <span className="traffic-rules-choice-control" aria-hidden="true" />
                        <span className="traffic-rules-choice-copy">
                          <strong>{person.name}</strong>
                          <small>{person.role}</small>
                        </span>
                      </label>
                    );
                  }) : (
                    <p className="traffic-rules-empty-option">No people match this filter.</p>
                  )}
                </div>
              </div>
              <div className="traffic-rules-people-picker">
                <span className="traffic-rules-field-label">People B</span>
                <input
                  aria-label="Filter people B"
                  value={personBQuery}
                  onChange={(event) => setPersonBQuery(event.target.value)}
                  placeholder="filter by name, role or skill"
                />
                <div className="traffic-rules-person-options" role="group" aria-label="People B">
                  {personBOptions.length ? personBOptions.map((person) => {
                    const isSelected = personBIds.includes(person.id);
                    return (
                      <label className={`traffic-rules-person-option ${isSelected ? 'is-selected' : ''}`} key={person.id}>
                        <input
                          checked={isSelected}
                          className="traffic-rules-choice-input"
                          type="checkbox"
                          onChange={(event) => {
                            setPersonBIds((current) => (
                              event.target.checked
                                ? Array.from(new Set([...current, person.id]))
                                : current.filter((personId) => personId !== person.id)
                            ));
                          }}
                        />
                        <span className="traffic-rules-choice-control" aria-hidden="true" />
                        <span className="traffic-rules-choice-copy">
                          <strong>{person.name}</strong>
                          <small>{person.role}</small>
                        </span>
                      </label>
                    );
                  }) : (
                    <p className="traffic-rules-empty-option">No people match this filter.</p>
                  )}
                </div>
                <div className="traffic-rules-selected-summary">
                  <span>{selectedPersonBNames.length ? `Selected: ${selectedPersonBNames.join(', ')}` : 'No people selected.'}</span>
                  {personBIds.length ? (
                    <button className="traffic-inline-link" type="button" onClick={() => setPersonBIds([])}>
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="traffic-rules-scope-panel">
              <div className="traffic-rules-scope-grid">
                <label className="traffic-rules-field">
                  <span>Rule scope</span>
                  <select value={ruleTimeScope} onChange={(event) => setRuleTimeScope(event.target.value as RuleTimeScope)}>
                    <option value="permanent">Permanent - no end date</option>
                    <option value="period">Temporary - selected month</option>
                  </select>
                </label>
                {ruleTimeScope === 'period' ? (
                  <label className="traffic-rules-field">
                    <span>Rule month</span>
                    <select value={rulePeriodId} onChange={(event) => setRulePeriodId(event.target.value)}>
                      {monthPeriods.map((period) => (
                        <option key={period.id} value={period.id}>{period.label}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="traffic-rules-field">
                  <span>Project</span>
                  <select value={ruleProjectId} onChange={(event) => setRuleProjectId(event.target.value)}>
                    <option value="">{ruleTimeScope === 'period' ? 'Entire month' : 'All projects'}</option>
                    {activeProjects.map((project) => (
                      <option key={project.id} value={project.id}>{project.client}: {project.name}</option>
                    ))}
                  </select>
                </label>
                <label className="traffic-rules-field">
                  <span>Rule strength</span>
                  <select value={severity} onChange={(event) => setSeverity(event.target.value as PlanningRule['severity'])}>
                    <option value="hard">Strict for AI</option>
                    <option value="warning">Warning for manual moves</option>
                  </select>
                </label>
              </div>
              <label className="traffic-rules-field traffic-rules-reason">
                <span>Reason / note</span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Short reason visible to PM/HR" />
              </label>
              <div className="traffic-rules-actions">
                <button className="traffic-button is-primary" type="submit" disabled={!canCreate}>
                  Add rule
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="traffic-rules-list" aria-label="Active rules">
          <div className="traffic-rules-list-header">
            <strong>Active rules</strong>
            <span>{filteredRules.length} / {activeRules.length}</span>
          </div>
          <section className="traffic-rules-toolbar" aria-label="Active rule filters">
            <label>
              Active rules month
              <select
                disabled={!hasAnyRules}
                value={activeRulesPeriodId}
                onChange={(event) => setActiveRulesPeriodId(event.target.value)}
              >
                {monthPeriods.map((period) => (
                  <option key={period.id} value={period.id}>{period.label}</option>
                ))}
              </select>
            </label>
            <label>
              Person in rule
              <select
                disabled={!hasActiveRules}
                value={personFilterId}
                onChange={(event) => setPersonFilterId(event.target.value)}
              >
                <option value="all">All people</option>
                {activePeople.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
            </label>
            <label>
              Rule project
              <select
                disabled={!hasActiveRules}
                value={projectFilterId}
                onChange={(event) => setProjectFilterId(event.target.value)}
              >
                <option value="all">All scopes</option>
                <option value="global">No project</option>
                {activeProjects.map((project) => (
                  <option key={project.id} value={project.id}>{project.client}: {project.name}</option>
                ))}
              </select>
            </label>
            <label>
              Search rules
              <input
                disabled={!hasActiveRules}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="name, project, reason"
              />
            </label>
          </section>
          <div className="traffic-rules-result-list">
            {filteredRules.length ? (
              filteredRules.map((rule) => {
                const [personAIdNormalized, personBIdNormalized] = normalizePersonPair(rule.personAId, rule.personBId);
                const personA = peopleById.get(personAIdNormalized);
                const personB = peopleById.get(personBIdNormalized);
                const project = rule.projectId ? projectsById.get(rule.projectId) : undefined;
                const timeScope = getPlanningRuleTimeScope(rule);
                const rulePeriod = rule.periodId ? periods.find((period) => period.id === rule.periodId) : undefined;
                const scopeDetail = timeScope === 'permanent'
                  ? 'Always applies'
                  : rulePeriod?.label || rule.periodId || 'Selected month';
                const projectLabel = project
                  ? `${project.client}: ${project.name}`
                  : timeScope === 'period' ? 'entire month' : 'all projects';
                return (
                  <article className="traffic-rule-row" key={rule.id}>
                    <div>
                      <span className="traffic-rule-row-heading">
                        <strong>{personA?.name || rule.personAId} + {personB?.name || rule.personBId}</strong>
                        <span className={`traffic-rule-scope-badge is-${timeScope}`}>
                          {timeScope === 'permanent' ? 'Permanent' : 'Temporary'}
                        </span>
                      </span>
                      <span>{scopeDetail} · {projectLabel} · {rule.severity === 'hard' ? 'strict for AI' : 'warning'}</span>
                      {rule.reason ? <p>{rule.reason}</p> : null}
                    </div>
                    <button className="traffic-inline-link" type="button" onClick={() => onDelete(rule.id)}>
                      Delete
                    </button>
                  </article>
                );
              })
            ) : (
              <p className="traffic-editor-section-note">No rules match the selected filters.</p>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

function matchesPersonQuery(person: Person, normalizedQuery: string) {
  if (!normalizedQuery) return true;
  return [person.name, person.role, person.seniority, person.skillIds.join(' ')].some((value) => (
    value?.toLowerCase().includes(normalizedQuery)
  ));
}
