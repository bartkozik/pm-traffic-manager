import './PeriodTimelineNavigator.css';
import { useState } from 'react';
import { Period } from '../models/traffic.model';
import {
  formatPeriodRangeLabel,
  getCenteredMonthRangeStartId,
  getMonthPeriodIndex,
  getTimelineMonthPeriods,
  getVisibleMonthPeriods,
  shiftMonthRangeStartId,
  type PeriodRangeMonths,
} from './periodRange';

interface PeriodTimelineOption<T extends PeriodRangeMonths> {
  label: string;
  value: T;
}

interface PeriodTimelineAction {
  label: string;
  onClick: () => void;
}

interface PeriodTimelineNavigatorProps<T extends PeriodRangeMonths> {
  activePeriodId: string;
  addAction?: PeriodTimelineAction;
  ariaLabel: string;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  description?: string;
  heading?: string;
  monthPeriods: Period[];
  rangeMonths: T;
  rangeOptions?: Array<PeriodTimelineOption<T>>;
  rangeStartPeriodId: string;
  onActivePeriodChange: (periodId: string) => void;
  onRangeMonthsChange?: (range: T) => void;
  onRangeStartChange: (periodId: string) => void;
}

const shortMonthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short' });

function formatShortMonth(period: Period) {
  const value = shortMonthFormatter.format(new Date(`${period.id}-01T00:00:00.000Z`));
  return value.replace('.', '');
}

export function PeriodTimelineNavigator<T extends PeriodRangeMonths>({
  activePeriodId,
  addAction,
  ariaLabel,
  className = '',
  collapsible = false,
  defaultOpen = true,
  description,
  heading,
  monthPeriods,
  rangeMonths,
  rangeOptions,
  rangeStartPeriodId,
  onActivePeriodChange,
  onRangeMonthsChange,
  onRangeStartChange,
}: PeriodTimelineNavigatorProps<T>) {
  const [isTimelineOpen, setIsTimelineOpen] = useState(defaultOpen);
  const visibleMonthPeriods = getVisibleMonthPeriods(monthPeriods, rangeStartPeriodId, rangeMonths);
  const timelineMonths = getTimelineMonthPeriods(monthPeriods, rangeStartPeriodId, rangeMonths, 12);
  const mobileTimelinePeriodIds = new Set(
    getTimelineMonthPeriods(monthPeriods, rangeStartPeriodId, rangeMonths, 3).map((period) => period.id)
  );
  const rangeStartIndex = Math.max(0, getMonthPeriodIndex(monthPeriods, visibleMonthPeriods[0]?.id || rangeStartPeriodId));
  const hasPreviousRange = rangeStartIndex > 0;
  const hasNextRange = rangeStartIndex + visibleMonthPeriods.length < monthPeriods.length;
  const visiblePeriodIds = new Set(visibleMonthPeriods.map((period) => period.id));
  const rangeLabel = formatPeriodRangeLabel(visibleMonthPeriods);
  const shouldShowModeSwitch = Boolean(rangeOptions?.length && rangeOptions.length > 1 && onRangeMonthsChange);
  const shouldShowTimelineBody = !collapsible || isTimelineOpen;

  const goToRange = (offset: number) => {
    const canMove = offset < 0 ? hasPreviousRange : hasNextRange;
    if (!canMove) return;

    const targetId = shiftMonthRangeStartId(monthPeriods, rangeStartPeriodId, rangeMonths, offset);
    onRangeStartChange(targetId);
    if (!getVisibleMonthPeriods(monthPeriods, targetId, rangeMonths).some((period) => period.id === activePeriodId)) {
      onActivePeriodChange(targetId);
    }
  };

  const selectPeriod = (periodId: string) => {
    const targetStartId = rangeMonths === 1
      ? periodId
      : getCenteredMonthRangeStartId(monthPeriods, periodId, rangeMonths);

    if (targetStartId !== rangeStartPeriodId) {
      onRangeStartChange(targetStartId);
    }
    onActivePeriodChange(periodId);
  };

  return (
    <section
      className={[
        'period-timeline-nav',
        collapsible ? 'is-collapsible' : '',
        collapsible && !isTimelineOpen ? 'is-collapsed' : '',
        className,
      ].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
    >
      <div className="period-timeline-top">
        <div className="period-timeline-copy">
          {heading ? <span>{heading}</span> : null}
          <strong>{rangeLabel}</strong>
          {description ? <small>{description}</small> : null}
        </div>

        {shouldShowTimelineBody && shouldShowModeSwitch ? (
          <div className="period-timeline-mode-switch" role="group" aria-label="Time range unit">
            {rangeOptions?.map((option) => (
              <button
                aria-pressed={rangeMonths === option.value}
                className={rangeMonths === option.value ? 'is-active' : ''}
                key={option.value}
                type="button"
                onClick={() => onRangeMonthsChange?.(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="period-timeline-top-actions">
          {shouldShowTimelineBody && addAction ? (
            <button className="period-timeline-add" type="button" onClick={addAction.onClick}>
              {addAction.label}
            </button>
          ) : null}
          {collapsible ? (
            <button
              aria-expanded={isTimelineOpen}
              aria-label={isTimelineOpen ? 'Collapse planning range' : 'Expand planning range'}
              className="period-timeline-toggle"
              type="button"
              onClick={() => setIsTimelineOpen((current) => !current)}
            >
              {isTimelineOpen ? 'Collapse' : 'Expand'}
            </button>
          ) : null}
        </div>
      </div>

      {shouldShowTimelineBody ? (
        <div className="period-timeline-bar">
          <button
            aria-label="Show earlier range"
            className="period-timeline-step is-previous"
            disabled={!hasPreviousRange}
            type="button"
            onClick={() => goToRange(-1)}
          >
            <span aria-hidden="true">&lt;</span>
          </button>
          <div className="period-timeline-rail-wrap">
            <div className="period-timeline-rail" role="group" aria-label="Months on the timeline">
              {timelineMonths.map((period) => {
                const isInRange = visiblePeriodIds.has(period.id);
                const isActive = period.id === activePeriodId;
                const isContextOnly = rangeMonths > 1 && !isInRange;
                const isMobileHidden = !mobileTimelinePeriodIds.has(period.id);
                return (
                  <button
                    aria-current={isActive ? 'date' : undefined}
                    aria-pressed={isActive}
                    className={[
                      'period-timeline-month',
                      isInRange ? 'is-in-range' : '',
                      isActive ? 'is-active' : '',
                      isContextOnly ? 'is-context-only' : '',
                      isMobileHidden ? 'is-mobile-hidden' : '',
                    ].filter(Boolean).join(' ')}
                    key={period.id}
                    title={period.label}
                    type="button"
                    onClick={() => selectPeriod(period.id)}
                  >
                    <span>{formatShortMonth(period)}</span>
                    <small>{period.id.slice(0, 4)}</small>
                  </button>
                );
              })}
            </div>
          </div>
          <button
            aria-label="Show later range"
            className="period-timeline-step is-next"
            disabled={!hasNextRange}
            type="button"
            onClick={() => goToRange(1)}
          >
            <span aria-hidden="true">&gt;</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
