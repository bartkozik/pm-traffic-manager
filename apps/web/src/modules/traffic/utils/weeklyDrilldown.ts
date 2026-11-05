import { getEffectiveAllocationSkillId, isProductiveAllocationTarget, Period, Person, PersonTileAllocation, ProjectFrame, SkillId } from '../models/traffic.model';
import { getPersonPeriodAvailableHours } from './personPeriod';

export interface WeeklyPersonLoad {
  personId: string;
  allocatedHours: number;
  availableHours: number;
  utilizationPercent: number;
  status: 'unavailable' | 'under' | 'healthy' | 'over';
}

export interface WeeklyProjectWorkload {
  projectId: string;
  projectName: string;
  client: string;
  skillId?: SkillId;
  hours: number;
  revenueK: number;
}

export interface WeeklyDrilldownWeek {
  period: Period;
  allocatedHours: number;
  availableHours: number;
  utilizationPercent: number;
  overloadedPeople: number;
  people: WeeklyPersonLoad[];
  projectWorkloads: WeeklyProjectWorkload[];
}

interface WeeklyDrilldownInput {
  monthPeriod: Period;
  periods: Period[];
  people: Person[];
  projects: ProjectFrame[];
  allocations: PersonTileAllocation[];
}

interface AllocationWeekShare {
  hours: number;
  revenueK: number;
}

export interface DiabloBusinessWeek {
  id: string;
  index: number;
  startsOn: string;
  endsOn: string;
  workingDays: number;
  label: string;
  parentPeriodId: string;
}

const BUSINESS_WEEK_SHORT_MONTHS_PL = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Mon–Fri working weeks within a month, clipped at the month edges (so the first
// and last week may be short). Labeled by the real date range, e.g. "1–5 cze".
export function getBusinessWeeksForMonth(monthPeriod: Period): DiabloBusinessWeek[] {
  const monthStart = new Date(`${monthPeriod.startsOn}T00:00:00.000Z`);
  const monthEnd = new Date(`${monthPeriod.endsOn}T00:00:00.000Z`);
  const weeks: DiabloBusinessWeek[] = [];
  let index = 1;

  // Walk from the Monday on/before the first of the month, week by week.
  const cursor = new Date(monthStart);
  const weekday = cursor.getUTCDay(); // 0=Sun … 6=Sat
  cursor.setUTCDate(cursor.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));

  while (cursor <= monthEnd) {
    const monday = new Date(cursor);
    const friday = new Date(cursor);
    friday.setUTCDate(friday.getUTCDate() + 4);

    const start = monday < monthStart ? new Date(monthStart) : monday;
    const end = friday > monthEnd ? new Date(monthEnd) : friday;
    const workingDays = countBusinessDays(start, end);

    if (start <= end && workingDays > 0) {
      weeks.push({
        id: `${monthPeriod.id}-w${index}`,
        index,
        startsOn: toDateInputValue(start),
        endsOn: toDateInputValue(end),
        workingDays,
        label: formatBusinessWeekLabel(start, end),
        parentPeriodId: monthPeriod.id,
      });
      index += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return weeks;
}

export interface DiabloPlanningWeekSpan {
  periodId: string;
  periodLabel: string;
  startsOn: string;
  endsOn: string;
  workingDays: number;
}

export interface DiabloPlanningWeek {
  id: string;
  startsOn: string;
  endsOn: string;
  label: string;
  workingDays: number;
  spansMonths: boolean;
  spans: DiabloPlanningWeekSpan[];
}

export interface PlanningWeekLoad {
  week: DiabloPlanningWeek;
  allocatedHours: number;
  availableHours: number;
  utilizationPercent: number;
  overloadedPeople: number;
  people: WeeklyPersonLoad[];
  projectWorkloads: WeeklyProjectWorkload[];
}

// Whole Mon–Fri business weeks across the full planning horizon. A week that
// straddles a month boundary (e.g. 29 cze – 3 lip) stays a SINGLE week, but its
// `spans` record how it splits across the months it touches, so downstream code
// can pull each month's slice of the work.
export function getPlanningBusinessWeeks(monthPeriods: Period[]): DiabloPlanningWeek[] {
  if (!monthPeriods.length) return [];
  const sorted = [...monthPeriods].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const rangeStart = new Date(`${sorted[0].startsOn}T00:00:00.000Z`);
  const rangeEnd = new Date(`${sorted[sorted.length - 1].endsOn}T00:00:00.000Z`);
  const weeks: DiabloPlanningWeek[] = [];

  const cursor = new Date(rangeStart);
  const weekday = cursor.getUTCDay(); // 0=Sun … 6=Sat
  cursor.setUTCDate(cursor.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));

  while (cursor <= rangeEnd) {
    const monday = new Date(cursor);
    const friday = new Date(cursor);
    friday.setUTCDate(friday.getUTCDate() + 4);

    const weekStart = monday < rangeStart ? new Date(rangeStart) : monday;
    const weekEnd = friday > rangeEnd ? new Date(rangeEnd) : friday;

    if (weekStart <= weekEnd) {
      const spans: DiabloPlanningWeekSpan[] = [];
      sorted.forEach((month) => {
        const monthStart = new Date(`${month.startsOn}T00:00:00.000Z`);
        const monthEnd = new Date(`${month.endsOn}T00:00:00.000Z`);
        const spanStart = weekStart > monthStart ? weekStart : monthStart;
        const spanEnd = weekEnd < monthEnd ? weekEnd : monthEnd;
        if (spanStart > spanEnd) return;
        const workingDays = countBusinessDays(spanStart, spanEnd);
        if (workingDays <= 0) return;
        spans.push({
          periodId: month.id,
          periodLabel: month.label,
          startsOn: toDateInputValue(spanStart),
          endsOn: toDateInputValue(spanEnd),
          workingDays,
        });
      });

      const workingDays = spans.reduce((sum, span) => sum + span.workingDays, 0);
      if (spans.length && workingDays > 0) {
        const labelStart = new Date(`${spans[0].startsOn}T00:00:00.000Z`);
        const labelEnd = new Date(`${spans[spans.length - 1].endsOn}T00:00:00.000Z`);
        weeks.push({
          id: `week-${toDateInputValue(weekStart)}`,
          startsOn: spans[0].startsOn,
          endsOn: spans[spans.length - 1].endsOn,
          label: formatBusinessWeekLabel(labelStart, labelEnd),
          workingDays,
          spansMonths: spans.length > 1,
          spans,
        });
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return weeks;
}

// People + project workload for one (possibly cross-month) business week. Each
// month's slice is taken proportionally by working days: a week's share of a
// month = (week working days in that month) / (that month's working days).
export function buildPlanningWeekLoad({
  week,
  monthPeriods,
  people,
  projects,
  allocations,
}: {
  week: DiabloPlanningWeek;
  monthPeriods: Period[];
  people: Person[];
  projects: ProjectFrame[];
  allocations: PersonTileAllocation[];
}): PlanningWeekLoad {
  const monthById = new Map(monthPeriods.map((month) => [month.id, month]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const personHours = new Map<string, number>();
  const personAvailable = new Map<string, number>();
  const projectAgg = new Map<string, WeeklyProjectWorkload>();

  week.spans.forEach((span) => {
    const month = monthById.get(span.periodId);
    if (!month) return;
    const monthWorkingDays = countBusinessDays(
      new Date(`${month.startsOn}T00:00:00.000Z`),
      new Date(`${month.endsOn}T00:00:00.000Z`)
    );
    if (monthWorkingDays <= 0) return;
    const shareFactor = span.workingDays / monthWorkingDays;

    allocations
      .filter((allocation) => (
        allocation.periodId === span.periodId &&
        isProductiveAllocationTarget(allocation, projectsById)
      ))
      .forEach((allocation) => {
        const hours = allocation.hours * shareFactor;
        const revenueK = allocation.revenueK * shareFactor;
        personHours.set(allocation.personId, (personHours.get(allocation.personId) || 0) + hours);

        const project = projectsById.get(allocation.target);
        if (!project) return;
        const skillId = getEffectiveAllocationSkillId(allocation, project, peopleById.get(allocation.personId));
        const key = `${allocation.target}:${skillId || 'unassigned'}`;
        const current = projectAgg.get(key) || {
          projectId: project.id,
          projectName: project.name,
          client: project.client,
          skillId,
          hours: 0,
          revenueK: 0,
        };
        projectAgg.set(key, { ...current, hours: current.hours + hours, revenueK: current.revenueK + revenueK });
      });

    people.forEach((person) => {
      const available = getPersonPeriodAvailableHours(person, span.periodId) * shareFactor;
      personAvailable.set(person.id, (personAvailable.get(person.id) || 0) + available);
    });
  });

  const peopleLoad = people.map((person) => {
    const allocatedHours = roundHours(personHours.get(person.id) || 0);
    const availableHours = roundHours(personAvailable.get(person.id) || 0);
    const utilizationPercent = getUtilizationPercent(allocatedHours, availableHours);
    return {
      personId: person.id,
      allocatedHours,
      availableHours,
      utilizationPercent,
      status: getWeeklyStatus(allocatedHours, availableHours, utilizationPercent),
    } satisfies WeeklyPersonLoad;
  });
  const projectWorkloads = Array.from(projectAgg.values())
    .map((item) => ({ ...item, hours: roundHours(item.hours), revenueK: roundMoney(item.revenueK) }))
    .sort((a, b) => b.hours - a.hours);
  const allocatedHours = roundHours(peopleLoad.reduce((sum, person) => sum + person.allocatedHours, 0));
  const availableHours = roundHours(peopleLoad.reduce((sum, person) => sum + person.availableHours, 0));

  return {
    week,
    allocatedHours,
    availableHours,
    utilizationPercent: getUtilizationPercent(allocatedHours, availableHours),
    overloadedPeople: peopleLoad.filter((person) => person.status === 'over').length,
    people: peopleLoad,
    projectWorkloads,
  };
}

function countBusinessDays(start: Date, end: Date) {
  let count = 0;
  const day = new Date(start);
  while (day <= end) {
    const weekday = day.getUTCDay();
    if (weekday >= 1 && weekday <= 5) count += 1;
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return count;
}

function formatBusinessWeekLabel(start: Date, end: Date) {
  const startMonth = BUSINESS_WEEK_SHORT_MONTHS_PL[start.getUTCMonth()];
  const endMonth = BUSINESS_WEEK_SHORT_MONTHS_PL[end.getUTCMonth()];
  if (startMonth === endMonth) return `${start.getUTCDate()}–${end.getUTCDate()} ${startMonth}`;
  return `${start.getUTCDate()} ${startMonth} – ${end.getUTCDate()} ${endMonth}`;
}

export function getWeeksForMonth(periods: Period[], monthPeriod: Period): Period[] {
  const storedWeeks = periods
    .filter((period) => period.granularity === 'week' && period.parentPeriodId === monthPeriod.id)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));

  if (weeksCoverMonth(storedWeeks, monthPeriod)) return storedWeeks;

  return createCalendarWeeks(monthPeriod);
}

export function buildWeeklyDrilldown({
  monthPeriod,
  periods,
  people,
  projects,
  allocations,
}: WeeklyDrilldownInput): WeeklyDrilldownWeek[] {
  const weeks = getWeeksForMonth(periods, monthPeriod);
  const monthDays = getInclusiveDays(monthPeriod.startsOn, monthPeriod.endsOn);
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const productiveAllocations = allocations.filter((allocation) => (
    allocation.periodId === monthPeriod.id &&
    isProductiveAllocationTarget(allocation, projectsById)
  ));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const weekShares = getAllocationWeekShares(productiveAllocations, weeks, monthDays);

  return weeks.map((week) => {
    const peopleLoad = people.map((person) => {
      const allocatedHours = roundHours(productiveAllocations
        .filter((allocation) => allocation.personId === person.id)
        .reduce((sum, allocation) => sum + (weekShares.get(allocation.id)?.get(week.id)?.hours || 0), 0));
      const weekShare = getInclusiveDays(week.startsOn, week.endsOn) / monthDays;
      const availableHours = roundHours(getPersonPeriodAvailableHours(person, monthPeriod.id) * weekShare);
      const utilizationPercent = getUtilizationPercent(allocatedHours, availableHours);

      return {
        personId: person.id,
        allocatedHours,
        availableHours,
        utilizationPercent,
        status: getWeeklyStatus(allocatedHours, availableHours, utilizationPercent),
      } satisfies WeeklyPersonLoad;
    });
    const projectWorkloads = Array.from(productiveAllocations.reduce((result, allocation) => {
      const project = projectsById.get(allocation.target);
      if (!project) return result;

      const skillId = getEffectiveAllocationSkillId(allocation, project, peopleById.get(allocation.personId));
      const key = `${allocation.target}:${skillId || 'unassigned'}`;
      const current = result.get(key) || {
        projectId: project.id,
        projectName: project.name,
        client: project.client,
        skillId,
        hours: 0,
        revenueK: 0,
      };
      const allocationWeekShare = weekShares.get(allocation.id)?.get(week.id) || { hours: 0, revenueK: 0 };

      result.set(key, {
        ...current,
        hours: current.hours + allocationWeekShare.hours,
        revenueK: current.revenueK + allocationWeekShare.revenueK,
      });
      return result;
    }, new Map<string, WeeklyProjectWorkload>()).values())
      .map((item) => ({
        ...item,
        hours: roundHours(item.hours),
        revenueK: roundMoney(item.revenueK),
      }))
      .sort((a, b) => b.hours - a.hours);
    const allocatedHours = roundHours(peopleLoad.reduce((sum, person) => sum + person.allocatedHours, 0));
    const availableHours = roundHours(peopleLoad.reduce((sum, person) => sum + person.availableHours, 0));

    return {
      period: week,
      allocatedHours,
      availableHours,
      utilizationPercent: getUtilizationPercent(allocatedHours, availableHours),
      overloadedPeople: peopleLoad.filter((person) => person.status === 'over').length,
      people: peopleLoad,
      projectWorkloads,
    } satisfies WeeklyDrilldownWeek;
  });
}

export function getAllocationWeekHours(
  allocation: PersonTileAllocation,
  week: Period,
  weeks: Period[],
  monthDays: number
) {
  return getAllocationWeekShare(allocation, week, weeks, monthDays).hours;
}

function getAllocationWeekShares(
  allocations: PersonTileAllocation[],
  weeks: Period[],
  monthDays: number
) {
  return allocations.reduce((result, allocation) => {
    result.set(allocation.id, new Map(weeks.map((week) => [
      week.id,
      getAllocationWeekShare(allocation, week, weeks, monthDays),
    ])));
    return result;
  }, new Map<string, Map<string, AllocationWeekShare>>());
}

function getAllocationWeekShare(
  allocation: PersonTileAllocation,
  week: Period,
  weeks: Period[],
  monthDays: number
): AllocationWeekShare {
  const override = allocation.weeklyOverrides?.find((item) => item.periodId === week.id);
  const hasAnyOverride = Boolean(allocation.weeklyOverrides?.some((item) => typeof item.hours === 'number'));
  if (!hasAnyOverride) {
    const weekShare = getInclusiveDays(week.startsOn, week.endsOn) / monthDays;
    return {
      hours: allocation.hours * weekShare,
      revenueK: allocation.revenueK * weekShare,
    };
  }

  const explicitHours = getExplicitWeeklyHours(allocation);
  const remainingHours = Math.max(0, allocation.hours - explicitHours);
  const remainingWeeks = weeks.filter((item) => (
    !allocation.weeklyOverrides?.some((overrideItem) => overrideItem.periodId === item.id && typeof overrideItem.hours === 'number')
  ));
  const remainingDays = remainingWeeks.reduce((sum, item) => sum + getInclusiveDays(item.startsOn, item.endsOn), 0);
  const hours = typeof override?.hours === 'number'
    ? override.hours
    : remainingDays > 0
      ? remainingHours * (getInclusiveDays(week.startsOn, week.endsOn) / remainingDays)
      : 0;
  const revenueDenominator = Math.max(allocation.hours, explicitHours);
  const revenueK = revenueDenominator > 0 ? allocation.revenueK * (hours / revenueDenominator) : 0;

  return { hours, revenueK };
}

function getExplicitWeeklyHours(allocation: PersonTileAllocation) {
  return (allocation.weeklyOverrides || []).reduce((sum, override) => (
    sum + (typeof override.hours === 'number' ? override.hours : 0)
  ), 0);
}

function weeksCoverMonth(weeks: Period[], monthPeriod: Period) {
  if (!weeks.length) return false;
  const first = weeks[0];
  const last = weeks.at(-1);
  if (!last || first.startsOn > monthPeriod.startsOn || last.endsOn < monthPeriod.endsOn) return false;

  return weeks.every((week, index) => {
    const next = weeks[index + 1];
    if (!next) return true;
    return addUtcDays(week.endsOn, 1) === next.startsOn;
  });
}

function createCalendarWeeks(monthPeriod: Period): Period[] {
  const end = new Date(`${monthPeriod.endsOn}T00:00:00.000Z`);
  const weeks: Period[] = [];
  let cursor = new Date(`${monthPeriod.startsOn}T00:00:00.000Z`);
  let index = 1;

  while (cursor <= end) {
    const weekEnd = new Date(cursor);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    if (weekEnd > end) weekEnd.setTime(end.getTime());

    weeks.push({
      id: `${monthPeriod.id}-w${index}`,
      label: `${monthPeriod.label} W${index}`,
      granularity: 'week',
      startsOn: toDateInputValue(cursor),
      endsOn: toDateInputValue(weekEnd),
      parentPeriodId: monthPeriod.id,
    });

    cursor = new Date(weekEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    index += 1;
  }

  return weeks;
}

function getInclusiveDays(startsOn: string, endsOn: string) {
  const start = new Date(`${startsOn}T00:00:00.000Z`);
  const end = new Date(`${endsOn}T00:00:00.000Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function addUtcDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateInputValue(date);
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getUtilizationPercent(allocatedHours: number, availableHours: number) {
  if (availableHours > 0) return Math.round((allocatedHours / availableHours) * 100);
  return allocatedHours > 0 ? 100 : 0;
}

function getWeeklyStatus(
  allocatedHours: number,
  availableHours: number,
  utilizationPercent: number
): WeeklyPersonLoad['status'] {
  if (availableHours === 0 && allocatedHours > 0) return 'over';
  if (availableHours === 0) return 'unavailable';
  if (utilizationPercent > 105) return 'over';
  if (utilizationPercent < 65) return 'under';
  return 'healthy';
}

function roundHours(value: number) {
  return Math.round(value * 10) / 10;
}

function roundMoney(value: number) {
  return Math.round(value * 10) / 10;
}
