import { describe, expect, it } from 'vitest';
import { createSeedTrafficSnapshot } from '@ptm/domain';
import {
  buildPerson,
  buildPersonPairBlockRule,
  buildProject,
  findPersonByExternalRef,
  findProjectByExternalRef,
  selectPersonCapacityReconciliation,
  selectPersonCapacityMoves,
  summarizeBoard,
  validateImportReferences,
} from './builders.js';

describe('PTM MCP builders', () => {
  it('builds a complete person with derived cost defaults', () => {
    const snapshot = createSeedTrafficSnapshot();
    const person = buildPerson(snapshot, {
      name: 'Jan Kowalski',
      role: 'Backend Developer',
      skillIds: ['backend'],
      monthlyCostK: 20,
    });

    expect(person).toMatchObject({
      id: 'person-jan-kowalski',
      name: 'Jan Kowalski',
      role: 'Backend Developer',
      initials: 'JK',
      skillIds: ['backend'],
      monthlyCostK: 20,
      hoursPerTile: 5,
      costModel: {
        type: 'fixed_monthly',
        defaultMonthlyHours: 160,
        internalHourlyCostPln: 125,
        fixedMonthlyCostK: 20,
      },
      layers: {
        salesK: 20,
        targetK: 27,
      },
    });
  });

  it('builds imported people with stable source ids and external refs', () => {
    const snapshot = createSeedTrafficSnapshot();
    const person = buildPerson(snapshot, {
      sourceSystem: 'legacy-pm',
      externalId: 'EMP-42',
      name: 'Jan Kowalski',
      role: 'Backend Developer',
      monthlyCostK: 20,
    });

    expect(person.id).toBe('person-legacy-pm-emp-42');
    expect(person.externalRefs).toEqual([
      expect.objectContaining({ sourceSystem: 'legacy-pm', sourceId: 'EMP-42' }),
    ]);
    expect(findPersonByExternalRef({ ...snapshot, people: [person] }, 'legacy-pm', 'EMP-42')?.id).toBe(person.id);
  });

  it('builds a project with monthly revenue and requirements', () => {
    const snapshot = createSeedTrafficSnapshot();
    const project = buildProject(snapshot, {
      name: 'Portal klienta',
      client: 'ACME',
      stage: 'likely',
      revenueK: 42,
      projectRatePlnH: 240,
      requirements: [
        { skillId: 'backend', seniority: 'senior', estimatedHours: 80, phaseLabel: 'Build' },
      ],
    });

    expect(project).toMatchObject({
      id: 'project-portal-klienta',
      name: 'Portal klienta',
      client: 'ACME',
      stage: 'likely',
      planningStatus: 'ghost',
      probability: 0.65,
      budgetK: 42,
      startPeriodId: snapshot.activePeriodId,
      rateConfig: {
        projectRatePlnH: 240,
        companyTargetRatePlnH: 260,
      },
      revenuePlan: [{
        periodId: snapshot.activePeriodId,
        nativeRevenueK: 42,
        revenueK: 42,
        probability: 0.65,
      }],
      requirements: [{
        id: 'project-portal-klienta-backend-1',
        skillId: 'backend',
        seniority: 'senior',
        estimatedHours: 80,
        required: true,
        phaseLabel: 'Build',
      }],
    });
  });

  it('builds imported projects with multi-month revenue plans and external refs', () => {
    const snapshot = createSeedTrafficSnapshot();
    const project = buildProject(snapshot, {
      sourceSystem: 'crm',
      externalId: 'deal-7',
      name: 'Portal klienta',
      client: 'ACME',
      revenueK: 42,
      revenuePlans: [
        { periodId: '2026-06', revenueK: 30, committedRevenueK: 20, currency: 'PLN', probability: 100 },
        { periodId: '2026-07', revenueK: 12, currency: 'EUR', probability: 50 },
      ],
    });

    expect(project.id).toBe('project-crm-deal-7');
    expect(project.externalRefs).toEqual([
      expect.objectContaining({ sourceSystem: 'crm', sourceId: 'deal-7' }),
    ]);
    expect(project.revenuePlan.map((plan) => [plan.periodId, plan.revenueK, plan.probability])).toEqual([
      ['2026-06', 30, 1],
      ['2026-07', 12, 0.5],
    ]);
    expect(findProjectByExternalRef({ ...snapshot, projects: [project] }, 'crm', 'deal-7')?.id).toBe(project.id);
  });

  it('selects bench tiles when moving person capacity to a project', () => {
    const snapshot = createSeedTrafficSnapshot();
    const selection = selectPersonCapacityMoves(snapshot, {
      personId: 'anna',
      toTarget: 'alfa',
      tileCount: 2,
    });

    expect(selection).toEqual({
      periodId: snapshot.activePeriodId,
      moves: [
        { tileId: `${snapshot.activePeriodId}-anna-0`, target: 'alfa' },
        { tileId: `${snapshot.activePeriodId}-anna-1`, target: 'alfa' },
      ],
    });
  });

  it('reconciles desired person allocation counts by moving only the delta', () => {
    const snapshot = createSeedTrafficSnapshot();
    const firstSelection = selectPersonCapacityReconciliation(snapshot, {
      personId: 'anna',
      target: 'alfa',
      desiredTileCount: 3,
    });

    expect(firstSelection.moves).toHaveLength(3);
    expect(firstSelection.moves.map((move) => move.target)).toEqual(['alfa', 'alfa', 'alfa']);

    let assignedAnnaTiles = 0;
    const alreadyAssigned = {
      ...snapshot,
      allocations: snapshot.allocations.map((allocation) => {
        if (allocation.personId !== 'anna' || assignedAnnaTiles >= 2) return allocation;
        assignedAnnaTiles += 1;
        return { ...allocation, target: 'alfa' };
      }),
    };
    const secondSelection = selectPersonCapacityReconciliation(alreadyAssigned, {
      personId: 'anna',
      target: 'alfa',
      desiredTileCount: 3,
    });

    expect(secondSelection.currentTileCount).toBe(2);
    expect(secondSelection.moves).toHaveLength(1);
  });

  it('builds a deterministic period-scoped person pair block rule', () => {
    const snapshot = createSeedTrafficSnapshot();
    const rule = buildPersonPairBlockRule(snapshot, {
      personAId: 'anna',
      personBId: 'tomasz',
      periodId: '2026-06',
      severity: 'warning',
      reason: 'Avoid this pairing during onboarding.',
    });

    expect(rule).toMatchObject({
      id: 'person-pair-block:2026-06:all:anna:tomasz',
      type: 'person_pair_block',
      timeScope: 'period',
      periodId: '2026-06',
      personAId: 'anna',
      personBId: 'tomasz',
      severity: 'warning',
      reason: 'Avoid this pairing during onboarding.',
    });
  });

  it('defaults fully committed projects to signed and 100 percent probability', () => {
    const snapshot = createSeedTrafficSnapshot();
    const project = buildProject(snapshot, {
      name: 'Signed retainer',
      client: 'ACME',
      revenueK: 30,
      committedRevenueK: 30,
    });

    expect(project.stage).toBe('signed');
    expect(project.planningStatus).toBe('active');
    expect(project.probability).toBe(1);
    expect(project.revenuePlan[0].probability).toBe(1);
  });

  it('rejects person-pair rules for unknown people', () => {
    const snapshot = createSeedTrafficSnapshot();

    expect(() => buildPersonPairBlockRule(snapshot, {
      personAId: 'anna',
      personBId: 'missing-person',
    })).toThrow('Unknown active personBId: missing-person');
  });

  it('summarizes board ids and period allocation counts for agents', () => {
    const snapshot = createSeedTrafficSnapshot();
    const overview = summarizeBoard(snapshot);

    expect(overview.activePeriodId).toBe(snapshot.activePeriodId);
    expect(overview.counts.activePeople).toBeGreaterThan(0);
    if (!('people' in overview)) {
      throw new Error('Expected board overview to include entity ids by default.');
    }
    expect(overview.people.map((person) => person.id)).toContain('tomasz');
    expect(overview.projects.map((project) => project.id)).toContain('alfa');
    expect(overview.people[0]).toHaveProperty('externalRefCount');
    expect(overview.people[0]).not.toHaveProperty('externalRefs');
    expect(overview.projects[0]).toHaveProperty('externalRefCount');
    expect(overview.projects[0]).not.toHaveProperty('externalRefs');
  });

  it('can omit entity lists from board summaries for low-token mutation responses', () => {
    const snapshot = createSeedTrafficSnapshot();
    const overview = summarizeBoard(snapshot, snapshot.activePeriodId, { includeEntities: false });

    expect(overview.activePeriodId).toBe(snapshot.activePeriodId);
    expect(overview.counts.people).toBe(snapshot.people.length);
    expect(overview.counts.projects).toBe(snapshot.projects.length);
    expect(overview).not.toHaveProperty('people');
    expect(overview).not.toHaveProperty('projects');
  });

  it('validates duplicate source records and missing allocation references before import', () => {
    const snapshot = createSeedTrafficSnapshot();
    const issues = validateImportReferences(snapshot, {
      sourceSystem: 'legacy',
      people: [
        { externalId: 'p1', name: 'One' },
        { externalId: 'p1', name: 'Duplicate' },
      ],
      allocations: [
        { personExternalId: 'missing', projectExternalId: 'also-missing', periodId: '2099-01', desiredTileCount: -1 },
      ],
    });

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'duplicate_person',
      'missing_person',
      'missing_project',
      'missing_period',
      'invalid_tile_count',
    ]));
  });

  it('validates person period ids and allows bench allocation targets', () => {
    const snapshot = createSeedTrafficSnapshot();
    const issues = validateImportReferences(snapshot, {
      sourceSystem: 'legacy',
      people: [{ externalId: 'p1', name: 'One', periodId: '2099-01' }],
      allocations: [{ personId: 'anna', target: 'bench', desiredTileCount: 2 }],
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'missing_period',
        sourceRecordId: 'p1',
      }),
    ]);
  });
});
