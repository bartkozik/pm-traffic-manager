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
            title: "Avery: bez projektu",
            detail: "Avery ma dostępność i brak produktywnej alokacji.",
            action: 'Przypisać zadanie albo potwierdzić ławkę.',
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

    const pulse = screen.getByLabelText("Triggery Traffic Review osoby: Avery");
    const trigger = within(pulse).getByLabelText("HR: Avery: bez projektu. Avery ma dostępność i brak produktywnej alokacji. Przypisać zadanie albo potwierdzić ławkę.");

    expect(trigger).toHaveTextContent('HR');
    expect(trigger).toHaveTextContent('bez projektu');
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
              title: "Avery: pm: 0/24h pokrycia.",
              detail: 'Brakuje pokrycia PM.',
              action: 'Poprawić mapowanie alokacji lub potwierdzić brak PM.',
              personId: person.id,
            },
            {
              id: 'trigger-pm-2',
              owner: 'PM',
              severity: 'medium',
              title: "Avery: pm: 0/24h pokrycia.",
              detail: 'Brakuje pokrycia PM.',
              action: 'Poprawić mapowanie alokacji lub potwierdzić brak PM.',
              personId: person.id,
            },
            {
              id: 'trigger-tech',
              owner: 'TECH',
              severity: 'medium',
              title: "Client 1: single point of failure",
              detail: "Tylko Avery jest przypisana do projektu.",
              action: 'Zaplanować backup albo shadowing.',
              personId: person.id,
            },
            {
              id: 'trigger-hr',
              owner: 'HR',
              severity: 'high',
              title: "Avery: konflikt z kalendarzem HR",
              detail: "Avery ma urlop, ale jest zaplanowana.",
              action: 'Zaktualizować dostępność albo przesunąć alokacje.',
              personId: person.id,
            },
            {
              id: 'trigger-finance',
              owner: 'FINANCE',
              severity: 'high',
              title: "Client 1: koszt zespołu ponad budżet",
              detail: 'Alokacje przekraczają ramkę.',
              action: 'Zmniejszyć obsadę albo renegocjować finansowanie.',
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

    const pulse = screen.getByLabelText("Triggery Traffic Review osoby: Avery");

    expect(within(pulse).getByText('2x')).toBeInTheDocument();
    expect(within(pulse).getAllByText("Avery: pm: 0/24h pokrycia.")).toHaveLength(1);
    expect(within(pulse).queryByText("Client 1: koszt zespołu ponad budżet")).not.toBeInTheDocument();

    fireEvent.click(within(pulse).getByRole('button', { name: 'Pokaż 1 ukryte triggery Traffic Review' }));

    expect(within(pulse).getByText("Client 1: koszt zespołu ponad budżet")).toBeInTheDocument();
    expect(within(pulse).getByRole('button', { name: 'Zwiń dodatkowe triggery Traffic Review (1)' })).toBeInTheDocument();
  });
});
