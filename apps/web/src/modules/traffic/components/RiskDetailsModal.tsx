import { BoardRisk } from '../utils/boardRisks';
import './HelpModal.css';
import './TrafficSummaryPanels.css';

interface RiskDetailsModalProps {
  risk: BoardRisk;
  onClose: () => void;
}

export function RiskDetailsModal({ risk, onClose }: RiskDetailsModalProps) {
  const items = groupRiskItems(risk.items || []);

  return (
    <div className="traffic-help-overlay" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="traffic-risk-details-title"
        aria-modal="true"
        className="traffic-help-modal traffic-risk-details-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="traffic-help-header">
          <div>
            <span>Detale ryzyka</span>
            <h2 id="traffic-risk-details-title">{risk.title}</h2>
          </div>
          <button className="traffic-icon-button" type="button" onClick={onClose}>
            Zamknij
          </button>
        </header>

        <article className="traffic-risk-details-content">
          <p className={`traffic-risk-details-summary is-${risk.severity}`}>{risk.detail}</p>
          {items.length ? (
            <div className="traffic-risk-details-list">
              {items.map((item) => (
                <section className="traffic-risk-detail-row" key={item.key}>
                  <div>
                    <strong>{item.primary}</strong>
                    <span>
                      {item.count > 1 ? `${item.count}x` : null}
                      {item.count > 1 && item.secondary ? ' · ' : null}
                      {item.secondary}
                    </span>
                  </div>
                  <p>{item.detail}</p>
                </section>
              ))}
            </div>
          ) : (
            <p className="traffic-help-empty">Brak dodatkowych detali dla tego ryzyka.</p>
          )}
        </article>
      </section>
    </div>
  );
}

function groupRiskItems(items: NonNullable<BoardRisk['items']>) {
  return Array.from(items.reduce((result, item) => {
    const key = `${item.primary}::${item.secondary || ''}::${item.detail}`;
    const current = result.get(key);
    result.set(key, current ? { ...current, count: current.count + 1 } : { ...item, key, count: 1 });
    return result;
  }, new Map<string, NonNullable<BoardRisk['items']>[number] & { key: string; count: number }>()).values());
}
