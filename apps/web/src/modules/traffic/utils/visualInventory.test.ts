import { describe, expect, it } from 'vitest';
import { Period, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import {
  getFrameBehavior,
  getPeriodRelationshipOverlaySignals,
  getPeriodRelationshipConnectorSignals,
  getPersonGroupVisualFocusClassName,
  getPersonGroupVisualClasses,
  getPooledFrameCapacityK,
  getProjectInventoryCardClassNames,
  getProjectInventoryPatternClassName,
  getProjectInventoryPatternCode,
  getProjectInventoryPatterns,
  getProjectFrameGeometryCells,
  getProjectFrameGeometrySegments,
  getProjectRelationshipSignals,
  getRelationshipSignalClassName,
  getPersonUnderloadSeverity,
  groupAllocationsByPerson,
  isChangeFocusAllocation,
  splitAllocationsByRevenueLimit,
  summarizeProjectRelationshipSignals,
} from './visualInventory';

const person = {
  id: 'person-1',
  name: "Taylor",
  role: 'Developer',
  initials: "TG",
  color: '#2563eb',
  skillIds: ['backend'],
  costModel: { type: 'fixed_monthly', defaultMonthlyHours: 160 },
  monthlyCostK: 18,
  hoursPerTile: 5,
  layers: { workK: 10, adminK: 13, salesK: 16, targetK: 22 },
} satisfies Person;

const periods = [
  { id: '2026-06', label: 'June 2026', granularity: 'month', startsOn: '2026-06-01', endsOn: '2026-06-30' },
  { id: '2026-07', label: 'July 2026', granularity: 'month', startsOn: '2026-07-01', endsOn: '2026-07-31' },
] satisfies Period[];

const project = {
  id: 'project-1',
  client: 'Client',
  name: 'Fixed project',
  contractType: 'multi_month_fixed',
  stage: 'signed',
  budgetK: 20,
  probability: 1,
  startMonth: 'June 2026',
  startPeriodId: '2026-06',
  endPeriodId: '2026-07',
  rateConfig: { companyTargetRatePlnH: 220 },
  requirements: [],
  revenuePlan: [
    { periodId: '2026-06', revenueK: 10 },
    { periodId: '2026-07', revenueK: 10 },
  ],
  invoices: [],
  notes: '',
} satisfies ProjectFrame;

function allocation(id: string, overrides: Partial<PersonTileAllocation> = {}) {
  return {
    id,
    personId: person.id,
    tileIndex: Number(id.replace(/\D/g, '')) || 0,
    target: 'bench',
    periodId: '2026-06',
    mode: 'revenue_first',
    revenueK: 1,
    hours: 5,
    ...overrides,
  } satisfies PersonTileAllocation;
}

describe('visual inventory helpers', () => {
  it('maps contract types to inventory frame behavior', () => {
    expect(getFrameBehavior('hourly')).toBe('elastic');
    expect(getFrameBehavior('time_materials_capped')).toBe('capped');
    expect(getFrameBehavior('fixed_monthly')).toBe('capped');
    expect(getFrameBehavior('fixed_phase')).toBe('pooled');
    expect(getFrameBehavior('multi_month_fixed')).toBe('pooled');
  });

  it('keeps elastic frames uncapped and capped frames overflowed', () => {
    const allocations = [allocation('a1'), allocation('a2'), allocation('a3')];

    expect(splitAllocationsByRevenueLimit(allocations, null)).toMatchObject({
      visibleRevenueK: 3,
      overflowRevenueK: 0,
    });
    expect(splitAllocationsByRevenueLimit(allocations, 2)).toMatchObject({
      visibleRevenueK: 2,
      overflowRevenueK: 1,
    });
  });

  it('shrinks pooled frame capacity after earlier-month burn', () => {
    const juneBurn = Array.from({ length: 14 }, (_, index) => (
      allocation(`burn-${index}`, { target: project.id, periodId: '2026-06' })
    ));

    expect(getPooledFrameCapacityK(project, '2026-07', juneBurn, periods, 10)).toBe(6);
  });

  it('builds visual frame geometry segments for filled, empty, pool and overflow states', () => {
    expect(getProjectFrameGeometrySegments({
      frameBehavior: 'capped',
      visibleRevenueK: 6,
      emptyRevenueK: 4,
      overflowRevenueK: 2,
    }).map((segment) => [segment.kind, segment.label, segment.valueK])).toEqual([
      ['filled', 'filled', 6],
      ['empty', 'free', 4],
      ['overflow', 'overflow', 2],
    ]);

    expect(getProjectFrameGeometrySegments({
      frameBehavior: 'pooled',
      visibleRevenueK: 7,
      emptyRevenueK: 1,
      poolRemainingK: 12,
      overflowRevenueK: 0,
    }).map((segment) => [segment.kind, segment.label, segment.valueK])).toEqual([
      ['filled', 'filled', 7],
      ['empty', 'window/pool', 1],
      ['poolRemaining', 'remaining pool', 12],
    ]);
  });

  it('builds bounded square cells for visual frame geometry maps', () => {
    const segments = getProjectFrameGeometrySegments({
      frameBehavior: 'capped',
      visibleRevenueK: 18,
      emptyRevenueK: 12,
      overflowRevenueK: 6,
    });
    const cells = getProjectFrameGeometryCells(segments, 12);

    expect(cells).toHaveLength(12);
    expect(cells[0]).toMatchObject({ kind: 'filled', label: 'filled', segmentValueK: 18, unitK: 3 });
    expect(cells.filter((cell) => cell.kind === 'filled')).toHaveLength(6);
    expect(cells.filter((cell) => cell.kind === 'empty')).toHaveLength(4);
    expect(cells.filter((cell) => cell.kind === 'overflow')).toHaveLength(2);
  });

  it('groups allocations by person and marks fragmentation across targets', () => {
    const peopleById = new Map([[person.id, person]]);
    const grouped = groupAllocationsByPerson(
      [
        allocation('a1', { target: 'project-1', validation: [{ code: 'target_revenue_gap', severity: 'warning', message: 'gap' }] }),
        allocation('a2', { target: 'project-1', validation: [{ code: 'target_revenue_surplus', severity: 'info', message: 'ok' }] }),
      ],
      peopleById,
      [
        allocation('a1', { target: 'project-1', hours: 24 }),
        allocation('a2', { target: 'project-1' }),
        allocation('a3', { target: 'project-2', hours: 24 }),
      ]
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({
      revenueK: 2,
      hours: 10,
      warningCount: 1,
      positiveCount: 1,
      fragmentCount: 2,
      meetingStateCounts: {
        unchanged: 0,
        changedThisWeek: 0,
        handoffRequired: 0,
        planB: 0,
        mentoring: 0,
        backup: 0,
        moved: 0,
        activeEngagement: 0,
        unavailableContext: 0,
        lowWorkload: 0,
        underloaded: 1,
        rdWork: 0,
        waitingRoomWork: 0,
        timeOffWork: 0,
        lowValueWork: 0,
        ownership: 0,
      },
    });
  });

  it('aggregates meeting state markers for visible person groups', () => {
    const peopleById = new Map([[person.id, person]]);
    const grouped = groupAllocationsByPerson(
      [
        allocation('a1', { meetingState: { changedThisWeek: true, handoffRequired: true } }),
        allocation('a2', { meetingState: { planB: true, mentoring: true } }),
        allocation('a3', { meetingState: { unchanged: true } }),
      ],
      peopleById,
      []
    );

    expect(grouped[0].meetingStateCounts).toEqual({
      unchanged: 1,
      changedThisWeek: 1,
      handoffRequired: 1,
      planB: 1,
      mentoring: 1,
      backup: 0,
      moved: 0,
      activeEngagement: 0,
      unavailableContext: 0,
      lowWorkload: 1,
      underloaded: 1,
      rdWork: 0,
      waitingRoomWork: 0,
      timeOffWork: 0,
      lowValueWork: 0,
      ownership: 0,
    });
  });

  it('derives active engagement and unavailable-context markers from allocation and person state', () => {
    const unavailablePerson = {
      ...person,
      monthlyOverrides: [{ periodId: '2026-06', status: 'holiday' as const }],
    };
    const peopleById = new Map([[unavailablePerson.id, unavailablePerson]]);
    const grouped = groupAllocationsByPerson(
      [allocation('a1', { hours: 24, periodId: '2026-06' })],
      peopleById,
      []
    );

    expect(grouped[0].meetingStateCounts.activeEngagement).toBe(1);
    expect(grouped[0].meetingStateCounts.unavailableContext).toBe(1);
    expect(grouped[0].meetingStateCounts.lowWorkload).toBe(1);
  });

  it('derives bench, underload, low-value, R&D, waiting-room, and PM ownership markers from board context', () => {
    const pmPerson = {
      ...person,
      skillIds: ['pm'],
    } satisfies Person;
    const lowValueProject = {
      ...project,
      stage: 'defensive',
    } satisfies ProjectFrame;
    const rdProject = {
      ...project,
      id: 'project-rd',
      workType: 'research_development',
    } satisfies ProjectFrame;
    const waitingRoomProject = {
      ...project,
      id: 'project-waiting',
      workType: 'waiting_room',
    } satisfies ProjectFrame;
    const peopleById = new Map([[pmPerson.id, pmPerson]]);
    const projectsById = new Map<string, ProjectFrame>([
      [lowValueProject.id, lowValueProject],
      [rdProject.id, rdProject],
      [waitingRoomProject.id, waitingRoomProject],
    ]);
    const grouped = groupAllocationsByPerson(
      [
        allocation('a1', { target: 'bench' }),
        allocation('a2', { target: lowValueProject.id }),
        allocation('a3', { target: rdProject.id }),
        allocation('a4', { target: waitingRoomProject.id }),
      ],
      peopleById,
      [],
      projectsById
    );

    expect(grouped[0].meetingStateCounts.lowWorkload).toBe(1);
    expect(grouped[0].meetingStateCounts.underloaded).toBe(1);
    expect(grouped[0].underloadSeverity).toBe('critical');
    expect(grouped[0].meetingStateCounts.rdWork).toBe(1);
    expect(grouped[0].meetingStateCounts.waitingRoomWork).toBe(1);
    expect(grouped[0].meetingStateCounts.lowValueWork).toBe(1);
    expect(grouped[0].meetingStateCounts.ownership).toBe(1);
  });

  it('derives movement markers from previous target state', () => {
    const peopleById = new Map([[person.id, person]]);
    const grouped = groupAllocationsByPerson(
      [allocation('a1', { target: project.id, previousTarget: 'bench' })],
      peopleById,
      []
    );

    expect(grouped[0].meetingStateCounts.moved).toBe(1);
    expect(getPersonGroupVisualClasses(grouped[0])).toContain('has-moved');
  });

  it('derives project relationship signals from meeting markers and monthly fragmentation', () => {
    const peopleById = new Map([[person.id, person]]);
    const signals = getProjectRelationshipSignals(
      [
        allocation('a0', { target: project.id, meetingState: { unchanged: true } }),
        allocation('a1', { target: project.id, previousTarget: 'bench', meetingState: { changedThisWeek: true, handoffRequired: true } }),
        allocation('a2', { target: project.id, meetingState: { mentoring: true, backup: true } }),
      ],
      peopleById,
      [
        allocation('a1', { target: project.id, hours: 24 }),
        allocation('a2', { target: project.id }),
        allocation('a3', { target: 'project-2', hours: 24 }),
      ]
    );

    expect(signals.map((signal) => signal.kind)).toEqual([
      'unchanged',
      'moved',
      'handoff',
      'changed',
      'mentoring',
      'backup',
      'fragmented',
    ]);
    expect(signals.map((signal) => signal.personName)).toEqual(["Taylor", "Taylor", "Taylor", "Taylor", "Taylor", "Taylor", "Taylor"]);
  });

  it('summarizes project relationship signals by type and unique people', () => {
    const peopleById = new Map([[person.id, person]]);
    const signals = getProjectRelationshipSignals(
      [
        allocation('a0', { target: project.id, meetingState: { unchanged: true } }),
        allocation('a1', { target: project.id, previousTarget: 'bench', meetingState: { changedThisWeek: true, handoffRequired: true } }),
        allocation('a2', { target: project.id, meetingState: { changedThisWeek: true } }),
      ],
      peopleById,
      [
        allocation('a1', { target: project.id, hours: 24 }),
        allocation('a2', { target: 'project-2', hours: 24 }),
      ]
    );

    expect(summarizeProjectRelationshipSignals(signals).map((summary) => ({
      kind: summary.kind,
      count: summary.count,
      detail: summary.detail,
    }))).toEqual([
      { kind: 'unchanged', count: 1, detail: "unchanged: Taylor" },
      { kind: 'moved', count: 1, detail: "move: Taylor" },
      { kind: 'handoff', count: 1, detail: "handoff: Taylor" },
      { kind: 'changed', count: 1, detail: "change: Taylor" },
      { kind: 'fragmented', count: 1, detail: "across multiple projects: Taylor" },
    ]);
  });

  it('derives project inventory patterns for healthy teams, single-person projects, shortages, R&D, waiting-room and low-value work', () => {
    const secondPerson = {
      ...person,
      id: 'person-2',
      name: "Avery",
      initials: 'AN',
      skillIds: ['frontend'],
    } satisfies Person;
    const peopleById = new Map<string, Person>([
      [person.id, person],
      [secondPerson.id, secondPerson],
    ]);
    const healthyProject = {
      ...project,
      contractType: 'hourly',
      stage: 'signed',
      planningStatus: 'active',
      requirements: [
        { id: 'req-backend', skillId: 'backend', estimatedHours: 5, required: true },
        { id: 'req-frontend', skillId: 'frontend', estimatedHours: 5, required: true },
      ],
    } satisfies ProjectFrame;

    const healthyPatterns = getProjectInventoryPatterns({
      project: healthyProject,
      allocations: [
        allocation('a1', { target: healthyProject.id, personId: person.id, hours: 5 }),
        allocation('a2', { target: healthyProject.id, personId: secondPerson.id, hours: 5 }),
      ],
      periodAllocations: [
        allocation('a1', { target: healthyProject.id, personId: person.id, hours: 5 }),
        allocation('a2', { target: healthyProject.id, personId: secondPerson.id, hours: 5 }),
      ],
      peopleById,
      overflowRevenueK: 0,
    });

    expect(healthyPatterns.map((pattern) => pattern.kind)).toEqual(['healthyTeam']);
    expect(getProjectInventoryCardClassNames(healthyPatterns)).toEqual(['has-project-healthy-team']);

    const singlePersonPatterns = getProjectInventoryPatterns({
      project,
      allocations: [allocation('a1', { target: project.id })],
      periodAllocations: [allocation('a1', { target: project.id })],
      peopleById,
      overflowRevenueK: 0,
    });

    expect(singlePersonPatterns.map((pattern) => pattern.kind)).toContain('singlePersonProject');
    expect(getProjectInventoryPatternClassName('singlePersonProject')).toBe('is-single-person');

    const shortagePatterns = getProjectInventoryPatterns({
      project: {
        ...project,
        requirements: [{ id: 'req-backend', skillId: 'backend', estimatedHours: 20, required: true }],
      },
      allocations: [allocation('a1', { target: project.id, hours: 5 })],
      periodAllocations: [allocation('a1', { target: project.id, hours: 5 })],
      peopleById,
      overflowRevenueK: 0,
    });

    expect(shortagePatterns.map((pattern) => pattern.kind)).toContain('peopleShortage');

    const lowValuePatterns = getProjectInventoryPatterns({
      project: { ...project, stage: 'defensive', planningStatus: 'ghost' },
      allocations: [],
      periodAllocations: [],
      peopleById,
      overflowRevenueK: 0,
    });

    expect(lowValuePatterns.map((pattern) => pattern.kind)).toEqual(['emptyProject', 'lowValueProject']);

    const rdPatterns = getProjectInventoryPatterns({
      project: { ...project, workType: 'research_development' },
      allocations: [],
      periodAllocations: [],
      peopleById,
      overflowRevenueK: 0,
    });
    expect(rdPatterns.map((pattern) => pattern.kind)).toEqual(['emptyProject', 'researchDevelopmentProject']);
    expect(getProjectInventoryPatternClassName('researchDevelopmentProject')).toBe('is-rd-project');

    const waitingRoomPatterns = getProjectInventoryPatterns({
      project: { ...project, workType: 'waiting_room' },
      allocations: [],
      periodAllocations: [],
      peopleById,
      overflowRevenueK: 0,
    });
    expect(waitingRoomPatterns.map((pattern) => pattern.kind)).toEqual(['emptyProject', 'waitingRoomProject']);
    expect(getProjectInventoryPatternClassName('waitingRoomProject')).toBe('is-waiting-room-project');

    const sourceMismatchPatterns = getProjectInventoryPatterns({
      project: { ...project, sourceStatus: 'scope_changed', sourceStatusNote: 'CRM ma stary scope' },
      allocations: [allocation('a1', { target: project.id })],
      periodAllocations: [allocation('a1', { target: project.id })],
      peopleById,
      overflowRevenueK: 0,
    });

    expect(sourceMismatchPatterns.map((pattern) => pattern.kind)).toContain('sourceMismatch');
    expect(sourceMismatchPatterns.find((pattern) => pattern.kind === 'sourceMismatch')?.detail).toBe('CRM ma stary scope');
    expect(getProjectInventoryPatternClassName('sourceMismatch')).toBe('is-source-mismatch');
    expect(getProjectInventoryPatternCode('healthyTeam')).toBe('OK');
    expect(getProjectInventoryPatternCode('singlePersonProject')).toBe('1P');
    expect(getProjectInventoryPatternCode('peopleShortage')).toBe('GAP');
  });

  it('marks projects with people spread across multiple targets and mixed collaborator fragmentation', () => {
    const secondPerson = {
      ...person,
      id: 'person-2',
      name: "Avery",
      initials: 'AN',
      skillIds: ['frontend'],
    } satisfies Person;
    const peopleById = new Map<string, Person>([
      [person.id, person],
      [secondPerson.id, secondPerson],
    ]);
    const patterns = getProjectInventoryPatterns({
      project,
      allocations: [
        allocation('a1', { target: project.id, personId: person.id }),
        allocation('a2', { target: project.id, personId: secondPerson.id }),
      ],
      periodAllocations: [
        allocation('a1', { target: project.id, personId: person.id, hours: 24 }),
        allocation('a2', { target: project.id, personId: secondPerson.id }),
        allocation('a3', { target: 'project-2', personId: person.id, hours: 24 }),
      ],
      peopleById,
      overflowRevenueK: 0,
    });

    expect(patterns.map((pattern) => pattern.kind)).toEqual([
      'manyProjectPeople',
      'fragmentedCollaborators',
    ]);
  });

  it('ignores symbolic secondary allocations when deriving fragmentation patterns', () => {
    const peopleById = new Map([[person.id, person]]);
    const periodAllocations = [
      allocation('a1', { target: project.id, hours: 24 }),
      allocation('a2', { target: 'project-2', hours: 8 }),
    ];

    expect(getProjectRelationshipSignals(
      [allocation('a1', { target: project.id, hours: 24 })],
      peopleById,
      periodAllocations
    ).map((signal) => signal.kind)).not.toContain('fragmented');

    const patterns = getProjectInventoryPatterns({
      project,
      allocations: [allocation('a1', { target: project.id, hours: 24 })],
      periodAllocations,
      peopleById,
      overflowRevenueK: 0,
    });

    expect(patterns.map((pattern) => pattern.kind)).not.toContain('manyProjectPeople');
    expect(patterns.map((pattern) => pattern.kind)).not.toContain('fragmentedCollaborators');
  });

  it('maps person allocation group state into visual inventory classes', () => {
    const peopleById = new Map([[person.id, person]]);
    const grouped = groupAllocationsByPerson(
      [
        allocation('a1', {
          target: 'bench',
          hours: 24,
          meetingState: { handoffRequired: true, planB: true, mentoring: true, backup: true },
        }),
      ],
      peopleById,
      [
        allocation('a1', { target: 'bench' }),
        allocation('a2', { target: project.id, hours: 24 }),
      ]
    );

    expect(getPersonGroupVisualClasses(grouped[0])).toEqual([
      'has-low-workload',
      'has-underloaded',
      'has-underloaded-critical',
      'has-active-engagement',
      'has-handoff',
      'has-plan-b',
      'has-mentoring',
      'has-backup',
    ]);
  });

  it('distinguishes a person with no productive project work from lower utilization', () => {
    const peopleById = new Map([[person.id, person]]);
    const [benchGroup] = groupAllocationsByPerson(
      [allocation('a1', { target: 'bench', hours: 16 })],
      peopleById,
      []
    );
    const lowGroup = groupAllocationsByPerson(
      [allocation('a2', { target: project.id, hours: 72 })],
      peopleById,
      []
    )[0];

    expect(getPersonUnderloadSeverity(person, '2026-06', [allocation('a1', { target: 'bench' })])).toBe('bench');
    expect(getPersonUnderloadSeverity(person, '2026-06', [allocation('a2', { target: project.id, hours: 72 })])).toBe('low');
    expect(benchGroup.underloadSeverity).toBe('bench');
    expect(getPersonGroupVisualClasses(benchGroup)).toContain('has-bench-only');
    expect(lowGroup.underloadSeverity).toBe('low');
    expect(getPersonGroupVisualClasses(lowGroup)).toContain('has-underloaded');
    expect(getPersonGroupVisualClasses(lowGroup)).not.toContain('has-underloaded-critical');
  });

  it('marks only changed and handoff assignments as weekly focus targets', () => {
    const peopleById = new Map([[person.id, person]]);
    const [changedGroup] = groupAllocationsByPerson(
      [allocation('a1', { meetingState: { changedThisWeek: true } })],
      peopleById,
      []
    );
    const [planBGroup] = groupAllocationsByPerson(
      [allocation('a2', { meetingState: { planB: true } })],
      peopleById,
      []
    );

    expect(isChangeFocusAllocation(allocation('a1', { meetingState: { changedThisWeek: true } }))).toBe(true);
    expect(isChangeFocusAllocation(allocation('a2', { meetingState: { handoffRequired: true } }))).toBe(true);
    expect(isChangeFocusAllocation(allocation('a5', { target: project.id, previousTarget: 'bench' }))).toBe(true);
    expect(isChangeFocusAllocation(allocation('a3', { meetingState: { planB: true } }))).toBe(false);
    expect(isChangeFocusAllocation(allocation('a4', { meetingState: { unchanged: true } }))).toBe(false);
    expect(getPersonGroupVisualFocusClassName(changedGroup, 'changes')).toBe('is-focus-target');
    expect(getPersonGroupVisualFocusClassName(planBGroup, 'changes')).toBe('is-focus-muted');
    expect(getPersonGroupVisualFocusClassName(planBGroup, 'all')).toBe('');
  });

  it('derives month-level relationship overlay signals from assignment markers and target fragmentation', () => {
    const secondProject = {
      ...project,
      id: 'project-2',
      client: 'Second Client',
    } satisfies ProjectFrame;
    const peopleById = new Map([[person.id, person]]);
    const projectsById = new Map([
      [project.id, project],
      [secondProject.id, secondProject],
    ]);
    const signals = getPeriodRelationshipOverlaySignals(
      [
        allocation('a0', { target: project.id, meetingState: { unchanged: true } }),
        allocation('a1', { target: project.id, hours: 24, previousTarget: 'bench', meetingState: { changedThisWeek: true, handoffRequired: true } }),
        allocation('a2', { target: secondProject.id, hours: 24, meetingState: { backup: true } }),
      ],
      peopleById,
      projectsById
    );

    expect(signals.map((signal) => signal.kind)).toEqual(['unchanged', 'moved', 'handoff', 'changed', 'backup', 'fragmented']);
    expect(signals.find((signal) => signal.kind === 'moved')).toMatchObject({
      sourceLabel: 'Bench',
      targetLabel: 'Client',
    });
    expect(signals.map((signal) => signal.targetLabel)).toContain('Client');
    expect(signals.map((signal) => signal.targetLabel)).toContain('Second Client');
    expect(signals.find((signal) => signal.kind === 'fragmented')).toMatchObject({
      sourceLabel: 'Client',
      targetLabel: 'Second Client',
    });
  });

  it('derives lightweight relationship connector signals for movement and cross-target fragmentation', () => {
    const secondProject = {
      ...project,
      id: 'project-2',
      client: 'Second Client',
    } satisfies ProjectFrame;
    const peopleById = new Map([[person.id, person]]);
    const projectsById = new Map([
      [project.id, project],
      [secondProject.id, secondProject],
    ]);
    const connectors = getPeriodRelationshipConnectorSignals(
      [
        allocation('a1', { target: project.id, hours: 24, previousTarget: 'bench', meetingState: { changedThisWeek: true } }),
        allocation('a2', { target: secondProject.id, hours: 24, meetingState: { backup: true } }),
      ],
      peopleById,
      projectsById
    );

    expect(connectors.map((connector) => connector.kind)).toEqual(['moved', 'fragmented']);
    expect(connectors[0]).toMatchObject({
      sourceTarget: 'bench',
      targetTarget: project.id,
      sourceLabel: 'Bench',
      targetLabel: 'Client',
      label: 'move',
    });
    expect(connectors[1]).toMatchObject({
      sourceTarget: project.id,
      targetTarget: secondProject.id,
      sourceLabel: 'Client',
      targetLabel: 'Second Client',
      label: 'across multiple projects',
    });
  });

  it('keeps relationship signal class names stable for shared rail and overlay styling', () => {
    expect(getRelationshipSignalClassName('unchanged')).toBe('is-unchanged');
    expect(getRelationshipSignalClassName('moved')).toBe('is-moved');
    expect(getRelationshipSignalClassName('changed')).toBe('is-changed');
    expect(getRelationshipSignalClassName('handoff')).toBe('is-handoff');
    expect(getRelationshipSignalClassName('planB')).toBe('is-plan-b');
    expect(getRelationshipSignalClassName('mentoring')).toBe('is-mentoring');
    expect(getRelationshipSignalClassName('backup')).toBe('is-backup');
    expect(getRelationshipSignalClassName('fragmented')).toBe('is-fragmented');
  });
});
