import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Period, ProjectFrame } from '../models/traffic.model';
import { DiabloHiddenProjectsModal } from './DiabloHiddenProjectsModal';

const period: Period = {
  id: '2026-06',
  label: 'Czerwiec 2026',
  granularity: 'month',
  startsOn: '2026-06-01',
  endsOn: '2026-06-30',
};

const hiddenProject: ProjectFrame = {
  id: 'project-hidden',
  name: 'Discovery',
  client: "Client 1",
  contractType: 'time_materials_capped',
  stage: 'signed',
  planningStatus: 'active',
  workType: 'commercial',
  budgetK: 12,
  probability: 1,
  startMonth: 'Czerwiec 2026',
  startPeriodId: period.id,
  endPeriodId: period.id,
  rateConfig: { companyTargetRatePlnH: 240 },
  requirements: [],
  preferredPersonIds: [],
  blockedPersonIds: [],
  revenuePlan: [{ periodId: period.id, revenueK: 18, probability: 1 }],
  invoices: [],
  archivedPeriodIds: [period.id],
  notes: '',
};

describe('DiabloHiddenProjectsModal', () => {
  it('lists hidden projects for the active month and restores a selected project', () => {
    const onClose = vi.fn();
    const onRestoreProject = vi.fn();

    render(
      <DiabloHiddenProjectsModal
        period={period}
        projects={[hiddenProject]}
        onClose={onClose}
        onRestoreProject={onRestoreProject}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Ukryte projekty' })).toBeInTheDocument();
    expect(screen.getByText('Czerwiec 2026')).toBeInTheDocument();
    expect(screen.getByText("Client 1")).toBeInTheDocument();
    expect(screen.getByText('Discovery')).toBeInTheDocument();
    expect(screen.getByText('18k')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Przywróć' }));

    expect(onRestoreProject).toHaveBeenCalledWith(hiddenProject.id);
  });

  it('closes from the header action', () => {
    const onClose = vi.fn();

    render(
      <DiabloHiddenProjectsModal
        period={period}
        projects={[]}
        onClose={onClose}
        onRestoreProject={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
