import { AllocationValidation, BoardLens, isTimeOffProject, Period, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { isProjectActiveInPeriod } from './projectPeriod';
import { buildWeeklyDrilldown } from './weeklyDrilldown';

export interface PerspectiveSummaryItem {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

interface GeneratePerspectiveSummaryInput {
  activePeriodId: string;
  allocations: PersonTileAllocation[];
  lens: BoardLens;
  people?: Person[];
  periods?: Period[];
  projects?: ProjectFrame[];
}

const lensValidationCodes: Record<BoardLens, AllocationValidation['code'][]> = {
  management: [
    'internal_margin_gap',
    'target_revenue_gap',
    'missing_required_skill',
    'insufficient_hours',
    'insufficient_seniority',
    'role_mismatch',
    'blocked_person',
    'not_preferred_person',
    'person_collaboration_conflict',
    'over_allocated',
  ],
  finance: ['internal_margin_gap', 'target_revenue_gap'],
  sales: ['target_revenue_gap', 'internal_margin_gap'],
  pm: ['missing_required_skill', 'insufficient_hours', 'insufficient_seniority', 'role_mismatch', 'blocked_person', 'not_preferred_person', 'person_collaboration_conflict', 'over_allocated'],
  hr: ['role_mismatch', 'insufficient_seniority', 'blocked_person', 'not_preferred_person', 'person_collaboration_conflict', 'over_allocated'],
};

const validationLabels: Record<AllocationValidation['code'], string> = {
  internal_margin_gap: 'Revenue below cost',
  insufficient_hours: 'Missing required hours',
  insufficient_seniority: 'Insufficient seniority',
  missing_required_skill: 'Missing required skill',
  over_allocated: 'Person overload',
  role_mismatch: 'Role mismatch',
  blocked_person: 'Blocked person',
  not_preferred_person: 'Outside preferred team',
  person_collaboration_conflict: 'People collaboration conflict',
  target_revenue_gap: 'Rate below target',
  target_revenue_surplus: 'Rate above target',
};

function getCompactValidationMessage(validation: AllocationValidation) {
  switch (validation.code) {
    case 'target_revenue_gap': {
      const match = validation.message.match(/shortfall of ([0-9.]+k) PLN/) || validation.message.match(/brakuje ([0-9.]+k) PLN do celu/);
      return match ? `${match[1]} short of target` : 'below target';
    }
    case 'internal_margin_gap': {
      const match = validation.message.match(/leaving ([0-9.]+k) PLN uncovered/) || validation.message.match(/brakuje ([0-9.]+k) PLN do pokrycia kosztu/);
      return match ? `${match[1]} short of cost coverage` : 'below cost';
    }
    case 'insufficient_hours': {
      return validation.message.replace(/ (?:covered|pokrycia)\./, '').toLowerCase();
    }
    case 'missing_required_skill':
      return 'ambiguous skill';
    case 'insufficient_seniority':
      return 'seniority below requirements';
    case 'role_mismatch':
      return 'skill outside person profile';
    case 'blocked_person':
      return 'person blocked in project';
    case 'not_preferred_person':
      return 'outside preferred team';
    case 'person_collaboration_conflict':
      return 'collaboration conflict';
    case 'over_allocated':
      return 'person overload';
    case 'target_revenue_surplus': {
      const match = validation.message.match(/exceeding it by ([0-9.]+k) PLN/) || validation.message.match(/jest ([0-9.]+k) PLN powyżej celu/);
      return match ? `${match[1]} above target` : 'above target';
    }
  }
}

export function generatePerspectiveSummary({
  activePeriodId,
  allocations,
  lens,
  people = [],
  periods = [],
  projects = [],
}: GeneratePerspectiveSummaryInput): PerspectiveSummaryItem[] {
  const relevantCodes = new Set(lensValidationCodes[lens]);
  const activeAllocations = allocations.filter((allocation) => allocation.periodId === activePeriodId);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const validationRecords = activeAllocations
    .flatMap((allocation) => (allocation.validation || []).map((validation) => ({ allocation, validation })))
    .filter(({ validation }) => relevantCodes.has(validation.code));
  const codeCounts = validationRecords
    .map(({ validation }) => validation)
    .reduce((result, validation) => {
      const current = result.get(validation.code) || { invalid: 0, warning: 0, info: 0 };
      current[validation.severity] += 1;
      result.set(validation.code, current);
      return result;
    }, new Map<AllocationValidation['code'], Record<AllocationValidation['severity'], number>>());

  const items: PerspectiveSummaryItem[] = Array.from(codeCounts.entries()).map(([code, counts]) => {
    const total = counts.invalid + counts.warning + counts.info;
    const groupedExamples = Array.from(validationRecords
      .filter(({ validation }) => validation.code === code)
      .reduce((result, { allocation, validation }) => {
        const person = peopleById.get(allocation.personId);
        const project = projectsById.get(allocation.target);
        const owner = person?.name || allocation.personId;
        const target = project ? project.client : 'bench';
        const compactMessage = getCompactValidationMessage(validation);
        const key = `${owner}:${target}:${compactMessage}`;
        const current = result.get(key);

        result.set(key, {
          label: `${owner} -> ${target}`,
          message: compactMessage,
          count: (current?.count || 0) + 1,
        });
        return result;
      }, new Map<string, { label: string; message: string; count: number }>())
      .values());
    const examples = groupedExamples
      .slice(0, 2)
      .map((example) => `${example.label}: ${example.count}x ${example.message}`);
    const shownCount = groupedExamples.slice(0, 2).reduce((sum, example) => sum + example.count, 0);
    const remaining = total - shownCount;
    const exampleDetail = examples.length ? examples.join(' · ') : `${total} saved warnings in the active month.`;
    return {
      id: code,
      severity: counts.invalid > 0 ? 'high' : counts.warning > 0 ? 'medium' : 'low',
      title: validationLabels[code],
      detail: remaining > 0 ? `${exampleDetail} · +${remaining} similar` : exampleDetail,
    } satisfies PerspectiveSummaryItem;
  });

  items.unshift(...generateWeeklyPerspectiveItems({
    activePeriodId,
    allocations,
    lens,
    people,
    periods,
    projects,
  }));
  items.unshift(...generateGhostPipelineItems({
    activePeriodId,
    allocations,
    lens,
    projects,
  }));

  if (items.length) return items.slice(0, 4);

  return [{
    id: `${lens}-no-validation-warnings`,
    severity: 'low',
    title: 'No saved warnings',
    detail: 'No saved allocation warnings for this lens in the active month.',
  }];
}

function generateGhostPipelineItems({
  activePeriodId,
  allocations,
  lens,
  projects,
}: Required<Pick<GeneratePerspectiveSummaryInput, 'activePeriodId' | 'allocations' | 'lens' | 'projects'>>): PerspectiveSummaryItem[] {
  if (lens !== 'sales') return [];

  const periodAllocations = allocations.filter((allocation) => allocation.periodId === activePeriodId);
  const allocationsByTarget = periodAllocations.reduce((result, allocation) => {
    const current = result.get(allocation.target) || [];
    current.push(allocation);
    result.set(allocation.target, current);
    return result;
  }, new Map<string, PersonTileAllocation[]>());
  const ghostProjects = projects.filter((project) => (
    project.planningStatus === 'ghost' &&
    !isTimeOffProject(project) &&
    isProjectActiveInPeriod(project, activePeriodId, allocationsByTarget)
  ));

  if (!ghostProjects.length) return [];

  const ghostProjectIds = new Set(ghostProjects.map((project) => project.id));
  const plannedK = ghostProjects.reduce((sum, project) => (
    sum + (project.revenuePlan.find((plan) => plan.periodId === activePeriodId)?.revenueK ?? project.budgetK)
  ), 0);
  const expectedK = ghostProjects.reduce((sum, project) => {
    const plan = project.revenuePlan.find((entry) => entry.periodId === activePeriodId);
    const revenueK = plan?.revenueK ?? project.budgetK;
    const probability = plan?.probability ?? project.probability;
    return sum + revenueK * probability;
  }, 0);
  const reservedK = periodAllocations
    .filter((allocation) => ghostProjectIds.has(allocation.target))
    .reduce((sum, allocation) => sum + allocation.revenueK, 0);
  const reserveGapK = Math.max(0, Math.round((plannedK - reservedK) * 10) / 10);

  return [{
    id: 'ghost-pipeline-capacity',
    severity: reserveGapK >= 10 ? 'medium' : 'low',
    title: 'Pipeline reservation',
    detail: `${ghostProjects.length} sales opportunities: ${Math.round(plannedK * 10) / 10}k planned, ${Math.round(expectedK * 10) / 10}k expected, ${reservedK}k reserved. Gap: ${reserveGapK}k.`,
  }];
}

function generateWeeklyPerspectiveItems({
  activePeriodId,
  allocations,
  lens,
  people,
  periods,
  projects,
}: Required<Pick<GeneratePerspectiveSummaryInput, 'activePeriodId' | 'allocations' | 'lens' | 'people' | 'periods' | 'projects'>>): PerspectiveSummaryItem[] {
  if (lens !== 'pm' && lens !== 'hr') return [];

  const monthPeriod = periods.find((period) => period.id === activePeriodId && period.granularity === 'month');
  if (!monthPeriod || !people.length) return [];

  const drilldown = buildWeeklyDrilldown({
    allocations,
    monthPeriod,
    people,
    periods,
    projects,
  });
  const overloadedWeeks = drilldown.filter((week) => week.overloadedPeople > 0);
  const peakWeek = overloadedWeeks.sort((a, b) => b.overloadedPeople - a.overloadedPeople)[0];
  if (!peakWeek) return [];

  const overloadedPersonIds = new Set(overloadedWeeks.flatMap((week) => (
    week.people
      .filter((person) => person.status === 'over')
      .map((person) => person.personId)
  )));
  const overloadedNames = Array.from(overloadedPersonIds)
    .map((personId) => people.find((person) => person.id === personId)?.name || personId)
    .slice(0, 3);
  const namesLabel = overloadedNames.length ? `: ${overloadedNames.join(', ')}` : '';

  if (lens === 'pm') {
    const peakProject = peakWeek.projectWorkloads[0];
    return [{
      id: 'weekly-delivery-overload',
      severity: 'high',
      title: 'Weekly delivery overload',
      detail: `${overloadedWeeks.length} overloaded weeks. Peak: ${peakWeek.period.label}, ${peakWeek.overloadedPeople} people.${peakProject ? ` Highest workload: ${peakProject.client} ${peakProject.hours}h.` : ''}`,
    }];
  }

  return [{
    id: 'weekly-people-overload',
    severity: 'high',
    title: 'Weekly people overload',
    detail: `${overloadedPersonIds.size} people have weekly overload${namesLabel}. Peak: ${peakWeek.period.label}, ${peakWeek.overloadedPeople} people.`,
  }];
}
