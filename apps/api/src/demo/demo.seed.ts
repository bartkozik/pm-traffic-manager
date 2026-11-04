import { createMonthPeriod, createSeedTrafficSnapshot, createWeekPeriods, type TrafficSnapshot } from '@ptm/domain';

export function createDemoSnapshot(now = new Date()): TrafficSnapshot {
  const seed = createSeedTrafficSnapshot();
  const current = createMonthPeriod(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const next = createMonthPeriod(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));
  const sourceMonths = seed.periods.filter((period) => period.granularity === 'month').sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const replacements = new Map([[sourceMonths[0].id, current.id], [sourceMonths[1].id, next.id]]);
  const shifted = JSON.parse(JSON.stringify(seed).replace(/\d{4}-\d{2}/g, (month) => replacements.get(month) ?? month)) as TrafficSnapshot;
  shifted.periods = [current, ...createWeekPeriods(current), next, ...createWeekPeriods(next)];
  shifted.projects = shifted.projects.map((project) => ({ ...project, startMonth: shifted.periods.find((period) => period.id === project.startPeriodId)?.label ?? project.startMonth }));
  return shifted;
}
