import { describe, expect, it } from 'vitest';
import type { Period, Person, PersonTileAllocation, ProjectFrame, Skill } from '../models/traffic.model';
import {
  analyticLegendSections,
  buildAnalyticBoardRows,
  filterAnalyticBoardRows,
  getAnalyticSignalCodeMeta,
  sortAnalyticBoardRows,
} from './analyticBoard';

const periods: Period[] = [
  { id: '2026-06', label: 'June 2026', granularity: 'month', startsOn: '2026-06-01', endsOn: '2026-06-30' },
  { id: '2026-07', label: 'July 2026', granularity: 'month', startsOn: '2026-07-01', endsOn: '2026-07-31' },
  { id: '2026-08', label: 'Sierpien 2026', granularity: 'month', startsOn: '2026-08-01', endsOn: '2026-08-31' },
];

const skills: Skill[] = [
  { id: 'backend', label: 'Backend', defaultTargetRatePlnH: 260 },
  { id: 'frontend', label: 'Frontend', defaultTargetRatePlnH: 240 },
];

const tomasz = {
  id: 'person-tomasz',
  name: "Taylor",
  role: 'Senior Developer',
  initials: "TG",
  color: '#ef4444',
  skillIds: ['backend'],
  seniority: 'senior',
  costModel: { type: 'fixed_monthly', defaultMonthlyHours: 160, fixedMonthlyCostK: 20 },
  monthlyCostK: 20,
  hoursPerTile: 8,
  layers: { workK: 12, adminK: 15, salesK: 18, targetK: 24 },
} satisfies Person;

const anna = {
  ...tomasz,
  id: 'person-anna',
  name: "Avery",
  role: 'Frontend Developer',
  initials: "AK",
  skillIds: ['frontend'],
  seniority: 'mid',
} satisfies Person;

const fanimani = {
  id: 'project-fanimani',
  name: 'Core team',
  client: 'FaniMani',
  contractType: 'time_materials_capped',
  stage: 'signed',
  planningStatus: 'active',
  workType: 'commercial',
  budgetK: 30,
  probability: 1,
  startMonth: 'June 2026',
  startPeriodId: '2026-06',
  rateConfig: { companyTargetRatePlnH: 260 },
  requirements: [],
  revenuePlan: [{ periodId: '2026-06', revenueK: 30, probability: 1 }],
  invoices: [],
  notes: '',
} satisfies ProjectFrame;

const rdProject = {
  ...fanimani,
  id: 'project-rd',
  name: 'AI Lab',
  client: 'R&D',
  stage: 'possible',
  workType: 'research_development',
  revenuePlan: [{ periodId: '2026-07', revenueK: 8, probability: 0.5 }],
} satisfies ProjectFrame;

const riskyClient = {
  ...fanimani,
  id: 'project-risky',
  name: 'Migration',
  client: 'Klient 9',
  stage: 'likely',
  revenuePlan: [{ periodId: '2026-08', revenueK: 15, probability: 0.8 }],
} satisfies ProjectFrame;

function allocation(id: string, overrides: Partial<PersonTileAllocation>): PersonTileAllocation {
  return {
    id,
    personId: tomasz.id,
    tileIndex: 0,
    target: fanimani.id,
    periodId: '2026-06',
    mode: 'revenue_first',
    revenueK: 1,
    hours: 8,
    ...overrides,
  };
}

describe('analytic board rows', () => {
  it('aggregates people allocations across a 3 month range and derives scan signals', () => {
    const rows = buildAnalyticBoardRows({
      people: [tomasz, anna],
      projects: [fanimani, rdProject, riskyClient],
      skills,
      periods,
      allocations: [
        allocation('tomasz-fanimani', { target: fanimani.id, periodId: '2026-06', revenueK: 6, hours: 30, skillId: 'backend' }),
        allocation('tomasz-risky-june', { target: riskyClient.id, periodId: '2026-06', tileIndex: 1, revenueK: 2, hours: 10 }),
        allocation('tomasz-bench', { target: 'bench', periodId: '2026-06', tileIndex: 2, revenueK: 1, hours: 8 }),
        allocation('tomasz-rd', {
          target: rdProject.id,
          periodId: '2026-07',
          tileIndex: 3,
          revenueK: 4,
          hours: 20,
          previousTarget: fanimani.id,
          meetingState: { changedThisWeek: true },
        }),
        allocation('tomasz-risky-august', {
          target: riskyClient.id,
          periodId: '2026-08',
          tileIndex: 4,
          revenueK: 15,
          hours: 180,
          validation: [{ code: 'over_allocated', severity: 'warning', message: 'Za duzo godzin' }],
        }),
        allocation('anna-fanimani', {
          personId: anna.id,
          target: fanimani.id,
          periodId: '2026-06',
          tileIndex: 0,
          revenueK: 4,
          hours: 20,
          skillId: 'frontend',
        }),
      ],
    });

    const row = rows.find((item) => item.id === tomasz.id);
    expect(row).toBeDefined();
    expect(row?.periodCells).toHaveLength(3);
    expect(row?.rangeRevenueK).toBe(28);
    expect(row?.rangeBenchRevenueK).toBe(1);
    expect(row?.rangeProjectCount).toBe(3);
    expect(row?.signalKinds).toEqual(expect.arrayContaining([
      'bench',
      'fragmentation',
      'researchDevelopment',
      'lowValue',
      'singlePersonProject',
      'changed',
      'risk',
      'overload',
    ]));

    const june = row?.periodCells.find((cell) => cell.period.id === '2026-06');
    expect(june?.assignments.map((assignment) => assignment.label)).toEqual([
      'FaniMani: Core team',
      'Klient 9: Migration',
      'Bench',
    ]);
    expect(june?.assignments[0]?.skillLabels).toEqual(['Backend']);
    expect(june?.assignments[0]?.skillCodes).toEqual(['BE']);
  });

  it('maps assignment skills to documented visual glyphs for compact chips', () => {
    const rows = buildAnalyticBoardRows({
      people: [tomasz, anna],
      projects: [fanimani],
      skills,
      periods: [periods[0]],
      allocations: [
        allocation('tomasz-backend', { target: fanimani.id, skillId: 'backend' }),
        allocation('anna-frontend', {
          personId: anna.id,
          target: fanimani.id,
          skillId: 'frontend',
        }),
      ],
    });
    const legendCodes = new Set(analyticLegendSections.flatMap((section) => section.items.map((item) => item.code)));
    const emittedSkillCodes = rows.flatMap((row) => (
      row.periodCells.flatMap((cell) => cell.assignments.flatMap((assignment) => assignment.skillCodes))
    ));

    expect(emittedSkillCodes).toEqual(expect.arrayContaining(['BE', 'FE']));
    emittedSkillCodes.forEach((code) => {
      const meta = getAnalyticSignalCodeMeta(code);
      expect(meta?.kind).toBe('glyph');
      expect(meta?.className).toMatch(/^is-skill-/);
      expect(legendCodes.has(code)).toBe(true);
    });
    expect(getAnalyticSignalCodeMeta('BE')?.className).toBe('is-skill-backend');
    expect(getAnalyticSignalCodeMeta('FE')?.className).toBe('is-skill-frontend');
  });

  it('keeps archived people out of active analytic rows', () => {
    const rows = buildAnalyticBoardRows({
      people: [tomasz, { ...anna, archivedAt: '2026-06-20T08:00:00.000Z' }],
      projects: [fanimani],
      skills,
      periods: [periods[0]],
      allocations: [
        allocation('tomasz-work', { target: fanimani.id }),
        allocation('anna-work', {
          personId: anna.id,
          target: fanimani.id,
          revenueK: 4,
          hours: 20,
        }),
      ],
    });

    expect(rows.map((row) => row.id)).toEqual([tomasz.id]);
    expect(rows[0]?.signalKinds).toContain('singlePersonProject');
  });

  it('filters by search and signal presets', () => {
    const rows = buildAnalyticBoardRows({
      people: [tomasz, anna],
      projects: [fanimani, rdProject, riskyClient],
      skills,
      periods,
      allocations: [
        allocation('tomasz-rd', { target: rdProject.id, periodId: '2026-07', revenueK: 4, hours: 20 }),
        allocation('anna-fanimani', {
          personId: anna.id,
          target: fanimani.id,
          periodId: '2026-06',
          revenueK: 4,
          hours: 20,
        }),
      ],
    });

    expect(filterAnalyticBoardRows(rows, { search: 'AI Lab' }).map((row) => row.id)).toEqual([tomasz.id]);
    expect(filterAnalyticBoardRows(rows, { filters: ['rd'] }).map((row) => row.id)).toEqual([tomasz.id]);
  });

  it('sorts by numeric range metrics', () => {
    const rows = buildAnalyticBoardRows({
      people: [tomasz, anna],
      projects: [fanimani],
      skills,
      periods: [periods[0]],
      allocations: [
        allocation('tomasz-bench', { target: 'bench', revenueK: 3, hours: 24 }),
        allocation('anna-bench', { personId: anna.id, target: 'bench', revenueK: 1, hours: 8 }),
      ],
    });

    expect(sortAnalyticBoardRows(rows, {
      columnAccessor: 'rangeBenchRevenueK',
      direction: 'desc',
    }).map((row) => row.id)).toEqual([tomasz.id, anna.id]);
  });

  it('sorts revenue and hours by visible productive values', () => {
    const rows = buildAnalyticBoardRows({
      people: [tomasz, anna],
      projects: [fanimani],
      skills,
      periods: [periods[0]],
      allocations: [
        allocation('tomasz-bench', { target: 'bench', revenueK: 20, hours: 120 }),
        allocation('tomasz-work', { target: fanimani.id, tileIndex: 1, revenueK: 2, hours: 10 }),
        allocation('anna-work', { personId: anna.id, target: fanimani.id, revenueK: 8, hours: 40 }),
      ],
    });

    expect(sortAnalyticBoardRows(rows, {
      columnAccessor: 'rangeRevenueK',
      direction: 'desc',
    }).map((row) => row.id)).toEqual([anna.id, tomasz.id]);
    expect(sortAnalyticBoardRows(rows, {
      columnAccessor: 'rangeHours',
      direction: 'desc',
    }).map((row) => row.id)).toEqual([anna.id, tomasz.id]);
  });

  it('documents every emitted scan signal in the analytic legend', () => {
    const rows = buildAnalyticBoardRows({
      people: [tomasz],
      projects: [fanimani, rdProject, riskyClient],
      skills,
      periods,
      allocations: [
        allocation('tomasz-bench', { target: 'bench', revenueK: 1, hours: 8 }),
        allocation('tomasz-rd', {
          target: rdProject.id,
          periodId: '2026-07',
          tileIndex: 1,
          previousTarget: fanimani.id,
          meetingState: { changedThisWeek: true },
        }),
        allocation('tomasz-risky', {
          target: riskyClient.id,
          periodId: '2026-08',
          tileIndex: 2,
          hours: 180,
          validation: [{ code: 'over_allocated', severity: 'warning', message: 'Za duzo godzin' }],
        }),
      ],
    });
    const legendCodes = new Set(analyticLegendSections.flatMap((section) => section.items.map((item) => item.code)));
    const emittedCodes = new Set(rows.flatMap((row) => row.signalCodes));

    expect(emittedCodes.size).toBeGreaterThan(0);
    emittedCodes.forEach((code) => {
      const meta = getAnalyticSignalCodeMeta(code);
      expect(meta).toBeDefined();
      expect(meta?.className).toMatch(/^is-/);
      expect(meta?.kind).toBeTruthy();
      expect(legendCodes.has(code)).toBe(true);
    });
    expect(getAnalyticSignalCodeMeta('LOW')?.className).toBe('is-low-value');
    expect(getAnalyticSignalCodeMeta('MOVE')?.className).toBe('is-moved');
  });
});
