import { HelpTopicId } from '../help/helpContent';
import type { CollaborationActionType, CollaborationTarget } from '../utils/collaborationPresence';
import type { generateBoardRisks } from '../utils/boardRisks';
import type { generateLensMetrics } from '../utils/lensMetrics';
import type { generateTrafficReview, TrafficReviewMode } from '../utils/trafficReview';
import { HelpButton } from './HelpButton';
import './TrafficSummaryPanels.css';

type LensMetricCard = ReturnType<typeof generateLensMetrics>[number];
type BoardRisk = ReturnType<typeof generateBoardRisks>[number];
type TrafficReview = ReturnType<typeof generateTrafficReview>;

const trafficReviewModeLabels: Record<TrafficReviewMode, string> = {
  short: 'Short term',
  long: 'Long term',
};

const trafficReviewOwnerLabels = {
  ALL: 'All',
  HR: 'HR',
  PM: 'PM',
  TECH: 'Tech',
  SALES: 'Sales',
  FINANCE: 'Finance',
} as const;

interface TrafficKpisProps {
  cards: LensMetricCard[];
}

export function TrafficKpis({ cards }: TrafficKpisProps) {
  return (
    <section
      className="traffic-kpis"
      data-collaboration-target-id="kpis"
      data-collaboration-target-label="KPI boardu"
      data-collaboration-target-type="section"
    >
      {cards.map((item) => (
        <div className={`traffic-kpi ${item.tone ? `is-${item.tone}` : ''}`} key={item.id}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </section>
  );
}

interface TrafficReviewPanelProps {
  mode: TrafficReviewMode;
  review: TrafficReview;
  onModeChange: (mode: TrafficReviewMode) => void;
  onOpenHelp: (topicId: HelpTopicId) => void;
  onPublishPresenceAction: (
    type: CollaborationActionType,
    label: string,
    target?: CollaborationTarget | null
  ) => void;
}

export function TrafficReviewPanel({
  mode,
  review,
  onModeChange,
  onOpenHelp,
  onPublishPresenceAction,
}: TrafficReviewPanelProps) {
  return (
    <details
      className="traffic-review-panel traffic-secondary-analysis"
      aria-label="Traffic meeting review"
      data-collaboration-target-id="traffic-review"
      data-collaboration-target-label="Traffic review"
      data-collaboration-target-type="section"
      onToggle={(event) => onPublishPresenceAction(
        event.currentTarget.open ? 'open' : 'close',
        `${event.currentTarget.open ? 'Rozwinął' : 'Zwinął'} Traffic review`,
        { type: 'section', id: 'traffic-review', label: 'Traffic review' }
      )}
    >
      <summary>
        <span className="traffic-secondary-summary-title">
          Traffic review
          <span className="traffic-review-mode-pill">{trafficReviewModeLabels[review.mode]}</span>
          <HelpButton
            label="Wyjasnij workflow Traffic Review"
            topicId="traffic-review"
            onOpenHelp={onOpenHelp}
          />
        </span>
        <span className="traffic-secondary-summary-meta">
          {review.horizonLabel} · {review.triggers.length} triggerów
        </span>
      </summary>
      <div className="traffic-secondary-body">
        <div className="traffic-review-toolbar" role="tablist" aria-label="Tryb spotkania traffic">
          {(['short', 'long'] satisfies TrafficReviewMode[]).map((item) => (
            <button
              aria-selected={mode === item}
              className={`traffic-review-mode-button ${mode === item ? 'is-active' : ''}`}
              key={item}
              role="tab"
              type="button"
              onClick={() => onModeChange(item)}
            >
              {trafficReviewModeLabels[item]}
            </button>
          ))}
        </div>
        <div className="traffic-review-grid">
          <div className="traffic-review-checklist" aria-label="Agenda i pytania pomocnicze">
            {review.checklist.map((item) => (
              <div className={`traffic-review-check-item is-${item.status}`} key={item.id} title={item.detail}>
                <span>{trafficReviewOwnerLabels[item.owner]}</span>
                <strong>{item.label}</strong>
              </div>
            ))}
          </div>
          <div className="traffic-review-trigger-list" aria-label="Triggery traffic review">
            {review.triggers.length ? review.triggers.map((trigger) => (
              <article className={`traffic-review-trigger is-${trigger.severity}`} key={trigger.id} title={trigger.action}>
                <div>
                  <span>{trafficReviewOwnerLabels[trigger.owner]}</span>
                  <strong>{trigger.title}</strong>
                </div>
                <p>{trigger.detail}</p>
                <small>{trigger.action}</small>
              </article>
            )) : (
              <div className="traffic-review-empty">
                Brak triggerów dla tego trybu. Board nie pokazuje teraz krytycznych patternów spotkania.
              </div>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}

interface GeneratedRisksPanelProps {
  risks: BoardRisk[];
  onOpenHelp: (topicId: HelpTopicId) => void;
  onOpenRiskDetails: (riskId: string) => void;
  onPublishPresenceAction: (
    type: CollaborationActionType,
    label: string,
    target?: CollaborationTarget | null
  ) => void;
}

export function GeneratedRisksPanel({
  risks,
  onOpenHelp,
  onOpenRiskDetails,
  onPublishPresenceAction,
}: GeneratedRisksPanelProps) {
  return (
    <details
      className="traffic-risk-panel traffic-secondary-analysis"
      aria-label="Ryzyka wygenerowane z boardu"
      data-collaboration-target-id="generated-risks"
      data-collaboration-target-label="Ryzyka wygenerowane"
      data-collaboration-target-type="section"
      onToggle={(event) => onPublishPresenceAction(
        event.currentTarget.open ? 'open' : 'close',
        `${event.currentTarget.open ? 'Rozwinął' : 'Zwinął'} Ryzyka wygenerowane`,
        { type: 'section', id: 'generated-risks', label: 'Ryzyka wygenerowane' }
      )}
    >
      <summary>
        <span className="traffic-secondary-summary-title">
          Ryzyka wygenerowane
          <HelpButton
            label="Wyjasnij ryzyka wygenerowane"
            topicId="generated-risks"
            onOpenHelp={onOpenHelp}
          />
        </span>
        <span className="traffic-secondary-summary-meta">{risks.length} sygnałów</span>
      </summary>
      <div className="traffic-secondary-body">
        <div className="traffic-risk-list">
          {risks.map((risk) => (
            <div className={`traffic-risk-item is-${risk.severity}`} key={risk.id} title={risk.detail}>
              <div className="traffic-risk-item-header">
                <strong>{risk.title}</strong>
                <button
                  aria-label={`Pokaż detale ryzyka: ${risk.title}`}
                  className="traffic-help-button"
                  type="button"
                  onClick={() => onOpenRiskDetails(risk.id)}
                >
                  i
                </button>
              </div>
              <span>{risk.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
