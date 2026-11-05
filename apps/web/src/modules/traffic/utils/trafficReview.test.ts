import { describe, expect, it } from 'vitest';
import { Period, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { generateTrafficReview } from './trafficReview';

const periods = [
  { id: '2026-06', label: 'June 2026', granularity: 'month', startsOn: '2026-06-01', endsOn: '2026-06-30' },
  { id: '2026-07', label: 'July 2026', granularity: 'month', startsOn: '2026-07-01', endsOn: '2026-07-31' },
  { id: '2026-08', label: 'August 2026', granularity: 'month', startsOn: '2026-08-01', endsOn: '2026-08-31' },
] satisfies Period[];

const person = {
  id: 'person-1',
  name: "Taylor",
  role: 'Developer',
  initials: "TG",
  color: '#2563eb',
  skillIds: ['backend'],
  seniority: 'senior',
  costModel: { type: 'fixed_monthly', defaultMonthlyHours: 160 },
  monthlyCostK: 18,
  hoursPerTile: 5,
  layers: { workK: 10, adminK: 13, salesK: 16, targetK: 22 },
} satisfies Person;

const project = {
  id: 'project-1',
  client: 'Client',
  name: 'Build',
  contractType: 'hourly',
  stage: 'signed',
  budgetK: 20,
  probability: 1,
  startMonth: 'June 2026',
  startPeriodId: '2026-06',
  rateConfig: { companyTargetRatePlnH: 220 },
  requirements: [],
  revenuePlan: [{ periodId: '2026-06', revenueK: 10, committedRevenueK: 10, probability: 1 }],
  invoices: [],
  notes: '',
} satisfies ProjectFrame;

function allocation(id: string, overrides: Partial<PersonTileAllocation> = {}) {
  return {
    id,
    personId: person.id,
    tileIndex: Number(id.replace(/\D/g, '')) || 0,
    target: project.id,
    periodId: '2026-06',
    mode: 'revenue_first',
    revenueK: 1,
    hours: 8,
    ...overrides,
  } satisfies PersonTileAllocation;
}

describe('traffic review', () => {
  it('creates short-term meeting triggers from visible allocation patterns', () => {
    const unavailablePerson = {
      ...person,
      monthlyOverrides: [{ periodId: '2026-06', status: 'holiday' as const }],
    } satisfies Person;
    const review = generateTrafficReview({
      activePeriodId: '2026-06',
      allocations: [
        allocation('a1', { target: project.id, personId: unavailablePerson.id, hours: 24 }),
        allocation('a2', { target: 'project-2', personId: unavailablePerson.id, hours: 24 }),
      ],
      mode: 'short',
      people: [unavailablePerson],
      periods,
      projects: [project, { ...project, id: 'project-2', client: 'Other', revenuePlan: [{ periodId: '2026-06', revenueK: 8 }] }],
    });

    expect(review.horizonLabel).toBe('one week ahead');
    expect(review.triggers.map((trigger) => trigger.id)).toContain('short-hr-calendar-person-1');
    expect(review.triggers.map((trigger) => trigger.id)).toContain('short-person-many-projects-person-1');
    expect(review.triggers.find((trigger) => trigger.id === 'short-person-many-projects-person-1')).toMatchObject({
      personId: 'person-1',
    });
    expect(review.checklist.some((item) => item.owner === 'HR' && item.status === 'attention')).toBe(true);
  });

  it('does not create a short-term many-project trigger from a symbolic secondary allocation', () => {
    const review = generateTrafficReview({
      activePeriodId: '2026-06',
      allocations: [
        allocation('a1', { target: project.id, hours: 24 }),
        allocation('a2', { target: 'project-2', hours: 8 }),
      ],
      mode: 'short',
      people: [person],
      periods,
      projects: [project, { ...project, id: 'project-2', client: 'Other', revenuePlan: [{ periodId: '2026-06', revenueK: 8 }] }],
    });

    expect(review.triggers.map((trigger) => trigger.id)).not.toContain('short-person-many-projects-person-1');
  });

  it('adds short-term finance and backup triggers from allocation state', () => {
    const review = generateTrafficReview({
      activePeriodId: '2026-06',
      allocations: [
        allocation('a1', {
          revenueK: 1,
          hours: 40,
          meetingState: { mentoring: true },
          validation: [{ code: 'target_revenue_gap', severity: 'warning', message: 'below target' }],
        }),
        allocation('a2', { revenueK: 15 }),
      ],
      mode: 'short',
      people: [person],
      periods,
      projects: [{ ...project, budgetK: 10, revenuePlan: [{ periodId: '2026-06', revenueK: 10 }] }],
    });

    const triggerIds = review.triggers.map((trigger) => trigger.id);

    expect(triggerIds).toContain('short-project-team-cost-project-1');
    expect(triggerIds).toContain('short-low-margin-a1');
    expect(triggerIds).toContain('short-missing-backup-a1');
    expect(review.checklist.some((item) => item.owner === 'TECH' && item.status === 'attention')).toBe(true);
  });

  it('adds short-term BE/FE/QA ordering and ineffective onboarding triggers', () => {
    const onboardingPerson = {
      ...person,
      monthlyOverrides: [{ periodId: '2026-06', status: 'partial_availability' as const, availableHours: 80, note: 'onboarding' }],
    } satisfies Person;
    const coreProject = {
      ...project,
      requirements: [
        { id: 'req-be', skillId: 'backend', estimatedHours: 80, required: true },
        { id: 'req-fe', skillId: 'frontend', estimatedHours: 80, required: true },
        { id: 'req-qa', skillId: 'qa', estimatedHours: 40, required: true },
      ],
    } satisfies ProjectFrame;
    const review = generateTrafficReview({
      activePeriodId: '2026-06',
      allocations: [
        allocation('a1', { target: coreProject.id, personId: onboardingPerson.id, skillId: 'frontend', hours: 24 }),
        allocation('a2', { target: coreProject.id, personId: onboardingPerson.id, skillId: 'qa', hours: 8 }),
      ],
      mode: 'short',
      people: [onboardingPerson],
      periods,
      projects: [coreProject],
    });

    const triggerIds = review.triggers.map((trigger) => trigger.id);

    expect(triggerIds).toContain('short-core-order-project-1');
    expect(triggerIds).toContain('short-ineffective-onboarding-person-1');
    expect(review.triggers.find((trigger) => trigger.id === 'short-core-order-project-1')?.detail).toContain('BE is missing');
    expect(review.checklist.some((item) => item.owner === 'TECH' && item.status === 'attention')).toBe(true);
    expect(review.checklist.some((item) => item.owner === 'HR' && item.status === 'attention')).toBe(true);
  });

  it('adds short and long-term source-system mismatch triggers from explicit project source state', () => {
    const sourceMismatchProject = {
      ...project,
      sourceStatus: 'scope_changed',
      sourceStatusNote: 'Scope increased after the call; CRM still shows the old scope.',
    } satisfies ProjectFrame;

    const shortReview = generateTrafficReview({
      activePeriodId: '2026-06',
      allocations: [allocation('a1')],
      mode: 'short',
      people: [person],
      periods,
      projects: [sourceMismatchProject],
    });
    const longReview = generateTrafficReview({
      activePeriodId: '2026-06',
      allocations: [allocation('a1')],
      mode: 'long',
      people: [person],
      periods,
      projects: [sourceMismatchProject],
    });

    expect(shortReview.triggers.find((trigger) => trigger.id === 'short-source-mismatch-project-1')).toMatchObject({
      owner: 'SALES',
      projectId: 'project-1',
      title: 'Client: outdated source/scope',
    });
    expect(longReview.triggers.find((trigger) => trigger.id === 'long-source-mismatch-project-1')).toMatchObject({
      owner: 'SALES',
      projectId: 'project-1',
      title: 'Client: source system does not reflect scope',
    });
    expect(shortReview.triggers.find((trigger) => trigger.id === 'short-source-mismatch-project-1')?.detail).toContain('CRM still shows the old scope');
  });

  it('creates long-term meeting triggers from three-month forecast patterns', () => {
    const review = generateTrafficReview({
      activePeriodId: '2026-06',
      allocations: [allocation('a1', { revenueK: 2, hours: 8 })],
      mode: 'long',
      people: [person],
      periods,
      projects: [
        project,
        { ...project, id: 'project-2', client: 'Likely', stage: 'likely', revenuePlan: [{ periodId: '2026-07', revenueK: 10 }] },
        { ...project, id: 'project-3', client: 'Ghost', planningStatus: 'ghost', revenuePlan: [{ periodId: '2026-08', revenueK: 10 }] },
      ],
    });

    expect(review.horizonLabel).toBe('three months ahead');
    expect(review.triggers.map((trigger) => trigger.id)).toContain('long-uncertain-projects');
    expect(review.triggers.map((trigger) => trigger.id)).toContain('long-underloaded-person-1');
    expect(review.checklist.some((item) => item.owner === 'SALES' && item.status === 'attention')).toBe(true);
  });

  it('adds long-term low-value, trend, and scope-without-staffing triggers', () => {
    const possibleProject = {
      ...project,
      id: 'project-2',
      client: 'Possible',
      stage: 'possible',
      revenuePlan: [{ periodId: '2026-07', revenueK: 20 }],
    } satisfies ProjectFrame;
    const futureProject = {
      ...project,
      id: 'project-3',
      client: 'Future',
      revenuePlan: [
        { periodId: '2026-06', revenueK: 4 },
        { periodId: '2026-07', revenueK: 12 },
        { periodId: '2026-08', revenueK: 24 },
      ],
    } satisfies ProjectFrame;
    const review = generateTrafficReview({
      activePeriodId: '2026-06',
      allocations: [
        allocation('a1', { target: project.id, periodId: '2026-06', revenueK: 4 }),
        allocation('a2', { target: possibleProject.id, periodId: '2026-07', revenueK: 12 }),
        allocation('a3', { target: possibleProject.id, periodId: '2026-08', revenueK: 24 }),
      ],
      mode: 'long',
      people: [person],
      periods,
      projects: [project, possibleProject, futureProject],
    });

    const triggerIds = review.triggers.map((trigger) => trigger.id);

    expect(triggerIds).toContain('long-too-much-low-value');
    expect(triggerIds).toContain('long-increasing-load');
    expect(triggerIds).toContain('long-scope-without-staffing-project-3');
  });

  it('adds long-term HR horizon gap, recurring underload, and ineffective onboarding triggers', () => {
    const onboardingPerson = {
      ...person,
      monthlyOverrides: [
        { periodId: '2026-06', status: 'holiday' as const, availableHours: 80 },
        { periodId: '2026-07', status: 'notice_period' as const, availableHours: 80 },
        { periodId: '2026-08', status: 'partial_availability' as const, availableHours: 80, note: 'onboarding' },
      ],
    } satisfies Person;
    const review = generateTrafficReview({
      activePeriodId: '2026-06',
      allocations: [
        allocation('a1', { periodId: '2026-06', hours: 8, personId: onboardingPerson.id }),
        allocation('a2', { periodId: '2026-07', hours: 8, personId: onboardingPerson.id }),
        allocation('a3', { periodId: '2026-08', hours: 20, personId: onboardingPerson.id }),
      ],
      mode: 'long',
      people: [onboardingPerson],
      periods,
      projects: [project],
    });

    const triggerIds = review.triggers.map((trigger) => trigger.id);

    expect(triggerIds).toContain('long-hr-horizon-gap-person-1');
    expect(triggerIds).toContain('long-recurring-underload-person-1');
    expect(triggerIds).toContain('long-ineffective-onboarding-person-1');
    expect(review.checklist.some((item) => item.owner === 'HR' && item.status === 'attention')).toBe(true);
  });

  it('adds long-term contract-end replacement trigger when no backup or skill replacement exists', () => {
    const leavingPerson = {
      ...person,
      monthlyOverrides: [{ periodId: '2026-07', status: 'notice_period' as const, availableHours: 80, note: 'contract ends after July' }],
    } satisfies Person;
    const review = generateTrafficReview({
      activePeriodId: '2026-06',
      allocations: [
        allocation('a1', {
          personId: leavingPerson.id,
          periodId: '2026-07',
          skillId: 'backend',
          hours: 24,
        }),
      ],
      mode: 'long',
      people: [leavingPerson],
      periods,
      projects: [project],
    });

    const trigger = review.triggers.find((item) => item.id === 'long-contract-replacement-project-1:person-1:2026-07');

    expect(trigger).toMatchObject({
      owner: 'HR',
      severity: 'high',
      title: 'Client: no replacement plan',
    });
    expect(trigger?.detail).toContain('notice period / end of engagement');
    expect(trigger?.detail).toContain('no backup or a person with skill backend');
  });

  it('skips contract-end replacement trigger when backup or skill replacement exists', () => {
    const leavingPerson = {
      ...person,
      monthlyOverrides: [{ periodId: '2026-07', status: 'notice_period' as const, availableHours: 80 }],
    } satisfies Person;
    const replacementPerson = {
      ...person,
      id: 'person-replacement',
      name: 'Basia',
      initials: 'BA',
      skillIds: ['fullstack'],
    } satisfies Person;
    const reviewWithReplacement = generateTrafficReview({
      activePeriodId: '2026-06',
      allocations: [
        allocation('a1', { personId: leavingPerson.id, periodId: '2026-07', skillId: 'backend', hours: 24 }),
        allocation('a2', { personId: replacementPerson.id, periodId: '2026-07', skillId: 'backend', hours: 8 }),
      ],
      mode: 'long',
      people: [leavingPerson, replacementPerson],
      periods,
      projects: [project],
    });
    const reviewWithBackup = generateTrafficReview({
      activePeriodId: '2026-06',
      allocations: [
        allocation('a1', {
          personId: leavingPerson.id,
          periodId: '2026-07',
          skillId: 'backend',
          hours: 24,
          meetingState: { backup: true },
        }),
      ],
      mode: 'long',
      people: [leavingPerson],
      periods,
      projects: [project],
    });

    expect(reviewWithReplacement.triggers.some((item) => item.id.startsWith('long-contract-replacement-'))).toBe(false);
    expect(reviewWithBackup.triggers.some((item) => item.id.startsWith('long-contract-replacement-'))).toBe(false);
  });

  it('adds long-term rotation, over-promise, under-utilized senior, and competency mismatch triggers', () => {
    const seniorPerson = {
      ...person,
      id: 'person-senior',
      name: 'Marta',
      initials: 'MK',
      skillIds: ['backend', 'frontend'],
      seniority: 'senior' as const,
    } satisfies Person;
    const juniorPerson = {
      ...person,
      id: 'person-junior',
      name: 'Jan',
      initials: 'JJ',
      skillIds: ['frontend'],
      seniority: 'junior' as const,
    } satisfies Person;
    const fixedProject = {
      ...project,
      id: 'project-fixed',
      client: 'Fixed',
      contractType: 'fixed_phase' as const,
      requirements: [{ id: 'req-fe', skillId: 'frontend', estimatedHours: 20, required: true }],
      revenuePlan: [{ periodId: '2026-07', revenueK: 8 }],
    } satisfies ProjectFrame;
    const ghostProject = {
      ...project,
      id: 'project-ghost',
      client: 'Ghost',
      planningStatus: 'ghost' as const,
      revenuePlan: [{ periodId: '2026-08', revenueK: 20 }],
    } satisfies ProjectFrame;
    const mismatchProject = {
      ...project,
      id: 'project-mismatch',
      client: 'Mismatch',
      requirements: [{ id: 'req-be-senior', skillId: 'backend', seniority: 'senior' as const, estimatedHours: 40, required: true }],
      revenuePlan: [{ periodId: '2026-06', revenueK: 12 }],
    } satisfies ProjectFrame;

    const review = generateTrafficReview({
      activePeriodId: '2026-06',
      allocations: [
        allocation('a1', { target: project.id, personId: seniorPerson.id, periodId: '2026-06', hours: 12 }),
        allocation('a2', { target: fixedProject.id, personId: seniorPerson.id, periodId: '2026-07', hours: 12, skillId: 'frontend' }),
        allocation('a3', { target: ghostProject.id, personId: seniorPerson.id, periodId: '2026-08', hours: 12 }),
        allocation('a4', {
          target: mismatchProject.id,
          personId: juniorPerson.id,
          requirementId: 'req-be-senior',
          periodId: '2026-06',
          hours: 16,
          validation: [{ code: 'missing_required_skill', severity: 'invalid', message: 'Missing senior backend' }],
        }),
      ],
      mode: 'long',
      people: [seniorPerson, juniorPerson],
      periods,
      projects: [project, fixedProject, ghostProject, mismatchProject],
    });

    const triggerIds = review.triggers.map((trigger) => trigger.id);

    expect(triggerIds).toContain('long-mixed-rotation-person-senior');
    expect(triggerIds).toContain('long-under-utilized-senior-person-senior');
    expect(triggerIds).toContain('long-over-promise-project-ghost');
    expect(triggerIds.some((id) => id.startsWith('long-competency-mismatch-project-mismatch:person-junior'))).toBe(true);
    expect(review.checklist.some((item) => item.owner === 'TECH' && item.status === 'attention')).toBe(true);
    expect(review.checklist.some((item) => item.owner === 'SALES' && item.status === 'attention')).toBe(true);
  });

});
