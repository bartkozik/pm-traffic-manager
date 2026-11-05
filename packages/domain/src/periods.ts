import { Period, Person, PersonTileAllocation } from './traffic.model.js';
import { getPersonPeriodCostTileCount, getPersonPeriodHoursPerTile } from './personPeriod.js';

const monthFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
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

export function getLatestMonth(periods: Period[]) {
  return periods
    .filter((period) => period.granularity === 'month')
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .at(-1);
}

export function getMonthDate(period: Period) {
  return new Date(`${period.startsOn}T00:00:00.000Z`);
}

export function createPersonPeriodAllocations(person: Person, periodId: string, sourceAllocations?: PersonTileAllocation[]) {
  return Array.from({ length: getPersonPeriodCostTileCount(person, periodId) }, (_, tileIndex) => {
    const source = sourceAllocations?.find((allocation) => allocation.tileIndex === tileIndex);
    return {
      id: `${periodId}-${person.id}-${tileIndex}`,
      personId: person.id,
      tileIndex,
      target: source?.target || 'bench',
      previousTarget: source?.previousTarget,
      periodId,
      mode: source?.mode || 'revenue_first',
      revenueK: source?.revenueK || 1,
      hours: source?.hours || getPersonPeriodHoursPerTile(person, periodId),
      skillId: source?.skillId,
      requirementId: source?.requirementId,
      projectSlotIndex: source?.projectSlotIndex,
      hoursOverridden: source?.hoursOverridden,
      revenueOverridden: source?.revenueOverridden,
      meetingState: source?.meetingState,
      validation: source?.validation,
    } satisfies PersonTileAllocation;
  });
}

export function isPersonActiveInPeriod(person: Person, periodId: string) {
  return !person.archivedAt && !(person.hiddenPeriodIds || []).includes(periodId);
}
