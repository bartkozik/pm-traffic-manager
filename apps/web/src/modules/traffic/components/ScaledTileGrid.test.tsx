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
        emptySlotLabel="Available cap"
        emptySlotTone="capped"
        peopleById={new Map()}
        skillsById={new Map()}
        onOpenAllocation={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Available cap: 3k')).toHaveClass('is-capped');
    expect(screen.getByText('Available cap')).toBeInTheDocument();
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
            validation: [{ code: 'missing_required_skill', severity: 'warning', message: 'Missing skill' }],
          },
        ]}
        emptySlotKeyPrefix="project-alpha"
        peopleById={new Map([[person.id, person]])}
        skillsById={new Map()}
        onOpenAllocation={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Visual markers for person Avery/)).toBeInTheDocument();
    expect(screen.getByLabelText(/risks: 1 risks/)).toHaveClass('is-warning');
    expect(screen.getByLabelText(/info: Handoff needed/)).toHaveClass('is-handoff');
    expect(screen.getByLabelText(/backup: Backup/)).toHaveClass('is-backup');
    expect(screen.getByLabelText(/move: Person moved/)).toHaveClass('is-moved');
    expect(screen.getByLabelText(/very low: Person has extremely low productive utilisation/)).toHaveClass('is-underloaded-critical');
    expect(screen.getByLabelText(/20h\+: At least 20h of work/)).toHaveClass('is-active-engagement');

    const riskChip = screen.getByLabelText('1 risks for this allocation group');
    expect(within(riskChip).getByText('risks: 1')).toHaveClass('traffic-person-signal-full');
    expect(within(riskChip).getByText('R1')).toHaveClass('traffic-person-signal-compact');

    const handoffChip = screen.getByLabelText('Handoff needed: 1 tiles');
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
          validation: [{ code: 'missing_required_skill', severity: 'warning', message: 'Missing skill' }],
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
            validation: [{ code: 'missing_required_skill', severity: 'warning', message: 'Missing skill' }],
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
    expect(screen.getByLabelText(/5 additional markers for person Avery: Plan B, mentor, backup, move, 20h\+/)).toHaveTextContent('more 5');
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

    expect(screen.getByLabelText(/Allocation layers: labour cost 1k, office\/admin 1k, sales\/marketing 1k, margin\/target 1k/)).toBeInTheDocument();
    expect(screen.getByTitle('labour cost: 1k')).toHaveTextContent('L1k');
    expect(screen.getByTitle('office/admin: 1k')).toHaveTextContent('A1k');
    expect(screen.getByTitle('sales/marketing: 1k')).toHaveTextContent('S1k');
    expect(screen.getByTitle('margin/target: 1k')).toHaveTextContent('M1k');
    expect(screen.queryByText('cost 1k')).not.toBeInTheDocument();
    expect(screen.queryByText('office 1k')).not.toBeInTheDocument();
    expect(screen.queryByText('sales 1k')).not.toBeInTheDocument();
    expect(screen.queryByText('margin 1k')).not.toBeInTheDocument();
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
        label: 'June 2026',
        granularity: 'month' as const,
        startsOn: '2026-06-01',
        endsOn: '2026-06-30',
      },
      {
        id: '2026-06-w1',
        label: 'June 2026 W1',
        granularity: 'week' as const,
        startsOn: '2026-06-01',
        endsOn: '2026-06-15',
        parentPeriodId: '2026-06',
      },
      {
        id: '2026-06-w2',
        label: 'June 2026 W2',
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

    expect(screen.getByLabelText(/Weekly breakdown for Avery: W1 24h manual, W2 16h/)).toBeInTheDocument();
    expect(screen.getByLabelText('W1: 24h, set manually')).toHaveClass('is-manual', 'is-heavy');
    expect(screen.getByLabelText('W2: 16h, distributed proportionally')).toHaveClass('is-auto');
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

    expect(screen.getByRole('note', { name: /Compact tile cluster for Avery: 8 tiles, 8k, 56h/ })).toHaveTextContent('8 tiles');
    const compactCluster = screen.getByRole('group', { name: "Tiles in compact cluster for Avery" });
    expect(compactCluster).toHaveClass('is-compact-cluster');

    const tiles = within(compactCluster).getAllByRole('button', { name: /Avery: 1k PLN/ });
    expect(tiles).toHaveLength(8);
    expect(tiles[0]).toHaveClass('is-compact');
    expect(tiles[0]).toHaveAttribute('draggable', 'true');

    fireEvent.click(tiles[0]);
    expect(onOpenAllocation).toHaveBeenCalledWith('allocation-0');
  });
});
