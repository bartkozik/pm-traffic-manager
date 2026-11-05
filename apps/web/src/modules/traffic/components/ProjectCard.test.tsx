import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContractType, Period, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { ProjectCard } from './ProjectCard';

const period: Period = {
  id: '2026-06',
  label: 'June 2026',
  granularity: 'month',
  startsOn: '2026-06-01',
  endsOn: '2026-06-30',
};

function project(contractType: ContractType): ProjectFrame {
  return {
    id: `project-${contractType}`,
    name: 'Discovery',
    client: "Client 1",
    contractType,
    stage: 'signed',
    planningStatus: 'active',
    sourceStatus: 'synced',
    workType: 'commercial',
    budgetK: 24,
    probability: 1,
    startMonth: '2026-06',
    startPeriodId: '2026-06',
    rateConfig: { companyTargetRatePlnH: 200 },
    requirements: [],
    revenuePlan: [{ periodId: '2026-06', revenueK: 24, probability: 1 }],
    invoices: [],
    notes: '',
  };
}

function renderProjectCard(contractType: ContractType) {
  render(
    <ProjectCard
      project={project(contractType)}
      activePeriodId="2026-06"
      allocations={[]}
      allAllocations={[]}
      peopleById={new Map()}
      periods={[period]}
      projectsById={new Map()}
      skillsById={new Map()}
      isArchivePending={false}
      onArchive={vi.fn()}
      onDropPayload={vi.fn()}
      onEdit={vi.fn()}
      onOpenHelp={vi.fn()}
      onOpenAllocation={vi.fn()}
      onTileDragStart={vi.fn()}
    />
  );
}

const person: Person = {
  id: 'person-1',
  name: "Avery",
  role: 'Developer',
  initials: "AK",
  color: '#0f766e',
  skillIds: ['frontend'],
  seniority: 'mid',
  costModel: { type: 'fixed_monthly', defaultMonthlyHours: 160 },
  monthlyCostK: 12,
  hoursPerTile: 8,
  layers: {
    workK: 3,
    adminK: 4,
    salesK: 5,
    targetK: 6,
  },
};

function allocation(id: string, overrides: Partial<PersonTileAllocation> = {}) {
  return {
    id,
    personId: person.id,
    tileIndex: Number(id.replace(/\D/g, '')) || 0,
    target: 'project-hourly',
    periodId: '2026-06',
    mode: 'revenue_first',
    revenueK: 1,
    hours: 8,
    ...overrides,
  } satisfies PersonTileAllocation;
}

describe('ProjectCard', () => {
  it('shows stable contract-frame behavior in the project header', () => {
    renderProjectCard('hourly');

    expect(screen.getByLabelText('Project frame behaviour: elastic frame. Contract type: Uncapped T&M')).toHaveTextContent('elastic frame');
  });

  it('distinguishes pooled fixed-price frames in the project header', () => {
    renderProjectCard('fixed_phase');

    expect(screen.getByLabelText('Project frame behaviour: pooled frame. Contract type: Fixed price / pool')).toHaveTextContent('pooled frame');
    expect(screen.getByLabelText(/Frame slot map: window\/pool 24k/)).toBeInTheDocument();
  });

  it('shows compact project inventory codes while preserving full state descriptions', () => {
    render(
      <ProjectCard
        project={project('hourly')}
        activePeriodId="2026-06"
        allocations={[allocation('allocation-1', { hours: 24 })]}
        allAllocations={[allocation('allocation-1', { hours: 24 })]}
        peopleById={new Map([[person.id, person]])}
        periods={[period]}
        projectsById={new Map()}
        skillsById={new Map()}
        isArchivePending={false}
        onArchive={vi.fn()}
        onDropPayload={vi.fn()}
        onEdit={vi.fn()}
        onOpenHelp={vi.fn()}
        onOpenAllocation={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    const rail = screen.getByLabelText("Project visual patterns: Client 1");
    const singlePersonState = within(rail).getByLabelText('one person: one-person project or single point of failure');

    expect(singlePersonState).toHaveTextContent('1P');
    expect(singlePersonState).toHaveTextContent('one-person project');
  });

  it('caps project inventory chips so the allocation canvas remains dominant', () => {
    render(
      <ProjectCard
        project={{
          ...project('hourly'),
          sourceStatus: 'source_missing',
          workType: 'research_development',
          requirements: [{
            id: 'req-frontend',
            skillId: 'frontend',
            estimatedHours: 80,
            required: true,
          }],
        }}
        activePeriodId="2026-06"
        allocations={[allocation('allocation-1', { hours: 24 })]}
        allAllocations={[
          allocation('allocation-1', { hours: 24 }),
          allocation('allocation-2', { target: 'project-2', hours: 24 }),
        ]}
        peopleById={new Map([[person.id, person]])}
        periods={[period]}
        projectsById={new Map()}
        skillsById={new Map()}
        isArchivePending={false}
        onArchive={vi.fn()}
        onDropPayload={vi.fn()}
        onEdit={vi.fn()}
        onOpenHelp={vi.fn()}
        onOpenAllocation={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    const rail = screen.getByLabelText("Project visual patterns: Client 1");

    expect(within(rail).getByText('+1')).toBeInTheDocument();
    expect(within(rail).getByLabelText('1 additional project patterns: source/scope')).toHaveTextContent('more');
  });

  it('surfaces project-scoped Traffic Review triggers directly on the project card', () => {
    render(
      <ProjectCard
        project={project('hourly')}
        activePeriodId="2026-06"
        allocations={[allocation('allocation-1', { hours: 24 })]}
        allAllocations={[allocation('allocation-1', { hours: 24 })]}
        peopleById={new Map([[person.id, person]])}
        periods={[period]}
        projectsById={new Map()}
        skillsById={new Map()}
        reviewTriggers={[
          {
            id: 'short-project-single-point-project-hourly',
            owner: 'TECH',
            severity: 'medium',
            title: "Client 1: single point of failure",
            detail: "Only Avery is allocated to the project.",
            action: 'Plan backup or shadowing.',
            projectId: 'project-hourly',
          },
          {
            id: 'short-project-core-order-project-hourly',
            owner: 'TECH',
            severity: 'medium',
            title: "Client 1: BE/FE/QA sequence",
            detail: 'Brakuje QA po frontendzie.',
            action: 'Add QA or change the work sequence.',
            projectId: 'project-hourly',
          },
          {
            id: 'short-project-team-cost-project-hourly',
            owner: 'FINANCE',
            severity: 'high',
            title: "Client 1: team cost exceeds budget",
            detail: 'Allocations exceed the frame.',
            action: 'Reduce staffing or renegotiate funding.',
            projectId: 'project-hourly',
          },
        ]}
        isArchivePending={false}
        onArchive={vi.fn()}
        onDropPayload={vi.fn()}
        onEdit={vi.fn()}
        onOpenHelp={vi.fn()}
        onOpenAllocation={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    const pulse = screen.getByLabelText("Traffic Review triggers for project: Client 1");
    const trigger = within(pulse).getByLabelText("TECH: Client 1: single point of failure. Only Avery is allocated to the project. Plan backup or shadowing.");

    expect(trigger).toHaveTextContent('TECH');
    expect(trigger).toHaveTextContent('single point of failure');
    expect(within(pulse).getByText('+1')).toBeInTheDocument();
  });

  it('groups duplicate project Traffic Review triggers and lets users inspect hidden trigger groups', () => {
    render(
      <ProjectCard
        project={project('hourly')}
        activePeriodId="2026-06"
        allocations={[allocation('allocation-1', { hours: 24 })]}
        allAllocations={[allocation('allocation-1', { hours: 24 })]}
        peopleById={new Map([[person.id, person]])}
        periods={[period]}
        projectsById={new Map()}
        skillsById={new Map()}
        reviewTriggers={[
          {
            id: 'short-project-single-point-project-hourly',
            owner: 'TECH',
            severity: 'medium',
            title: "Client 1: single point of failure",
            detail: "Only Avery is allocated to the project.",
            action: 'Plan backup or shadowing.',
            projectId: 'project-hourly',
          },
          {
            id: 'long-project-single-point-project-hourly',
            owner: 'TECH',
            severity: 'medium',
            title: "Client 1: single point of failure",
            detail: "Only Avery is allocated to the project.",
            action: 'Plan backup or shadowing.',
            projectId: 'project-hourly',
          },
          {
            id: 'short-project-core-order-project-hourly',
            owner: 'TECH',
            severity: 'medium',
            title: "Client 1: BE/FE/QA sequence",
            detail: 'Brakuje QA po frontendzie.',
            action: 'Add QA or change the work sequence.',
            projectId: 'project-hourly',
          },
          {
            id: 'short-project-team-cost-project-hourly',
            owner: 'FINANCE',
            severity: 'high',
            title: "Client 1: team cost exceeds budget",
            detail: 'Allocations exceed the frame.',
            action: 'Reduce staffing or renegotiate funding.',
            projectId: 'project-hourly',
          },
        ]}
        isArchivePending={false}
        onArchive={vi.fn()}
        onDropPayload={vi.fn()}
        onEdit={vi.fn()}
        onOpenHelp={vi.fn()}
        onOpenAllocation={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    const pulse = screen.getByLabelText("Traffic Review triggers for project: Client 1");

    expect(within(pulse).getByText('2x')).toBeInTheDocument();
    expect(within(pulse).getAllByText("Client 1: single point of failure")).toHaveLength(1);
    expect(within(pulse).queryByText("Client 1: team cost exceeds budget")).not.toBeInTheDocument();

    fireEvent.click(within(pulse).getByRole('button', { name: 'Show 1 hidden Traffic Review triggers' }));

    expect(within(pulse).getByText("Client 1: team cost exceeds budget")).toBeInTheDocument();
    expect(within(pulse).getByRole('button', { name: 'Collapse additional Traffic Review triggers (1)' })).toBeInTheDocument();
  });

  it('summarizes relationship signals before showing limited relationship details', () => {
    render(
      <ProjectCard
        project={project('hourly')}
        activePeriodId="2026-06"
        allocations={[
          allocation('allocation-1', { hours: 24, meetingState: { unchanged: true } }),
          allocation('allocation-2', {
            hours: 24,
            previousTarget: 'bench',
            meetingState: { changedThisWeek: true, handoffRequired: true },
          }),
        ]}
        allAllocations={[
          allocation('allocation-1', { hours: 24, meetingState: { unchanged: true } }),
          allocation('allocation-2', {
            hours: 24,
            previousTarget: 'bench',
            meetingState: { changedThisWeek: true, handoffRequired: true },
          }),
          allocation('allocation-3', { target: 'project-2', hours: 24 }),
        ]}
        peopleById={new Map([[person.id, person]])}
        periods={[period]}
        projectsById={new Map()}
        skillsById={new Map()}
        isArchivePending={false}
        onArchive={vi.fn()}
        onDropPayload={vi.fn()}
        onEdit={vi.fn()}
        onOpenHelp={vi.fn()}
        onOpenAllocation={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    const summary = screen.getByLabelText("Allocation relationships and changes summary: Client 1");
    expect(within(summary).getByTitle("handoff: Avery")).toHaveTextContent('handoff1');
    expect(within(summary).getByTitle("across multiple projects: Avery")).toHaveTextContent('across multiple projects1');

    const detailRail = screen.getByLabelText("Allocation relationships and changes: Client 1");
    expect(within(detailRail).getByText('more')).toBeInTheDocument();
    expect(within(detailRail).getByText('+3')).toBeInTheDocument();
  });

  it('keeps long project report details behind nested collapsed panels', () => {
    render(
      <ProjectCard
        project={{
          ...project('hourly'),
          requirements: [{
            id: 'req-frontend',
            skillId: 'frontend',
            seniority: 'mid',
            estimatedHours: 40,
            required: true,
          }],
          notes: 'Review after refinement.',
        }}
        activePeriodId="2026-06"
        allocations={[allocation('allocation-1', {
          hours: 8,
          validation: [{ code: 'missing_required_skill', severity: 'warning', message: 'Missing FE skill' }],
        })]}
        allAllocations={[allocation('allocation-1', {
          hours: 8,
          validation: [{ code: 'missing_required_skill', severity: 'warning', message: 'Missing FE skill' }],
        })]}
        peopleById={new Map([[person.id, person]])}
        periods={[period]}
        projectsById={new Map()}
        skillsById={new Map([['frontend', {
          id: 'frontend',
          label: 'Frontend',
          defaultRatePlnH: 250,
          defaultTargetRatePlnH: 300,
        }]])}
        isArchivePending={false}
        onArchive={vi.fn()}
        onDropPayload={vi.fn()}
        onEdit={vi.fn()}
        onOpenHelp={vi.fn()}
        onOpenAllocation={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    const projectSummary = screen.getByText('Project summary').closest('summary');
    const projectDetails = projectSummary?.closest('details');
    expect((projectDetails as HTMLDetailsElement).open).toBe(false);

    fireEvent.click(projectSummary as HTMLElement);
    expect((projectDetails as HTMLDetailsElement).open).toBe(true);
    expect(within(projectDetails as HTMLElement).getByText('1 req. · 1 signals · note')).toBeInTheDocument();

    const requirementSummary = screen.getByText('Requirements').closest('summary');
    const riskSummary = screen.getByText('Allocation signals').closest('summary');
    const noteSummary = screen.getByText('Note').closest('summary');
    const requirementPanel = requirementSummary?.closest('details');
    const riskPanel = riskSummary?.closest('details');
    const notePanel = noteSummary?.closest('details');

    expect((requirementPanel as HTMLDetailsElement).open).toBe(false);
    expect((riskPanel as HTMLDetailsElement).open).toBe(false);
    expect((notePanel as HTMLDetailsElement).open).toBe(false);

    fireEvent.click(requirementSummary as HTMLElement);
    expect((requirementPanel as HTMLDetailsElement).open).toBe(true);
    expect(screen.getByText(/Frontend mid: 8\/40h/)).toBeInTheDocument();

    fireEvent.click(riskSummary as HTMLElement);
    expect((riskPanel as HTMLDetailsElement).open).toBe(true);
    expect(screen.getByText(/Missing FE skill/)).toBeInTheDocument();

    fireEvent.click(noteSummary as HTMLElement);
    expect((notePanel as HTMLDetailsElement).open).toBe(true);
    expect(screen.getByText('Review after refinement.')).toBeInTheDocument();
  });
});
