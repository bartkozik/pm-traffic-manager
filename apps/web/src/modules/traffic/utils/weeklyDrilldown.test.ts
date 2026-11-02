import { describe, expect, it } from 'vitest';
import { Period, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { buildWeeklyDrilldown, getWeeksForMonth } from './weeklyDrilldown';

const month = {
  id: '2026-03',
  label: 'Marzec 2026',
  granularity: 'month',
  startsOn: '2026-03-01',
  endsOn: '2026-03-31',
} satisfies Period;

const person = {
  id: 'person-1',
  name: 'Developer',
  role: 'Developer',
  initials: 'DV',
  color: '#000000',
  skillIds: ['backend'],
  costModel: {
    type: 'hourly',
    defaultMonthlyHours: 160,
    internalHourlyCostPln: 100,
  },
  monthlyCostK: 16,
  hoursPerTile: 8,
  layers: { workK: 8, adminK: 10, salesK: 12, targetK: 16 },
} satisfies Person;

const project = {
  id: 'project-1',
  name: 'Build',
  client: 'Client',
  contractType: 'hourly',
  stage: 'signed',
  budgetK: 10,
  probability: 1,
  startMonth: 'Marzec 2026',
  startPeriodId: month.id,
  rateConfig: { companyTargetRatePlnH: 250 },
  requirements: [],
  revenuePlan: [{ periodId: month.id, revenueK: 10, committedRevenueK: 10, probability: 1 }],
  invoices: [],
  notes: '',
} satisfies ProjectFrame;

const allocation = {
  id: 'allocation-1',
  personId: person.id,
  tileIndex: 0,
  target: project.id,
  periodId: month.id,
  mode: 'hours_first',
  revenueK: 10,
  hours: 160,
  skillId: 'backend',
} satisfies PersonTileAllocation;

describe('weekly drilldown', () => {
  it('falls back to complete calendar weeks when stored weeks do not cover the month', () => {
    const weeks = getWeeksForMonth([
      month,
      {
        id: '2026-03-w1',
        label: 'Marzec W1',
        granularity: 'week',
        startsOn: '2026-03-01',
        endsOn: '2026-03-07',
        parentPeriodId: month.id,
      },
    ], month);

    expect(weeks).toHaveLength(5);
    expect(weeks[0].startsOn).toBe('2026-03-01');
    expect(weeks.at(-1)?.endsOn).toBe('2026-03-31');
  });

  it('spreads monthly productive hours and availability across weeks proportionally', () => {
    const drilldown = buildWeeklyDrilldown({
      allocations: [allocation],
      monthPeriod: month,
      people: [person],
      periods: [month],
      projects: [project],
    });

    expect(drilldown).toHaveLength(5);
    expect(drilldown[0].allocatedHours).toBe(36.1);
    expect(drilldown[0].availableHours).toBe(36.1);
    expect(drilldown[0].utilizationPercent).toBe(100);
    expect(drilldown.at(-1)?.allocatedHours).toBe(15.5);
    expect(drilldown.at(-1)?.projectWorkloads[0]).toMatchObject({
      projectId: project.id,
      skillId: 'backend',
      hours: 15.5,
      revenueK: 1,
    });
  });

  it('marks a person as overloaded when weekly hours exceed weekly availability', () => {
    const drilldown = buildWeeklyDrilldown({
      allocations: [{ ...allocation, hours: 220 }],
      monthPeriod: month,
      people: [person],
      periods: [month],
      projects: [project],
    });

    expect(drilldown[0].overloadedPeople).toBe(1);
    expect(drilldown[0].people[0].status).toBe('over');
  });

  it('uses explicit weekly hour overrides and distributes the remaining monthly hours', () => {
    const drilldown = buildWeeklyDrilldown({
      allocations: [{
        ...allocation,
        weeklyOverrides: [{ periodId: '2026-03-w1', hours: 60 }],
      }],
      monthPeriod: month,
      people: [person],
      periods: [month],
      projects: [project],
    });

    expect(drilldown[0].allocatedHours).toBe(60);
    expect(drilldown[1].allocatedHours).toBe(29.2);
    expect(drilldown.at(-1)?.allocatedHours).toBe(12.5);
  });

  it('keeps weekly revenue capped to monthly allocation when weekly hours exceed monthly hours', () => {
    const drilldown = buildWeeklyDrilldown({
      allocations: [{
        ...allocation,
        weeklyOverrides: [
          { periodId: '2026-03-w1', hours: 120 },
          { periodId: '2026-03-w2', hours: 120 },
        ],
      }],
      monthPeriod: month,
      people: [person],
      periods: [month],
      projects: [project],
    });
    const revenueTotal = drilldown.reduce((sum, week) => (
      sum + (week.projectWorkloads[0]?.revenueK || 0)
    ), 0);

    expect(revenueTotal).toBe(10);
    expect(drilldown[0].allocatedHours).toBe(120);
    expect(drilldown[1].allocatedHours).toBe(120);
  });
});
