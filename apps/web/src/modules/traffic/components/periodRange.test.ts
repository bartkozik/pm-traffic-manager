import { describe, expect, it } from 'vitest';
import { Period } from '../models/traffic.model';
import {
  formatPeriodRangeLabel,
  getCenteredMonthRangeStartId,
  getTimelineMonthPeriods,
  getVisibleMonthPeriods,
  isMonthPeriodVisible,
  shiftMonthRangeStartId,
} from './periodRange';

const monthPeriods: Period[] = [
  month('2026-06', 'Czerwiec 2026', '2026-06-30'),
  month('2026-07', 'Lipiec 2026', '2026-07-31'),
  month('2026-08', 'Sierpien 2026', '2026-08-31'),
  month('2026-09', 'Wrzesien 2026', '2026-09-30'),
  month('2026-10', 'Pazdziernik 2026', '2026-10-31'),
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

describe('period range', () => {
  it('keeps visible quarter anchored to range start when active month changes inside it', () => {
    expect(getVisibleMonthPeriods(monthPeriods, '2026-06', 3).map((period) => period.id)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
    expect(isMonthPeriodVisible(monthPeriods, '2026-06', 3, '2026-08')).toBe(true);
  });

  it('moves the range by one month when scrolling', () => {
    const nextStartId = shiftMonthRangeStartId(monthPeriods, '2026-06', 3, 1);

    expect(nextStartId).toBe('2026-07');
    expect(getVisibleMonthPeriods(monthPeriods, nextStartId, 3).map((period) => period.id)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('keeps timeline context around the selected range for the requested visible count', () => {
    expect(getTimelineMonthPeriods(monthPeriods, '2026-08', 1, 3).map((period) => period.id)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('centers a multi-month range around a selected month when possible', () => {
    expect(getCenteredMonthRangeStartId(monthPeriods, '2026-08', 3)).toBe('2026-07');
    expect(getVisibleMonthPeriods(monthPeriods, '2026-07', 3).map((period) => period.id)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('formats single month and multi-month range labels', () => {
    expect(formatPeriodRangeLabel(getVisibleMonthPeriods(monthPeriods, '2026-06', 1))).toBe('Czerwiec 2026');
    expect(formatPeriodRangeLabel(getVisibleMonthPeriods(monthPeriods, '2026-06', 3))).toBe('Czerwiec - Sierpien 2026');
  });
});
