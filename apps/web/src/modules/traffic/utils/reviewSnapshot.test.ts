import { describe, expect, it } from 'vitest';
import { Period, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { generateReviewSnapshot } from './reviewSnapshot';

const period = {
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
  name: 'Build',
  client: 'Client',
  contractType: 'hourly',
  stage: 'signed',
  budgetK: 10,
  probability: 1,
  startMonth: 'March 2026',
  startPeriodId: period.id,
  rateConfig: { companyTargetRatePlnH: 250 },
  requirements: [],
  revenuePlan: [{ periodId: period.id, revenueK: 10, committedRevenueK: 10, probability: 1 }],
  invoices: [],
  notes: '',
} satisfies ProjectFrame;

const allocation = {
  id: 'allocation-1',
  personId: person.id,
  tileIndex: 0,
  target: project.id,
  periodId: period.id,
  mode: 'revenue_first',
  revenueK: 10,
  hours: 40,
} satisfies PersonTileAllocation;

describe('review snapshot', () => {
  it('generates a shareable text summary for the active board period', () => {
    const snapshot = generateReviewSnapshot({
      allocations: [allocation],
      metrics: {
        committedRevenue: 8,
        expectedRevenue: 10,
        loss: 2,
        pressureToTarget: 5,
        targetRevenue: 15,
        totalCost: 9,
      },
      people: [person],
      period,
      projects: [project],
      risks: [{
        id: 'risk-1',
        severity: 'medium',
        title: 'Target pressure',
        detail: '5k short.',
      }],
    });

    expect(snapshot).toContain('PM Traffic Management review snapshot');
    expect(snapshot).toContain('Period: March 2026');
    expect(snapshot).toContain('- Target revenue: 15k');
    expect(snapshot).toContain('- [medium] Target pressure: 5k short.');
    expect(snapshot).toContain('- Client / Build: 10/10k allocated');
    expect(snapshot).toContain("- Oakley: 40/160h");
  });

  it('includes AI planning assistant results when available', () => {
    const snapshot = generateReviewSnapshot({
      allocations: [allocation],
      aiOpportunityCheck: {
        boardId: 'ptm-mvp',
        periodId: period.id,
        mode: 'mock',
        analysis: {
          generatedAt: '2026-03-01T00:00:00.000Z',
          period,
          monthSummary: {
            committedRevenueK: 8,
            expectedRevenueK: 10,
            plannedRevenueK: 10,
            allocatedRevenueK: 10,
            nonCommercialCapacityK: 0,
            nonCommercialAllocatedCapacityK: 0,
            unallocatedPlannedRevenueK: 0,
            totalCostK: 9,
            targetRevenueK: 15,
            committedGapK: 7,
            expectedGapK: 5,
            targetGapK: 5,
            internalMarginK: 1,
            targetMarginK: -5,
            overAllocatedPeople: 0,
            underAllocatedPeople: 1,
            highRiskProjectCount: 0,
          },
          projects: [],
          people: [],
          skillBottlenecks: [],
          allocationRisks: [],
          removeProjectScenarios: [],
          benchUtilizationSuggestions: [],
        },
        result: {
          verdict: 'pursue_with_changes',
          confidence: 'medium',
          topReasons: ['Backend is the bottleneck.'],
          projectActions: [],
          allocationSuggestions: [],
          bottlenecks: [],
          financialRisks: [],
          deliveryHrRisks: [],
          assumptionsToVerify: [],
          nextScenarioToTry: 'Duplicate the month and move backend hours.',
        },
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
      metrics: {
        committedRevenue: 8,
        expectedRevenue: 10,
        loss: 2,
        pressureToTarget: 5,
        targetRevenue: 15,
        totalCost: 9,
      },
      people: [person],
      period,
      projects: [project],
      risks: [],
    });

    expect(snapshot).toContain('AI planning assistant');
    expect(snapshot).toContain('Verdict: pursue_with_changes (Confidence: medium, source: test analysis)');
    expect(snapshot).toContain('- Backend is the bottleneck.');
    expect(snapshot).toContain('Next scenario: Duplicate the month and move backend hours.');
  });
});
