import { describe, expect, it } from 'vitest';
import { generateMonthOpportunityAnalysis } from './opportunityAnalysis.js';
import { createPersonPairPlanningRule } from './planningRules.js';
import { TrafficSnapshot } from './traffic.model.js';

const baseSnapshot: TrafficSnapshot = {
  schemaVersion: 1,
  activePeriodId: '2026-03',
  activeTileUnitId: 'money-1k',
  tileUnits: [{ id: 'money-1k', kind: 'money', label: '1k PLN', value: 1, currency: 'PLN' }],
  periods: [
    { id: '2026-03', label: 'Marzec 2026', granularity: 'month', startsOn: '2026-03-01', endsOn: '2026-03-31' },
  ],
  skills: [
    { id: 'backend', label: 'Backend', defaultTargetRatePlnH: 260 },
    { id: 'frontend', label: 'Frontend', defaultTargetRatePlnH: 240 },
    { id: 'qa', label: 'QA', defaultTargetRatePlnH: 180 },
  ],
  people: [
    {
      id: 'senior-backend',
      name: 'Senior Backend',
      role: 'Developer',
      initials: 'SB',
      color: '#000000',
      skillIds: ['backend'],
      seniority: 'senior',
      costModel: { type: 'hourly', defaultMonthlyHours: 120, internalHourlyCostPln: 250 },
      monthlyCostK: 30,
      hoursPerTile: 5,
      layers: { workK: 30, adminK: 36, salesK: 42, targetK: 50 },
    },
    {
      id: 'frontend',
      name: 'Frontend',
      role: 'Developer',
      initials: 'FE',
      color: '#111111',
      skillIds: ['frontend'],
      seniority: 'mid',
      costModel: { type: 'fixed_monthly', defaultMonthlyHours: 120 },
      monthlyCostK: 20,
      hoursPerTile: 6,
      layers: { workK: 20, adminK: 25, salesK: 30, targetK: 38 },
    },
  ],
  projects: [
    {
      id: 'cheap-fixed',
      name: 'Cheap Fixed',
      client: 'Low Rate Client',
      contractType: 'fixed_phase',
      stage: 'likely',
      planningStatus: 'active',
      budgetK: 20,
      probability: 0.8,
      startMonth: 'Marzec 2026',
      startPeriodId: '2026-03',
      rateConfig: { companyTargetRatePlnH: 260, skillRatesPlnH: { backend: 260 } },
      requirements: [
        { id: 'cheap-backend', skillId: 'backend', seniority: 'senior', estimatedHours: 120, required: true },
      ],
      revenuePlan: [{ periodId: '2026-03', revenueK: 20, committedRevenueK: 0, probability: 0.8 }],
      invoices: [{ id: 'inv-cheap', projectId: 'cheap-fixed', amount: 10_000, issueDate: '2026-03-01', dueDate: '2026-03-25', status: 'issued' }],
      notes: '',
    },
    {
      id: 'good-frontend',
      name: 'Good Frontend',
      client: 'Good Client',
      contractType: 'hourly',
      stage: 'signed',
      planningStatus: 'active',
      budgetK: 30,
      probability: 1,
      startMonth: 'Marzec 2026',
      startPeriodId: '2026-03',
      rateConfig: { projectRatePlnH: 300, companyTargetRatePlnH: 240 },
      requirements: [
        { id: 'good-frontend-req', skillId: 'frontend', seniority: 'mid', estimatedHours: 80, required: true },
      ],
      revenuePlan: [{ periodId: '2026-03', revenueK: 30, committedRevenueK: 30, probability: 1 }],
      invoices: [{ id: 'inv-good', projectId: 'good-frontend', amount: 30_000, issueDate: '2026-03-01', dueDate: '2026-03-20', status: 'paid', paidDate: '2026-03-19' }],
      notes: '',
    },
  ],
  allocations: [
    {
      id: 'alloc-cheap',
      personId: 'senior-backend',
      tileIndex: 0,
      target: 'cheap-fixed',
      periodId: '2026-03',
      mode: 'hours_first',
      revenueK: 20,
      hours: 120,
      skillId: 'backend',
      requirementId: 'cheap-backend',
      validation: [{ code: 'target_revenue_gap', severity: 'warning', message: 'Below target revenue.' }],
    },
    {
      id: 'alloc-good',
      personId: 'frontend',
      tileIndex: 0,
      target: 'good-frontend',
      periodId: '2026-03',
      mode: 'hours_first',
      revenueK: 30,
      hours: 80,
      skillId: 'frontend',
      requirementId: 'good-frontend-req',
    },
  ],
};

describe('generateMonthOpportunityAnalysis', () => {
  it('computes project profitability and recommends renegotiating a cheap fixed-price project', () => {
    const analysis = generateMonthOpportunityAnalysis(baseSnapshot, '2026-03', '2026-03-01T00:00:00.000Z');
    const cheapProject = analysis.projects.find((project) => project.projectId === 'cheap-fixed');

    expect(cheapProject?.targetRevenueGapK).toBe(11.2);
    expect(cheapProject?.recommendation).toBe('renegotiate');
    expect(cheapProject?.validationWarnings).toHaveLength(1);
  });

  it('includes project notes in the analysis pack for AI review', () => {
    const analysis = generateMonthOpportunityAnalysis({
      ...baseSnapshot,
      projects: baseSnapshot.projects.map((project) => (
        project.id === 'cheap-fixed'
          ? { ...project, notes: 'Klient nie potwierdzil zakresu migracji danych.' }
          : project
      )),
    }, '2026-03', '2026-03-01T00:00:00.000Z');
    const cheapProject = analysis.projects.find((project) => project.projectId === 'cheap-fixed');

    expect(cheapProject?.notes).toBe('Klient nie potwierdzil zakresu migracji danych.');
  });

  it('does not carry a monthly project into another month without revenue plan or allocations', () => {
    const nextMonthSnapshot: TrafficSnapshot = {
      ...baseSnapshot,
      activePeriodId: '2026-04',
      periods: [
        ...baseSnapshot.periods,
        { id: '2026-04', label: 'Kwiecien 2026', granularity: 'month', startsOn: '2026-04-01', endsOn: '2026-04-30' },
      ],
      allocations: baseSnapshot.allocations.filter((allocation) => allocation.periodId === '2026-04'),
    };

    const analysis = generateMonthOpportunityAnalysis(nextMonthSnapshot, '2026-04', '2026-04-01T00:00:00.000Z');

    expect(analysis.projects).toHaveLength(0);
    expect(analysis.monthSummary.plannedRevenueK).toBe(0);
  });

  it('surfaces project resource gaps when planned revenue is not covered by allocated tiles', () => {
    const analysis = generateMonthOpportunityAnalysis({
      ...baseSnapshot,
      allocations: [
        baseSnapshot.allocations[0],
        {
          ...baseSnapshot.allocations[1],
          revenueK: 12,
          hours: 32,
        },
      ],
    }, '2026-03', '2026-03-01T00:00:00.000Z');
    const frontendProject = analysis.projects.find((project) => project.projectId === 'good-frontend');

    expect(frontendProject?.plannedRevenueK).toBe(30);
    expect(frontendProject?.allocatedRevenueK).toBe(12);
    expect(frontendProject?.resourceGapK).toBe(18);
    expect(frontendProject?.recommendation).toBe('pursue_with_changes');
    expect(analysis.monthSummary.unallocatedPlannedRevenueK).toBe(18);
  });

  it('surfaces skill bottlenecks from required hours and matching capacity', () => {
    const analysis = generateMonthOpportunityAnalysis({
      ...baseSnapshot,
      projects: [
        ...baseSnapshot.projects,
        {
          ...baseSnapshot.projects[0],
          id: 'backend-ghost',
          name: 'Backend Ghost',
          planningStatus: 'ghost',
          requirements: [{ id: 'ghost-backend', skillId: 'backend', estimatedHours: 80, required: true }],
          revenuePlan: [{ periodId: '2026-03', revenueK: 40, probability: 0.5 }],
        },
      ],
    }, '2026-03', '2026-03-01T00:00:00.000Z');

    const backend = analysis.skillBottlenecks.find((skill) => skill.skillId === 'backend');

    expect(backend?.requiredHours).toBe(200);
    expect(backend?.availableMatchingHours).toBe(120);
    expect(backend?.isBottleneck).toBe(true);
  });

  it('counts unmapped allocations against required skill hours when the person skill matches unambiguously', () => {
    const analysis = generateMonthOpportunityAnalysis({
      ...baseSnapshot,
      allocations: [
        {
          ...baseSnapshot.allocations[0],
          skillId: undefined,
          requirementId: undefined,
        },
        baseSnapshot.allocations[1],
      ],
    }, '2026-03', '2026-03-01T00:00:00.000Z');
    const cheapProject = analysis.projects.find((project) => project.projectId === 'cheap-fixed');
    const backendBottleneck = analysis.skillBottlenecks.find((skill) => skill.skillId === 'backend');

    expect(cheapProject?.allocatedHoursBySkill).toContainEqual({ skillId: 'backend', hours: 120 });
    expect(cheapProject?.missingRequiredHoursBySkill).not.toContainEqual({ skillId: 'backend', hours: expect.any(Number) });
    expect(backendBottleneck?.allocatedHours).toBe(120);
  });

  it('ranks remove-project scenarios by released scarce capacity and reduced risk', () => {
    const analysis = generateMonthOpportunityAnalysis(baseSnapshot, '2026-03', '2026-03-01T00:00:00.000Z');
    const scenario = analysis.removeProjectScenarios.find((item) => item.projectId === 'cheap-fixed');

    expect(scenario?.releasedHours).toBe(120);
    expect(scenario?.lostExpectedRevenueK).toBe(16);
    expect(scenario?.riskReductionCount).toBeGreaterThan(0);
  });

  it('suggests profitable bench allocation candidates for a new project without explicit requirements', () => {
    const analysis = generateMonthOpportunityAnalysis({
      ...baseSnapshot,
      projects: [
        ...baseSnapshot.projects,
        {
          id: 'new-commercial',
          name: 'New Commercial',
          client: 'Fresh Client',
          contractType: 'time_materials_capped',
          stage: 'likely',
          planningStatus: 'active',
          budgetK: 24,
          probability: 0.9,
          startMonth: 'Marzec 2026',
          startPeriodId: '2026-03',
          rateConfig: { projectRatePlnH: 320, companyTargetRatePlnH: 260 },
          requirements: [],
          revenuePlan: [{ periodId: '2026-03', revenueK: 24, probability: 0.9 }],
          invoices: [],
          notes: '',
        },
      ],
      allocations: [
        ...baseSnapshot.allocations,
        {
          id: 'bench-senior',
          personId: 'senior-backend',
          tileIndex: 1,
          target: 'bench',
          periodId: '2026-03',
          mode: 'hours_first',
          revenueK: 8,
          hours: 32,
        },
        {
          id: 'bench-frontend',
          personId: 'frontend',
          tileIndex: 1,
          target: 'bench',
          periodId: '2026-03',
          mode: 'hours_first',
          revenueK: 8,
          hours: 32,
        },
      ],
    }, '2026-03', '2026-03-01T00:00:00.000Z');

    const newProject = analysis.projects.find((project) => project.projectId === 'new-commercial');

    expect(newProject?.resourceGapK).toBe(24);
    expect(newProject?.allocationCandidates[0]).toMatchObject({
      personId: 'frontend',
      sourceAllocationIds: ['bench-frontend'],
    });
    expect(newProject?.allocationCandidates[0]?.estimatedGrossProfitK)
      .toBeGreaterThan(newProject?.allocationCandidates[1]?.estimatedGrossProfitK || 0);
  });

  it('suggests reallocating wrongly assigned project tiles to projects with matching requirements', () => {
    const analysis = generateMonthOpportunityAnalysis({
      ...baseSnapshot,
      allocations: [
        {
          ...baseSnapshot.allocations[0],
          target: 'good-frontend',
          skillId: undefined,
          requirementId: undefined,
          validation: [{ code: 'missing_required_skill', severity: 'invalid', message: 'Backend does not cover frontend.' }],
        },
        {
          ...baseSnapshot.allocations[1],
          target: 'cheap-fixed',
          skillId: undefined,
          requirementId: undefined,
          validation: [{ code: 'missing_required_skill', severity: 'invalid', message: 'Frontend does not cover backend.' }],
        },
      ],
    }, '2026-03', '2026-03-01T00:00:00.000Z');

    const cheapProject = analysis.projects.find((project) => project.projectId === 'cheap-fixed');
    const frontendProject = analysis.projects.find((project) => project.projectId === 'good-frontend');

    expect(cheapProject?.allocationCandidates).toContainEqual(expect.objectContaining({
      personId: 'senior-backend',
      sourceAllocationIds: ['alloc-cheap'],
      sourceTargetIds: ['good-frontend'],
      source: 'misallocated_project',
    }));
    expect(frontendProject?.allocationCandidates).toContainEqual(expect.objectContaining({
      personId: 'frontend',
      sourceAllocationIds: ['alloc-good'],
      sourceTargetIds: ['cheap-fixed'],
      source: 'misallocated_project',
    }));
  });

  it('detects wrongly assigned project tiles even before allocation validation is saved', () => {
    const analysis = generateMonthOpportunityAnalysis({
      ...baseSnapshot,
      allocations: [
        {
          ...baseSnapshot.allocations[0],
          target: 'good-frontend',
          skillId: undefined,
          requirementId: undefined,
          validation: undefined,
        },
        {
          ...baseSnapshot.allocations[1],
          target: 'cheap-fixed',
          skillId: undefined,
          requirementId: undefined,
          validation: undefined,
        },
      ],
    }, '2026-03', '2026-03-01T00:00:00.000Z');

    const cheapProject = analysis.projects.find((project) => project.projectId === 'cheap-fixed');
    const frontendProject = analysis.projects.find((project) => project.projectId === 'good-frontend');

    expect(cheapProject?.allocationCandidates).toContainEqual(expect.objectContaining({
      personId: 'senior-backend',
      sourceAllocationIds: ['alloc-cheap'],
      sourceTargetIds: ['good-frontend'],
      source: 'misallocated_project',
    }));
    expect(frontendProject?.allocationCandidates).toContainEqual(expect.objectContaining({
      personId: 'frontend',
      sourceAllocationIds: ['alloc-good'],
      sourceTargetIds: ['cheap-fixed'],
      source: 'misallocated_project',
    }));
  });

  it('suggests an in-house R&D goal when benched people cannot safely cover project requirements', () => {
    const analysis = generateMonthOpportunityAnalysis({
      ...baseSnapshot,
      people: [
        ...baseSnapshot.people,
        {
          id: 'qa',
          name: 'QA',
          role: 'QA Engineer',
          initials: 'QA',
          color: '#222222',
          skillIds: ['qa'],
          seniority: 'mid',
          costModel: { type: 'hourly', defaultMonthlyHours: 80, internalHourlyCostPln: 160 },
          monthlyCostK: 13,
          hoursPerTile: 6,
          layers: { workK: 13, adminK: 16, salesK: 19, targetK: 24 },
        },
      ],
      allocations: [
        ...baseSnapshot.allocations,
        {
          id: 'bench-qa',
          personId: 'qa',
          tileIndex: 0,
          target: 'bench',
          periodId: '2026-03',
          mode: 'hours_first',
          revenueK: 6,
          hours: 24,
        },
      ],
    }, '2026-03', '2026-03-01T00:00:00.000Z');

    expect(analysis.benchUtilizationSuggestions).toContainEqual(expect.objectContaining({
      personId: 'qa',
      role: 'QA Engineer',
      seniority: 'mid',
      skillIds: ['qa'],
      suggestion: 'create_inhouse_rd',
      alertLevel: 'medium',
    }));
  });

  it('marks costly senior bench time as a critical R&D opportunity when no safe project matches', () => {
    const analysis = generateMonthOpportunityAnalysis({
      ...baseSnapshot,
      projects: [
        ...baseSnapshot.projects,
        {
          id: 'internal-rd',
          name: 'Internal R&D',
          client: 'Iterato',
          contractType: 'fixed_phase',
          stage: 'signed',
          planningStatus: 'active',
          workType: 'research_development',
          budgetK: 8,
          probability: 1,
          startMonth: 'Marzec 2026',
          startPeriodId: '2026-03',
          rateConfig: { companyTargetRatePlnH: 260 },
          requirements: [],
          revenuePlan: [{ periodId: '2026-03', revenueK: 8, probability: 1 }],
          invoices: [],
          notes: '',
        },
      ],
      allocations: [
        ...baseSnapshot.allocations,
        {
          id: 'bench-senior-rd',
          personId: 'senior-backend',
          tileIndex: 3,
          target: 'bench',
          periodId: '2026-03',
          mode: 'hours_first',
          revenueK: 8,
          hours: 32,
        },
      ],
    }, '2026-03', '2026-03-01T00:00:00.000Z');

    expect(analysis.benchUtilizationSuggestions).toContainEqual(expect.objectContaining({
      personId: 'senior-backend',
      seniority: 'senior',
      skillIds: ['backend'],
      benchInternalCostK: 8,
      alertLevel: 'critical',
      suggestion: 'create_inhouse_rd',
      preferredProjectIds: ['internal-rd'],
    }));
  });

  it('keeps same-skill project requirements separate when building allocation candidates', () => {
    const midBackend: TrafficSnapshot['people'][number] = {
      ...baseSnapshot.people[1],
      id: 'mid-backend',
      name: 'Mid Backend',
      initials: 'MB',
      skillIds: ['backend'],
      seniority: 'mid' as const,
    };
    const sameSkillProject = {
      ...baseSnapshot.projects[0],
      id: 'same-skill-project',
      name: 'Same Skill Project',
      requirements: [
        { id: 'backend-mid-req', skillId: 'backend' as const, seniority: 'mid' as const, estimatedHours: 40, required: true },
        { id: 'backend-senior-req', skillId: 'backend' as const, seniority: 'senior' as const, estimatedHours: 80, required: true },
      ],
      revenuePlan: [{ periodId: '2026-03', revenueK: 40, committedRevenueK: 40, probability: 1 }],
    };

    const analysis = generateMonthOpportunityAnalysis({
      ...baseSnapshot,
      people: [baseSnapshot.people[0], midBackend],
      projects: [sameSkillProject],
      allocations: [
        {
          id: 'mid-backend-allocation',
          personId: 'mid-backend',
          tileIndex: 0,
          target: 'same-skill-project',
          periodId: '2026-03',
          mode: 'hours_first',
          revenueK: 10,
          hours: 40,
          skillId: 'backend',
          requirementId: 'backend-mid-req',
        },
        {
          id: 'senior-backend-bench',
          personId: 'senior-backend',
          tileIndex: 0,
          target: 'bench',
          periodId: '2026-03',
          mode: 'hours_first',
          revenueK: 20,
          hours: 80,
        },
      ],
    }, '2026-03', '2026-03-01T00:00:00.000Z');

    const project = analysis.projects.find((item) => item.projectId === 'same-skill-project');

    expect(project?.requirementCoverage).toEqual([
      expect.objectContaining({ requirementId: 'backend-mid-req', allocatedHours: 40, missingHours: 0 }),
      expect.objectContaining({ requirementId: 'backend-senior-req', allocatedHours: 0, missingHours: 80 }),
    ]);
    expect(project?.missingRequiredHoursBySkill).toEqual([{ skillId: 'backend', hours: 80 }]);
    expect(project?.allocationCandidates).toContainEqual(expect.objectContaining({
      personId: 'senior-backend',
      requirementId: 'backend-senior-req',
    }));
  });

  it('does not use holiday or unavailable bench tiles as AI allocation sources', () => {
    const holidaySenior = {
      ...baseSnapshot.people[0],
      monthlyOverrides: [{
        periodId: '2026-03',
        status: 'holiday' as const,
        availableHours: 0,
      }],
    };

    const analysis = generateMonthOpportunityAnalysis({
      ...baseSnapshot,
      people: [holidaySenior, baseSnapshot.people[1]],
      allocations: [{
        id: 'holiday-bench',
        personId: 'senior-backend',
        tileIndex: 0,
        target: 'bench',
        periodId: '2026-03',
        mode: 'hours_first',
        revenueK: 10,
        hours: 40,
      }],
    }, '2026-03', '2026-03-01T00:00:00.000Z');

    const cheapProject = analysis.projects.find((project) => project.projectId === 'cheap-fixed');

    expect(cheapProject?.allocationCandidates.map((candidate) => candidate.personId)).not.toContain('senior-backend');
    expect(analysis.benchUtilizationSuggestions.map((suggestion) => suggestion.personId)).not.toContain('senior-backend');
  });

  it('does not move tiles out of time-off frames for AI correction candidates', () => {
    const timeOffProject = {
      ...baseSnapshot.projects[0],
      id: 'senior-time-off',
      name: 'Senior URLop',
      client: 'TIME OFF',
      workType: 'time_off' as const,
      requirements: [],
      revenuePlan: [{ periodId: '2026-03', revenueK: 8, probability: 1 }],
    };

    const analysis = generateMonthOpportunityAnalysis({
      ...baseSnapshot,
      projects: [baseSnapshot.projects[0], timeOffProject],
      allocations: [{
        id: 'senior-time-off-allocation',
        personId: 'senior-backend',
        tileIndex: 0,
        target: 'senior-time-off',
        periodId: '2026-03',
        mode: 'hours_first',
        revenueK: 8,
        hours: 32,
      }],
    }, '2026-03', '2026-03-01T00:00:00.000Z');

    const cheapProject = analysis.projects.find((project) => project.projectId === 'cheap-fixed');

    expect(analysis.projects.map((project) => project.projectId)).not.toContain('senior-time-off');
    expect(cheapProject?.allocationCandidates).toEqual([]);
  });

  it('keeps non-commercial capacity out of commercial revenue and margin summaries', () => {
    const rdProject = {
      ...baseSnapshot.projects[0],
      id: 'internal-rd',
      name: 'Internal R&D',
      client: 'Iterato',
      workType: 'research_development' as const,
      requirements: [],
      revenuePlan: [{ periodId: '2026-03', revenueK: 8, probability: 1 }],
    };

    const analysis = generateMonthOpportunityAnalysis({
      ...baseSnapshot,
      projects: [rdProject],
      allocations: [{
        id: 'senior-rd-allocation',
        personId: 'senior-backend',
        tileIndex: 0,
        target: 'internal-rd',
        periodId: '2026-03',
        mode: 'hours_first',
        revenueK: 8,
        hours: 32,
      }],
    }, '2026-03', '2026-03-01T00:00:00.000Z');
    const project = analysis.projects.find((item) => item.projectId === 'internal-rd');

    expect(project).toMatchObject({
      plannedCapacityK: 8,
      plannedRevenueK: 0,
      allocatedCapacityK: 8,
      allocatedRevenueK: 0,
      nonCommercialCapacityK: 8,
      nonCommercialAllocatedCapacityK: 8,
      expectedRevenueK: 0,
      resourceGapK: 0,
    });
    expect(analysis.monthSummary.plannedRevenueK).toBe(0);
    expect(analysis.monthSummary.expectedRevenueK).toBe(0);
    expect(analysis.monthSummary.nonCommercialCapacityK).toBe(8);
    expect(analysis.monthSummary.nonCommercialAllocatedCapacityK).toBe(8);
  });

  it('filters allocation candidates that would violate hard person-pair planning rules', () => {
    const snapshot: TrafficSnapshot = {
      ...baseSnapshot,
      people: [
        ...baseSnapshot.people,
        {
          id: 'bench-backend',
          name: 'Bench Backend',
          role: 'Developer',
          initials: 'BB',
          color: '#222222',
          skillIds: ['backend'],
          seniority: 'senior',
          costModel: { type: 'hourly', defaultMonthlyHours: 120, internalHourlyCostPln: 180 },
          monthlyCostK: 18,
          hoursPerTile: 10,
          layers: { workK: 18, adminK: 22, salesK: 26, targetK: 32 },
        },
      ],
      allocations: [
        { ...baseSnapshot.allocations[0], hours: 60, revenueK: 10 },
        baseSnapshot.allocations[1],
        {
          id: 'bench-backend-alloc',
          personId: 'bench-backend',
          tileIndex: 0,
          target: 'bench',
          periodId: '2026-03',
          mode: 'revenue_first',
          revenueK: 10,
          hours: 60,
        },
      ],
      planningRules: [
        createPersonPairPlanningRule({
          timeScope: 'permanent',
          personAId: 'senior-backend',
          personBId: 'bench-backend',
          projectId: 'cheap-fixed',
          severity: 'hard',
          now: '2026-03-01T00:00:00.000Z',
        }),
      ],
    };

    const analysis = generateMonthOpportunityAnalysis(snapshot, '2026-03', '2026-03-01T00:00:00.000Z');
    const cheapProject = analysis.projects.find((project) => project.projectId === 'cheap-fixed');

    expect(cheapProject?.missingRequiredHoursBySkill).toEqual([{ skillId: 'backend', hours: 60 }]);
    expect(cheapProject?.allocationCandidates.map((candidate) => candidate.personId)).not.toContain('bench-backend');
  });
});
