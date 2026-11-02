import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MonthPlanningCard } from './MonthPlanningCard';
import { Period, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';

const period: Period = {
  id: '2026-06',
  label: 'Czerwiec 2026',
  granularity: 'month',
  startsOn: '2026-06-01',
  endsOn: '2026-06-30',
};

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

const project: ProjectFrame = {
  id: 'project-1',
  name: 'Core team',
  client: "Client 1",
  contractType: 'time_materials_capped',
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

const benchAllocation: PersonTileAllocation = {
  id: 'allocation-bench-1',
  personId: person.id,
  tileIndex: 0,
  target: 'bench',
  periodId: period.id,
  mode: 'revenue_first',
  revenueK: 1,
  hours: 8,
};

describe('MonthPlanningCard', () => {
  it('passes project-scoped Traffic Review triggers to the matching project card', () => {
    render(
      <MonthPlanningCard
        period={period}
        isActive
        people={[person]}
        peopleById={new Map([[person.id, person]])}
        periods={[period]}
        projects={[project]}
        skillsById={new Map()}
        allocationsByTarget={new Map([
          [project.id, []],
          ['bench', []],
        ])}
        allAllocations={[]}
        reviewTriggersByProjectId={new Map([
          [project.id, [{
            id: 'short-project-no-resources-project-1',
            owner: 'PM',
            severity: 'high',
            title: "Client 1: bez zasobów",
            detail: 'Projekt jest aktywny w miesiącu, ale nie ma przypisanych kafelków.',
            action: 'Dodać przynajmniej jedną osobę.',
            projectId: project.id,
          }]],
        ])}
        pendingArchiveProjectId={null}
        pendingDeleteArchivedProjectId={null}
        onActivate={vi.fn()}
        onArchiveProject={vi.fn()}
        onCreateProject={vi.fn()}
        onDeleteArchivedProject={vi.fn()}
        onDropPayload={vi.fn()}
        onEditPerson={vi.fn()}
        onEditProject={vi.fn()}
        onOpenHelp={vi.fn()}
        onOpenAllocation={vi.fn()}
        onRestoreProject={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Triggery Traffic Review projektu: Client 1")).toHaveTextContent('bez zasobów');
  });

  it('keeps the bench as a full-row bench target instead of a project grid card', () => {
    render(
      <MonthPlanningCard
        period={period}
        isActive
        people={[person]}
        peopleById={new Map([[person.id, person]])}
        periods={[period]}
        projects={[project]}
        skillsById={new Map()}
        allocationsByTarget={new Map([
          [project.id, []],
          ['bench', [benchAllocation]],
        ])}
        allAllocations={[benchAllocation]}
        pendingArchiveProjectId={null}
        pendingDeleteArchivedProjectId={null}
        onActivate={vi.fn()}
        onArchiveProject={vi.fn()}
        onCreateProject={vi.fn()}
        onDeleteArchivedProject={vi.fn()}
        onDropPayload={vi.fn()}
        onEditPerson={vi.fn()}
        onEditProject={vi.fn()}
        onOpenHelp={vi.fn()}
        onOpenAllocation={vi.fn()}
        onRestoreProject={vi.fn()}
        onTileDragStart={vi.fn()}
      />
    );

    const benchToggle = screen.getByRole('button', { name: /Ławka \/ nieprzypisany cel/i });
    const benchTarget = benchToggle.closest('.traffic-bench-grid-target');

    expect(benchTarget).toBeInTheDocument();
    expect(benchTarget).not.toHaveClass('traffic-project-grid-item');
    expect(benchTarget?.querySelector('.traffic-bench')).toBeInTheDocument();
  });
});
