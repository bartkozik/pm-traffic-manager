import type { Period } from '../models/traffic.model';

const monthFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getMonthPeriodId(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getMonthLabel(date: Date) {
  const label = monthFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function getPeriodDisplayLabel(period: Period) {
  const legacyLabel = period.label.match(/^(styczeń|luty|marzec|kwiecień|maj|czerwiec|lipiec|sierpień|wrzesień|październik|listopad|grudzień)(?: (\d{4}))?(?: W([1-6]))?$/i);
  if (!legacyLabel) return period.label;
  const date = new Date(`${period.startsOn}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return period.label;
  const month = getMonthLabel(date);
  const label = legacyLabel[2] ? month : month.replace(/ \d{4}$/, '');
  return legacyLabel[3] ? `${label} W${legacyLabel[3]}` : label;
}

export function getMonthEnd(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

export function addUtcMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

export function createMonthPeriod(date: Date): Period {
  return {
    id: getMonthPeriodId(date),
    label: getMonthLabel(date),
    granularity: 'month',
    startsOn: toDateInputValue(date),
    endsOn: toDateInputValue(getMonthEnd(date)),
  };
}

export function createWeekPeriods(month: Period): Period[] {
  const start = new Date(`${month.startsOn}T00:00:00.000Z`);
  const end = new Date(`${month.endsOn}T00:00:00.000Z`);
  const weeks: Period[] = [];
  let cursor = new Date(start);
  let index = 1;

  while (cursor <= end) {
    const weekEnd = new Date(cursor);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    if (weekEnd > end) weekEnd.setTime(end.getTime());

    weeks.push({
      id: `${month.id}-w${index}`,
      label: `${month.label} W${index}`,
      granularity: 'week',
      startsOn: toDateInputValue(cursor),
      endsOn: toDateInputValue(weekEnd),
      parentPeriodId: month.id,
    });

    cursor = new Date(weekEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    index += 1;
  }

  return weeks;
}
