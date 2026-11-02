import { describe, expect, it } from 'vitest';
import { createMonthPeriod, createWeekPeriods, getMonthPeriodId } from './trafficPeriods';

describe('trafficPeriods', () => {
  it('creates month period ids and Polish labels from UTC dates', () => {
    const date = new Date(Date.UTC(2026, 5, 10));

    expect(getMonthPeriodId(date)).toBe('2026-06');
    expect(createMonthPeriod(date)).toEqual({
      id: '2026-06',
      label: 'Czerwiec 2026',
      granularity: 'month',
      startsOn: '2026-06-10',
      endsOn: '2026-06-30',
    });
  });

  it('splits a month period into calendar-sized weekly periods', () => {
    const month = {
      id: '2026-06',
      label: 'Czerwiec 2026',
      granularity: 'month' as const,
      startsOn: '2026-06-01',
      endsOn: '2026-06-30',
    };

    expect(createWeekPeriods(month)).toEqual([
      {
        id: '2026-06-w1',
        label: 'Czerwiec 2026 W1',
        granularity: 'week',
        startsOn: '2026-06-01',
        endsOn: '2026-06-07',
        parentPeriodId: '2026-06',
      },
      {
        id: '2026-06-w2',
        label: 'Czerwiec 2026 W2',
        granularity: 'week',
        startsOn: '2026-06-08',
        endsOn: '2026-06-14',
        parentPeriodId: '2026-06',
      },
      {
        id: '2026-06-w3',
        label: 'Czerwiec 2026 W3',
        granularity: 'week',
        startsOn: '2026-06-15',
        endsOn: '2026-06-21',
        parentPeriodId: '2026-06',
      },
      {
        id: '2026-06-w4',
        label: 'Czerwiec 2026 W4',
        granularity: 'week',
        startsOn: '2026-06-22',
        endsOn: '2026-06-28',
        parentPeriodId: '2026-06',
      },
      {
        id: '2026-06-w5',
        label: 'Czerwiec 2026 W5',
        granularity: 'week',
        startsOn: '2026-06-29',
        endsOn: '2026-06-30',
        parentPeriodId: '2026-06',
      },
    ]);
  });
});
