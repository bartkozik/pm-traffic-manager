import { allocationCoversRequirement, BoardLens, isProductiveAllocationTarget, Period, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { BoardRisk } from './boardRisks';
import { getPersonPeriodAvailableHours } from './personPeriod';
import { isProjectActiveInPeriod } from './projectPeriod';
import { buildWeeklyDrilldown } from './weeklyDrilldown';

export interface BoardMetrics {
  totalCost: number;
  targetRevenue: number;
  committedRevenue: number;
  expectedRevenue: number;
  pressureToTarget: number;
  loss: number;
}

export interface LensMetric {
  id: string;
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}

interface GenerateLensMetricsInput {
  activePeriodId: string;
  allocations: PersonTileAllocation[];
  boardRisks: BoardRisk[];
  lens: BoardLens;
  metrics: BoardMetrics;
  people: Person[];
  periods: Period[];
  projects: ProjectFrame[];
}

function formatK(value: number) {
  return `${Math.round(value * 10) / 10}k`;
}

function formatHours(value: number) {
  return `${Math.round(value)}h`;
}

function getActivePeriod(periods: Period[], activePeriodId: string) {
  return periods.find((period) => period.id === activePeriodId && period.granularity === 'month');
}

function getPeriodAllocations(allocations: PersonTileAllocation[], activePeriodId: string) {
  return allocations.filter((allocation) => allocation.periodId === activePeriodId);
}

function getAllocationsByTarget(periodAllocations: PersonTileAllocation[]) {
  return periodAllocations.reduce((result, allocation) => {
    const current = result.get(allocation.target) || [];
    current.push(allocation);
    result.set(allocation.target, current);
    return result;
  }, new Map<string, PersonTileAllocation[]>());
}

function calculateRequiredHoursGap(
  projects: ProjectFrame[],
  allocationsByTarget: Map<string, PersonTileAllocation[]>,
  peopleById: Map<string, Person>
) {
  return projects.reduce((sum, project) => {
    const projectAllocations = allocationsByTarget.get(project.id) || [];
    const projectGap = project.requirements
      .filter((requirement) => requirement.required)
      .reduce((requirementSum, requirement) => {
        const coveredHours = projectAllocations
          .filter((allocation) => allocationCoversRequirement(
            allocation,
            requirement,
            project,
            peopleById.get(allocation.personId)
          ))
          .reduce((hoursSum, allocation) => hoursSum + allocation.hours, 0);
        return requirementSum + Math.max(0, requirement.estimatedHours - coveredHours);
      }, 0);
    return sum + projectGap;
  }, 0);
}

export function generateLensMetrics({
  activePeriodId,
  allocations,
  boardRisks,
  lens,
  metrics,
  people,
  periods,
  projects,
}: GenerateLensMetricsInput): LensMetric[] {
  const activePeriod = getActivePeriod(periods, activePeriodId);
  const periodAllocations = getPeriodAllocations(allocations, activePeriodId);
  const allocationsByTarget = getAllocationsByTarget(periodAllocations);
  const activeProjects = projects.filter((project) => isProjectActiveInPeriod(project, activePeriodId, allocationsByTarget));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const productivePeriodAllocations = periodAllocations.filter((allocation) => (
    isProductiveAllocationTarget(allocation, projectsById)
  ));

  if (lens === 'finance') {
    const marginK = Math.round((metrics.expectedRevenue - metrics.totalCost) * 10) / 10;
    return [
      { id: 'people-cost', label: 'Koszt ludzi', value: formatK(metrics.totalCost) },
      { id: 'committed-revenue', label: 'Podpisane revenue', value: formatK(metrics.committedRevenue), tone: metrics.committedRevenue >= metrics.totalCost ? 'success' : 'warning' },
      { id: 'expected-revenue', label: 'Prognoza revenue', value: formatK(metrics.expectedRevenue), tone: metrics.expectedRevenue >= metrics.targetRevenue ? 'success' : 'default' },
      { id: 'expected-margin', label: 'Marża vs koszt', value: formatK(marginK), tone: marginK < 0 ? 'danger' : 'success' },
      { id: 'target-gap', label: 'Brak do celu', value: formatK(metrics.pressureToTarget), tone: metrics.pressureToTarget > 0 ? 'warning' : 'success' },
    ];
  }

  if (lens === 'sales') {
    const ghostExpectedK = activeProjects
      .filter((project) => project.planningStatus === 'ghost')
      .reduce((sum, project) => {
        const plan = project.revenuePlan.find((entry) => entry.periodId === activePeriodId);
        return sum + (plan?.revenueK ?? project.budgetK) * (plan?.probability ?? project.probability);
      }, 0);
    const cheapDealWarnings = periodAllocations
      .flatMap((allocation) => allocation.validation || [])
      .filter((validation) => validation.code === 'target_revenue_gap' || validation.code === 'internal_margin_gap')
      .length;

    return [
      { id: 'expected-forecast', label: 'Prognoza sprzedaży', value: formatK(metrics.expectedRevenue) },
      { id: 'committed-coverage', label: 'Podpisane umowy', value: formatK(metrics.committedRevenue) },
      { id: 'ghost-expected', label: 'Szanse w pipeline', value: formatK(ghostExpectedK), tone: ghostExpectedK > 0 ? 'warning' : 'default' },
      { id: 'target-gap', label: 'Brak do celu', value: formatK(metrics.pressureToTarget), tone: metrics.pressureToTarget > 0 ? 'warning' : 'success' },
      { id: 'cheap-deal-warnings', label: 'Ryzyka stawek', value: String(cheapDealWarnings), tone: cheapDealWarnings > 0 ? 'danger' : 'default' },
    ];
  }

  if (lens === 'pm') {
    const requiredHoursGap = calculateRequiredHoursGap(activeProjects, allocationsByTarget, peopleById);
    const projectHours = productivePeriodAllocations
      .reduce((sum, allocation) => sum + allocation.hours, 0);
    const weeklyOverloadWeeks = activePeriod
      ? buildWeeklyDrilldown({ allocations, monthPeriod: activePeriod, people, periods, projects })
        .filter((week) => week.overloadedPeople > 0)
        .length
      : 0;
    const deliveryWarnings = periodAllocations
      .flatMap((allocation) => allocation.validation || [])
      .filter((validation) => (
        validation.code === 'missing_required_skill' ||
        validation.code === 'insufficient_hours' ||
        validation.code === 'insufficient_seniority' ||
        validation.code === 'role_mismatch' ||
        validation.code === 'person_collaboration_conflict'
      ))
      .length;

    return [
      { id: 'project-hours', label: 'Godziny projektowe', value: formatHours(projectHours) },
      { id: 'required-gap', label: 'Brakujące godziny', value: formatHours(requiredHoursGap), tone: requiredHoursGap > 0 ? 'danger' : 'success' },
      { id: 'weekly-overload', label: 'Tygodnie z przeciążeniem', value: String(weeklyOverloadWeeks), tone: weeklyOverloadWeeks > 0 ? 'danger' : 'default' },
      { id: 'delivery-warnings', label: 'Ryzyka realizacji', value: String(deliveryWarnings), tone: deliveryWarnings > 0 ? 'warning' : 'default' },
      { id: 'active-projects', label: 'Aktywne projekty', value: String(activeProjects.length) },
    ];
  }

  if (lens === 'hr') {
    const availableHours = people.reduce((sum, person) => sum + getPersonPeriodAvailableHours(person, activePeriodId), 0);
    const allocatedHours = productivePeriodAllocations.reduce((sum, allocation) => sum + allocation.hours, 0);
    const benchRevenueK = (allocationsByTarget.get('bench') || []).reduce((sum, allocation) => sum + allocation.revenueK, 0);
    const weeklyOverloadedPeople = activePeriod
      ? new Set(buildWeeklyDrilldown({ allocations, monthPeriod: activePeriod, people, periods, projects })
        .flatMap((week) => week.people.filter((entry) => entry.status === 'over').map((entry) => entry.personId))).size
      : 0;
    const utilization = availableHours ? Math.round((allocatedHours / availableHours) * 100) : 0;

    return [
      { id: 'available-hours', label: 'Dostępne godziny', value: formatHours(availableHours) },
      { id: 'allocated-hours', label: 'Zaplanowane godziny', value: formatHours(allocatedHours), tone: utilization > 100 ? 'danger' : 'default' },
      { id: 'utilization', label: 'Zajętość', value: `${utilization}%`, tone: utilization > 100 ? 'danger' : utilization > 85 ? 'warning' : 'default' },
      { id: 'bench-revenue', label: 'Cel na ławce', value: formatK(benchRevenueK), tone: benchRevenueK > 0 ? 'warning' : 'success' },
      { id: 'overloaded-people', label: 'Osoby przeciążone', value: String(weeklyOverloadedPeople), tone: weeklyOverloadedPeople > 0 ? 'danger' : 'default' },
    ];
  }

  return [
    { id: 'total-cost', label: 'Koszt ludzi', value: formatK(metrics.totalCost) },
    { id: 'target-revenue', label: 'Cel przychodu', value: formatK(metrics.targetRevenue) },
    { id: 'committed-gap', label: 'Brak w podpisanych', value: formatK(Math.max(0, metrics.targetRevenue - metrics.committedRevenue)), tone: metrics.targetRevenue > metrics.committedRevenue ? 'warning' : 'success' },
    { id: 'expected-gap', label: 'Brak w prognozie', value: formatK(metrics.pressureToTarget), tone: metrics.pressureToTarget > 0 ? 'warning' : 'success' },
    { id: 'major-risks', label: 'Ryzyka', value: String(boardRisks.filter((risk) => risk.id !== 'no-major-risks').length), tone: boardRisks.some((risk) => risk.severity === 'high') ? 'danger' : 'default' },
  ];
}
