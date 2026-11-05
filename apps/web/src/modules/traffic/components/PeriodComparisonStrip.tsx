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
    <section className="traffic-period-comparison" aria-label="Committed, forecast and target comparison">
      <div className="traffic-section-title">
        <span>Committed / forecast / target</span>
        <span>{comparisons.length} months</span>
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
                Committed {formatComparisonValue(comparison.committedRevenueK)} / forecast {formatComparisonValue(comparison.expectedRevenueK)} / target{' '}
                {formatComparisonValue(comparison.targetRevenueK)}
              </span>
              <div className="traffic-period-comparison-meter" aria-label={`${expectedCoverage}% of target covered by forecast`}>
                <i style={{ width: `${expectedCoverage}%` }} />
                <em style={{ width: `${committedCoverage}%` }} />
              </div>
              <small>
                Shortfall: committed {formatComparisonValue(comparison.committedGapK)} · forecast {formatComparisonValue(comparison.expectedGapK)}
              </small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
