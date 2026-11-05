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

    expect(screen.getByRole('radiogroup', { name: 'Person A' })).toBeInTheDocument();
    expect(screen.queryByText('No rules match the selected filters.')).toBeInTheDocument();
    const emptyActiveRules = screen.getByRole('region', { name: 'Active rules' });
    expect(within(emptyActiveRules).getByLabelText('Active rules month')).toBeDisabled();
    expect(within(emptyActiveRules).getByLabelText('Person in rule')).toBeDisabled();
    expect(within(emptyActiveRules).getByLabelText('Rule project')).toBeDisabled();
    expect(within(emptyActiveRules).getByLabelText('Search rules')).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: "Morgan Project Manager" }));
    fireEvent.change(screen.getByLabelText('Reason / note'), {
      target: { value: 'Keep apart without exceptions' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));

    const activeRules = screen.getByRole('region', { name: 'Active rules' });
    expect(within(activeRules).getByText("Morgan + Taylor")).toBeInTheDocument();
    expect(within(activeRules).getByText('Permanent')).toBeInTheDocument();
    expect(within(activeRules).getByText(/Always applies/)).toBeInTheDocument();
    expect(within(activeRules).getByText('Keep apart without exceptions')).toBeInTheDocument();
    expect(within(activeRules).getByLabelText('Person in rule')).toBeEnabled();
    expect(within(activeRules).getByLabelText('Search rules')).toBeEnabled();
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

    expect(screen.getByRole('dialog', { name: 'Manage planning rules' })).toHaveAttribute('aria-modal', 'true');

    fireEvent.click(screen.getByRole('checkbox', { name: "Morgan Project Manager" }));
    fireEvent.change(screen.getByLabelText('Reason / note'), {
      target: { value: 'Rule added with keyboard' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Add rule form' }));

    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({
        personAId: 'marek',
        personBId: 'tomasz',
        reason: 'Rule added with keyboard',
      }),
    ]);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the month selector only for time-bound rule creation', () => {
    render(<PlanningRulesManagerHarness initialRules={[]} />);

    const addRuleRegion = screen.getByRole('region', { name: 'Add rule' });
    expect(within(addRuleRegion).queryByLabelText('Rule month')).not.toBeInTheDocument();

    fireEvent.change(within(addRuleRegion).getByLabelText('Rule scope'), {
      target: { value: 'period' },
    });

    expect(within(addRuleRegion).getByLabelText('Rule month')).toBeInTheDocument();
  });

  it('keeps month-wide rules visible when a concrete project filter is selected', () => {
    const snapshot = createSeedTrafficSnapshot();
    const project = snapshot.projects[0];

    render(<PlanningRulesManagerHarness initialProjectId={project.id} initialRules={snapshot.planningRules || []} />);

    const activeRules = screen.getByRole('region', { name: 'Active rules' });
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

    const activeRules = screen.getByRole('region', { name: 'Active rules' });
    expect(within(activeRules).getAllByText("Avery + Taylor")).toHaveLength(2);
    expect(within(activeRules).getByText('Permanent')).toBeInTheDocument();
    expect(within(activeRules).getByText('Temporary')).toBeInTheDocument();
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
