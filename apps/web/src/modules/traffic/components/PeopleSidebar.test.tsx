import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PeopleSidebar } from './PeopleSidebar';
import { Person, PersonTileAllocation } from '../models/traffic.model';

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

const benchAllocation: PersonTileAllocation = {
  id: 'allocation-bench-1',
  personId: person.id,
  tileIndex: 0,
  target: 'bench',
  periodId: '2026-06',
  mode: 'revenue_first',
  revenueK: 1,
  hours: 8,
};

describe('PeopleSidebar', () => {
  it('surfaces person-scoped Traffic Review triggers on the person card', () => {
    render(
      <PeopleSidebar
        people={[person]}
        periodAllocations={[benchAllocation]}
        benchAllocations={[benchAllocation]}
        skillsById={new Map()}
        reviewTriggersByPersonId={new Map([
          [person.id, [{
            id: 'short-person-no-project-person-1',
            owner: 'HR',
            severity: 'medium',
            title: "Avery: no project",
            detail: "Avery has capacity but no productive allocation.",
            action: 'Assign work or confirm bench time.',
            personId: person.id,
          }]],
        ])}
        pendingArchivePersonId={null}
        onArchivePerson={vi.fn()}
        onCreatePerson={vi.fn()}
        onEditPerson={vi.fn()}
        onOpenHelp={vi.fn()}
        onOpenAllocation={vi.fn()}
        onPersonDragStart={vi.fn()}
        onResetPersonAllocations={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    const pulse = screen.getByLabelText("Traffic Review triggers for person: Avery");
    const trigger = within(pulse).getByLabelText("HR: Avery: no project. Avery has capacity but no productive allocation. Assign work or confirm bench time.");

    expect(trigger).toHaveTextContent('HR');
    expect(trigger).toHaveTextContent('no project');
  });

  it('groups repeated person Traffic Review triggers and expands hidden trigger groups inline', () => {
    render(
      <PeopleSidebar
        people={[person]}
        periodAllocations={[benchAllocation]}
        benchAllocations={[benchAllocation]}
        skillsById={new Map()}
        reviewTriggersByPersonId={new Map([
          [person.id, [
            {
              id: 'trigger-pm-1',
              owner: 'PM',
              severity: 'medium',
              title: "Avery: pm: 0/24h coverage.",
              detail: 'Missing PM coverage.',
              action: 'Fix allocation mapping or confirm the absence of a PM.',
              personId: person.id,
            },
            {
              id: 'trigger-pm-2',
              owner: 'PM',
              severity: 'medium',
              title: "Avery: pm: 0/24h coverage.",
              detail: 'Missing PM coverage.',
              action: 'Fix allocation mapping or confirm the absence of a PM.',
              personId: person.id,
            },
            {
              id: 'trigger-tech',
              owner: 'TECH',
              severity: 'medium',
              title: "Client 1: single point of failure",
              detail: "Only Avery is allocated to the project.",
              action: 'Plan backup or shadowing.',
              personId: person.id,
            },
            {
              id: 'trigger-hr',
              owner: 'HR',
              severity: 'high',
              title: "Avery: HR calendar conflict",
              detail: "Avery is on leave but has planned work.",
              action: 'Update availability or move allocations.',
              personId: person.id,
            },
            {
              id: 'trigger-finance',
              owner: 'FINANCE',
              severity: 'high',
              title: "Client 1: team cost exceeds budget",
              detail: 'Allocations exceed the frame.',
              action: 'Reduce staffing or renegotiate funding.',
              personId: person.id,
            },
          ]],
        ])}
        pendingArchivePersonId={null}
        onArchivePerson={vi.fn()}
        onCreatePerson={vi.fn()}
        onEditPerson={vi.fn()}
        onOpenHelp={vi.fn()}
        onOpenAllocation={vi.fn()}
        onPersonDragStart={vi.fn()}
        onResetPersonAllocations={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    const pulse = screen.getByLabelText("Traffic Review triggers for person: Avery");

    expect(within(pulse).getByText('2x')).toBeInTheDocument();
    expect(within(pulse).getAllByText("Avery: pm: 0/24h coverage.")).toHaveLength(1);
    expect(within(pulse).queryByText("Client 1: team cost exceeds budget")).not.toBeInTheDocument();

    fireEvent.click(within(pulse).getByRole('button', { name: 'Show 1 hidden Traffic Review triggers' }));

    expect(within(pulse).getByText("Client 1: team cost exceeds budget")).toBeInTheDocument();
    expect(within(pulse).getByRole('button', { name: 'Collapse additional Traffic Review triggers (1)' })).toBeInTheDocument();
  });
});
