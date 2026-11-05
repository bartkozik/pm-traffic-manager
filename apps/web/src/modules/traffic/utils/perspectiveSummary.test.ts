import { describe, expect, it } from 'vitest';
import { Period, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { generatePerspectiveSummary } from './perspectiveSummary';

const month = {
  id: '2026-03',
  label: 'March 2026',
  granularity: 'month',
  startsOn: '2026-03-01',
  endsOn: '2026-03-31',
} satisfies Period;

const person = {
  id: 'person-1',
  name: "Oakley",
  role: 'Developer',
  initials: 'OK',
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
  name: 'Platform',
  client: 'Client',
  contractType: 'hourly',
  stage: 'signed',
  budgetK: 10,
  probability: 1,
  startMonth: 'March 2026',
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
  weeklyOverrides: [{ periodId: '2026-03-w1', hours: 80 }],
} satisfies PersonTileAllocation;

describe('perspective summary weekly warnings', () => {
  it('adds PM delivery overload warning from weekly drill-down data', () => {
    const summary = generatePerspectiveSummary({
      activePeriodId: month.id,
      allocations: [allocation],
      lens: 'pm',
      people: [person],
      periods: [month],
      projects: [project],
    });

    expect(summary[0]).toMatchObject({
      id: 'weekly-delivery-overload',
      severity: 'high',
      title: 'Weekly delivery overload',
    });
    expect(summary[0].detail).toContain('Client');
  });

  it('adds HR people overload warning with overloaded person names', () => {
    const summary = generatePerspectiveSummary({
      activePeriodId: month.id,
      allocations: [allocation],
      lens: 'hr',
      people: [person],
      periods: [month],
      projects: [project],
    });

    expect(summary[0]).toMatchObject({
      id: 'weekly-people-overload',
      severity: 'high',
      title: 'Weekly people overload',
    });
    expect(summary[0].detail).toContain("Oakley");
  });

  it('keeps finance focused on allocation warnings instead of invoice timing', () => {
    const summary = generatePerspectiveSummary({
      activePeriodId: month.id,
      allocations: [allocation],
      lens: 'finance',
      people: [person],
      periods: [month],
      projects: [project],
    });

    expect(summary[0]).toMatchObject({
      id: 'finance-no-validation-warnings',
      title: 'No saved warnings',
    });
    expect(summary).toHaveLength(1);
    expect(summary.map((item) => item.id)).not.toContain('weekly-delivery-overload');
  });

  it('adds sales pipeline capacity summary for ghost projects', () => {
    const ghostProject = {
      ...project,
      id: 'ghost-project',
      stage: 'likely',
      planningStatus: 'ghost',
      budgetK: 20,
      probability: 0.5,
      revenuePlan: [{ periodId: month.id, revenueK: 20, probability: 0.5 }],
    } satisfies ProjectFrame;
    const ghostAllocation = {
      ...allocation,
      id: 'ghost-allocation',
      target: ghostProject.id,
      revenueK: 8,
    } satisfies PersonTileAllocation;

    const summary = generatePerspectiveSummary({
      activePeriodId: month.id,
      allocations: [ghostAllocation],
      lens: 'sales',
      people: [person],
      periods: [month],
      projects: [ghostProject],
    });

    expect(summary[0]).toMatchObject({
      id: 'ghost-pipeline-capacity',
      title: 'Pipeline reservation',
    });
    expect(summary[0].detail).toContain('20k planned');
    expect(summary[0].detail).toContain('8k reserved');
  });
});
