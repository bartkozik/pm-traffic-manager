import { describe, expect, it } from 'vitest';
import { Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { validateAllocation } from './allocationValidation';

const person = {
  id: 'person-1',
  name: 'Mid Frontend',
  role: 'Frontend Developer',
  initials: 'MF',
  color: '#000000',
  skillIds: ['frontend'],
  seniority: 'mid',
  costModel: {
    type: 'hourly',
    defaultMonthlyHours: 100,
    internalHourlyCostPln: 240,
  },
  monthlyCostK: 24,
  hoursPerTile: 5,
  layers: { workK: 8, adminK: 10, salesK: 12, targetK: 18 },
} satisfies Person;

const project = {
  id: 'project-1',
  name: 'Backend Project',
  client: 'Client',
  contractType: 'hourly',
  stage: 'signed',
  budgetK: 12,
  probability: 1,
  startMonth: 'Marzec 2026',
  startPeriodId: '2026-03',
  rateConfig: {
    projectRatePlnH: 160,
    companyTargetRatePlnH: 260,
    skillRatesPlnH: { backend: 260 },
  },
  requirements: [
    {
      id: 'backend-required',
      skillId: 'backend',
      seniority: 'senior',
      estimatedHours: 40,
      required: true,
      phaseLabel: 'Implementation',
    },
  ],
  revenuePlan: [{ periodId: '2026-03', revenueK: 12, committedRevenueK: 12, probability: 1 }],
  invoices: [],
  notes: '',
} satisfies ProjectFrame;

const allocation = {
  id: 'allocation-1',
  personId: person.id,
  tileIndex: 0,
  target: project.id,
  periodId: '2026-03',
  mode: 'hours_first',
  revenueK: 3,
  hours: 20,
  requirementId: 'backend-required',
  skillId: 'backend',
} satisfies PersonTileAllocation;

describe('validateAllocation', () => {
  it('flags role, seniority, required hours, internal margin, and target revenue gaps', () => {
    const validations = validateAllocation(allocation, person, project, [allocation]);
    const codes = validations.map((validation) => validation.code);

    expect(codes).toEqual(expect.arrayContaining([
      'internal_margin_gap',
      'target_revenue_gap',
      'role_mismatch',
      'insufficient_seniority',
      'insufficient_hours',
    ]));
    expect(validations.find((validation) => validation.code === 'target_revenue_gap')?.message)
      .toContain('Ta alokacja daje');
    expect(validations.find((validation) => validation.code === 'target_revenue_gap')?.message)
      .not.toContain('Revenue kafelka');
  });

  it('adds a positive signal when allocation revenue is above target', () => {
    const profitableAllocation = {
      ...allocation,
      revenueK: 12,
      hours: 20,
    } satisfies PersonTileAllocation;
    const validations = validateAllocation(profitableAllocation, person, project, [profitableAllocation]);
    const positiveSignal = validations.find((validation) => validation.code === 'target_revenue_surplus');

    expect(positiveSignal?.severity).toBe('info');
    expect(positiveSignal?.message).toContain('powyżej celu');
  });

  it('flags missing skill mapping when a project has required skills', () => {
    const validations = validateAllocation(
      { ...allocation, requirementId: undefined, skillId: undefined },
      person,
      project,
      [{ ...allocation, requirementId: undefined, skillId: undefined }]
    );

    expect(validations.map((validation) => validation.code)).toContain('missing_required_skill');
  });

  it('uses a matching person skill as the allocation skill when the mapping is unambiguous', () => {
    const backendPerson = {
      ...person,
      skillIds: ['backend'],
      seniority: 'senior',
    } satisfies Person;
    const unmappedBackendAllocation = {
      ...allocation,
      personId: backendPerson.id,
      requirementId: undefined,
      skillId: undefined,
      hours: 40,
    } satisfies PersonTileAllocation;
    const validations = validateAllocation(
      unmappedBackendAllocation,
      backendPerson,
      project,
      [unmappedBackendAllocation]
    );
    const codes = validations.map((validation) => validation.code);

    expect(codes).not.toContain('missing_required_skill');
    expect(codes).not.toContain('insufficient_hours');
    expect(codes).not.toContain('insufficient_seniority');
  });

  it('treats fullstack as covering a single backend requirement without role mismatch', () => {
    const fullstackPerson = {
      ...person,
      skillIds: ['fullstack'],
      seniority: 'senior',
    } satisfies Person;
    const fullstackAllocation = {
      ...allocation,
      personId: fullstackPerson.id,
      requirementId: undefined,
      skillId: undefined,
      hours: 40,
    } satisfies PersonTileAllocation;
    const validations = validateAllocation(
      fullstackAllocation,
      fullstackPerson,
      project,
      [fullstackAllocation]
    );
    const codes = validations.map((validation) => validation.code);

    expect(codes).not.toContain('missing_required_skill');
    expect(codes).not.toContain('role_mismatch');
    expect(codes).not.toContain('insufficient_hours');
  });

  it('lets one multi-skill person cover separate matching project requirements', () => {
    const multiSkillPerson = {
      ...person,
      id: 'anna',
      name: "Avery",
      skillIds: ['design', 'frontend'],
      seniority: 'mid',
      costModel: { type: 'fixed_monthly', defaultMonthlyHours: 120 },
      monthlyCostK: 1,
      hoursPerTile: 7,
    } satisfies Person;
    const multiSkillProject = {
      ...project,
      requirements: [
        { id: 'design-mid', skillId: 'design', seniority: 'mid', estimatedHours: 40, required: true },
        { id: 'frontend-mid', skillId: 'frontend', seniority: 'mid', estimatedHours: 70, required: true },
      ],
      rateConfig: {
        companyTargetRatePlnH: 100,
        skillRatesPlnH: { design: 100, frontend: 100 },
      },
    } satisfies ProjectFrame;
    const designAllocation = {
      ...allocation,
      id: 'allocation-design',
      personId: multiSkillPerson.id,
      requirementId: 'design-mid',
      skillId: 'design',
      hours: 40,
      revenueK: 10,
    } satisfies PersonTileAllocation;
    const frontendAllocation = {
      ...allocation,
      id: 'allocation-frontend',
      personId: multiSkillPerson.id,
      requirementId: 'frontend-mid',
      skillId: 'frontend',
      hours: 70,
      revenueK: 10,
    } satisfies PersonTileAllocation;

    const validations = validateAllocation(
      designAllocation,
      multiSkillPerson,
      multiSkillProject,
      [designAllocation, frontendAllocation]
    );
    const codes = validations.map((validation) => validation.code);

    expect(codes).not.toContain('missing_required_skill');
    expect(codes).not.toContain('role_mismatch');
    expect(codes).not.toContain('insufficient_hours');
    expect(codes).not.toContain('insufficient_seniority');
  });

  it('flags blocked and non-preferred people', () => {
    const validations = validateAllocation(
      allocation,
      person,
      {
        ...project,
        preferredPersonIds: ['other-person'],
        blockedPersonIds: [person.id],
      },
      [allocation]
    );
    const codes = validations.map((validation) => validation.code);

    expect(codes).toEqual(expect.arrayContaining(['blocked_person', 'not_preferred_person']));
  });

  it('flags people that should not work together on the same project', () => {
    const otherPerson = {
      ...person,
      id: 'person-2',
      name: 'Senior Backend',
      seniority: 'senior',
      skillIds: ['backend'],
      blockedCollaborationPersonIds: [person.id],
    } satisfies Person;
    const otherAllocation = {
      ...allocation,
      id: 'allocation-2',
      personId: otherPerson.id,
      hours: 20,
    } satisfies PersonTileAllocation;
    const peopleById = new Map<string, Person>([
      [person.id, person],
      [otherPerson.id, otherPerson],
    ]);

    const validations = validateAllocation(
      allocation,
      person,
      project,
      [allocation, otherAllocation],
      peopleById
    );

    expect(validations.map((validation) => validation.code)).toContain('person_collaboration_conflict');
  });

  it('does not validate bench allocations', () => {
    const validations = validateAllocation({ ...allocation, target: 'bench' }, person, project, [allocation]);

    expect(validations).toEqual([]);
  });
});
