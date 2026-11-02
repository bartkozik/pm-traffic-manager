import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createSeedTrafficSnapshot } from '../models/traffic.model';
import { PersonEditor } from './PersonEditor';

describe('PersonEditor', () => {
  it('keeps advanced person fields collapsed by default', () => {
    const snapshot = createSeedTrafficSnapshot();
    const person = snapshot.people[0];

    render(
      <PersonEditor
        activePeriodId={snapshot.activePeriodId}
        people={snapshot.people}
        periods={snapshot.periods}
        person={person}
        skills={snapshot.skills}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Imię i nazwisko')).toBeInTheDocument();
    expect(screen.getByLabelText('Koszt miesięczny (k PLN / kafelki)')).toBeInTheDocument();
    expect(screen.getByText('Więcej szczegółów')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Rola')).not.toBeInTheDocument();
    expect(screen.queryByText('Warstwy kosztu / celu')).not.toBeInTheDocument();
  });

  it('does not expose collaboration risk matrix because those conflicts are managed in planning rules', () => {
    const snapshot = createSeedTrafficSnapshot();
    const person = snapshot.people[0];

    render(
      <PersonEditor
        activePeriodId={snapshot.activePeriodId}
        people={snapshot.people}
        periods={snapshot.periods}
        person={person}
        skills={snapshot.skills}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Więcej szczegółów' }));

    expect(screen.queryByText('Ryzyka współpracy')).not.toBeInTheDocument();
    expect(screen.queryByText('Nie łącz w projektach')).not.toBeInTheDocument();
    expect(screen.getByText('Warstwy kosztu / celu')).toBeInTheDocument();
  });

  it('saves the base monthly cost used for inventory tile count', () => {
    const snapshot = createSeedTrafficSnapshot();
    const person = snapshot.people[0];
    const onSave = vi.fn();

    render(
      <PersonEditor
        activePeriodId={snapshot.activePeriodId}
        people={snapshot.people}
        periods={snapshot.periods}
        person={person}
        skills={snapshot.skills}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText('Koszt miesięczny (k PLN / kafelki)'), {
      target: { value: '9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz osobę' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        monthlyCostK: 9,
        costModel: expect.objectContaining({ fixedMonthlyCostK: 9 }),
      })
    );
  });

  it('supports keyboard submit, Escape cancel, and focus wrapping inside the dialog', () => {
    const snapshot = createSeedTrafficSnapshot();
    const person = snapshot.people[0];
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <PersonEditor
        activePeriodId={snapshot.activePeriodId}
        people={snapshot.people}
        periods={snapshot.periods}
        person={person}
        skills={snapshot.skills}
        onClose={onClose}
        onOpenHelp={vi.fn()}
        onSave={onSave}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Edytor osoby' });
    const closeButton = screen.getByRole('button', { name: 'Zamknij edytor osoby' });
    const saveButton = screen.getByRole('button', { name: 'Zapisz osobę' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');

    saveButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(document.activeElement).toBe(closeButton);

    fireEvent.change(screen.getByLabelText('Koszt miesięczny (k PLN / kafelki)'), {
      target: { value: '11' },
    });
    fireEvent.submit(dialog);

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ monthlyCostK: 11 }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('archives a person from the editor only after confirmation', () => {
    const snapshot = createSeedTrafficSnapshot();
    const person = snapshot.people[0];
    const onArchive = vi.fn();
    const onClose = vi.fn();

    render(
      <PersonEditor
        activePeriodId={snapshot.activePeriodId}
        people={snapshot.people}
        periods={snapshot.periods}
        person={person}
        skills={snapshot.skills}
        onArchive={onArchive}
        onClose={onClose}
        onOpenHelp={vi.fn()}
        onSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: `Archiwizuj osobę: ${person.name}` }));

    expect(onArchive).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: `Potwierdź archiwizację osoby: ${person.name}` }));

    expect(onArchive).toHaveBeenCalledWith(person.id);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not show archive action while a new person is being created', () => {
    const snapshot = createSeedTrafficSnapshot();
    const person = snapshot.people[0];

    render(
      <PersonEditor
        activePeriodId={snapshot.activePeriodId}
        isNew
        people={snapshot.people}
        periods={snapshot.periods}
        person={person}
        skills={snapshot.skills}
        onArchive={vi.fn()}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: `Archiwizuj osobę: ${person.name}` })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zapisz osobę' })).toBeInTheDocument();
  });

  it('derives initials from the edited person name by default', () => {
    const snapshot = createSeedTrafficSnapshot();
    const person = {
      ...snapshot.people[0],
      name: 'Nowa osoba 5',
      initials: 'N5',
    };
    const onSave = vi.fn();

    render(
      <PersonEditor
        activePeriodId={snapshot.activePeriodId}
        people={snapshot.people}
        periods={snapshot.periods}
        person={person}
        skills={snapshot.skills}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText('Imię i nazwisko'), {
      target: { value: 'Jan Kowalski' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Więcej szczegółów' }));

    expect(screen.getByLabelText('Inicjały')).toHaveValue('JK');

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz osobę' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Jan Kowalski',
        initials: 'JK',
      })
    );
  });

  it('keeps manually changed initials when the name changes later', () => {
    const snapshot = createSeedTrafficSnapshot();
    const person = {
      ...snapshot.people[0],
      name: 'Nowa osoba 5',
      initials: 'N5',
    };

    render(
      <PersonEditor
        activePeriodId={snapshot.activePeriodId}
        people={snapshot.people}
        periods={snapshot.periods}
        person={person}
        skills={snapshot.skills}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Więcej szczegółów' }));
    fireEvent.change(screen.getByLabelText('Inicjały'), { target: { value: 'VIP' } });
    fireEvent.change(screen.getByLabelText('Imię i nazwisko'), {
      target: { value: "Avery Nowak" },
    });

    expect(screen.getByLabelText('Inicjały')).toHaveValue('VIP');
  });

  it('allows saving a person without skills or seniority', () => {
    const snapshot = createSeedTrafficSnapshot();
    const person = snapshot.people[0];
    const onSave = vi.fn();

    render(
      <PersonEditor
        activePeriodId={snapshot.activePeriodId}
        people={snapshot.people}
        periods={snapshot.periods}
        person={person}
        skills={snapshot.skills}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Więcej szczegółów' }));
    fireEvent.change(screen.getByLabelText('Poziom'), { target: { value: '' } });

    person.skillIds.forEach((skillId) => {
      const skill = snapshot.skills.find((item) => item.id === skillId);
      if (skill) {
        fireEvent.click(screen.getByRole('checkbox', { name: skill.label }));
      }
    });

    expect(screen.getByRole('checkbox', { name: 'Backend' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'DevOps' })).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz osobę' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        seniority: undefined,
        skillIds: [],
      })
    );
  });

  it('allows changing the skill set for an existing person', () => {
    const snapshot = createSeedTrafficSnapshot();
    const person = snapshot.people[0];
    const onSave = vi.fn();

    render(
      <PersonEditor
        activePeriodId={snapshot.activePeriodId}
        people={snapshot.people}
        periods={snapshot.periods}
        person={person}
        skills={snapshot.skills}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Więcej szczegółów' }));

    expect(screen.getByRole('checkbox', { name: 'Backend' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Frontend' })).not.toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Backend' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Frontend' }));

    expect(screen.getByRole('checkbox', { name: 'Backend' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Frontend' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz osobę' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        skillIds: ['devops', 'frontend'],
      })
    );
  });

  it('allows adding skills and seniority from an empty person draft', () => {
    const snapshot = createSeedTrafficSnapshot();
    const person = {
      ...snapshot.people[0],
      seniority: undefined,
      skillIds: [],
    };
    const onSave = vi.fn();

    render(
      <PersonEditor
        activePeriodId={snapshot.activePeriodId}
        people={snapshot.people}
        periods={snapshot.periods}
        person={person}
        skills={snapshot.skills}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Więcej szczegółów' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Backend' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Frontend' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Backend' }));
    fireEvent.change(screen.getByLabelText('Poziom'), { target: { value: 'senior' } });

    expect(screen.getByRole('checkbox', { name: 'Backend' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Frontend' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Zapisz osobę' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        seniority: 'senior',
        skillIds: ['frontend'],
      })
    );
  });
});
