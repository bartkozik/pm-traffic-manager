import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Period } from '../models/traffic.model';
import { PeriodTimelineNavigator } from './PeriodTimelineNavigator';

const monthPeriods: Period[] = [
  month('2026-06', 'June 2026', '2026-06-30'),
  month('2026-07', 'July 2026', '2026-07-31'),
  month('2026-08', 'August 2026', '2026-08-31'),
  month('2026-09', 'September 2026', '2026-09-30'),
  month('2026-10', 'October 2026', '2026-10-31'),
  month('2026-11', 'November 2026', '2026-11-30'),
];

const extendedMonthPeriods: Period[] = [
  month('2026-01', 'January 2026', '2026-01-31'),
  month('2026-02', 'February 2026', '2026-02-28'),
  month('2026-03', 'March 2026', '2026-03-31'),
  month('2026-04', 'April 2026', '2026-04-30'),
  month('2026-05', 'May 2026', '2026-05-31'),
  month('2026-06', 'June 2026', '2026-06-30'),
  month('2026-07', 'July 2026', '2026-07-31'),
  month('2026-08', 'August 2026', '2026-08-31'),
  month('2026-09', 'September 2026', '2026-09-30'),
  month('2026-10', 'October 2026', '2026-10-31'),
  month('2026-11', 'November 2026', '2026-11-30'),
  month('2026-12', 'December 2026', '2026-12-31'),
  month('2027-01', 'January 2027', '2027-01-31'),
  month('2027-02', 'February 2027', '2027-02-28'),
];

function month(id: string, label: string, endsOn: string): Period {
  return {
    id,
    label,
    granularity: 'month',
    startsOn: `${id}-01`,
    endsOn,
  };
}

describe('PeriodTimelineNavigator', () => {
  it('centers the quarterly range when a context month is clicked', () => {
    const onActivePeriodChange = vi.fn();
    const onRangeMonthsChange = vi.fn();
    const onRangeStartChange = vi.fn();

    render(
      <PeriodTimelineNavigator
        activePeriodId="2026-09"
        ariaLabel="Test range"
        monthPeriods={monthPeriods}
        rangeMonths={3}
        rangeOptions={[
          { label: 'Month', value: 1 },
          { label: 'Quarter', value: 3 },
        ]}
        rangeStartPeriodId="2026-09"
        onActivePeriodChange={onActivePeriodChange}
        onRangeMonthsChange={onRangeMonthsChange}
        onRangeStartChange={onRangeStartChange}
      />
    );

    const contextMonth = screen.getByTitle('August 2026');

    expect(contextMonth).toBeEnabled();
    fireEvent.click(contextMonth);

    expect(onActivePeriodChange).toHaveBeenCalledWith('2026-08');
    expect(onRangeStartChange).toHaveBeenCalledWith('2026-07');
  });

  it('keeps month selection active inside the current quarterly range', () => {
    const onActivePeriodChange = vi.fn();
    const onRangeStartChange = vi.fn();

    render(
      <PeriodTimelineNavigator
        activePeriodId="2026-09"
        ariaLabel="Test range"
        monthPeriods={monthPeriods}
        rangeMonths={3}
        rangeOptions={[
          { label: 'Month', value: 1 },
          { label: 'Quarter', value: 3 },
        ]}
        rangeStartPeriodId="2026-09"
        onActivePeriodChange={onActivePeriodChange}
        onRangeMonthsChange={() => undefined}
        onRangeStartChange={onRangeStartChange}
      />
    );

    fireEvent.click(screen.getByTitle('October 2026'));

    expect(onActivePeriodChange).toHaveBeenCalledWith('2026-10');
    expect(onRangeStartChange).not.toHaveBeenCalled();
  });

  it('renders a monthly-only timeline without the mode switch and keeps three mobile months', () => {
    const { container } = render(
      <PeriodTimelineNavigator
        activePeriodId="2026-08"
        ariaLabel="Test range"
        monthPeriods={extendedMonthPeriods}
        rangeMonths={1}
        rangeStartPeriodId="2026-08"
        onActivePeriodChange={() => undefined}
        onRangeStartChange={() => undefined}
      />
    );

    expect(screen.queryByRole('group', { name: 'Time range unit' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Show earlier range')).toBeInTheDocument();
    expect(screen.getByLabelText('Show later range')).toBeInTheDocument();
    expect(container.querySelectorAll('.period-timeline-month')).toHaveLength(12);
    expect(container.querySelectorAll('.period-timeline-month.is-mobile-hidden')).toHaveLength(9);
    expect(screen.getByTitle('August 2026')).not.toHaveClass('is-mobile-hidden');
  });

  it('can collapse the optional timeline while keeping the range label visible', () => {
    render(
      <PeriodTimelineNavigator
        activePeriodId="2026-08"
        ariaLabel="Test range"
        collapsible
        defaultOpen
        heading="Planning range"
        monthPeriods={extendedMonthPeriods}
        rangeMonths={1}
        rangeStartPeriodId="2026-08"
        onActivePeriodChange={() => undefined}
        onRangeStartChange={() => undefined}
      />
    );

    const collapseButton = screen.getByRole('button', { name: 'Collapse planning range' });

    expect(collapseButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Show earlier range')).toBeInTheDocument();

    fireEvent.click(collapseButton);

    expect(screen.getByRole('button', { name: 'Expand planning range' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('August 2026')).toBeInTheDocument();
    expect(screen.queryByLabelText('Show earlier range')).not.toBeInTheDocument();
  });
});
