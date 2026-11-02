import { useEffect, useMemo, useState } from 'react';
import type { OpportunityCheckResponse } from '@ptm/contracts';
import type { MoveTrafficAllocation, Period, Person, PersonTileAllocation, PlanningRule, ProjectFrame } from '../models/traffic.model';
import { runOpportunityCheck } from '../services/trafficBoardApi';
import { formatOpportunityConfidence, formatOpportunitySource } from '../utils/opportunityCheckFormatting';
import {
  type AppliedSuggestionMove,
  buildSuggestedAllocationPlan,
  formatOpportunityAction,
  formatOpportunityVerdict,
  groupSuggestedAllocationMoves,
} from '../utils/opportunityAllocationPlan';
import { getStoredOpportunityChecks, setStoredOpportunityChecks } from '../utils/opportunityCheckStorage';

interface DiabloAiPlanningPanelProps {
  allocations: PersonTileAllocation[];
  people: Person[];
  period: Period;
  planningRules: PlanningRule[];
  projects: ProjectFrame[];
  roomName: string;
  defaultOpen?: boolean;
  onActiveCheckChange: (check: OpportunityCheckResponse | null) => void;
  onApplyAllocationMoves: (moves: MoveTrafficAllocation[], periodId: string) => Promise<void>;
}

type BenchSuggestion = OpportunityCheckResponse['analysis']['benchUtilizationSuggestions'][number];

export function DiabloAiPlanningPanel({
  allocations,
  people,
  period,
  planningRules,
  projects,
  roomName,
  defaultOpen = false,
  onActiveCheckChange,
  onApplyAllocationMoves,
}: DiabloAiPlanningPanelProps) {
  const [opportunityCheck, setOpportunityCheck] = useState<OpportunityCheckResponse | null>(null);
  const [opportunityCheckStatus, setOpportunityCheckStatus] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [opportunityCheckError, setOpportunityCheckError] = useState<string | null>(null);
  const [savedOpportunityChecks, setSavedOpportunityChecks] = useState<Record<string, OpportunityCheckResponse>>({});
  const [aiSaveStatus, setAiSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [pendingResetOpportunityCheck, setPendingResetOpportunityCheck] = useState(false);
  const [isSuggestionListExpanded, setIsSuggestionListExpanded] = useState(false);
  const [lastAppliedSuggestionMoves, setLastAppliedSuggestionMoves] = useState<AppliedSuggestionMove[]>([]);
  const [appliedSuggestionAt, setAppliedSuggestionAt] = useState<string | null>(null);

  const activeOpportunityCheck = opportunityCheck?.periodId === period.id
    ? opportunityCheck
    : savedOpportunityChecks[period.id] || null;

  useEffect(() => {
    setSavedOpportunityChecks(getStoredOpportunityChecks(roomName));
    setOpportunityCheck(null);
    setOpportunityCheckError(null);
    setOpportunityCheckStatus('idle');
    setAiSaveStatus('idle');
    setPendingResetOpportunityCheck(false);
    setIsSuggestionListExpanded(false);
    setLastAppliedSuggestionMoves([]);
    setAppliedSuggestionAt(null);
  }, [roomName]);

  useEffect(() => {
    setOpportunityCheckStatus('idle');
    setOpportunityCheckError(null);
    setAiSaveStatus('idle');
    setPendingResetOpportunityCheck(false);
    setIsSuggestionListExpanded(false);
    setLastAppliedSuggestionMoves([]);
    setAppliedSuggestionAt(null);
  }, [period.id]);

  useEffect(() => {
    onActiveCheckChange(activeOpportunityCheck);
  }, [activeOpportunityCheck, onActiveCheckChange]);

  useEffect(() => {
    if (!pendingResetOpportunityCheck) return undefined;
    const timeoutId = window.setTimeout(() => setPendingResetOpportunityCheck(false), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [pendingResetOpportunityCheck]);

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const getProjectLabel = (projectId: string) => {
    const project = projectById.get(projectId);
    return project ? `${project.client}: ${project.name}` : projectId;
  };

  const aiProjectActions = activeOpportunityCheck?.result.projectActions.filter((action) => action.action !== 'keep') || [];
  const primaryAiAction = aiProjectActions[0] || activeOpportunityCheck?.result.projectActions[0] || null;
  const suggestedAllocationPlan = useMemo(() => buildSuggestedAllocationPlan({
    allocations,
    opportunityCheck: activeOpportunityCheck,
    people,
    planningRules,
    periodId: period.id,
    projects,
  }), [activeOpportunityCheck, allocations, people, period.id, planningRules, projects]);
  const suggestedAllocationGroups = useMemo(
    () => groupSuggestedAllocationMoves(suggestedAllocationPlan),
    [suggestedAllocationPlan]
  );
  const visibleSuggestedAllocationGroups = isSuggestionListExpanded
    ? suggestedAllocationGroups
    : suggestedAllocationGroups.slice(0, 4);
  const hiddenSuggestedAllocationGroupsCount = Math.max(0, suggestedAllocationGroups.length - visibleSuggestedAllocationGroups.length);
  const benchSuggestions = activeOpportunityCheck?.analysis.benchUtilizationSuggestions || [];
  const inhouseBenchSuggestions = benchSuggestions
    .filter((suggestion) => suggestion.suggestion === 'create_inhouse_rd')
    .slice(0, 4);
  const criticalBenchCount = benchSuggestions.filter((suggestion) => (
    suggestion.alertLevel === 'critical' || suggestion.alertLevel === 'high'
  )).length;
  const topBenchAlert = benchSuggestions[0]?.alertLevel || 'low';
  const benchSignalLabel = activeOpportunityCheck ? String(benchSuggestions.length) : '-';

  const handleRunOpportunityCheck = async () => {
    setOpportunityCheckStatus('loading');
    setOpportunityCheckError(null);
    setAppliedSuggestionAt(null);
    setAiSaveStatus('idle');
    setPendingResetOpportunityCheck(false);
    setIsSuggestionListExpanded(false);
    setLastAppliedSuggestionMoves([]);

    try {
      const response = await runOpportunityCheck(roomName, period.id);
      setOpportunityCheck(response);
      setOpportunityCheckStatus('idle');
    } catch (error) {
      setOpportunityCheckError(error instanceof Error ? error.message : 'Nie udało się uruchomić AI Check.');
      setOpportunityCheckStatus('failed');
    }
  };

  const handleSaveOpportunityCheck = () => {
    if (!activeOpportunityCheck) return;

    const nextSavedChecks = {
      ...savedOpportunityChecks,
      [activeOpportunityCheck.periodId]: activeOpportunityCheck,
    };
    setSavedOpportunityChecks(nextSavedChecks);
    setStoredOpportunityChecks(roomName, nextSavedChecks);
    setAiSaveStatus('saved');
    setPendingResetOpportunityCheck(false);
  };

  const handleResetOpportunityCheck = () => {
    if (!activeOpportunityCheck) return;
    if (!pendingResetOpportunityCheck) {
      setPendingResetOpportunityCheck(true);
      return;
    }

    const nextSavedChecks = { ...savedOpportunityChecks };
    delete nextSavedChecks[period.id];
    setSavedOpportunityChecks(nextSavedChecks);
    setStoredOpportunityChecks(roomName, nextSavedChecks);
    if (opportunityCheck?.periodId === period.id) setOpportunityCheck(null);
    setOpportunityCheckStatus('idle');
    setOpportunityCheckError(null);
    setAiSaveStatus('idle');
    setPendingResetOpportunityCheck(false);
  };

  const handleApplySuggestedAllocation = async () => {
    const allocationsById = new Map(allocations.map((allocation) => [allocation.id, allocation]));
    const affectedAllocationIds = new Set(suggestedAllocationPlan.map((move) => move.allocationId));
    const restoreMoves = Array.from(affectedAllocationIds).flatMap((allocationId) => {
      const allocation = allocationsById.get(allocationId);
      return allocation ? [{ allocationId, previousTarget: allocation.target }] : [];
    });
    const targetMoves = [
      ...suggestedAllocationPlan.flatMap((move) => {
        const allocation = allocationsById.get(move.allocationId);
        return allocation?.target !== move.projectId
          ? [{ tileId: move.allocationId, target: move.projectId }]
          : [];
      }),
    ];

    try {
      await onApplyAllocationMoves(targetMoves, period.id);
    } catch (error) {
      setOpportunityCheckError(error instanceof Error ? error.message : 'Nie udało się zapisać zaaplikowanej alokacji.');
      return;
    }

    setLastAppliedSuggestionMoves(restoreMoves);
    setAppliedSuggestionAt(new Date().toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
    }));
  };

  const handleRestoreSuggestedAllocation = async () => {
    try {
      await onApplyAllocationMoves(lastAppliedSuggestionMoves.map((move) => ({
        tileId: move.allocationId,
        target: move.previousTarget,
      })), period.id);
    } catch (error) {
      setOpportunityCheckError(error instanceof Error ? error.message : 'Nie udało się zapisać cofnięcia alokacji.');
      return;
    }

    setLastAppliedSuggestionMoves([]);
    setAppliedSuggestionAt(null);
  };

  return (
    <details className="diablo-ai-panel" aria-label="AI Assisted Planning" open={defaultOpen}>
      <summary>
        <span className="diablo-ai-summary-title">
          <strong>AI Assisted Planning</strong>
          <small>
            {period.label} · {activeOpportunityCheck ? 'wynik gotowy' : opportunityCheckStatus === 'failed' ? 'błąd AI Check' : 'nieuruchomione'}
          </small>
        </span>
        <span className={`diablo-ai-bench-signal is-${topBenchAlert}`}>
          Sygnały: {benchSignalLabel}
          {criticalBenchCount ? ` · ${criticalBenchCount} pilne` : ''}
        </span>
      </summary>

      <div className="diablo-ai-body">
        {opportunityCheckStatus === 'failed' && !activeOpportunityCheck ? (
          <div className="diablo-ai-empty is-danger">
            Nie udało się uruchomić AI Check dla {period.label}. {opportunityCheckError || 'Sprawdź API albo spróbuj ponownie.'}
          </div>
        ) : activeOpportunityCheck ? (
          <div className="diablo-ai-grid">
            <section className={`diablo-ai-card diablo-ai-verdict is-${activeOpportunityCheck.result.verdict}`}>
              <span>Najważniejsza decyzja</span>
              <strong>
                {primaryAiAction
                  ? `${formatOpportunityAction(primaryAiAction.action)}: ${getProjectLabel(primaryAiAction.projectId)}`
                  : formatOpportunityVerdict(activeOpportunityCheck.result.verdict)}
              </strong>
              <small>
                {formatOpportunityVerdict(activeOpportunityCheck.result.verdict)} · Pewność: {formatOpportunityConfidence(activeOpportunityCheck.result.confidence)} · Źródło: {formatOpportunitySource(activeOpportunityCheck.mode)}
              </small>
              {primaryAiAction ? <p>{primaryAiAction.reason}</p> : null}
              {activeOpportunityCheck.result.topReasons.slice(0, 2).map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
            </section>

            <section className="diablo-ai-card is-action">
              <div className="diablo-ai-card-header">
                <strong>Sugerowana alokacja</strong>
                <button
                  className="traffic-button is-primary"
                  type="button"
                  disabled={!suggestedAllocationPlan.length || Boolean(appliedSuggestionAt)}
                  onClick={handleApplySuggestedAllocation}
                >
                  {appliedSuggestionAt ? 'Zaaplikowano' : 'Zaaplikuj'}
                </button>
              </div>

              {lastAppliedSuggestionMoves.length && appliedSuggestionAt ? (
                <div className="diablo-ai-applied">
                  <strong>Zaaplikowano {lastAppliedSuggestionMoves.length} kafelków o {appliedSuggestionAt}</strong>
                  <button className="traffic-inline-link" type="button" onClick={handleRestoreSuggestedAllocation}>
                    Cofnij aplikację
                  </button>
                </div>
              ) : suggestedAllocationPlan.length ? (
                <>
                  <ul>
                    {visibleSuggestedAllocationGroups.map((group) => (
                      <li key={group.key}>
                        <span>{group.label}</span>
                        {group.count > 1 ? ` · ${group.count}x` : ''}
                      </li>
                    ))}
                  </ul>
                  <p>{suggestedAllocationPlan.length} kafelków do przesunięcia w {period.label}.</p>
                  {hiddenSuggestedAllocationGroupsCount > 0 || isSuggestionListExpanded ? (
                    <button className="traffic-inline-link" type="button" onClick={() => setIsSuggestionListExpanded((current) => !current)}>
                      {isSuggestionListExpanded ? 'Pokaż mniej' : `Pokaż wszystkie (+${hiddenSuggestedAllocationGroupsCount})`}
                    </button>
                  ) : null}
                </>
              ) : (
                <p>Brak bezpiecznych automatycznych korekt z aktualnego układu. Sprawdź wymagania, seniority, zapisane warningi albo dostępność ludzi.</p>
              )}
            </section>

            <section className="diablo-ai-card is-bench">
              <div className="diablo-ai-card-header">
                <strong>Ławka i R&D</strong>
                <span>{benchSuggestions.length} sygnałów</span>
              </div>
              {inhouseBenchSuggestions.length ? (
                <ul>
                  {inhouseBenchSuggestions.map((suggestion) => (
                    <li className={`diablo-ai-bench-row is-${suggestion.alertLevel || 'medium'}`} key={suggestion.personId}>
                      <span>
                        {suggestion.name} · {formatBenchMeta(suggestion)}
                      </span>
                      <small>{formatBenchSkills(suggestion.skillIds)} · {suggestion.reason}</small>
                      <small>{formatPreferredProjects(suggestion, getProjectLabel)}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Brak osób, którym analiza sugeruje osobny cel R&D lub sales-support zamiast bezczynnej ławki.</p>
              )}
            </section>

            <section className="diablo-ai-card">
              <strong>Akcje projektowe</strong>
              <ul>
                {(aiProjectActions.length ? aiProjectActions : activeOpportunityCheck.result.projectActions).slice(0, 3).map((action) => (
                  <li key={`${action.projectId}:${action.action}`}>
                    <span>{formatOpportunityAction(action.action)}: {getProjectLabel(action.projectId)}</span>
                    <small>{action.reason}</small>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : (
          <div className="diablo-ai-empty">
            Uruchom AI Check dla {period.label}, żeby dostać werdykt, sugerowane ruchy kafelków oraz sygnały o kosztownej ławce i możliwym R&D.
          </div>
        )}

        <div className="diablo-ai-actions">
          <button
            className={`traffic-button ${activeOpportunityCheck ? 'is-success' : ''}`}
            type="button"
            disabled={opportunityCheckStatus === 'loading'}
            onClick={handleRunOpportunityCheck}
          >
            {opportunityCheckStatus === 'loading' ? 'Analizuję' : activeOpportunityCheck ? 'Odśwież AI Check' : 'AI Check'}
          </button>
          <button
            className={`traffic-button ${aiSaveStatus === 'saved' ? 'is-success' : ''}`}
            type="button"
            disabled={!activeOpportunityCheck}
            onClick={handleSaveOpportunityCheck}
          >
            {aiSaveStatus === 'saved' ? 'Zapisano' : 'Zapisz wynik'}
          </button>
          <button
            className={`traffic-button ${pendingResetOpportunityCheck ? 'is-danger' : ''}`}
            type="button"
            disabled={!activeOpportunityCheck}
            onClick={handleResetOpportunityCheck}
          >
            {pendingResetOpportunityCheck ? 'Potwierdź usunięcie' : 'Usuń wynik'}
          </button>
          {opportunityCheckError && activeOpportunityCheck ? <span className="diablo-ai-inline-error">{opportunityCheckError}</span> : null}
        </div>
      </div>
    </details>
  );
}

function formatBenchMeta(suggestion: BenchSuggestion) {
  const seniority = suggestion.seniority || 'n/a';
  const role = suggestion.role || 'rola?';
  const cost = typeof suggestion.benchInternalCostK === 'number' ? `${suggestion.benchInternalCostK}k kosztu` : 'koszt?';
  return `${role}, ${seniority}, ${suggestion.benchHours}h, ${cost}`;
}

function formatBenchSkills(skillIds?: readonly string[]) {
  if (!skillIds?.length) return 'skille: brak';
  const visibleSkills = skillIds.slice(0, 3).join(', ');
  return skillIds.length > 3 ? `skille: ${visibleSkills} +${skillIds.length - 3}` : `skille: ${visibleSkills}`;
}

function formatPreferredProjects(
  suggestion: BenchSuggestion,
  getProjectLabel: (projectId: string) => string
) {
  const projectIds = suggestion.preferredProjectIds || [];
  if (!projectIds.length) return 'Brak aktywnej ramki R&D: utwórz ją albo oznacz istniejący projekt jako R&D.';
  return `Proponowany cel: ${projectIds.slice(0, 2).map(getProjectLabel).join(', ')}`;
}
