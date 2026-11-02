import {
  getEffectiveAllocationRequirement,
  getEffectiveAllocationSkillId,
  hasEnoughSeniority,
  isProductiveAllocationTarget,
  isTimeOffProject,
  Period,
  Person,
  personCanCoverRequirement,
  PersonTileAllocation,
  ProjectFrame,
  SkillId,
} from '../models/traffic.model';
import { calculateAllocationInternalMarginGapK, calculateAllocationTargetGapK } from './allocationCalculations';
import { getPersonPeriodProfile } from './personPeriod';
import { getPersonPeriodUtilization } from './personUtilization';
import { buildWeeklyDrilldown } from './weeklyDrilldown';
import { isProjectActiveInPeriod } from './projectPeriod';
import { MEANINGFUL_FRAGMENTATION_TARGET_HOURS, isProjectSourceMismatch } from './visualInventory';

export type TrafficReviewMode = 'short' | 'long';
export type TrafficReviewOwner = 'ALL' | 'HR' | 'PM' | 'TECH' | 'SALES' | 'FINANCE';
export type TrafficReviewSeverity = 'high' | 'medium' | 'low';

export interface TrafficReviewTrigger {
  id: string;
  owner: TrafficReviewOwner;
  severity: TrafficReviewSeverity;
  title: string;
  detail: string;
  action: string;
  projectId?: string;
  personId?: string;
  allocationId?: string;
  periodId?: string;
}

export interface TrafficReviewChecklistItem {
  id: string;
  owner: TrafficReviewOwner;
  label: string;
  status: 'ok' | 'attention';
  detail: string;
}

export interface TrafficReviewSummary {
  mode: TrafficReviewMode;
  horizonLabel: string;
  checklist: TrafficReviewChecklistItem[];
  triggers: TrafficReviewTrigger[];
}

interface GenerateTrafficReviewInput {
  activePeriodId: string;
  allocations: PersonTileAllocation[];
  people: Person[];
  periods: Period[];
  projects: ProjectFrame[];
  mode: TrafficReviewMode;
}

export function generateTrafficReview({
  activePeriodId,
  allocations,
  people,
  periods,
  projects,
  mode,
}: GenerateTrafficReviewInput): TrafficReviewSummary {
  const triggers = mode === 'short'
    ? generateShortTermTriggers({ activePeriodId, allocations, people, periods, projects })
    : generateLongTermTriggers({ activePeriodId, allocations, people, periods, projects });

  return {
    mode,
    horizonLabel: mode === 'short' ? 'tydzień do przodu' : '3 miesiące do przodu',
    checklist: buildChecklist(mode, triggers),
    triggers: sortTriggers(triggers).slice(0, 12),
  };
}

function generateShortTermTriggers(input: Omit<GenerateTrafficReviewInput, 'mode'>): TrafficReviewTrigger[] {
  const { activePeriodId, allocations, people, periods, projects } = input;
  const periodPeople = people.map((person) => getPersonPeriodProfile(person, activePeriodId));
  const periodAllocations = allocations.filter((allocation) => allocation.periodId === activePeriodId);
  const peopleById = new Map(periodPeople.map((person) => [person.id, person]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const productiveAllocations = periodAllocations.filter((allocation) => isProductiveAllocationTarget(allocation, projectsById));
  const allocationsByTarget = groupAllocationsByTarget(periodAllocations);
  const triggers: TrafficReviewTrigger[] = [];

  getPeopleWithManyProjectTargets(productiveAllocations, peopleById).forEach(({ person, targetCount, hours }) => {
    const isExceptionRole = person.skillIds.includes('design') || person.skillIds.includes('qa');
    triggers.push({
      id: `short-person-many-projects-${person.id}`,
      owner: 'PM',
      severity: isExceptionRole ? 'low' : 'medium',
      title: `${person.name}: wiele projektów`,
      detail: `${person.name} pracuje w ${targetCount} projektach / ${roundHours(hours)}h w aktywnym miesiącu.`,
      action: 'Sprawdzić obciążenie, realność kontekstu i czy potrzebna jest rotacja lub odciążenie.',
      personId: person.id,
      periodId: activePeriodId,
    });
  });

  periodPeople.forEach((person) => {
    const utilization = getPersonPeriodUtilization(person, activePeriodId, allocations, projectsById);
    const productiveHours = productiveAllocations
      .filter((allocation) => allocation.personId === person.id)
      .reduce((sum, allocation) => sum + allocation.hours, 0);
    if (productiveHours === 0 && utilization.availableHours > 0) {
      triggers.push({
        id: `short-person-no-project-${person.id}`,
        owner: 'HR',
        severity: 'medium',
        title: `${person.name}: bez projektu`,
        detail: `${person.name} ma ${utilization.availableHours}h dostępności i brak produktywnej alokacji.`,
        action: 'Przypisać zadanie, zaplanować R&D/ławkę lub potwierdzić urlop/offboarding.',
        personId: person.id,
        periodId: activePeriodId,
      });
    }

    const periodOverride = person.monthlyOverrides?.find((override) => override.periodId === activePeriodId);
    const overrideStatus = periodOverride?.status;
    if (productiveHours > 0 && (overrideStatus === 'holiday' || overrideStatus === 'unavailable' || overrideStatus === 'notice_period')) {
      triggers.push({
        id: `short-hr-calendar-${person.id}`,
        owner: 'HR',
        severity: 'high',
        title: `${person.name}: konflikt z kalendarzem HR`,
        detail: `${person.name} ma status ${overrideStatus}, ale jest zaplanowany w projektach.`,
        action: 'Zaktualizować dostępność albo przesunąć alokacje przed planningiem.',
        personId: person.id,
        periodId: activePeriodId,
      });
    }

    const onboardingSignal = hasOnboardingSignal(periodOverride?.status, periodOverride?.note);
    if (onboardingSignal && utilization.availableHours > 0 && productiveHours > 0 && productiveHours / utilization.availableHours < 0.5) {
      triggers.push({
        id: `short-ineffective-onboarding-${person.id}`,
        owner: 'HR',
        severity: 'medium',
        title: `${person.name}: onboarding do sprawdzenia`,
        detail: `${person.name} ma ${roundHours(productiveHours)}h produktywnej alokacji przy ${utilization.availableHours}h dostępności i sygnale onboarding/partial.`,
        action: 'Sprawdzić dostęp, środowisko, zrozumienie zadań i dodać mentora lub mikro-zlecenia.',
        personId: person.id,
        periodId: activePeriodId,
      });
    }
  });

  projects
    .filter((project) => isProjectActiveInPeriod(project, activePeriodId, allocationsByTarget))
    .forEach((project) => {
      const projectAllocations = allocationsByTarget.get(project.id) || [];
      const uniquePeople = new Set(projectAllocations.map((allocation) => allocation.personId));
      if (!projectAllocations.length) {
        triggers.push({
          id: `short-project-no-resources-${project.id}`,
          owner: 'PM',
          severity: 'high',
          title: `${project.client}: bez zasobów`,
          detail: 'Projekt jest aktywny w miesiącu, ale nie ma przypisanych kafelków.',
          action: 'Dodać przynajmniej jedną nie-junior osobę albo zawiesić projekt.',
          projectId: project.id,
          periodId: activePeriodId,
        });
      }
      if (projectAllocations.length && uniquePeople.size === 1) {
        const person = peopleById.get(projectAllocations[0].personId);
        triggers.push({
          id: `short-project-single-point-${project.id}`,
          owner: 'TECH',
          severity: 'medium',
          title: `${project.client}: single point of failure`,
          detail: `Tylko ${person?.name || 'jedna osoba'} jest przypisana do projektu.`,
          action: 'Zaplanować backup, shadowing albo drugą osobę znającą kontekst.',
          projectId: project.id,
          personId: person?.id,
          periodId: activePeriodId,
        });
      }
      const orderingGap = getCoreSkillOrderingGap(project, projectAllocations, peopleById);
      if (orderingGap) {
        triggers.push({
          id: `short-core-order-${project.id}`,
          owner: 'TECH',
          severity: 'medium',
          title: `${project.client}: kolejność BE/FE/QA`,
          detail: orderingGap,
          action: 'Przeorganizować kolejność prac, dodać brakującą rolę albo potwierdzić, że zależność nie dotyczy tego zakresu.',
          projectId: project.id,
          periodId: activePeriodId,
        });
      }
      if (isWaitingOrLowValueProject(project) && projectAllocations.length) {
        triggers.push({
          id: `short-waiting-project-${project.id}`,
          owner: project.planningStatus === 'ghost' ? 'SALES' : 'PM',
          severity: 'medium',
          title: `${project.client}: projekt poczekalnia / low value`,
          detail: `${project.client} ma status ${project.planningStatus || project.stage} i spala ${sumRevenue(projectAllocations)}k.`,
          action: 'Zweryfikować sens projektu, deal lub przenieść ludzi do komercyjnego zakresu.',
          projectId: project.id,
          periodId: activePeriodId,
        });
      }
      if (isProjectSourceMismatch(project)) {
        triggers.push({
          id: `short-source-mismatch-${project.id}`,
          owner: 'SALES',
          severity: project.sourceStatus === 'source_missing' ? 'high' : 'medium',
          title: `${project.client}: źródło/scope nieaktualne`,
          detail: getProjectSourceMismatchDetail(project),
          action: 'Uaktualnić CRM/brief/source, budżet i staffing przed poniedziałkowym planningiem.',
          projectId: project.id,
          periodId: activePeriodId,
        });
      }

      const budgetGapK = getProjectBudgetGapK(project, projectAllocations);
      if (budgetGapK > 0) {
        triggers.push({
          id: `short-project-team-cost-${project.id}`,
          owner: 'FINANCE',
          severity: budgetGapK >= 8 ? 'high' : 'medium',
          title: `${project.client}: koszt zespołu ponad budżet`,
          detail: `Alokacje przekraczają ramkę projektu o ${roundMoney(budgetGapK)}k.`,
          action: 'Zmniejszyć obsadę, renegocjować finansowanie albo zmienić zakres.',
          projectId: project.id,
          periodId: activePeriodId,
        });
      }
    });

  const financialGaps = productiveAllocations
    .map((allocation) => ({
      allocation,
      project: projectsById.get(allocation.target),
      person: peopleById.get(allocation.personId),
    }))
    .map((entry) => ({
      ...entry,
      internalGapK: calculateAllocationInternalMarginGapK(entry.allocation, entry.person),
      targetGapK: calculateAllocationTargetGapK(entry.allocation, entry.project, entry.person),
    }))
    .filter((entry) => entry.internalGapK > 0 || entry.targetGapK > 0);

  financialGaps.slice(0, 3).forEach(({ allocation, project, person, internalGapK, targetGapK }) => {
    const gapK = Math.max(internalGapK, targetGapK);
    triggers.push({
      id: `short-low-margin-${allocation.id}`,
      owner: 'FINANCE',
      severity: gapK >= 5 ? 'high' : 'medium',
      title: `${project?.client || allocation.target}: budżet / marża do sprawdzenia`,
      detail: `${person?.name || allocation.personId}: luka ${roundMoney(gapK)}k względem kosztu lub targetu.`,
      action: 'Skorygować staffing, stawkę, scope albo zaakceptować świadomy wyjątek.',
      allocationId: allocation.id,
      projectId: project?.id,
      personId: person?.id || allocation.personId,
      periodId: allocation.periodId,
    });
  });

  productiveAllocations
    .filter((allocation) => allocation.meetingState?.mentoring && !allocation.meetingState.backup)
    .slice(0, 3)
    .forEach((allocation) => {
      const person = peopleById.get(allocation.personId);
      const project = projectsById.get(allocation.target);
      triggers.push({
        id: `short-missing-backup-${allocation.id}`,
        owner: 'TECH',
        severity: 'medium',
        title: `${project?.client || allocation.target}: mentoring bez backupu`,
        detail: `${person?.name || allocation.personId} ma mentoring, ale brak markera backup.`,
        action: 'Dodać backup, shadowing albo potwierdzić, że mentoring nie tworzy single point of failure.',
        allocationId: allocation.id,
        projectId: project?.id,
        personId: person?.id || allocation.personId,
        periodId: allocation.periodId,
      });
    });

  const mentoringByPerson = countAllocationsByPerson(productiveAllocations.filter((allocation) => allocation.meetingState?.mentoring));
  mentoringByPerson.forEach((count, personId) => {
    const person = peopleById.get(personId);
    if (person && (person.seniority === 'senior' || person.seniority === 'lead') && count > 2) {
      triggers.push({
        id: `short-mentoring-overload-${person.id}`,
        owner: 'TECH',
        severity: 'medium',
        title: `${person.name}: przeciążenie mentoringiem`,
        detail: `${person.name} ma ${count} kafelków oznaczonych jako mentoring.`,
        action: 'Przekazać część obowiązków innemu seniorowi albo dodać kopilota.',
        personId: person.id,
        periodId: activePeriodId,
      });
    }
  });

  const activePeriod = periods.find((period) => period.id === activePeriodId);
  if (activePeriod?.granularity === 'month') {
    buildWeeklyDrilldown({ monthPeriod: activePeriod, periods, people, projects, allocations })
      .filter((week) => week.overloadedPeople > 0)
      .slice(0, 2)
      .forEach((week) => {
        triggers.push({
          id: `short-week-overload-${week.period.id}`,
          owner: 'PM',
          severity: 'high',
          title: `${week.period.label}: przeciążenie tygodnia`,
          detail: `${week.overloadedPeople} osób przekracza dostępność w tym tygodniu.`,
          action: 'Przesunąć godziny tygodniowe, zmniejszyć zakres albo dodać zasób.',
          periodId: week.period.id,
        });
      });
  }

  periodAllocations
    .flatMap((allocation) => (allocation.validation || []).map((validation) => ({ allocation, validation })))
    .filter(({ validation }) => validation.severity !== 'info')
    .slice(0, 4)
    .forEach(({ allocation, validation }) => {
      const person = peopleById.get(allocation.personId);
      const project = projectsById.get(allocation.target);
      triggers.push({
        id: `short-validation-${allocation.id}-${validation.code}`,
        owner: getValidationOwner(validation.code),
        severity: validation.severity === 'invalid' ? 'high' : 'medium',
        title: `${person?.name || allocation.personId}: ${validation.message}`,
        detail: project ? `${project.client}: ${project.name}` : 'Ławka / nieprzypisane',
        action: 'Poprawić mapowanie alokacji lub potwierdzić wyjątek na spotkaniu traffic.',
        allocationId: allocation.id,
        projectId: project?.id,
        personId: person?.id || allocation.personId,
        periodId: allocation.periodId,
      });
    });

  return triggers;
}

function generateLongTermTriggers(input: Omit<GenerateTrafficReviewInput, 'mode'>): TrafficReviewTrigger[] {
  const { activePeriodId, allocations, people, periods, projects } = input;
  const horizonPeriods = getThreeMonthHorizon(periods, activePeriodId);
  const horizonPeriodIds = new Set(horizonPeriods.map((period) => period.id));
  const horizonAllocations = allocations.filter((allocation) => horizonPeriodIds.has(allocation.periodId));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const productiveAllocations = horizonAllocations.filter((allocation) => isProductiveAllocationTarget(allocation, projectsById));
  const triggers: TrafficReviewTrigger[] = [];

  const uncertainProjects = projects.filter((project) => (
    isProjectInHorizon(project, horizonPeriodIds, productiveAllocations) &&
    (project.stage === 'likely' || project.stage === 'possible' || project.planningStatus === 'ghost')
  ));
  if (uncertainProjects.length >= 2) {
    triggers.push({
      id: 'long-uncertain-projects',
      owner: 'SALES',
      severity: uncertainProjects.length >= 4 ? 'high' : 'medium',
      title: 'Dominują niepewne projekty',
      detail: `${uncertainProjects.length} projektów w horyzoncie to likely/possible/ghost.`,
      action: 'Sales dopina deal albo PM oznacza realny scenariusz pesymistyczny.',
    });
  }

  const signedRevenue = productiveAllocations
    .filter((allocation) => projects.find((project) => project.id === allocation.target)?.stage === 'signed')
    .reduce((sum, allocation) => sum + allocation.revenueK, 0);
  const totalRevenue = productiveAllocations.reduce((sum, allocation) => sum + allocation.revenueK, 0);
  if (totalRevenue > 0 && signedRevenue / totalRevenue < 0.5) {
    triggers.push({
      id: 'long-too-little-green',
      owner: 'SALES',
      severity: 'medium',
      title: 'Za mało podpisanej pracy',
      detail: `Podpisane projekty niosą ${Math.round((signedRevenue / totalRevenue) * 100)}% alokacji w horyzoncie.`,
      action: 'Pozyskać stabilne projekty albo ograniczyć rezerwacje o niskiej pewności.',
    });
  }

  const lowValueRevenue = productiveAllocations
    .filter((allocation) => {
      const project = projects.find((item) => item.id === allocation.target);
      return project ? isWaitingOrLowValueProject(project) : false;
    })
    .reduce((sum, allocation) => sum + allocation.revenueK, 0);
  if (totalRevenue > 0 && lowValueRevenue / totalRevenue > 0.35) {
    triggers.push({
      id: 'long-too-much-low-value',
      owner: 'FINANCE',
      severity: lowValueRevenue / totalRevenue > 0.55 ? 'high' : 'medium',
      title: 'Za dużo low-value / poczekalni',
      detail: `${Math.round((lowValueRevenue / totalRevenue) * 100)}% alokacji w horyzoncie siedzi w ghost/possible/defensive/R&D/poczekalni.`,
      action: 'Finance i Sales oceniają ROI, a PM przesuwa capacity do komercyjnych projektów.',
    });
  }

  people.forEach((person) => {
    const utilization = getPersonPeriodUtilization(person, activePeriodId, allocations, projectsById);
    if (utilization.availableHours > 0 && utilization.utilizationPercent < 50) {
      triggers.push({
        id: `long-underloaded-${person.id}`,
        owner: 'HR',
        severity: utilization.utilizationPercent === 0 ? 'high' : 'medium',
        title: `${person.name}: za mało pracy`,
        detail: `${utilization.utilizationPercent}% wykorzystania w aktywnym miesiącu.`,
        action: 'Zaplanować R&D, krótkie sprinty, wsparcie ofertowe albo przesunięcie do projektu.',
        personId: person.id,
        periodId: activePeriodId,
      });
    }

    const horizonUtilization = horizonPeriods.map((period) => {
      const periodUtilization = getPersonPeriodUtilization(person, period.id, allocations, projectsById);
      const productiveHours = productiveAllocations
        .filter((allocation) => allocation.personId === person.id && allocation.periodId === period.id)
        .reduce((sum, allocation) => sum + allocation.hours, 0);
      const override = person.monthlyOverrides?.find((item) => item.periodId === period.id);
      return { period, productiveHours, utilization: periodUtilization, override };
    });
    const lowMonths = horizonUtilization.filter((item) => (
      item.utilization.availableHours > 0 && item.utilization.utilizationPercent < 50
    ));
    if (lowMonths.length >= 2) {
      triggers.push({
        id: `long-recurring-underload-${person.id}`,
        owner: 'HR',
        severity: lowMonths.some((item) => item.utilization.utilizationPercent === 0) ? 'high' : 'medium',
        title: `${person.name}: cykliczna luka obłożenia`,
        detail: `${lowMonths.length} mies. w horyzoncie ma mniej niż 50% wykorzystania.`,
        action: 'HR/PM planuje równomierne rotacje, R&D, sales support albo redukcję przyszłej luki.',
        personId: person.id,
      });
    }

    const hrConflicts = horizonUtilization.filter((item) => (
      item.productiveHours > 0 &&
      (item.override?.status === 'holiday' || item.override?.status === 'unavailable' || item.override?.status === 'notice_period')
    ));
    if (hrConflicts.length) {
      triggers.push({
        id: `long-hr-horizon-gap-${person.id}`,
        owner: 'HR',
        severity: hrConflicts.some((item) => item.override?.status === 'notice_period' || item.override?.status === 'unavailable') ? 'high' : 'medium',
        title: `${person.name}: urlop/koniec umowy w horyzoncie`,
        detail: `${person.name} ma ${hrConflicts.map((item) => `${item.period.label}: ${item.override?.status}`).join(', ')} mimo zaplanowanej pracy.`,
        action: 'HR organizuje zastępstwo, PM przesuwa przydziały, a Finance koryguje budżet lub marżę jeśli luka jest kadrowa.',
        personId: person.id,
      });
    }

    const onboardingMonths = horizonUtilization.filter((item) => (
      hasOnboardingSignal(item.override?.status, item.override?.note) &&
      item.utilization.availableHours > 0 &&
      item.productiveHours > 0 &&
      item.productiveHours / item.utilization.availableHours < 0.5
    ));
    if (onboardingMonths.length) {
      triggers.push({
        id: `long-ineffective-onboarding-${person.id}`,
        owner: 'HR',
        severity: 'medium',
        title: `${person.name}: onboarding nie skaluje pracy`,
        detail: `${onboardingMonths.map((item) => item.period.label).join(', ')} ma sygnał onboarding/partial i mniej niż 50% produktywnej alokacji.`,
        action: 'PM/HR dodaje mentora, mikro-zadania, dostęp do środowiska albo redefiniuje plan wdrożenia.',
        personId: person.id,
      });
    }

    const seniorSimpleWork = getSeniorSimpleWorkTrigger(person, productiveAllocations, projectsById);
    if (seniorSimpleWork) triggers.push(seniorSimpleWork);

    const rotationTrigger = getMixedProjectRotationTrigger(person, productiveAllocations, projectsById);
    if (rotationTrigger) triggers.push(rotationTrigger);
  });

  const futurePeriods = horizonPeriods.filter((period) => period.id !== activePeriodId);
  const hasFutureWork = futurePeriods.some((period) => (
    allocations.some((allocation) => allocation.periodId === period.id && isProductiveAllocationTarget(allocation, projectsById)) ||
    projects.some((project) => !isTimeOffProject(project) && project.revenuePlan.some((plan) => plan.periodId === period.id && plan.revenueK > 0))
  ));
  if (futurePeriods.length && !hasFutureWork) {
    triggers.push({
      id: 'long-empty-future-horizon',
      owner: 'PM',
      severity: 'high',
      title: 'Pusty horyzont przyszły',
      detail: `Brak widocznej pracy po ${horizonPeriods[0]?.label || activePeriodId}.`,
      action: 'Uzupełnić backlog/pipeline albo zaplanować bench/redukcję obciążenia.',
    });
  }

  const loadTrend = getHorizonLoadTrend(horizonPeriods, allocations, projectsById);
  if (loadTrend) {
    triggers.push(loadTrend);
  }

  projects
    .filter((project) => isProjectInHorizon(project, horizonPeriodIds, productiveAllocations))
    .forEach((project) => {
      const projectAllocations = productiveAllocations.filter((allocation) => allocation.target === project.id);
      const uniquePeople = new Set(projectAllocations.map((allocation) => allocation.personId));
      if (projectAllocations.length && uniquePeople.size === 1) {
        triggers.push({
          id: `long-single-point-${project.id}`,
          owner: 'TECH',
          severity: 'medium',
          title: `${project.client}: single point of failure`,
          detail: 'W horyzoncie projektu jest tylko jedna osoba z kontekstem.',
          action: 'Tech Lead planuje shadowing, zastępstwo albo drugi owner techniczny.',
          projectId: project.id,
        });
      }
      getContractEndReplacementTriggers(project, projectAllocations, peopleById, horizonPeriods).forEach((trigger) => {
        triggers.push(trigger);
      });

      const requiredSkillIds = new Set(project.requirements.filter((requirement) => requirement.required).map((requirement) => requirement.skillId));
      const allocatedSkillIds = new Set(projectAllocations.map((allocation) => allocation.skillId).filter(Boolean));
      const missingCore = ['backend', 'frontend', 'qa'].filter((skillId) => (
        requiredSkillIds.has(skillId as never) && !allocatedSkillIds.has(skillId as never)
      ));
      if (missingCore.length) {
        triggers.push({
          id: `long-missing-core-${project.id}`,
          owner: 'TECH',
          severity: 'medium',
          title: `${project.client}: brak ${missingCore.join('/')}`,
          detail: 'W horyzoncie brakuje jednej z kluczowych kompetencji wymaganych przez projekt.',
          action: 'Dodać brakujący resource albo zmienić kolejność prac.',
          projectId: project.id,
        });
      }

      const scopeWithoutStaffing = project.revenuePlan
        .filter((plan) => horizonPeriodIds.has(plan.periodId))
        .some((plan) => plan.revenueK > 0 && !allocations.some((allocation) => (
          allocation.periodId === plan.periodId &&
          allocation.target === project.id &&
          allocation.target !== 'bench'
        )));
      if (scopeWithoutStaffing) {
        triggers.push({
          id: `long-scope-without-staffing-${project.id}`,
          owner: 'PM',
          severity: 'medium',
          title: `${project.client}: scope bez staffing-u`,
          detail: 'Projekt ma plan przychodu w horyzoncie, ale przynajmniej jeden miesiąc nie ma obsady.',
          action: 'PM eskaluje do Sales/Finance albo uzupełnia staffing przed kolejnym long-term traffic.',
          projectId: project.id,
        });
      }

      if (isProjectSourceMismatch(project)) {
        triggers.push({
          id: `long-source-mismatch-${project.id}`,
          owner: 'SALES',
          severity: project.sourceStatus === 'source_missing' ? 'high' : 'medium',
          title: `${project.client}: source system nie domyka scope`,
          detail: getProjectSourceMismatchDetail(project),
          action: 'Sales/PM aktualizuje źródło prawdy i sprawdza, czy zmiana scope wymaga korekty forecastu lub obsady.',
          projectId: project.id,
        });
      }

      const plannedRevenueK = project.revenuePlan
        .filter((plan) => horizonPeriodIds.has(plan.periodId))
        .reduce((sum, plan) => sum + plan.revenueK, 0);
      const allocatedRevenueK = projectAllocations.reduce((sum, allocation) => sum + allocation.revenueK, 0);
      const overPromiseGapK = Math.max(0, plannedRevenueK - allocatedRevenueK);
      if (plannedRevenueK > 0 && overPromiseGapK >= 8 && (project.stage === 'likely' || project.stage === 'possible' || project.planningStatus === 'ghost')) {
        triggers.push({
          id: `long-over-promise-${project.id}`,
          owner: 'SALES',
          severity: overPromiseGapK >= 16 ? 'high' : 'medium',
          title: `${project.client}: over-promise bez capacity`,
          detail: `Plan/pipeline pokazuje ${roundMoney(plannedRevenueK)}k, a obsada niesie ${roundMoney(allocatedRevenueK)}k.`,
          action: 'Sales i PM windują obietnicę do realnego planu albo robią pre-booking zasobów.',
          projectId: project.id,
        });
      }

      getCompetencyMismatchTriggers(project, projectAllocations, peopleById).forEach((trigger) => {
        triggers.push(trigger);
      });
    });

  return triggers;
}

function buildChecklist(mode: TrafficReviewMode, triggers: TrafficReviewTrigger[]): TrafficReviewChecklistItem[] {
  const hasOwnerAttention = (owner: TrafficReviewOwner) => triggers.some((trigger) => trigger.owner === owner);
  const hasHigh = triggers.some((trigger) => trigger.severity === 'high');

  if (mode === 'short') {
    return [
      checklistItem('short-prework', 'ALL', 'Reset i pre-work boardu', triggers.length ? 'attention' : 'ok', `${triggers.length} sygnałów do przejścia przed planningiem.`),
      checklistItem('short-hr', 'HR', 'Obecność, urlopy, offboarding, onboarding', hasOwnerAttention('HR') ? 'attention' : 'ok', 'Sprawdź tylko jeśli HR ma sygnały na liście.'),
      checklistItem('short-board-fill', 'PM', 'Wstępne wypełnienie tablicy i konflikty', hasOwnerAttention('PM') || hasHigh ? 'attention' : 'ok', 'Priorytety i konflikty powinny być domknięte przed poniedziałkiem.'),
      checklistItem('short-tech', 'TECH', 'Kolejność BE/FE/QA, backup, mentoring', hasOwnerAttention('TECH') ? 'attention' : 'ok', 'Tech Lead sprawdza tylko projekty z triggerami.'),
      checklistItem('short-actions', 'ALL', 'Akcje uzupełniające', triggers.length ? 'attention' : 'ok', 'Każdy trigger ma właściciela i oczekiwaną decyzję.'),
    ];
  }

  return [
    checklistItem('long-pipeline', 'SALES', 'Pipeline i pewność projektów', hasOwnerAttention('SALES') ? 'attention' : 'ok', 'Sprawdź, czy 3-miesięczny horyzont ma stabilną pracę.'),
    checklistItem('long-capacity', 'HR', 'Przyszłe przeciążenia i niedociążenia', hasOwnerAttention('HR') ? 'attention' : 'ok', 'HR sprawdza luki, urlopy i potencjalny bench.'),
    checklistItem('long-tech', 'TECH', 'Seniorzy, backup i luki kompetencji', hasOwnerAttention('TECH') ? 'attention' : 'ok', 'Tech Lead sprawdza single point of failure i brakujące role.'),
    checklistItem('long-finance', 'FINANCE', 'Budżet, marża, fixed-price burn', hasOwnerAttention('FINANCE') ? 'attention' : 'ok', 'Finance wchodzi tylko gdy pojawi się sygnał finansowy.'),
    checklistItem('long-actions', 'ALL', 'Decyzje i akcje uzupełniające', triggers.length ? 'attention' : 'ok', 'Ustal ownera i deadline dla każdego triggera.'),
  ];
}

function checklistItem(
  id: string,
  owner: TrafficReviewOwner,
  label: string,
  status: TrafficReviewChecklistItem['status'],
  detail: string
): TrafficReviewChecklistItem {
  return { id, owner, label, status, detail };
}

function getPeopleWithManyProjectTargets(allocations: PersonTileAllocation[], peopleById: Map<string, Person>) {
  const groups = allocations.reduce((result, allocation) => {
    const current = result.get(allocation.personId) || { targetHours: new Map<string, number>() };
    current.targetHours.set(allocation.target, (current.targetHours.get(allocation.target) || 0) + allocation.hours);
    result.set(allocation.personId, current);
    return result;
  }, new Map<string, { targetHours: Map<string, number> }>());

  return Array.from(groups.entries()).flatMap(([personId, group]) => {
    const person = peopleById.get(personId);
    const meaningfulTargets = Array.from(group.targetHours.values())
      .filter((hours) => hours >= MEANINGFUL_FRAGMENTATION_TARGET_HOURS);
    const hours = meaningfulTargets.reduce((sum, value) => sum + value, 0);
    return person && meaningfulTargets.length > 1
      ? [{ person, targetCount: meaningfulTargets.length, hours }]
      : [];
  });
}

function countAllocationsByPerson(allocations: PersonTileAllocation[]) {
  return allocations.reduce((result, allocation) => {
    result.set(allocation.personId, (result.get(allocation.personId) || 0) + 1);
    return result;
  }, new Map<string, number>());
}

function groupAllocationsByTarget(allocations: PersonTileAllocation[]) {
  return allocations.reduce((result, allocation) => {
    const current = result.get(allocation.target) || [];
    current.push(allocation);
    result.set(allocation.target, current);
    return result;
  }, new Map<string, PersonTileAllocation[]>());
}

function getThreeMonthHorizon(periods: Period[], activePeriodId: string) {
  const activePeriod = periods.find((period) => period.id === activePeriodId);
  const monthPeriods = periods
    .filter((period) => period.granularity === 'month')
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const activeIndex = monthPeriods.findIndex((period) => period.id === activePeriodId);

  if (activeIndex >= 0) return monthPeriods.slice(activeIndex, activeIndex + 3);
  return activePeriod ? [activePeriod] : [];
}

function isProjectInHorizon(
  project: ProjectFrame,
  horizonPeriodIds: Set<string>,
  allocations: PersonTileAllocation[]
) {
  if (isTimeOffProject(project)) return false;
  return (
    project.revenuePlan.some((plan) => horizonPeriodIds.has(plan.periodId) && plan.revenueK > 0) ||
    allocations.some((allocation) => allocation.target === project.id)
  );
}

function isWaitingOrLowValueProject(project: ProjectFrame) {
  return (
    project.planningStatus === 'ghost' ||
    project.stage === 'possible' ||
    project.stage === 'defensive' ||
    project.workType === 'research_development' ||
    project.workType === 'waiting_room' ||
    project.workType === 'defensive_maintenance'
  );
}

function getProjectSourceMismatchDetail(project: ProjectFrame) {
  const note = project.sourceStatusNote?.trim();
  if (note) return `${project.client}: ${note}`;
  return project.sourceStatus === 'source_missing'
    ? `${project.client}: brakuje wpisu lub potwierdzenia w CRM/źródle.`
    : `${project.client}: scope zmienił się, ale CRM/źródło nie zostało zaktualizowane.`;
}

function sumRevenue(allocations: PersonTileAllocation[]) {
  return allocations.reduce((sum, allocation) => sum + allocation.revenueK, 0);
}

function getProjectBudgetGapK(project: ProjectFrame, allocations: PersonTileAllocation[]) {
  const allocatedRevenue = sumRevenue(allocations);
  const periodPlanRevenue = project.revenuePlan.find((plan) => allocations.some((allocation) => allocation.periodId === plan.periodId))?.revenueK;
  const budgetK = periodPlanRevenue ?? project.budgetK;
  return Math.max(0, allocatedRevenue - budgetK);
}

function getValidationOwner(code: string): TrafficReviewOwner {
  if (code.includes('seniority') || code.includes('skill') || code === 'role_mismatch') return 'TECH';
  if (code.includes('margin') || code.includes('revenue')) return 'FINANCE';
  if (code.includes('collaboration')) return 'HR';
  return 'PM';
}

function hasOnboardingSignal(status: NonNullable<Person['monthlyOverrides']>[number]['status'] | undefined, note: string | undefined) {
  const noteValue = note?.toLowerCase() || '';
  return status === 'partial_availability' || noteValue.includes('onboarding') || noteValue.includes('wdroż') || noteValue.includes('wdroz');
}

function getCoreSkillOrderingGap(
  project: ProjectFrame,
  projectAllocations: PersonTileAllocation[],
  peopleById: Map<string, Person>
) {
  const requiredCoreSkills = new Set(project.requirements
    .filter((requirement) => requirement.required)
    .map((requirement) => requirement.skillId));
  if (!requiredCoreSkills.size) return null;

  const allocatedCoreSkills = new Set(projectAllocations
    .map((allocation) => getEffectiveAllocationSkillId(allocation, project, peopleById.get(allocation.personId)))
    .filter((skillId): skillId is SkillId => Boolean(skillId)));

  const gaps: string[] = [];
  if (allocatedCoreSkills.has('frontend') && requiredCoreSkills.has('backend') && !allocatedCoreSkills.has('backend')) {
    gaps.push('FE jest zaplanowany, ale brakuje BE');
  }
  if (allocatedCoreSkills.has('qa') && requiredCoreSkills.has('frontend') && !allocatedCoreSkills.has('frontend')) {
    gaps.push('QA jest zaplanowany, ale brakuje FE');
  }
  if (allocatedCoreSkills.has('qa') && requiredCoreSkills.has('backend') && !allocatedCoreSkills.has('backend')) {
    gaps.push('QA jest zaplanowany, ale brakuje BE');
  }

  return gaps.length ? gaps.join('; ') : null;
}

function getSeniorSimpleWorkTrigger(
  person: Person,
  productiveAllocations: PersonTileAllocation[],
  projectsById: Map<string, ProjectFrame>
): TrafficReviewTrigger | null {
  if (person.seniority !== 'senior' && person.seniority !== 'lead') return null;
  const personAllocations = productiveAllocations.filter((allocation) => allocation.personId === person.id);
  const totalHours = personAllocations.reduce((sum, allocation) => sum + allocation.hours, 0);
  if (totalHours < 20) return null;

  const hasSeniorRequirement = personAllocations.some((allocation) => {
    const project = projectsById.get(allocation.target);
    const requirement = getEffectiveAllocationRequirement(allocation, project, person);
    return requirement?.seniority === 'senior' || requirement?.seniority === 'lead';
  });
  if (hasSeniorRequirement) return null;

  return {
    id: `long-under-utilized-senior-${person.id}`,
    owner: 'HR',
    severity: 'medium',
    title: `${person.name}: senior na prostych zadaniach`,
    detail: `${person.name} ma ${roundHours(totalHours)}h w horyzoncie bez wymagania senior/lead.`,
    action: 'HR/PM przenosi seniora tam, gdzie realnie potrzebny jest mentoring, architektura lub trudny zakres.',
    personId: person.id,
  };
}

function getMixedProjectRotationTrigger(
  person: Person,
  productiveAllocations: PersonTileAllocation[],
  projectsById: Map<string, ProjectFrame>
): TrafficReviewTrigger | null {
  const personAllocations = productiveAllocations.filter((allocation) => allocation.personId === person.id);
  const projectIds = new Set(personAllocations.map((allocation) => allocation.target));
  if (projectIds.size < 3) return null;

  const categories = new Set(Array.from(projectIds).map((projectId) => getProjectRotationCategory(projectsById.get(projectId))));
  if (categories.size < 3) return null;

  return {
    id: `long-mixed-rotation-${person.id}`,
    owner: 'PM',
    severity: person.skillIds.includes('design') || person.skillIds.includes('qa') ? 'low' : 'medium',
    title: `${person.name}: mieszana rotacja projektów`,
    detail: `${person.name} pracuje w ${projectIds.size} projektach i ${categories.size} typach pracy w horyzoncie.`,
    action: 'PM ustala priorytety komercyjne vs R&D/pipeline i redukuje przełączanie kontekstu.',
    personId: person.id,
  };
}

function getProjectRotationCategory(project: ProjectFrame | undefined) {
  if (!project) return 'unknown';
  if (project.planningStatus === 'ghost') return 'ghost';
  if (project.stage === 'possible' || project.stage === 'defensive') return project.stage;
  if (project.contractType === 'fixed_phase' || project.contractType === 'multi_month_fixed') return 'fixed-pool';
  return project.contractType;
}

function getCompetencyMismatchTriggers(
  project: ProjectFrame,
  projectAllocations: PersonTileAllocation[],
  peopleById: Map<string, Person>
): TrafficReviewTrigger[] {
  const triggers = new Map<string, TrafficReviewTrigger>();

  projectAllocations.forEach((allocation) => {
    const person = peopleById.get(allocation.personId);
    const validationMismatch = (allocation.validation || []).find((validation) => (
      validation.code === 'missing_required_skill' ||
      validation.code === 'insufficient_seniority' ||
      validation.code === 'role_mismatch'
    ));
    const requirement = getEffectiveAllocationRequirement(allocation, project, person);
    const requirementMismatch = requirement && person && (
      !personCanCoverRequirement(person, requirement) ||
      !hasEnoughSeniority(person.seniority, requirement.seniority)
    );

    if (!validationMismatch && !requirementMismatch) return;

    const reason = validationMismatch?.message || (
      requirement
        ? `${requirement.skillId}${requirement.seniority ? ` ${requirement.seniority}` : ''} nie pasuje do ${person?.name || allocation.personId}`
        : 'alokacja nie pasuje kompetencyjnie do wymagania'
    );
    const key = `${project.id}:${allocation.personId}:${validationMismatch?.code || requirement?.id || allocation.id}`;
    triggers.set(key, {
      id: `long-competency-mismatch-${key}`,
      owner: 'TECH',
      severity: validationMismatch?.severity === 'invalid' ? 'high' : 'medium',
      title: `${project.client}: mismatch kompetencji`,
      detail: `${person?.name || allocation.personId}: ${reason}.`,
      action: 'Tech Lead organizuje skill check, szkolenie, shadowing albo zmienny przydział.',
      allocationId: allocation.id,
      projectId: project.id,
      personId: person?.id || allocation.personId,
      periodId: allocation.periodId,
    });
  });

  return Array.from(triggers.values()).slice(0, 3);
}

function getContractEndReplacementTriggers(
  project: ProjectFrame,
  projectAllocations: PersonTileAllocation[],
  peopleById: Map<string, Person>,
  horizonPeriods: Period[]
): TrafficReviewTrigger[] {
  const periodsById = new Map(horizonPeriods.map((period) => [period.id, period]));
  const triggers = new Map<string, TrafficReviewTrigger>();

  projectAllocations.forEach((allocation) => {
    const person = peopleById.get(allocation.personId);
    if (!person) return;

    const override = getPersonPeriodOverride(person, allocation.periodId);
    if (override?.status !== 'notice_period' && override?.status !== 'unavailable') return;

    const period = periodsById.get(allocation.periodId);
    const periodProjectAllocations = projectAllocations.filter((item) => item.periodId === allocation.periodId);
    const atRiskSkillId = getEffectiveAllocationSkillId(allocation, project, person);
    const hasBackupMarker = periodProjectAllocations.some((item) => item.meetingState?.backup);
    const hasSkillReplacement = periodProjectAllocations.some((item) => {
      if (item.personId === person.id) return false;
      const candidate = peopleById.get(item.personId);
      if (!candidate || hasPersonPeriodExitRisk(candidate, item.periodId)) return false;
      if (!atRiskSkillId) return true;
      return canCoverSkill(candidate, atRiskSkillId);
    });

    if (hasBackupMarker || hasSkillReplacement) return;

    const skillDetail = atRiskSkillId ? ` ani osoby z kompetencją ${atRiskSkillId}` : ' ani drugiej osoby z kontekstem';
    const noteDetail = override.note?.trim() ? ` (${override.note.trim()})` : '';
    const periodLabel = period?.label || allocation.periodId;
    const statusLabel = override.status === 'notice_period' ? 'notice period / koniec współpracy' : 'niedostępność';
    const key = `${project.id}:${person.id}:${allocation.periodId}`;

    triggers.set(key, {
      id: `long-contract-replacement-${key}`,
      owner: 'HR',
      severity: 'high',
      title: `${project.client}: brak planu zastępstwa`,
      detail: `${person.name} ma ${statusLabel} w ${periodLabel}${noteDetail}, a projekt nie ma backupu${skillDetail}.`,
      action: 'HR/PM planuje zastępstwo, shadowing albo pre-booking przed zamknięciem long-term traffic.',
      allocationId: allocation.id,
      projectId: project.id,
      personId: person.id,
      periodId: allocation.periodId,
    });
  });

  return Array.from(triggers.values()).slice(0, 3);
}

function getHorizonLoadTrend(
  periods: Period[],
  allocations: PersonTileAllocation[],
  projectsById: Map<string, ProjectFrame>
): TrafficReviewTrigger | null {
  if (periods.length < 3) return null;
  const productiveRevenueByPeriod = periods.map((period) => (
    allocations
      .filter((allocation) => allocation.periodId === period.id && isProductiveAllocationTarget(allocation, projectsById))
      .reduce((sum, allocation) => sum + allocation.revenueK, 0)
  ));
  const [first, second, third] = productiveRevenueByPeriod;
  const isIncreasing = first < second && second < third && third - first >= 8;
  const isDecreasing = first > second && second > third && first - third >= 8;

  if (isIncreasing) {
    return {
      id: 'long-increasing-load',
      owner: 'FINANCE',
      severity: 'medium',
      title: 'Rosnące obciążenie w horyzoncie',
      detail: `${roundMoney(first)}k -> ${roundMoney(second)}k -> ${roundMoney(third)}k produktywnej alokacji.`,
      action: 'Finance i PM sprawdzają budżet, scope i ryzyko nagłego wzrostu staffing-u.',
    };
  }

  if (isDecreasing) {
    return {
      id: 'long-decreasing-load',
      owner: 'HR',
      severity: 'medium',
      title: 'Zmniejszające się obłożenie',
      detail: `${roundMoney(first)}k -> ${roundMoney(second)}k -> ${roundMoney(third)}k produktywnej alokacji.`,
      action: 'HR/PM rozważa bench plan, R&D, sales support albo redukcję przyszłego obciążenia.',
    };
  }

  return null;
}

function getPersonPeriodOverride(person: Person, periodId: string) {
  return person.monthlyOverrides?.find((override) => override.periodId === periodId);
}

function hasPersonPeriodExitRisk(person: Person, periodId: string) {
  const status = getPersonPeriodOverride(person, periodId)?.status;
  return status === 'notice_period' || status === 'unavailable';
}

function canCoverSkill(person: Person, skillId: SkillId) {
  if (person.skillIds.includes(skillId)) return true;
  return person.skillIds.includes('fullstack') && (skillId === 'backend' || skillId === 'frontend' || skillId === 'devops');
}

function sortTriggers(triggers: TrafficReviewTrigger[]) {
  return [...dedupeTriggers(triggers)].sort((a, b) => (
    severityRank(b.severity) - severityRank(a.severity) ||
    ownerRank(a.owner) - ownerRank(b.owner) ||
    a.title.localeCompare(b.title)
  ));
}

function dedupeTriggers(triggers: TrafficReviewTrigger[]) {
  return Array.from(new Map(triggers.map((trigger) => [trigger.id, trigger])).values());
}

function severityRank(severity: TrafficReviewSeverity) {
  switch (severity) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
  }
}

function ownerRank(owner: TrafficReviewOwner) {
  switch (owner) {
    case 'ALL':
      return 0;
    case 'PM':
      return 1;
    case 'HR':
      return 2;
    case 'TECH':
      return 3;
    case 'SALES':
      return 4;
    case 'FINANCE':
      return 5;
  }
}

function roundHours(value: number) {
  return Math.round(value * 10) / 10;
}

function roundMoney(value: number) {
  return Math.round(value * 10) / 10;
}
