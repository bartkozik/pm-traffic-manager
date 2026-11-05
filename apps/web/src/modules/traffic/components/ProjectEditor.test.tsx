import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Period, ProjectFrame, Skill } from '../models/traffic.model';
import { ProjectEditor } from './ProjectEditor';

const period: Period = {
  id: '2026-06',
  label: 'June 2026',
  granularity: 'month',
  startsOn: '2026-06-01',
  endsOn: '2026-06-30',
};

const backendSkill: Skill = {
  id: 'backend',
  label: 'Backend',
  defaultTargetRatePlnH: 250,
};

function project(): ProjectFrame {
  return {
    id: 'project-alpha',
    name: 'Discovery',
    client: "Client 1",
    contractType: 'hourly',
    stage: 'signed',
    planningStatus: 'active',
    sourceStatus: 'synced',
    workType: 'commercial',
    budgetK: 24,
    probability: 1,
    startMonth: '2026-06',
    startPeriodId: '2026-06',
    currencyProfile: {
      billingCurrency: 'PLN',
      fxMode: 'pln',
    },
    rateConfig: { companyTargetRatePlnH: 200 },
    requirements: [],
    revenuePlan: [{ periodId: '2026-06', nativeRevenueK: 24, currency: 'PLN', revenueK: 24, probability: 1 }],
    invoices: [],
    notes: '',
  };
}

describe('ProjectEditor', () => {
  it('shows common currencies in a real select and still allows a custom code', () => {
    render(
      <ProjectEditor
        project={project()}
        activePeriodId="2026-06"
        periods={[period]}
        people={[]}
        skills={[]}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={vi.fn()}
      />
    );

    const currencySelect = screen.getByLabelText('Billing currency');

    expect(currencySelect).toHaveDisplayValue('PLN');
    expect(screen.getByRole('option', { name: 'USD' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'EUR' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Other currency...' })).toBeInTheDocument();

    fireEvent.change(currencySelect, { target: { value: '__custom_currency__' } });
    fireEvent.change(screen.getByLabelText('Currency code'), { target: { value: 'aed' } });

    expect(screen.getByLabelText('Currency code')).toHaveValue('AED');
    expect(screen.getByLabelText('Revenue in the active month (k AED)')).toBeInTheDocument();
  });

  it('preserves the PLN board value when changing currency and then adding FX', () => {
    const onSave = vi.fn();
    render(
      <ProjectEditor
        project={project()}
        activePeriodId="2026-06"
        periods={[period]}
        people={[]}
        skills={[]}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={onSave}
      />
    );

    const saveButton = screen.getByRole('button', { name: 'Save changes' });

    expect(saveButton).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Billing currency'), { target: { value: 'USD' } });

    expect(saveButton).toBeDisabled();
    expect(screen.getByText('A foreign currency requires an exchange rate before the PLN board value can be saved.')).toBeInTheDocument();
    expect(screen.getByLabelText('Board value (k PLN)')).toHaveValue(24);

    fireEvent.change(screen.getByLabelText('Exchange rate to PLN'), { target: { value: '4' } });

    expect(saveButton).toBeEnabled();
    expect(screen.getByLabelText('Revenue in the active month (k USD)')).toHaveValue(6);
    expect(screen.getByLabelText('Board value (k PLN)')).toHaveValue(24);

    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedProject = onSave.mock.calls[0][0] as ProjectFrame;
    expect(savedProject.currencyProfile?.billingCurrency).toBe('USD');
    expect(savedProject.revenuePlan[0]).toMatchObject({
      currency: 'USD',
      nativeRevenueK: 6,
      revenueK: 24,
    });
    expect(savedProject.revenuePlan[0].committedRevenueK).toBeUndefined();
    expect(savedProject.revenuePlan[0].fx?.rateToPln).toBe(4);
  });

  it('submits as a keyboard-accessible dialog form and closes on Escape', () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <ProjectEditor
        project={project()}
        activePeriodId="2026-06"
        periods={[period]}
        people={[]}
        skills={[]}
        onClose={onClose}
        onOpenHelp={vi.fn()}
        onSave={onSave}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Project editor' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');

    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Delivery' } });
    fireEvent.submit(dialog);

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Delivery' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps the PLN board input editable for non-PLN project revenue', () => {
    const onSave = vi.fn();
    render(
      <ProjectEditor
        project={project()}
        activePeriodId="2026-06"
        periods={[period]}
        people={[]}
        skills={[]}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText('Billing currency'), { target: { value: 'USD' } });
    fireEvent.change(screen.getByLabelText('Exchange rate to PLN'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Board value (k PLN)'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const savedProject = onSave.mock.calls[0][0] as ProjectFrame;
    expect(savedProject.budgetK).toBe(40);
    expect(savedProject.revenuePlan[0]).toMatchObject({
      currency: 'USD',
      nativeRevenueK: 10,
      revenueK: 40,
    });
  });

  it('uses the native amount when the user edits it before entering FX', () => {
    const onSave = vi.fn();
    render(
      <ProjectEditor
        project={project()}
        activePeriodId="2026-06"
        periods={[period]}
        people={[]}
        skills={[]}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText('Billing currency'), { target: { value: 'USD' } });
    fireEvent.change(screen.getByLabelText('Revenue in the active month (k USD)'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Exchange rate to PLN'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const savedProject = onSave.mock.calls[0][0] as ProjectFrame;
    expect(savedProject.budgetK).toBe(120);
    expect(savedProject.revenuePlan[0]).toMatchObject({
      currency: 'USD',
      nativeRevenueK: 30,
      revenueK: 120,
    });
  });

  it('shows non-commercial frames without contract, sales, currency, or FX fields', () => {
    render(
      <ProjectEditor
        project={project()}
        activePeriodId="2026-06"
        periods={[period]}
        people={[]}
        skills={[]}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Frame type'), { target: { value: 'non_commercial' } });

    expect(screen.getByLabelText('Frame type')).toHaveDisplayValue('Non-commercial / unavailable');
    expect(screen.getByLabelText('Frame kind')).toHaveDisplayValue('TIME OFF');
    expect(screen.getByLabelText('Planned cost/capacity in the active month (k PLN)')).toHaveValue(24);
    expect(screen.queryByLabelText('Contract type')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Stage')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Planning status')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Source / scope consistency')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Billing currency')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Exchange rate date')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Exchange rate to PLN')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Probability')).not.toBeInTheDocument();
    expect(screen.queryByText('Source / CRM note')).not.toBeInTheDocument();
  });

  it('normalizes hidden commercial fields when saving a non-commercial frame', () => {
    const onSave = vi.fn();
    render(
      <ProjectEditor
        project={{
          ...project(),
          contractType: 'fixed_phase',
          currencyProfile: {
            billingCurrency: 'USD',
            defaultFx: {
              currency: 'USD',
              effectiveDate: '2026-06-01',
              rateToPln: 4,
              requestedDate: '2026-06-01',
              source: 'manual',
            },
            fxMode: 'manual',
          },
          planningStatus: 'ghost',
          probability: 0.25,
          rateConfig: {
            companyTargetRatePlnH: 200,
            projectRateCurrency: 'USD',
            projectRateNativeH: 100,
            projectRatePlnH: 400,
          },
          revenuePlan: [{
            committedRevenueK: 8,
            currency: 'USD',
            fx: {
              currency: 'USD',
              effectiveDate: '2026-06-01',
              rateToPln: 4,
              requestedDate: '2026-06-01',
              source: 'manual',
            },
            nativeCommittedRevenueK: 2,
            nativeRevenueK: 6,
            periodId: '2026-06',
            probability: 0.25,
            revenueK: 24,
          }],
          sourceStatus: 'scope_changed',
          sourceStatusNote: 'CRM stale',
          stage: 'possible',
        }}
        activePeriodId="2026-06"
        periods={[period]}
        people={[]}
        skills={[]}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText('Frame type'), { target: { value: 'non_commercial' } });
    fireEvent.change(screen.getByLabelText('Planned cost/capacity in the active month (k PLN)'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const savedProject = onSave.mock.calls[0][0] as ProjectFrame;
    expect(savedProject).toMatchObject({
      budgetK: 12,
      contractType: 'fixed_monthly',
      currencyProfile: { billingCurrency: 'PLN', fxMode: 'pln' },
      planningStatus: 'active',
      probability: 1,
      sourceStatus: 'synced',
      stage: 'signed',
      workType: 'time_off',
    });
    expect(savedProject.sourceStatusNote).toBeUndefined();
    expect(savedProject.rateConfig.projectRateCurrency).toBe('PLN');
    expect(savedProject.rateConfig.projectRateNativeH).toBeUndefined();
    expect(savedProject.rateConfig.projectRatePlnH).toBeUndefined();
    expect(savedProject.revenuePlan[0]).toEqual({
      currency: 'PLN',
      nativeRevenueK: 12,
      periodId: '2026-06',
      probability: 1,
      revenueK: 12,
    });
  });

  it('lets project requirements be planned by tile count while saving estimated hours', () => {
    const onSave = vi.fn();
    render(
      <ProjectEditor
        project={{
          ...project(),
          rateConfig: { companyTargetRatePlnH: 250, projectRatePlnH: 250 },
          requirements: [{
            id: 'req-backend',
            skillId: 'backend',
            estimatedHours: 40,
            required: true,
          }],
        }}
        activePeriodId="2026-06"
        periods={[period]}
        people={[]}
        skills={[backendSkill]}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={onSave}
      />
    );

    expect(screen.getByLabelText('Planned tiles for Backend')).toHaveValue(10);

    fireEvent.change(screen.getByLabelText('Planned tiles for Backend'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const savedProject = onSave.mock.calls[0][0] as ProjectFrame;
    expect(savedProject.requirements[0]).toMatchObject({
      id: 'req-backend',
      skillId: 'backend',
      estimatedHours: 24,
    });
  });

  it('lets project requirements be marked as optional', () => {
    const onSave = vi.fn();
    render(
      <ProjectEditor
        project={{
          ...project(),
          requirements: [{
            id: 'req-backend',
            skillId: 'backend',
            estimatedHours: 40,
            required: true,
          }],
        }}
        activePeriodId="2026-06"
        periods={[period]}
        people={[]}
        skills={[backendSkill]}
        onClose={vi.fn()}
        onOpenHelp={vi.fn()}
        onSave={onSave}
      />
    );

    const requiredToggle = screen.getByLabelText('Requirement Backend is required');

    expect(requiredToggle).toBeChecked();

    fireEvent.click(requiredToggle);

    expect(requiredToggle).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const savedProject = onSave.mock.calls[0][0] as ProjectFrame;
    expect(savedProject.requirements[0]).toMatchObject({
      id: 'req-backend',
      required: false,
    });
  });
});
