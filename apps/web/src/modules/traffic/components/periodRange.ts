import { Period } from '../models/traffic.model';

export type PeriodRangeMonths = 1 | 3 | 6 | 12;

export function getMonthPeriodIndex(monthPeriods: Period[], periodId: string) {
  return monthPeriods.findIndex((period) => period.id === periodId);
}

export function clampMonthRangeStartIndex(monthPeriods: Period[], startIndex: number, viewRangeMonths: PeriodRangeMonths) {
  if (!monthPeriods.length) return 0;
  const latestStartIndex = Math.max(0, monthPeriods.length - viewRangeMonths);
  return Math.min(Math.max(0, startIndex), latestStartIndex);
}

export function getMonthRangeStartId(
  monthPeriods: Period[],
  rangeStartPeriodId: string,
  viewRangeMonths: PeriodRangeMonths
) {
  const requestedIndex = getMonthPeriodIndex(monthPeriods, rangeStartPeriodId);
  const startIndex = clampMonthRangeStartIndex(
    monthPeriods,
    requestedIndex >= 0 ? requestedIndex : 0,
    viewRangeMonths
  );
  return monthPeriods[startIndex]?.id || rangeStartPeriodId;
}

export function getVisibleMonthPeriods(
  monthPeriods: Period[],
  rangeStartPeriodId: string,
  viewRangeMonths: PeriodRangeMonths
) {
  const rangeStartId = getMonthRangeStartId(monthPeriods, rangeStartPeriodId, viewRangeMonths);
  const startIndex = Math.max(0, getMonthPeriodIndex(monthPeriods, rangeStartId));
  return monthPeriods.slice(startIndex, startIndex + viewRangeMonths);
}

export function getTimelineMonthPeriods(
  monthPeriods: Period[],
  rangeStartPeriodId: string,
  viewRangeMonths: PeriodRangeMonths,
  visibleMonthCount = 12
) {
  if (!monthPeriods.length) return [];

  const rangeStartId = getMonthRangeStartId(monthPeriods, rangeStartPeriodId, viewRangeMonths);
  const rangeStartIndex = Math.max(0, getMonthPeriodIndex(monthPeriods, rangeStartId));
  const preferredCount = Math.min(monthPeriods.length, Math.max(viewRangeMonths, visibleMonthCount));
  const rangeCenterIndex = rangeStartIndex + (viewRangeMonths - 1) / 2;
  const requestedStartIndex = Math.round(rangeCenterIndex - (preferredCount - 1) / 2);
  const startIndex = Math.min(Math.max(0, requestedStartIndex), Math.max(0, monthPeriods.length - preferredCount));

  return monthPeriods.slice(startIndex, startIndex + preferredCount);
}

export function getCenteredMonthRangeStartId(
  monthPeriods: Period[],
  centerPeriodId: string,
  viewRangeMonths: PeriodRangeMonths
) {
  const centerIndex = getMonthPeriodIndex(monthPeriods, centerPeriodId);
  if (centerIndex < 0) return getMonthRangeStartId(monthPeriods, centerPeriodId, viewRangeMonths);

  const rangeStartIndex = clampMonthRangeStartIndex(
    monthPeriods,
    centerIndex - Math.floor(viewRangeMonths / 2),
    viewRangeMonths
  );

  return monthPeriods[rangeStartIndex]?.id || centerPeriodId;
}

export function formatPeriodRangeLabel(periods: Period[]) {
  if (!periods.length) return 'Brak zakresu';
  if (periods.length === 1) return periods[0].label;

  const first = periods[0];
  const last = periods[periods.length - 1];
  const firstYear = first.id.slice(0, 4);
  const lastYear = last.id.slice(0, 4);
  const firstMonth = first.label.replace(/\s+\d{4}$/, '');
  const lastMonth = last.label.replace(/\s+\d{4}$/, '');

  if (firstYear === lastYear) {
    return `${firstMonth} - ${lastMonth} ${lastYear}`;
  }

  return `${first.label} - ${last.label}`;
}

export function isMonthPeriodVisible(
  monthPeriods: Period[],
  rangeStartPeriodId: string,
  viewRangeMonths: PeriodRangeMonths,
  periodId: string
) {
  return getVisibleMonthPeriods(monthPeriods, rangeStartPeriodId, viewRangeMonths)
    .some((period) => period.id === periodId);
}

export function shiftMonthRangeStartId(
  monthPeriods: Period[],
  rangeStartPeriodId: string,
  viewRangeMonths: PeriodRangeMonths,
  offset: number
) {
  const currentStartId = getMonthRangeStartId(monthPeriods, rangeStartPeriodId, viewRangeMonths);
  const currentIndex = Math.max(0, getMonthPeriodIndex(monthPeriods, currentStartId));
  const nextIndex = clampMonthRangeStartIndex(monthPeriods, currentIndex + offset, viewRangeMonths);
  return monthPeriods[nextIndex]?.id || currentStartId;
}
