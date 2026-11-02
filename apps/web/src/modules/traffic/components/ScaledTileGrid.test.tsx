import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScaledTileGrid } from './ScaledTileGrid';

describe('ScaledTileGrid', () => {
  it('renders contract-specific empty frame geometry labels', () => {
    render(
      <ScaledTileGrid
        allocations={[]}
        emptyRevenueK={3}
        emptySlotKeyPrefix="project-alpha"
        emptySlotLabel="wolny limit CAP"
        emptySlotTone="capped"
        peopleById={new Map()}
        skillsById={new Map()}
        onOpenAllocation={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    expect(screen.getByLabelText('wolny limit CAP: 3k')).toHaveClass('is-capped');
    expect(screen.getByText('wolny limit CAP')).toBeInTheDocument();
    expect(screen.getByText('3k')).toBeInTheDocument();
  });

  it('renders compact visual state markers for person allocation cards', () => {
    const person = {
      id: 'person-1',
      name: "Avery",
      role: 'Developer',
      initials: "AK",
      color: '#0f766e',
      skillIds: ['backend' as const],
      seniority: 'mid' as const,
      costModel: { type: 'fixed_monthly' as const, defaultMonthlyHours: 160 },
      monthlyCostK: 12,
      hoursPerTile: 8,
      layers: { workK: 2, adminK: 3, salesK: 4, targetK: 5 },
    };

    render(
      <ScaledTileGrid
        allocations={[
          {
            id: 'allocation-1',
            personId: person.id,
            tileIndex: 0,
            target: 'project-1',
            previousTarget: 'bench',
            periodId: '2026-06',
            mode: 'revenue_first',
            revenueK: 1,
            hours: 24,
            meetingState: { handoffRequired: true, backup: true },
            validation: [{ code: 'missing_required_skill', severity: 'warning', message: 'Brak skillu' }],
          },
        ]}
        emptySlotKeyPrefix="project-alpha"
        peopleById={new Map([[person.id, person]])}
        skillsById={new Map()}
        onOpenAllocation={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Markery wizualne osoby Avery/)).toBeInTheDocument();
    expect(screen.getByLabelText(/ryzyka: 1 ryzyk/)).toHaveClass('is-warning');
    expect(screen.getByLabelText(/info: Wymaga przekazania informacji/)).toHaveClass('is-handoff');
    expect(screen.getByLabelText(/backup: Backup/)).toHaveClass('is-backup');
    expect(screen.getByLabelText(/ruch: Osoba została przesunięta/)).toHaveClass('is-moved');
    expect(screen.getByLabelText(/niska: Osoba ma skrajnie niskie wykorzystanie/)).toHaveClass('is-underloaded-critical');
    expect(screen.getByLabelText(/20h\+: Zaangażowanie/)).toHaveClass('is-active-engagement');

    const riskChip = screen.getByLabelText('1 ryzyk dla tej grupy alokacji');
    expect(within(riskChip).getByText('ryzyka: 1')).toHaveClass('traffic-person-signal-full');
    expect(within(riskChip).getByText('R1')).toHaveClass('traffic-person-signal-compact');

    const handoffChip = screen.getByLabelText('Wymaga przekazania informacji: 1 kaf.');
    expect(within(handoffChip).getByText('info')).toHaveClass('traffic-person-signal-full');
    expect(within(handoffChip).getByText('I')).toHaveClass('traffic-person-signal-compact');
  });

  it('caps text-heavy person signal chips while keeping hidden marker context accessible', () => {
    const person = {
      id: 'person-1',
      name: "Avery",
      role: 'Developer',
      initials: "AK",
      color: '#0f766e',
      skillIds: ['backend' as const],
      seniority: 'senior' as const,
      costModel: { type: 'fixed_monthly' as const, defaultMonthlyHours: 160 },
      monthlyCostK: 12,
      hoursPerTile: 8,
      layers: { workK: 1, adminK: 2, salesK: 3, targetK: 4 },
    };

    const { container } = render(
      <ScaledTileGrid
        allocations={[{
          id: 'allocation-1',
          personId: person.id,
          tileIndex: 0,
          target: 'project-1',
          previousTarget: 'bench',
          periodId: '2026-06',
          mode: 'revenue_first',
          revenueK: 1,
          hours: 24,
          meetingState: {
            changedThisWeek: true,
            handoffRequired: true,
            planB: true,
            mentoring: true,
            backup: true,
          },
          validation: [{ code: 'missing_required_skill', severity: 'warning', message: 'Brak skillu' }],
        }]}
        emptySlotKeyPrefix="project-alpha"
        periodAllocations={[
          {
            id: 'allocation-1',
            personId: person.id,
            tileIndex: 0,
            target: 'project-1',
            previousTarget: 'bench',
            periodId: '2026-06',
            mode: 'revenue_first',
            revenueK: 1,
            hours: 24,
            meetingState: {
              changedThisWeek: true,
              handoffRequired: true,
              planB: true,
              mentoring: true,
              backup: true,
            },
            validation: [{ code: 'missing_required_skill', severity: 'warning', message: 'Brak skillu' }],
          },
          {
            id: 'allocation-2',
            personId: person.id,
            tileIndex: 1,
            target: 'project-2',
            periodId: '2026-06',
            mode: 'revenue_first',
            revenueK: 1,
            hours: 24,
          },
        ]}
        peopleById={new Map([[person.id, person]])}
        skillsById={new Map()}
        onOpenAllocation={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    const signals = container.querySelector('.traffic-person-tile-group-signals');

    expect(signals?.children).toHaveLength(6);
    expect(screen.getByLabelText(/5 dodatkowe markery osoby Avery: Plan B, mentor, backup, ruch, 20h\+/)).toHaveTextContent('więcej 5');
  });

  it('renders cost layers as compact visual codes with accessible labels', () => {
    const person = {
      id: 'person-1',
      name: "Avery",
      role: 'Developer',
      initials: "AK",
      color: '#0f766e',
      skillIds: ['backend' as const],
      seniority: 'mid' as const,
      costModel: { type: 'fixed_monthly' as const, defaultMonthlyHours: 160 },
      monthlyCostK: 12,
      hoursPerTile: 8,
      layers: { workK: 1, adminK: 2, salesK: 3, targetK: 4 },
    };

    render(
      <ScaledTileGrid
        allocations={[
          {
            id: 'allocation-1',
            personId: person.id,
            tileIndex: 0,
            target: 'project-1',
            periodId: '2026-06',
            mode: 'revenue_first',
            revenueK: 1,
            hours: 8,
          },
          {
            id: 'allocation-2',
            personId: person.id,
            tileIndex: 1,
            target: 'project-1',
            periodId: '2026-06',
            mode: 'revenue_first',
            revenueK: 1,
            hours: 8,
          },
          {
            id: 'allocation-3',
            personId: person.id,
            tileIndex: 2,
            target: 'project-1',
            periodId: '2026-06',
            mode: 'revenue_first',
            revenueK: 1,
            hours: 8,
          },
          {
            id: 'allocation-4',
            personId: person.id,
            tileIndex: 3,
            target: 'project-1',
            periodId: '2026-06',
            mode: 'revenue_first',
            revenueK: 1,
            hours: 8,
          },
        ]}
        emptySlotKeyPrefix="project-alpha"
        peopleById={new Map([[person.id, person]])}
        skillsById={new Map()}
        onOpenAllocation={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Warstwy alokacji: koszt pracy 1k, biuro\/admin 1k, sprzedaż\/marketing 1k, marża\/cel 1k/)).toBeInTheDocument();
    expect(screen.getByTitle('koszt pracy: 1k')).toHaveTextContent('K1k');
    expect(screen.getByTitle('biuro/admin: 1k')).toHaveTextContent('B1k');
    expect(screen.getByTitle('sprzedaż/marketing: 1k')).toHaveTextContent('S1k');
    expect(screen.getByTitle('marża/cel: 1k')).toHaveTextContent('M1k');
    expect(screen.queryByText('koszt 1k')).not.toBeInTheDocument();
    expect(screen.queryByText('biuro 1k')).not.toBeInTheDocument();
    expect(screen.queryByText('sprzed. 1k')).not.toBeInTheDocument();
    expect(screen.queryByText('marża 1k')).not.toBeInTheDocument();
  });

  it('renders compact weekly hour slots on person allocation cards', () => {
    const person = {
      id: 'person-1',
      name: "Avery",
      role: 'Developer',
      initials: "AK",
      color: '#0f766e',
      skillIds: ['backend' as const],
      seniority: 'mid' as const,
      costModel: { type: 'fixed_monthly' as const, defaultMonthlyHours: 160 },
      monthlyCostK: 12,
      hoursPerTile: 8,
      layers: { workK: 1, adminK: 2, salesK: 3, targetK: 4 },
    };
    const periods = [
      {
        id: '2026-06',
        label: 'Czerwiec 2026',
        granularity: 'month' as const,
        startsOn: '2026-06-01',
        endsOn: '2026-06-30',
      },
      {
        id: '2026-06-w1',
        label: 'Czerwiec 2026 W1',
        granularity: 'week' as const,
        startsOn: '2026-06-01',
        endsOn: '2026-06-15',
        parentPeriodId: '2026-06',
      },
      {
        id: '2026-06-w2',
        label: 'Czerwiec 2026 W2',
        granularity: 'week' as const,
        startsOn: '2026-06-16',
        endsOn: '2026-06-30',
        parentPeriodId: '2026-06',
      },
    ];

    render(
      <ScaledTileGrid
        allocations={[{
          id: 'allocation-1',
          personId: person.id,
          tileIndex: 0,
          target: 'project-1',
          periodId: '2026-06',
          mode: 'revenue_first',
          revenueK: 1,
          hours: 40,
          weeklyOverrides: [{ periodId: '2026-06-w1', hours: 24 }],
        }]}
        emptySlotKeyPrefix="project-alpha"
        periods={periods}
        peopleById={new Map([[person.id, person]])}
        skillsById={new Map()}
        onOpenAllocation={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Rozkład tygodniowy osoby Avery: W1 24h ręcznie, W2 16h/)).toBeInTheDocument();
    expect(screen.getByLabelText('W1: 24h, ustawione ręcznie')).toHaveClass('is-manual', 'is-heavy');
    expect(screen.getByLabelText('W2: 16h, rozlane proporcjonalnie')).toHaveClass('is-auto');
  });

  it('compacts dense person tile clusters while keeping tile edit and drag affordances', () => {
    const person = {
      id: 'person-1',
      name: "Avery",
      role: 'Developer',
      initials: "AK",
      color: '#0f766e',
      skillIds: ['backend' as const],
      seniority: 'mid' as const,
      costModel: { type: 'fixed_monthly' as const, defaultMonthlyHours: 160 },
      monthlyCostK: 12,
      hoursPerTile: 8,
      layers: { workK: 2, adminK: 4, salesK: 6, targetK: 8 },
    };
    const onOpenAllocation = vi.fn();

    render(
      <ScaledTileGrid
        allocations={Array.from({ length: 8 }, (_, index) => ({
          id: `allocation-${index}`,
          personId: person.id,
          tileIndex: index,
          target: 'project-1',
          periodId: '2026-06',
          mode: 'revenue_first' as const,
          revenueK: 1,
          hours: 7,
        }))}
        emptySlotKeyPrefix="project-alpha"
        peopleById={new Map([[person.id, person]])}
        skillsById={new Map()}
        onOpenAllocation={onOpenAllocation}
        onTileDragStart={vi.fn()}
      />
    );

    expect(screen.getByRole('note', { name: /Kompaktowy klaster kafelków osoby Avery: 8 kafelków, 8k, 56h/ })).toHaveTextContent('8 kaf.');
    const compactCluster = screen.getByRole('group', { name: "Kafelki w kompaktowym klastrze osoby Avery" });
    expect(compactCluster).toHaveClass('is-compact-cluster');

    const tiles = within(compactCluster).getAllByRole('button', { name: /Avery: 1k PLN/ });
    expect(tiles).toHaveLength(8);
    expect(tiles[0]).toHaveClass('is-compact');
    expect(tiles[0]).toHaveAttribute('draggable', 'true');

    fireEvent.click(tiles[0]);
    expect(onOpenAllocation).toHaveBeenCalledWith('allocation-0');
  });
});
