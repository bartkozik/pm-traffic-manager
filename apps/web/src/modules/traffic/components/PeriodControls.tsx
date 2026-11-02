import { useEffect, useMemo, useState } from 'react';
import './PeriodControls.css';
import { HelpTopicId } from '../help/helpContent';
import { Period } from '../models/traffic.model';
import { HelpButton } from './HelpButton';
import { getMonthPeriodIndex, getVisibleMonthPeriods, PeriodRangeMonths, shiftMonthRangeStartId } from './periodRange';

interface PeriodControlsProps {
  activePeriodId: string;
  monthPeriods: Period[];
  isCollapsed: boolean;
  rangeStartPeriodId: string;
  viewRangeMonths: PeriodRangeMonths;
  onAddMonth: (periodId: string) => void;
  onOpenHelp: (topicId: HelpTopicId) => void;
  onRangeStartChange: (periodId: string) => void;
  onSelectPeriod: (periodId: string) => void;
  onToggleCollapsed: () => void;
  onViewRangeChange: (range: PeriodRangeMonths) => void;
}

const rangeOptions: Array<{ label: string; value: PeriodRangeMonths }> = [
  { label: '1 mies.', value: 1 },
  { label: 'Kwartał', value: 3 },
  { label: '6 mies.', value: 6 },
  { label: 'Rok', value: 12 },
];

const monthFormatter = new Intl.DateTimeFormat('pl-PL', {
  month: 'long',
  year: 'numeric',
});

function addUtcMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function formatMonthLabelFromId(periodId: string) {
  const label = monthFormatter.format(new Date(`${periodId}-01T00:00:00.000Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getAddMonthOptions(monthPeriods: Period[]) {
  const existingIds = new Set(monthPeriods.map((period) => period.id));
  const latestMonth = monthPeriods
    .slice()
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .at(-1);
  const startDate = latestMonth
    ? new Date(`${latestMonth.startsOn}T00:00:00.000Z`)
    : new Date('2026-03-01T00:00:00.000Z');
  const options: Array<{ id: string; label: string }> = [];
  let offset = 1;

  while (options.length < 6 && offset <= 18) {
    const candidateDate = addUtcMonths(startDate, offset);
    const id = `${candidateDate.getUTCFullYear()}-${String(candidateDate.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!existingIds.has(id)) {
      options.push({ id, label: formatMonthLabelFromId(id) });
    }
    offset += 1;
  }

  return options;
}

function formatShortDate(value: string) {
  const [, month, day] = value.split('-');
  return `${day}.${month}`;
}

export function PeriodControls({
  activePeriodId,
  monthPeriods,
  isCollapsed,
  rangeStartPeriodId,
  viewRangeMonths,
  onAddMonth,
  onOpenHelp,
  onRangeStartChange,
  onSelectPeriod,
  onToggleCollapsed,
  onViewRangeChange,
}: PeriodControlsProps) {
  const activeIndex = Math.max(0, monthPeriods.findIndex((period) => period.id === activePeriodId));
  const activePeriod = monthPeriods[activeIndex];
  const visibleMonths = getVisibleMonthPeriods(monthPeriods, rangeStartPeriodId, viewRangeMonths);
  const addMonthOptions = useMemo(() => getAddMonthOptions(monthPeriods), [monthPeriods]);
  const [selectedNewMonthId, setSelectedNewMonthId] = useState(addMonthOptions[0]?.id || '');
  const rangeStartIndex = Math.max(0, getMonthPeriodIndex(monthPeriods, visibleMonths[0]?.id || rangeStartPeriodId));
  const hasPreviousRange = rangeStartIndex > 0;
  const hasNextRange = rangeStartIndex + visibleMonths.length < monthPeriods.length;

  useEffect(() => {
    if (addMonthOptions.some((option) => option.id === selectedNewMonthId)) return;
    setSelectedNewMonthId(addMonthOptions[0]?.id || '');
  }, [addMonthOptions, selectedNewMonthId]);

  const goToPreviousRange = () => {
    if (!hasPreviousRange) return;
    const targetId = shiftMonthRangeStartId(monthPeriods, rangeStartPeriodId, viewRangeMonths, -1);
    onRangeStartChange(targetId);
    if (!getVisibleMonthPeriods(monthPeriods, targetId, viewRangeMonths).some((period) => period.id === activePeriodId)) {
      onSelectPeriod(targetId);
    }
  };

  const goToNextRange = () => {
    if (!hasNextRange) return;
    const targetId = shiftMonthRangeStartId(monthPeriods, rangeStartPeriodId, viewRangeMonths, 1);
    onRangeStartChange(targetId);
    if (!getVisibleMonthPeriods(monthPeriods, targetId, viewRangeMonths).some((period) => period.id === activePeriodId)) {
      onSelectPeriod(targetId);
    }
  };

  return (
    <div className={`traffic-period-panel ${isCollapsed ? 'is-collapsed' : ''}`}>
      <div className="traffic-period-summary">
        <div>
          <div className="traffic-period-eyebrow">
            Zakres planowania
            <HelpButton
              label="Wyjasnij zakres planowania miesiecy"
              topicId="period-planning"
              onOpenHelp={onOpenHelp}
            />
          </div>
          <strong>{activePeriod?.label || 'Brak aktywnego miesiąca'}</strong>
          <span>
            Widok: {rangeOptions.find((option) => option.value === viewRangeMonths)?.label || 'Kwartał'}
          </span>
        </div>
        <button
          aria-label={isCollapsed ? 'Rozwiń zakres planowania' : 'Zwiń zakres planowania'}
          className="traffic-period-toggle"
          type="button"
          onClick={onToggleCollapsed}
        >
          {isCollapsed ? 'Rozwiń' : 'Zwiń'}
        </button>
      </div>

      {!isCollapsed ? (
        <>
          <div className="traffic-period-controls">
            <div className="traffic-range-tabs" aria-label="Zakres osi miesięcy">
              {rangeOptions.map((option) => (
                <button
                  aria-pressed={viewRangeMonths === option.value}
                  className={`traffic-pill ${viewRangeMonths === option.value ? 'is-active' : ''}`}
                  key={option.value}
                  type="button"
                  onClick={() => onViewRangeChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="traffic-period-primary-actions">
              <label className="traffic-inline-select">
                Dodaj miesiąc
                <select
                  value={selectedNewMonthId}
                  onChange={(event) => setSelectedNewMonthId(event.target.value)}
                >
                  {addMonthOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="traffic-button is-primary"
                type="button"
                disabled={!selectedNewMonthId}
                onClick={() => onAddMonth(selectedNewMonthId)}
              >
                Dodaj
              </button>
            </div>
          </div>

          <div className="traffic-month-timeline" aria-label="Lista miesięcy w wybranym zakresie">
            <button
              aria-label="Pokaż wcześniejsze miesiące"
              className="traffic-icon-button"
              type="button"
              disabled={!hasPreviousRange}
              onClick={goToPreviousRange}
            >
              Wcześniej
            </button>
            <div className="traffic-month-list">
              {visibleMonths.map((period) => {
                return (
                  <button
                    className={`traffic-month-tab ${period.id === activePeriodId ? 'is-active' : ''}`}
                    key={period.id}
                    type="button"
                    onClick={() => onSelectPeriod(period.id)}
                  >
                    <strong>{period.label}</strong>
                    <span>
                      {formatShortDate(period.startsOn)} - {formatShortDate(period.endsOn)}
                    </span>
                    {period.id === activePeriodId ? <em>Aktywny miesiąc</em> : null}
                  </button>
                );
              })}
            </div>
            <button
              aria-label="Pokaż późniejsze miesiące"
              className="traffic-icon-button"
              type="button"
              disabled={!hasNextRange}
              onClick={goToNextRange}
            >
              Później
            </button>
          </div>

        </>
      ) : null}
    </div>
  );
}
