import { PersonTileAllocation, Period, ProjectFrame } from '../models/traffic.model';

export function isProjectActiveInPeriod(
  project: ProjectFrame,
  periodId: Period['id'],
  allocationsByTarget?: Map<string, PersonTileAllocation[]>
) {
  if (project.archivedAt || project.archivedPeriodIds?.includes(periodId)) return false;

  const hasRevenuePlan = project.revenuePlan.some((plan) => plan.periodId === periodId);
  const hasAllocations = Boolean(allocationsByTarget?.get(project.id)?.length);

  return hasRevenuePlan || hasAllocations || project.startPeriodId === periodId;
}
