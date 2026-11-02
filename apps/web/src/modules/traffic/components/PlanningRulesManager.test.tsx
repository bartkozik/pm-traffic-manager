import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createPersonPairPlanningRule,
  createSeedTrafficSnapshot,
  PlanningRule,
  upsertPlanningRules,
} from '../models/traffic.model';
import { PlanningRulesManager } from './PlanningRulesManager';

describe('PlanningRulesManager', () => {
  it('adds a rule and shows it in active rules immediately', () => {
    render(<PlanningRulesManagerHarness initialRules={[]} />);

    expect(screen.getByRole('radiogroup', { name: 'Osoba A' })).toBeInTheDocument();
    expect(screen.queryByText('Brak reguł dla wybranych filtrów.')).toBeInTheDocument();
    const emptyActiveRules = screen.getByRole('region', { name: 'Aktywne reguły' });
    expect(within(emptyActiveRules).getByLabelText('Miesiąc aktywnych reguł')).toBeDisabled();
    expect(within(emptyActiveRules).getByLabelText('Osoba w regule')).toBeDisabled();
    expect(within(emptyActiveRules).getByLabelText('Projekt reguły')).toBeDisabled();
    expect(within(emptyActiveRules).getByLabelText('Szukaj w regułach')).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: "Morgan Project Manager" }));
    fireEvent.change(screen.getByLabelText('Powód / notatka'), {
      target: { value: 'Nie łączyć bez wyjątków' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj regułę' }));

    const activeRules = screen.getByRole('region', { name: 'Aktywne reguły' });
    expect(within(activeRules).getByText("Morgan + Taylor")).toBeInTheDocument();
    expect(within(activeRules).getByText('Stała')).toBeInTheDocument();
    expect(within(activeRules).getByText(/Obowiązuje stale/)).toBeInTheDocument();
    expect(within(activeRules).getByText('Nie łączyć bez wyjątków')).toBeInTheDocument();
    expect(within(activeRules).getByLabelText('Osoba w regule')).toBeEnabled();
    expect(within(activeRules).getByLabelText('Szukaj w regułach')).toBeEnabled();
    expect(within(activeRules).getByText('1 / 1')).toBeInTheDocument();
  });

  it('supports keyboard submit and Escape cancel in the rule dialog', () => {
    const snapshot = createSeedTrafficSnapshot();
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <PlanningRulesManager
        activePeriodId={snapshot.activePeriodId}
        people={snapshot.people}
        periods={snapshot.periods}
        planningRules={[]}
        projects={snapshot.projects}
        onClose={onClose}
        onDelete={vi.fn()}
        onSave={onSave}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Zarządzanie regułami planowania' })).toHaveAttribute('aria-modal', 'true');

    fireEvent.click(screen.getByRole('checkbox', { name: "Morgan Project Manager" }));
    fireEvent.change(screen.getByLabelText('Powód / notatka'), {
      target: { value: 'Reguła z klawiatury' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Formularz dodawania reguły' }));

    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({
        personAId: 'marek',
        personBId: 'tomasz',
        reason: 'Reguła z klawiatury',
      }),
    ]);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the month selector only for time-bound rule creation', () => {
    render(<PlanningRulesManagerHarness initialRules={[]} />);

    const addRuleRegion = screen.getByRole('region', { name: 'Dodaj regułę' });
    expect(within(addRuleRegion).queryByLabelText('Miesiąc reguły')).not.toBeInTheDocument();

    fireEvent.change(within(addRuleRegion).getByLabelText('Zakres reguły'), {
      target: { value: 'period' },
    });

    expect(within(addRuleRegion).getByLabelText('Miesiąc reguły')).toBeInTheDocument();
  });

  it('keeps month-wide rules visible when a concrete project filter is selected', () => {
    const snapshot = createSeedTrafficSnapshot();
    const project = snapshot.projects[0];

    render(<PlanningRulesManagerHarness initialProjectId={project.id} initialRules={snapshot.planningRules || []} />);

    const activeRules = screen.getByRole('region', { name: 'Aktywne reguły' });
    expect(within(activeRules).getByText("Avery + Taylor")).toBeInTheDocument();
    expect(within(activeRules).getByText('1 / 1')).toBeInTheDocument();
  });

  it('shows permanent and time-bound active rules together with visible type labels', () => {
    const snapshot = createSeedTrafficSnapshot();
    const project = snapshot.projects[0];
    const permanentRule = createPersonPairPlanningRule({
      timeScope: 'permanent',
      personAId: 'anna',
      personBId: 'tomasz',
      projectId: project.id,
      now: '2026-06-01T00:00:00.000Z',
    });

    render(<PlanningRulesManagerHarness initialProjectId={project.id} initialRules={[permanentRule, ...(snapshot.planningRules || [])]} />);

    const activeRules = screen.getByRole('region', { name: 'Aktywne reguły' });
    expect(within(activeRules).getAllByText("Avery + Taylor")).toHaveLength(2);
    expect(within(activeRules).getByText('Stała')).toBeInTheDocument();
    expect(within(activeRules).getByText('Czasowa')).toBeInTheDocument();
    expect(within(activeRules).getByText('2 / 2')).toBeInTheDocument();
  });
});

function PlanningRulesManagerHarness({
  initialProjectId,
  initialRules,
}: {
  initialProjectId?: string;
  initialRules: PlanningRule[];
}) {
  const snapshot = createSeedTrafficSnapshot();
  const [planningRules, setPlanningRules] = useState(initialRules);

  return (
    <PlanningRulesManager
      activePeriodId={snapshot.activePeriodId}
      initialProjectId={initialProjectId}
      people={snapshot.people}
      periods={snapshot.periods}
      planningRules={planningRules}
      projects={snapshot.projects}
      onClose={vi.fn()}
      onDelete={(planningRuleId) => {
        setPlanningRules((current) => current.filter((rule) => rule.id !== planningRuleId));
      }}
      onSave={(nextRules) => {
        setPlanningRules((current) => upsertPlanningRules(current, nextRules));
      }}
    />
  );
}
