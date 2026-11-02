import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContractType, Period, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { ProjectCard } from './ProjectCard';

const period: Period = {
  id: '2026-06',
  label: 'Czerwiec 2026',
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

    expect(screen.getByLabelText('Zachowanie ramki projektu: ramka elastyczna. Typ kontraktu: T&M bez CAP')).toHaveTextContent('ramka elastyczna');
  });

  it('distinguishes pooled fixed-price frames in the project header', () => {
    renderProjectCard('fixed_phase');

    expect(screen.getByLabelText('Zachowanie ramki projektu: ramka z pulą. Typ kontraktu: fixed price / pula')).toHaveTextContent('ramka z pulą');
    expect(screen.getByLabelText(/Mapa slotów ramki: okno\/pula 24k/)).toBeInTheDocument();
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

    const rail = screen.getByLabelText("Wizualne patterny projektu: Client 1");
    const singlePersonState = within(rail).getByLabelText('jedna osoba: projekt jednoosobowy albo single point of failure');

    expect(singlePersonState).toHaveTextContent('1P');
    expect(singlePersonState).toHaveTextContent('projekt jednoosobowy');
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

    const rail = screen.getByLabelText("Wizualne patterny projektu: Client 1");

    expect(within(rail).getByText('+1')).toBeInTheDocument();
    expect(within(rail).getByLabelText('1 dodatkowe patterny projektu: źródło/scope')).toHaveTextContent('więcej');
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
            detail: "Tylko Avery jest przypisana do projektu.",
            action: 'Zaplanować backup albo shadowing.',
            projectId: 'project-hourly',
          },
          {
            id: 'short-project-core-order-project-hourly',
            owner: 'TECH',
            severity: 'medium',
            title: "Client 1: kolejność BE/FE/QA",
            detail: 'Brakuje QA po frontendzie.',
            action: 'Dodać QA albo zmienić kolejność prac.',
            projectId: 'project-hourly',
          },
          {
            id: 'short-project-team-cost-project-hourly',
            owner: 'FINANCE',
            severity: 'high',
            title: "Client 1: koszt zespołu ponad budżet",
            detail: 'Alokacje przekraczają ramkę.',
            action: 'Zmniejszyć obsadę albo renegocjować finansowanie.',
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

    const pulse = screen.getByLabelText("Triggery Traffic Review projektu: Client 1");
    const trigger = within(pulse).getByLabelText("TECH: Client 1: single point of failure. Tylko Avery jest przypisana do projektu. Zaplanować backup albo shadowing.");

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
            detail: "Tylko Avery jest przypisana do projektu.",
            action: 'Zaplanować backup albo shadowing.',
            projectId: 'project-hourly',
          },
          {
            id: 'long-project-single-point-project-hourly',
            owner: 'TECH',
            severity: 'medium',
            title: "Client 1: single point of failure",
            detail: "Tylko Avery jest przypisana do projektu.",
            action: 'Zaplanować backup albo shadowing.',
            projectId: 'project-hourly',
          },
          {
            id: 'short-project-core-order-project-hourly',
            owner: 'TECH',
            severity: 'medium',
            title: "Client 1: kolejność BE/FE/QA",
            detail: 'Brakuje QA po frontendzie.',
            action: 'Dodać QA albo zmienić kolejność prac.',
            projectId: 'project-hourly',
          },
          {
            id: 'short-project-team-cost-project-hourly',
            owner: 'FINANCE',
            severity: 'high',
            title: "Client 1: koszt zespołu ponad budżet",
            detail: 'Alokacje przekraczają ramkę.',
            action: 'Zmniejszyć obsadę albo renegocjować finansowanie.',
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

    const pulse = screen.getByLabelText("Triggery Traffic Review projektu: Client 1");

    expect(within(pulse).getByText('2x')).toBeInTheDocument();
    expect(within(pulse).getAllByText("Client 1: single point of failure")).toHaveLength(1);
    expect(within(pulse).queryByText("Client 1: koszt zespołu ponad budżet")).not.toBeInTheDocument();

    fireEvent.click(within(pulse).getByRole('button', { name: 'Pokaż 1 ukryte triggery Traffic Review' }));

    expect(within(pulse).getByText("Client 1: koszt zespołu ponad budżet")).toBeInTheDocument();
    expect(within(pulse).getByRole('button', { name: 'Zwiń dodatkowe triggery Traffic Review (1)' })).toBeInTheDocument();
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

    const summary = screen.getByLabelText("Podsumowanie relacji i zmian alokacji: Client 1");
    expect(within(summary).getByTitle("handoff: Avery")).toHaveTextContent('handoff1');
    expect(within(summary).getByTitle("w kilku miejscach: Avery")).toHaveTextContent('w kilku miejscach1');

    const detailRail = screen.getByLabelText("Relacje i zmiany alokacji: Client 1");
    expect(within(detailRail).getByText('więcej')).toBeInTheDocument();
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
          notes: 'Do weryfikacji po refinement.',
        }}
        activePeriodId="2026-06"
        allocations={[allocation('allocation-1', {
          hours: 8,
          validation: [{ code: 'missing_required_skill', severity: 'warning', message: 'Brak skillu FE' }],
        })]}
        allAllocations={[allocation('allocation-1', {
          hours: 8,
          validation: [{ code: 'missing_required_skill', severity: 'warning', message: 'Brak skillu FE' }],
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

    const projectSummary = screen.getByText('Podsumowanie projektu').closest('summary');
    const projectDetails = projectSummary?.closest('details');
    expect((projectDetails as HTMLDetailsElement).open).toBe(false);

    fireEvent.click(projectSummary as HTMLElement);
    expect((projectDetails as HTMLDetailsElement).open).toBe(true);
    expect(within(projectDetails as HTMLElement).getByText('1 wym. · 1 sygnałów · notatka')).toBeInTheDocument();

    const requirementSummary = screen.getByText('Wymagania').closest('summary');
    const riskSummary = screen.getByText('Sygnały alokacji').closest('summary');
    const noteSummary = screen.getByText('Notatka').closest('summary');
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
    expect(screen.getByText(/Brak skillu FE/)).toBeInTheDocument();

    fireEvent.click(noteSummary as HTMLElement);
    expect((notePanel as HTMLDetailsElement).open).toBe(true);
    expect(screen.getByText('Do weryfikacji po refinement.')).toBeInTheDocument();
  });
});
