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
  internal_margin_gap: 'Przychód poniżej kosztu',
  insufficient_hours: 'Brak wymaganych godzin',
  insufficient_seniority: 'Zbyt niski poziom seniority',
  missing_required_skill: 'Brak wymaganej kompetencji',
  over_allocated: 'Przeciążenie osoby',
  role_mismatch: 'Niedopasowanie roli',
  blocked_person: 'Zablokowana osoba',
  not_preferred_person: 'Poza preferowanym zespołem',
  person_collaboration_conflict: 'Konflikt współpracy osób',
  target_revenue_gap: 'Stawka poniżej celu',
  target_revenue_surplus: 'Stawka powyżej celu',
};

function getCompactValidationMessage(validation: AllocationValidation) {
  switch (validation.code) {
    case 'target_revenue_gap': {
      const match = validation.message.match(/brakuje ([0-9.]+k) PLN do celu/);
      return match ? `brakuje ${match[1]} do celu` : 'poniżej celu';
    }
    case 'internal_margin_gap': {
      const match = validation.message.match(/brakuje ([0-9.]+k) PLN do pokrycia kosztu/);
      return match ? `brakuje ${match[1]} do kosztu` : 'poniżej kosztu';
    }
    case 'insufficient_hours': {
      return validation.message.replace(' pokrycia.', '').toLowerCase();
    }
    case 'missing_required_skill':
      return 'niejednoznaczna kompetencja';
    case 'insufficient_seniority':
      return 'seniority poniżej wymagań';
    case 'role_mismatch':
      return 'kompetencja poza profilem osoby';
    case 'blocked_person':
      return 'osoba zablokowana w projekcie';
    case 'not_preferred_person':
      return 'poza preferowanym zespołem';
    case 'person_collaboration_conflict':
      return 'konflikt współpracy';
    case 'over_allocated':
      return 'przeciążenie osoby';
    case 'target_revenue_surplus': {
      const match = validation.message.match(/jest ([0-9.]+k) PLN powyżej celu/);
      return match ? `${match[1]} powyżej celu` : 'powyżej celu';
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
        const target = project ? project.client : 'ławka';
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
    const exampleDetail = examples.length ? examples.join(' · ') : `${total} zapisanych ostrzeżeń w aktywnym miesiącu.`;
    return {
      id: code,
      severity: counts.invalid > 0 ? 'high' : counts.warning > 0 ? 'medium' : 'low',
      title: validationLabels[code],
      detail: remaining > 0 ? `${exampleDetail} · +${remaining} podobne` : exampleDetail,
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
    title: 'Brak zapisanych ostrzeżeń',
    detail: 'Brak zapisanych ostrzeżeń alokacji dla tej soczewki w aktywnym miesiącu.',
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
    title: 'Rezerwacja pod pipeline',
    detail: `${ghostProjects.length} szans sprzedażowych: ${Math.round(plannedK * 10) / 10}k w planie, ${Math.round(expectedK * 10) / 10}k w prognozie, ${reservedK}k zarezerwowane. Brakuje: ${reserveGapK}k.`,
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
      title: 'Tygodniowe przeciążenie realizacji',
      detail: `${overloadedWeeks.length} tyg. z przeciążeniem. Najwięcej: ${peakWeek.period.label}, ${peakWeek.overloadedPeople} os.${peakProject ? ` Największe obciążenie: ${peakProject.client} ${peakProject.hours}h.` : ''}`,
    }];
  }

  return [{
    id: 'weekly-people-overload',
    severity: 'high',
    title: 'Tygodniowe przeciążenie ludzi',
    detail: `${overloadedPersonIds.size} os. ma przeciążenie tygodniowe${namesLabel}. Najwięcej: ${peakWeek.period.label}, ${peakWeek.overloadedPeople} os.`,
  }];
}
