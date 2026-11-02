import { PeriodRevenueComparison } from '../utils/periodRevenueComparison';
import './PeriodControls.css';

interface PeriodComparisonStripProps {
  activePeriodId: string;
  comparisons: PeriodRevenueComparison[];
  onSelectPeriod: (periodId: string) => void;
}

function formatComparisonValue(value: number) {
  return `${value}k`;
}

export function PeriodComparisonStrip({
  activePeriodId,
  comparisons,
  onSelectPeriod,
}: PeriodComparisonStripProps) {
  return (
    <section className="traffic-period-comparison" aria-label="Porównanie podpisanych, prognozy i celu">
      <div className="traffic-section-title">
        <span>Podpisane / prognoza / cel</span>
        <span>{comparisons.length} mies.</span>
      </div>
      <div className="traffic-period-comparison-grid">
        {comparisons.map((comparison) => {
          const expectedCoverage = comparison.targetRevenueK
            ? Math.min(100, Math.round((comparison.expectedRevenueK / comparison.targetRevenueK) * 100))
            : 0;
          const committedCoverage = comparison.targetRevenueK
            ? Math.min(100, Math.round((comparison.committedRevenueK / comparison.targetRevenueK) * 100))
            : 0;

          return (
            <button
              className={`traffic-period-comparison-item ${comparison.periodId === activePeriodId ? 'is-active' : ''}`}
              key={comparison.periodId}
              type="button"
              onClick={() => onSelectPeriod(comparison.periodId)}
            >
              <strong>{comparison.label}</strong>
              <span>
                Podpisane {formatComparisonValue(comparison.committedRevenueK)} / prognoza {formatComparisonValue(comparison.expectedRevenueK)} / cel{' '}
                {formatComparisonValue(comparison.targetRevenueK)}
              </span>
              <div className="traffic-period-comparison-meter" aria-label={`${expectedCoverage}% pokrycia celu prognozą`}>
                <i style={{ width: `${expectedCoverage}%` }} />
                <em style={{ width: `${committedCoverage}%` }} />
              </div>
              <small>
                Brakuje: podpisane {formatComparisonValue(comparison.committedGapK)} · prognoza {formatComparisonValue(comparison.expectedGapK)}
              </small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
