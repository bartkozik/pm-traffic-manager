import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Period, Person, PersonTileAllocation, ProjectFrame, Skill } from '../models/traffic.model';
import { DiabloMonthCanvas } from './DiabloMonthCanvas';
import {
  DIABLO_CANVAS_EDGE_GUTTER,
  DIABLO_LAYOUT_VERSION,
  DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS,
  DIABLO_PEOPLE_SORT_START_ROW,
  DIABLO_PERSON_FRAME_HEADER_ROWS,
  DIABLO_PERSON_TILE_COLUMNS,
  DIABLO_PERSON_FRAME_WIDTH,
  DIABLO_PROJECT_GRID_EMPTY_CELLS,
  DIABLO_PROJECT_SORT_START_ROW,
  getDiabloCanvasSize,
  getDiabloPeopleZoneColumns,
  getPersonFrameDimensionsForTileCount,
  getDiabloProjectZoneStart,
  type DiabloBoardLayout,
} from './diabloLayout';

const period: Period = {
  id: '2026-06',
  label: 'Czerwiec 2026',
  granularity: 'month',
  startsOn: '2026-06-01',
  endsOn: '2026-06-30',
};

const project: ProjectFrame = {
  id: 'project-a',
  name: 'Discovery',
  client: "Client 1",
  contractType: 'time_materials_capped',
  stage: 'signed',
  planningStatus: 'active',
  workType: 'commercial',
  budgetK: 8,
  probability: 1,
  startMonth: 'Czerwiec 2026',
  startPeriodId: period.id,
  endPeriodId: period.id,
  rateConfig: { companyTargetRatePlnH: 240 },
  requirements: [],
  preferredPersonIds: [],
  blockedPersonIds: [],
  revenuePlan: [{ periodId: period.id, revenueK: 8, probability: 1 }],
  invoices: [],
  notes: '',
};

const skill: Skill = {
  id: 'backend',
  label: 'Backend',
  defaultTargetRatePlnH: 240,
};

const frontendSkill: Skill = {
  id: 'frontend',
  label: 'Frontend',
  defaultTargetRatePlnH: 240,
};

const qaSkill: Skill = {
  id: 'qa',
  label: 'QA',
  defaultTargetRatePlnH: 240,
};

const person: Person = {
  id: 'person-a',
  name: "Taylor",
  role: 'Senior Developer',
  initials: "TG",
  color: '#ef4444',
  skillIds: ['backend'],
  seniority: 'senior',
  costModel: {
    type: 'fixed_monthly',
    defaultMonthlyHours: 160,
    fixedMonthlyCostK: 18,
  },
  monthlyCostK: 18,
  hoursPerTile: 8,
  layers: {
    workK: 12,
    adminK: 16,
    salesK: 20,
    targetK: 24,
  },
};

const frontendPerson: Person = {
  ...person,
  id: 'person-frontend',
  name: 'Julia',
  initials: 'JU',
  color: '#22c55e',
  skillIds: ['frontend'],
};

const benchAllocation: PersonTileAllocation = {
  id: 'bench-a-1',
  personId: person.id,
  tileIndex: 0,
  target: 'bench',
  periodId: period.id,
  mode: 'revenue_first',
  revenueK: 1,
  hours: 8,
  skillId: 'backend',
};

const projectZoneX = getDiabloProjectZoneStart(DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS) + 1;

const frontendAllocation: PersonTileAllocation = {
  ...benchAllocation,
  id: 'frontend-a-1',
  personId: frontendPerson.id,
  target: project.id,
  skillId: 'frontend',
};

const projectAllocation: PersonTileAllocation = {
  ...benchAllocation,
  id: 'project-a-1',
  tileIndex: 1,
  target: project.id,
};

const researchProject: ProjectFrame = {
  ...project,
  id: 'project-rd',
  name: 'Research',
  client: 'R&D',
  contractType: 'hourly',
  workType: 'research_development',
  budgetK: 3,
  revenuePlan: [{ periodId: period.id, revenueK: 3, probability: 1 }],
};

const timeOffProject: ProjectFrame = {
  ...project,
  id: 'project-time-off',
  name: 'Urlopy',
  client: 'URLOP',
  workType: 'time_off',
  budgetK: 4,
  revenuePlan: [{ periodId: period.id, revenueK: 4, probability: 1 }],
};

function makeProject(id: string, client: string, name: string, budgetK = 8): ProjectFrame {
  return {
    ...project,
    id,
    client,
    name,
    budgetK,
    revenuePlan: [{ periodId: period.id, revenueK: budgetK, probability: 1 }],
  };
}

function createPersonAllocations(
  count: number,
  target: PersonTileAllocation['target'],
  overrides: Partial<PersonTileAllocation> = {}
): PersonTileAllocation[] {
  const tileIndexOffset = overrides.tileIndex ?? 0;
  return Array.from({ length: count }, (_, index) => ({
    ...benchAllocation,
    ...overrides,
    id: `${target}-${index}`,
    target,
    tileIndex: tileIndexOffset + index,
  }));
}

const layout: DiabloBoardLayout = {
  version: DIABLO_LAYOUT_VERSION,
  roomName: 'room',
  periodId: period.id,
  peopleZoneColumns: DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS,
  projects: {
    [project.id]: {
      projectId: project.id,
      x: projectZoneX,
      y: 4,
      width: 4,
      height: 2,
    },
  },
  people: {},
  panels: {
    people: { x: 2, y: 2 },
    legend: { x: 20, y: 2 },
  },
};

function renderCanvas(overrides: Partial<ComponentProps<typeof DiabloMonthCanvas>> = {}) {
  const activePeople = overrides.activePeople ?? ([] as Person[]);
  const baseLayout = overrides.layout ?? layout;
  const { activePeople: _activePeople, layout: _layout, ...restOverrides } = overrides;
  void _activePeople;
  void _layout;
  const personLayouts = Object.fromEntries(
    activePeople.map((activePerson, index) => {
      const dimensions = getPersonFrameDimensionsForTileCount(activePerson.monthlyCostK);
      return [
        activePerson.id,
        {
          personId: activePerson.id,
          x: 2,
          y: 2 + index * (dimensions.height + 1),
          width: dimensions.width,
          height: dimensions.height,
        },
      ];
    })
  );
  const resolvedLayout: DiabloBoardLayout = {
    ...baseLayout,
    peopleZoneColumns: baseLayout.peopleZoneColumns ?? DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS,
    people: {
      ...personLayouts,
      ...(baseLayout.people || {}),
    },
  };
  const props: ComponentProps<typeof DiabloMonthCanvas> = {
    allAllocations: [],
    benchAllocations: [],
    canvasTool: 'create',
    peopleById: new Map(),
    period,
    periodAllocations: [],
    periods: [period],
    projects: [project],
    projectsById: new Map([[project.id, project]]),
    skillsById: new Map<string, Skill>([[skill.id, skill]]),
    monthClipboard: null,
    onArchiveProject: vi.fn(),
    onCanvasToolChange: vi.fn(),
    onCopyPeopleWithAllocations: vi.fn(),
    onCopyPeopleWithoutAllocations: vi.fn(),
    onCopyProjectsWithoutAllocations: vi.fn(),
    onCreatePerson: vi.fn(),
    onCreatePersonFromSelection: vi.fn(),
    onCreateProjectFromSelection: vi.fn(),
    onCycleWorkType: vi.fn(),
    onDeleteProject: vi.fn(),
    onDropPayload: vi.fn(),
    onEditPerson: vi.fn(),
    onEditProject: vi.fn(),
    onLayoutChange: vi.fn(),
    onOpenAllocation: vi.fn(),
    onOpenHelp: vi.fn(),
    onOpenHiddenProjects: vi.fn(),
    onPastePeopleClipboard: vi.fn(),
    onPasteProjectsClipboard: vi.fn(),
    onPersonDragStart: vi.fn(),
    onProjectFrameResize: vi.fn(),
    onResetLayout: vi.fn(),
    onResetPersonAllocations: vi.fn(),
    onResetProjectAllocations: vi.fn(),
    onClearMonthPlan: vi.fn(),
    onTileDragStart: vi.fn(),
    pendingArchiveProjectKey: null,
    pendingDeleteProjectId: null,
    ...restOverrides,
    activePeople,
    layout: resolvedLayout,
  };

  const view = render(<DiabloMonthCanvas {...props} />);
  return { props, ...view };
}

function getDiabloPersonFrameNames(container: HTMLElement) {
  return Array.from(container.querySelectorAll('.diablo-person-frame .diablo-person-frame-identity strong'))
    .map((element) => element.textContent || '');
}

function getRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function setCanvasViewportSize(viewport: HTMLElement, width: number, height: number, top = 0) {
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: height });
  viewport.getBoundingClientRect = () => getRect(0, top, width, height);
}

function getCanvasScale(container: HTMLElement) {
  const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement | null;
  const scaleShell = container.querySelector('.diablo-canvas-scale-shell') as HTMLElement | null;

  return getTransformScale(grid?.style.transform || '')
    ?? getTransformScale(scaleShell?.style.transform || '')
    ?? 1;
}

function getCanvasPan(container: HTMLElement) {
  const scaleShell = container.querySelector('.diablo-canvas-scale-shell') as HTMLElement | null;
  return getTransformTranslate(scaleShell?.style.transform || '');
}

function getTransformScale(transform: string) {
  const match = transform.match(/scale\((-?\d+(?:\.\d+)?)\)/);
  return match ? Number(match[1]) : null;
}

function getTransformTranslate(transform: string) {
  const match = transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
}

describe('DiabloMonthCanvas', () => {
  it('uses monthly availability for person free hour labels', () => {
    const { container } = renderCanvas({
      activePeople: [person],
      benchAllocations: [benchAllocation],
      periodAllocations: [benchAllocation],
      peopleById: new Map([[person.id, person]]),
    });
    const tileMetric = container.querySelector('.diablo-person-bench-tile .diablo-tile-metric-value');

    expect(screen.getByText('8.9h wolne')).toBeInTheDocument();
    expect(tileMetric).toHaveTextContent('8.9h');
    expect(container.querySelector('.diablo-weekly-slot-value')).toBeNull();
  });

  it('renders Diablo tiles in internal-cost display mode', () => {
    const { container } = renderCanvas({
      activePeople: [person],
      benchAllocations: [benchAllocation],
      periodAllocations: [benchAllocation],
      peopleById: new Map([[person.id, person]]),
      tileMetricMode: 'cost',
    });
    const tileMetric = container.querySelector('.diablo-person-bench-tile .diablo-tile-metric-value');

    expect(screen.getByLabelText(/Taylor, 0\/18k koszt, 1k koszt wolny/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Taylor: wolny kafelek, koszt wewnętrzny 1k, 8h, 1k capacity/ })).toBeInTheDocument();
    expect(tileMetric).toHaveTextContent('1k');
  });

  it('keeps project plate and empty slots free from removed scale labels', () => {
    const { container } = renderCanvas();
    const projectFrame = container.querySelector('.diablo-project-frame:not(.diablo-person-frame)') as HTMLElement;

    expect(within(projectFrame).getByText('0/8k')).toBeInTheDocument();
    expect(within(projectFrame).queryByText(/@\d+k/)).not.toBeInTheDocument();
    expect(within(projectFrame).queryByText(/\+\d+k/)).not.toBeInTheDocument();
  });

  it('renders weekly day slots with value and hours inside the existing canvas mechanics', () => {
    const weeklyBenchAllocation: PersonTileAllocation = {
      ...benchAllocation,
      id: `weekly-free:${period.id}:${person.id}:0`,
      mode: 'hours_first',
      revenueK: 0.8,
      hours: 8,
    };

    const { container } = renderCanvas({
      activePeople: [person],
      benchAllocations: [weeklyBenchAllocation],
      periodAllocations: [weeklyBenchAllocation],
      peopleById: new Map([[person.id, person]]),
    });
    const tileMetric = container.querySelector('.diablo-person-bench-tile .diablo-tile-metric-value');

    expect(screen.getByText('8h wolne · 1 dzień')).toBeInTheDocument();
    expect(tileMetric).toHaveTextContent('8h');
  });

  it('keeps weekly project allocations inside the frame until weekly capacity is exceeded', () => {
    const weeklyProject = {
      ...project,
      budgetK: 7,
      revenuePlan: [{ periodId: period.id, revenueK: 7, probability: 1 }],
    };
    const weeklyProjectAllocations: PersonTileAllocation[] = [
      {
        ...projectAllocation,
        id: `weekly:${period.id}:${person.id}:0`,
        mode: 'hours_first',
        revenueK: 1.8,
        hours: 8,
      },
      {
        ...frontendAllocation,
        id: `weekly:${period.id}:${frontendPerson.id}:0`,
        mode: 'hours_first',
        revenueK: 1.8,
        hours: 8,
      },
      {
        ...frontendAllocation,
        id: `weekly:${period.id}:${frontendPerson.id}:1`,
        tileIndex: 2,
        mode: 'hours_first',
        revenueK: 1.8,
        hours: 8,
      },
    ];
    const weeklyLayout: DiabloBoardLayout = {
      ...layout,
      projects: {
        [project.id]: {
          projectId: project.id,
          x: projectZoneX,
          y: 4,
          width: 7,
          height: 1,
        },
      },
    };
    const { container } = renderCanvas({
      activePeople: [person, frontendPerson],
      allAllocations: weeklyProjectAllocations,
      layout: weeklyLayout,
      peopleById: new Map([
        [person.id, person],
        [frontendPerson.id, frontendPerson],
      ]),
      periodAllocations: weeklyProjectAllocations,
      projects: [weeklyProject],
      projectsById: new Map([[weeklyProject.id, weeklyProject]]),
    });

    const projectFrame = container.querySelector('.diablo-project-frame:not(.diablo-person-frame)') as HTMLElement;

    expect(within(projectFrame).getByText('5.4/7k')).toBeInTheDocument();
    expect(projectFrame.querySelectorAll('.diablo-inventory-person-tile')).toHaveLength(3);
    expect(projectFrame.querySelector('.diablo-project-overflow-strip')).not.toBeInTheDocument();
  });

  it('keeps weekly allocations in visible day slots even when their daily value exceeds the weekly budget label', () => {
    const weeklyProject = {
      ...project,
      budgetK: 3,
      revenuePlan: [{ periodId: period.id, revenueK: 3, probability: 1 }],
    };
    const weeklyProjectAllocations: PersonTileAllocation[] = [
      {
        ...projectAllocation,
        id: `weekly:${period.id}:${person.id}:0`,
        mode: 'hours_first',
        revenueK: 1.8,
        hours: 8,
      },
      {
        ...frontendAllocation,
        id: `weekly:${period.id}:${frontendPerson.id}:0`,
        mode: 'hours_first',
        revenueK: 2,
        hours: 8,
      },
      {
        ...frontendAllocation,
        id: `weekly:${period.id}:${frontendPerson.id}:1`,
        tileIndex: 2,
        mode: 'hours_first',
        revenueK: 2,
        hours: 8,
      },
    ];
    const weeklyLayout: DiabloBoardLayout = {
      ...layout,
      projects: {
        [project.id]: {
          projectId: project.id,
          x: projectZoneX,
          y: 4,
          width: 3,
          height: 1,
        },
      },
    };
    const { container } = renderCanvas({
      activePeople: [person, frontendPerson],
      allAllocations: weeklyProjectAllocations,
      layout: weeklyLayout,
      peopleById: new Map([
        [person.id, person],
        [frontendPerson.id, frontendPerson],
      ]),
      periodAllocations: weeklyProjectAllocations,
      projects: [weeklyProject],
      projectsById: new Map([[weeklyProject.id, weeklyProject]]),
    });

    const projectFrame = container.querySelector('.diablo-project-frame:not(.diablo-person-frame)') as HTMLElement;

    expect(within(projectFrame).getByText('5.8/3k')).toBeInTheDocument();
    expect(projectFrame.querySelectorAll('.diablo-inventory-person-tile')).toHaveLength(3);
    expect(projectFrame.querySelector('.diablo-project-overflow-strip')).not.toBeInTheDocument();
  });

  it('places weekly allocations into open project slots before marking remaining tiles as overflow', () => {
    const weeklyProject = {
      ...project,
      budgetK: 3,
      revenuePlan: [{ periodId: period.id, revenueK: 3, probability: 1 }],
    };
    const weeklyProjectAllocations: PersonTileAllocation[] = [
      {
        ...projectAllocation,
        id: `weekly:${period.id}:${person.id}:0`,
        mode: 'hours_first',
        revenueK: 1,
        hours: 8,
        projectSlotIndex: 7,
      },
      {
        ...frontendAllocation,
        id: `weekly:${period.id}:${frontendPerson.id}:0`,
        mode: 'hours_first',
        revenueK: 1,
        hours: 8,
        projectSlotIndex: 0,
      },
      {
        ...frontendAllocation,
        id: `weekly:${period.id}:${frontendPerson.id}:1`,
        tileIndex: 2,
        mode: 'hours_first',
        revenueK: 1,
        hours: 8,
        projectSlotIndex: 1,
      },
    ];
    const weeklyLayout: DiabloBoardLayout = {
      ...layout,
      projects: {
        [project.id]: {
          projectId: project.id,
          x: projectZoneX,
          y: 4,
          width: 3,
          height: 1,
        },
      },
    };
    const { container } = renderCanvas({
      activePeople: [person, frontendPerson],
      allAllocations: weeklyProjectAllocations,
      layout: weeklyLayout,
      peopleById: new Map([
        [person.id, person],
        [frontendPerson.id, frontendPerson],
      ]),
      periodAllocations: weeklyProjectAllocations,
      projects: [weeklyProject],
      projectsById: new Map([[weeklyProject.id, weeklyProject]]),
    });

    const projectFrame = container.querySelector('.diablo-project-frame:not(.diablo-person-frame)') as HTMLElement;

    expect(projectFrame.querySelectorAll('.diablo-inventory-person-tile')).toHaveLength(3);
    expect(projectFrame.querySelector('.diablo-project-overflow-strip')).not.toBeInTheDocument();
  });

  it('renders the full Diablo inventory legend in tabs', () => {
    renderCanvas();
    const legendTabs = within(screen.getByLabelText('Sekcje legendy Diablo'));

    expect(legendTabs.getByRole('button', { name: 'Kolory' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Patterny')).toBeInTheDocument();
    expect(screen.getByText('Czerwony nacisk')).toBeInTheDocument();

    fireEvent.click(legendTabs.getByRole('button', { name: 'Kafelki' }));
    expect(screen.getByText('Skill / seniority')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();

    fireEvent.click(legendTabs.getByRole('button', { name: 'Projekt' }));
    expect(screen.getByText('Stan projektu')).toBeInTheDocument();
    expect(screen.getByText('Tygodnie')).toBeInTheDocument();
    expect(screen.getAllByText('klasyczny').length).toBeGreaterThan(0);
  });

  it('renders bench people as Diablo frames on the shared canvas people zone', () => {
    const { container, props } = renderCanvas({
      activePeople: [person],
      benchAllocations: [benchAllocation],
      periodAllocations: [benchAllocation],
    });
    const peopleZoneBackdrop = container.querySelector('.diablo-people-zone-backdrop');
    const projectZoneBackdrop = container.querySelector('.diablo-project-zone-backdrop');
    const controlPanel = screen.getByLabelText('Panel ludzi na canvasie');
    const projectControlPanel = screen.getByLabelText('Panel projektów na canvasie');
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    const scaleShell = container.querySelector('.diablo-canvas-scale-shell') as HTMLElement;
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const personFrame = container.querySelector('.diablo-person-frame') as HTMLElement;
    const projectFrame = container.querySelector('.diablo-project-frame:not(.diablo-person-frame)') as HTMLElement;
    const personFrameMeta = personFrame.querySelector('.diablo-person-frame-meta') as HTMLElement;
    const personSkillBadgeFooter = personFrame.querySelector('.diablo-person-skill-badge-footer') as HTMLElement;
    const benchTile = screen.getByRole('button', { name: /Taylor: wolny kafelek, 8\.9h pracy, 1k capacity/ });

    expect(container.querySelector('.diablo-canvas-left-column')).not.toBeInTheDocument();
    expect(container.querySelector('.diablo-bench-dropzone')).not.toBeInTheDocument();
    expect(peopleZoneBackdrop).toHaveStyle({
      width: '804px',
    });
    expect((peopleZoneBackdrop as HTMLElement).style.gridColumn).toBe('');
    expect((peopleZoneBackdrop as HTMLElement).style.gridRow).toBe('');
    expect(screen.getByRole('region', { name: 'Zoomowalny canvas planowania Diablo' })).toBe(viewport);
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(viewport).toContainElement(peopleZoneBackdrop as HTMLElement);
    expect(viewport).toContainElement(projectZoneBackdrop as HTMLElement);
    expect(scaleShell).not.toContainElement(peopleZoneBackdrop as HTMLElement);
    expect(scaleShell).not.toContainElement(projectZoneBackdrop as HTMLElement);
    expect(grid).not.toContainElement(peopleZoneBackdrop as HTMLElement);
    expect(grid).not.toContainElement(projectZoneBackdrop as HTMLElement);
    expect(controlPanel).toBeInTheDocument();
    expect(viewport).toContainElement(controlPanel);
    expect(viewport).toContainElement(projectControlPanel);
    expect(scaleShell).not.toContainElement(controlPanel);
    expect(scaleShell).not.toContainElement(projectControlPanel);
    expect(grid).not.toContainElement(controlPanel);
    expect(grid).not.toContainElement(projectControlPanel);
    expect(within(controlPanel).getByText('Ludzie')).toBeInTheDocument();
    expect(within(projectControlPanel).getByText('Projekty')).toBeInTheDocument();
    expect(within(projectControlPanel).getByText('1 ramka')).toBeInTheDocument();
    expect(within(projectControlPanel).getByText('8k plan')).toBeInTheDocument();
    expect(within(projectControlPanel).getByText('0k alok.')).toBeInTheDocument();
    expect(within(projectControlPanel).getByText('8k luka')).toHaveClass('is-warning');
    expect(within(projectControlPanel).getByText('0k poza')).not.toHaveClass('is-danger');
    expect(personFrame).toBeInTheDocument();
    expect(personFrame).toHaveStyle({
      gridColumn: `2 / span ${DIABLO_PERSON_FRAME_WIDTH}`,
      gridRow: `2 / span ${DIABLO_PERSON_FRAME_HEADER_ROWS + 4}`,
      '--diablo-person-tile-columns': `${DIABLO_PERSON_TILE_COLUMNS}`,
    });
    expect(within(personFrame).getByRole('button', { name: 'Edit' })).toHaveClass('diablo-frame-action-button');
    expect(within(projectFrame).getByRole('button', { name: 'Edit' })).toHaveClass('diablo-frame-action-button');
    expect(benchTile).toHaveClass('diablo-inventory-person-tile');
    expect(benchTile).toHaveClass('diablo-person-bench-tile');
    expect(benchTile).toHaveAttribute('tabindex', '-1');
    expect(personFrameMeta.querySelector('.traffic-person-visual-badge')).not.toBeInTheDocument();
    expect(personSkillBadgeFooter).toHaveAccessibleName("Kompetencje osoby Taylor");
    expect(
      within(personSkillBadgeFooter).getByLabelText('seniority Sr, kompetencje: Backend')
    ).toBeInTheDocument();

    fireEvent.dragStart(benchTile);
    expect(props.onTileDragStart).toHaveBeenCalledWith(expect.anything(), { type: 'tile', tileId: benchAllocation.id });
    expect(props.onPersonDragStart).not.toHaveBeenCalled();
    expect(projectFrame).toHaveClass('is-drop-candidate');

    fireEvent.dragStart(container.querySelector('.diablo-person-frame-tile-section') as HTMLElement);
    expect(props.onPersonDragStart).not.toHaveBeenCalled();

    fireEvent.dragStart(personFrame.querySelector('.diablo-person-frame-inner') as HTMLElement);
    expect(props.onPersonDragStart).toHaveBeenCalledWith(expect.anything(), { type: 'person', personId: person.id });
  });

  it('keeps allocation tiles out of the default keyboard tab sequence', () => {
    const { container } = renderCanvas({
      activePeople: [person],
      benchAllocations: [benchAllocation],
      peopleById: new Map([[person.id, person]]),
      periodAllocations: [benchAllocation, projectAllocation],
    });
    const allocationTiles = Array.from(container.querySelectorAll('.diablo-inventory-person-tile')) as HTMLButtonElement[];

    expect(allocationTiles.length).toBeGreaterThan(1);
    allocationTiles.forEach((tile) => {
      expect(tile).toHaveAttribute('tabindex', '-1');
    });
  });

  it('renders stable people and project zone backgrounds even when sections are empty', () => {
    const emptyLayout: DiabloBoardLayout = {
      ...layout,
      canvasSize: { columns: 36, rows: 28 },
      projects: {},
      people: {},
    };
    const { container } = renderCanvas({
      activePeople: [],
      layout: emptyLayout,
      projects: [],
      projectsById: new Map(),
    });
    const peopleZoneBackdrop = container.querySelector('.diablo-people-zone-backdrop') as HTMLElement;
    const projectZoneBackdrop = container.querySelector('.diablo-project-zone-backdrop') as HTMLElement;

    expect(peopleZoneBackdrop).toBeInTheDocument();
    expect(projectZoneBackdrop).toBeInTheDocument();
    expect(peopleZoneBackdrop).toHaveStyle({
      left: '0px',
      width: '804px',
    });
    expect(projectZoneBackdrop).toHaveStyle({
      left: '810px',
      width: '1128px',
    });
  });

  it('keeps person card details collapsed until the current card is hovered or focused', () => {
    const { container } = renderCanvas({
      activePeople: [person, frontendPerson],
      benchAllocations: [benchAllocation],
      peopleById: new Map([
        [person.id, person],
        [frontendPerson.id, frontendPerson],
      ]),
      periodAllocations: [benchAllocation],
    });
    const personFrames = Array.from(container.querySelectorAll('.diablo-person-frame')) as HTMLElement[];
    const [personFrame, coveredPersonFrame] = personFrames;
    const personFrameInner = personFrame.querySelector('.diablo-person-frame-inner') as HTMLElement;
    const personIdentity = personFrame.querySelector('.diablo-person-frame-identity') as HTMLButtonElement;
    const hoverDetails = personFrame.querySelector('.diablo-person-hover-details') as HTMLElement;
    const costSummary = personFrame.querySelector('.diablo-person-cost-summary') as HTMLDetailsElement;

    expect(hoverDetails).toHaveAttribute('aria-hidden', 'true');
    expect(personFrame).not.toHaveClass('has-expanded-person-details');
    expect(coveredPersonFrame).not.toHaveClass('is-covered-by-expanded-person-details');
    expect(personFrameInner).not.toHaveClass('has-expanded-hover-details');
    expect(costSummary).not.toHaveAttribute('open');

    fireEvent.mouseEnter(personFrameInner);
    expect(hoverDetails).toHaveAttribute('aria-hidden', 'false');
    expect(personFrame).toHaveClass('has-expanded-person-details');
    expect(coveredPersonFrame).toHaveClass('is-covered-by-expanded-person-details');
    expect(personFrameInner).toHaveClass('has-expanded-hover-details');
    expect(costSummary).toHaveAttribute('open');

    fireEvent.mouseLeave(personFrameInner);
    expect(hoverDetails).toHaveAttribute('aria-hidden', 'true');
    expect(personFrame).not.toHaveClass('has-expanded-person-details');
    expect(coveredPersonFrame).not.toHaveClass('is-covered-by-expanded-person-details');
    expect(personFrameInner).not.toHaveClass('has-expanded-hover-details');
    expect(costSummary).not.toHaveAttribute('open');

    fireEvent.focus(personIdentity);
    expect(hoverDetails).toHaveAttribute('aria-hidden', 'false');
    expect(personFrame).toHaveClass('has-expanded-person-details');
    expect(coveredPersonFrame).toHaveClass('is-covered-by-expanded-person-details');
    expect(personFrameInner).toHaveClass('has-expanded-hover-details');
    expect(costSummary).toHaveAttribute('open');

    fireEvent.blur(personIdentity);
    expect(hoverDetails).toHaveAttribute('aria-hidden', 'true');
    expect(personFrame).not.toHaveClass('has-expanded-person-details');
    expect(coveredPersonFrame).not.toHaveClass('is-covered-by-expanded-person-details');
    expect(personFrameInner).not.toHaveClass('has-expanded-hover-details');
    expect(costSummary).not.toHaveAttribute('open');
  });

  it('does not keep hover person details stuck open after pointer focus leaves the card', () => {
    const { container } = renderCanvas({
      activePeople: [person, frontendPerson],
      benchAllocations: [benchAllocation],
      peopleById: new Map([
        [person.id, person],
        [frontendPerson.id, frontendPerson],
      ]),
      periodAllocations: [benchAllocation],
    });
    const personFrame = container.querySelector('.diablo-person-frame') as HTMLElement;
    const personFrameInner = personFrame.querySelector('.diablo-person-frame-inner') as HTMLElement;
    const personIdentity = personFrame.querySelector('.diablo-person-frame-identity') as HTMLButtonElement;
    const hoverDetails = personFrame.querySelector('.diablo-person-hover-details') as HTMLElement;
    const costSummary = personFrame.querySelector('.diablo-person-cost-summary') as HTMLDetailsElement;

    fireEvent.mouseEnter(personFrameInner);
    expect(hoverDetails).toHaveAttribute('aria-hidden', 'false');
    expect(costSummary).toHaveAttribute('open');

    fireEvent.pointerDown(personIdentity, { button: 0 });
    fireEvent.focus(personIdentity);
    fireEvent.mouseLeave(personFrameInner);

    expect(hoverDetails).toHaveAttribute('aria-hidden', 'true');
    expect(personFrame).not.toHaveClass('has-expanded-person-details');
    expect(personFrameInner).not.toHaveClass('has-expanded-hover-details');
    expect(costSummary).not.toHaveAttribute('open');
  });

  it('summarizes active-month project capacity in the project toolbar', () => {
    const overallocatedProject = makeProject('project-over', 'Beta', 'Delivery', 4);
    const overallocatedProjectAllocation: PersonTileAllocation = {
      ...projectAllocation,
      id: 'project-over-1',
      target: overallocatedProject.id,
      revenueK: 6,
    };

    renderCanvas({
      layout: {
        ...layout,
        projects: {
          ...layout.projects,
          [overallocatedProject.id]: {
            projectId: overallocatedProject.id,
            x: projectZoneX + 6,
            y: 4,
            width: 4,
            height: 2,
          },
        },
      },
      periodAllocations: [projectAllocation, overallocatedProjectAllocation],
      projects: [project, overallocatedProject],
      projectsById: new Map([
        [project.id, project],
        [overallocatedProject.id, overallocatedProject],
      ]),
    });

    const projectControlPanel = within(screen.getByLabelText('Panel projektów na canvasie'));

    expect(projectControlPanel.getByText('2 ramki')).toBeInTheDocument();
    expect(projectControlPanel.getByText('12k plan')).toBeInTheDocument();
    expect(projectControlPanel.getByText('7k alok.')).toBeInTheDocument();
    expect(projectControlPanel.getByText('7k luka')).toHaveClass('is-warning');
    expect(projectControlPanel.getByText('+2k poza')).toHaveClass('is-danger');
  });

  it('requires confirmation before resetting active-month project allocations from the project toolbar', () => {
    const onResetProjectAllocations = vi.fn();

    renderCanvas({
      onResetProjectAllocations,
      periodAllocations: [projectAllocation],
    });

    const resetButton = screen.getByRole('button', {
      name: 'Resetuj przydziały do projektów w tym miesiącu',
    });

    expect(resetButton).toBeEnabled();
    expect(resetButton).toHaveTextContent('Reset alok.');

    fireEvent.click(resetButton);
    expect(onResetProjectAllocations).not.toHaveBeenCalled();
    expect(screen.getByRole('button', {
      name: 'Potwierdź reset przydziałów do projektów w tym miesiącu',
    })).toHaveTextContent('Potwierdź');

    fireEvent.click(screen.getByRole('button', {
      name: 'Potwierdź reset przydziałów do projektów w tym miesiącu',
    }));

    expect(onResetProjectAllocations).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Cofnięto przydziały');
  });

  it('uses active-week reset copy when the project toolbar is scoped to a week', () => {
    const onResetProjectAllocations = vi.fn();

    renderCanvas({
      allocationResetScope: 'week',
      onResetProjectAllocations,
      periodAllocations: [projectAllocation],
    });

    const resetButton = screen.getByRole('button', {
      name: 'Resetuj przydziały do projektów w tym tygodniu',
    });

    fireEvent.click(resetButton);
    fireEvent.click(screen.getByRole('button', {
      name: 'Potwierdź reset przydziałów do projektów w tym tygodniu',
    }));

    expect(onResetProjectAllocations).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Cofnięto przydziały tygodnia');
  });

  it('disables project allocation reset when the active month has no project allocations', () => {
    renderCanvas();

    expect(screen.getByRole('button', {
      name: 'Resetuj przydziały do projektów w tym miesiącu',
    })).toBeDisabled();
  });

  it('copies people with or without allocations and pastes compatible people clipboard data', () => {
    const onCopyPeopleWithAllocations = vi.fn();
    const onCopyPeopleWithoutAllocations = vi.fn();
    const onPastePeopleClipboard = vi.fn();
    const onPasteProjectsClipboard = vi.fn();

    const { container } = renderCanvas({
      monthClipboard: {
        mode: 'people_with_allocations',
        sourcePeriodId: '2026-05',
        sourcePeriodLabel: 'Maj 2026',
      },
      onCopyPeopleWithAllocations,
      onCopyPeopleWithoutAllocations,
      onPastePeopleClipboard,
      onPasteProjectsClipboard,
    });
    const copyMenu = container.querySelector('.diablo-control-menu') as HTMLDetailsElement;

    expect(screen.getByText('z: Maj 2026')).toHaveClass('diablo-clipboard-source');
    expect(screen.getByRole('button', { name: 'Wklej skopiowane projekty bez alokacji' })).toBeDisabled();
    expect(screen.getAllByText('z: Maj 2026')).toHaveLength(1);

    copyMenu.setAttribute('open', '');
    expect(copyMenu).toHaveAttribute('open');

    fireEvent.pointerDown(document.body);
    expect(copyMenu).not.toHaveAttribute('open');

    copyMenu.setAttribute('open', '');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Z alokacją' }));
    expect(screen.getByRole('status')).toHaveTextContent('Skopiowano ludzi z alokacją');
    expect(copyMenu).not.toHaveAttribute('open');

    copyMenu.setAttribute('open', '');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bez alokacji' }));
    expect(screen.getByRole('status')).toHaveTextContent('Skopiowano ludzi bez alokacji');
    expect(copyMenu).not.toHaveAttribute('open');

    fireEvent.click(screen.getByRole('button', { name: 'Wklej skopiowaną sekcję ludzi' }));
    expect(screen.getByRole('status')).toHaveTextContent('Wklejono ludzi');

    expect(onCopyPeopleWithAllocations).toHaveBeenCalledTimes(1);
    expect(onCopyPeopleWithoutAllocations).toHaveBeenCalledTimes(1);
    expect(onPastePeopleClipboard).toHaveBeenCalledTimes(1);
    expect(onPastePeopleClipboard).toHaveBeenCalledWith(period.id);

    fireEvent.click(screen.getByRole('button', { name: 'Wklej skopiowane projekty bez alokacji' }));
    expect(onPasteProjectsClipboard).not.toHaveBeenCalled();
  });

  it('copies project frames without allocations and pastes only compatible project clipboard data', () => {
    const onCopyProjectsWithoutAllocations = vi.fn();
    const onPastePeopleClipboard = vi.fn();
    const onPasteProjectsClipboard = vi.fn();

    renderCanvas({
      monthClipboard: {
        mode: 'projects_without_allocations',
        sourcePeriodId: '2026-05',
        sourcePeriodLabel: 'Maj 2026',
      },
      onCopyProjectsWithoutAllocations,
      onPastePeopleClipboard,
      onPasteProjectsClipboard,
    });

    expect(screen.getByText('z: Maj 2026')).toHaveClass('diablo-clipboard-source');
    expect(screen.getByRole('button', { name: 'Wklej skopiowaną sekcję ludzi' })).toBeDisabled();
    expect(screen.getAllByText('z: Maj 2026')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Kopiuj projekty bez alokacji' }));
    expect(screen.getByRole('status')).toHaveTextContent('Skopiowano projekty');

    fireEvent.click(screen.getByRole('button', { name: 'Wklej skopiowane projekty bez alokacji' }));
    expect(screen.getByRole('status')).toHaveTextContent('Wklejono projekty');

    expect(onCopyProjectsWithoutAllocations).toHaveBeenCalledTimes(1);
    expect(onPasteProjectsClipboard).toHaveBeenCalledTimes(1);
    expect(onPasteProjectsClipboard).toHaveBeenCalledWith(period.id);

    fireEvent.click(screen.getByRole('button', { name: 'Wklej skopiowaną sekcję ludzi' }));
    expect(onPastePeopleClipboard).not.toHaveBeenCalled();
  });

  it('hides clipboard source badges when paste is disabled for the current month', () => {
    const { rerender, props } = renderCanvas({
      monthClipboard: {
        mode: 'people_with_allocations',
        sourcePeriodId: period.id,
        sourcePeriodLabel: period.label,
      },
    });

    expect(screen.getByRole('button', { name: 'Wklej skopiowaną sekcję ludzi' })).toBeDisabled();
    expect(screen.queryByText(`z: ${period.label}`)).not.toBeInTheDocument();

    rerender(
      <DiabloMonthCanvas
        {...props}
        monthClipboard={{
          mode: 'projects_without_allocations',
          sourcePeriodId: period.id,
          sourcePeriodLabel: period.label,
        }}
      />
    );

    expect(screen.getByRole('button', { name: 'Wklej skopiowane projekty bez alokacji' })).toBeDisabled();
    expect(screen.queryByText(`z: ${period.label}`)).not.toBeInTheDocument();
  });

  it('renders person frames directly from canvas layouts instead of sorting a separate people list', () => {
    const adamFrontendPerson: Person = {
      ...frontendPerson,
      name: 'Adam',
      initials: 'AD',
    };
    const juliaQaPerson: Person = {
      ...person,
      id: 'person-qa',
      name: 'Julia',
      initials: 'JU',
      color: '#a855f7',
      skillIds: ['qa'],
    };
    const bartekBackendPerson: Person = {
      ...person,
      id: 'person-backend-b',
      name: 'Bartek',
      initials: 'BA',
      color: '#38bdf8',
      skillIds: ['backend', 'qa'],
    };
    const { container } = renderCanvas({
      activePeople: [person, adamFrontendPerson, juliaQaPerson, bartekBackendPerson],
      peopleById: new Map([
        [person.id, person],
        [adamFrontendPerson.id, adamFrontendPerson],
        [juliaQaPerson.id, juliaQaPerson],
        [bartekBackendPerson.id, bartekBackendPerson],
      ]),
      skillsById: new Map<string, Skill>([
        [skill.id, skill],
        [frontendSkill.id, frontendSkill],
        [qaSkill.id, qaSkill],
      ]),
    });

    expect(getDiabloPersonFrameNames(container)).toEqual(["Taylor", 'Adam', 'Julia', 'Bartek']);
    expect(container.querySelectorAll('.diablo-person-frame')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Sortuj osoby po skillach i nazwie' })).toBeInTheDocument();
  });

  it('sorts person frames into a skill-grouped people-zone grid when requested', () => {
    const onLayoutChange = vi.fn();
    const adamFrontendPerson: Person = {
      ...frontendPerson,
      name: 'Adam',
      initials: 'AD',
    };
    const juliaQaPerson: Person = {
      ...person,
      id: 'person-qa',
      name: 'Julia',
      initials: 'JU',
      color: '#a855f7',
      skillIds: ['qa'],
    };
    const bartekBackendPerson: Person = {
      ...person,
      id: 'person-backend-b',
      name: 'Bartek',
      initials: 'BA',
      color: '#38bdf8',
      skillIds: ['backend', 'qa'],
    };
    const zofiaNoSkillPerson: Person = {
      ...person,
      id: 'person-no-skill',
      name: 'Zofia',
      initials: 'ZO',
      color: '#f97316',
      skillIds: [],
    };

    renderCanvas({
      activePeople: [person, adamFrontendPerson, juliaQaPerson, bartekBackendPerson, zofiaNoSkillPerson],
      onLayoutChange,
      peopleById: new Map([
        [person.id, person],
        [adamFrontendPerson.id, adamFrontendPerson],
        [juliaQaPerson.id, juliaQaPerson],
        [bartekBackendPerson.id, bartekBackendPerson],
        [zofiaNoSkillPerson.id, zofiaNoSkillPerson],
      ]),
      skillsById: new Map<string, Skill>([
        [skill.id, skill],
        [frontendSkill.id, frontendSkill],
        [qaSkill.id, qaSkill],
      ]),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sortuj osoby po skillach i nazwie' }));

    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    const nextLayout = onLayoutChange.mock.calls[0][0] as DiabloBoardLayout;
    const people = nextLayout.people || {};
    expect(nextLayout.peopleZoneColumns).toBe(35);
    expect(people[bartekBackendPerson.id]).toMatchObject({
      x: 2,
      y: DIABLO_PEOPLE_SORT_START_ROW,
      width: DIABLO_PERSON_FRAME_WIDTH,
      height: DIABLO_PERSON_FRAME_HEADER_ROWS + 4,
    });
    expect(people[person.id]).toMatchObject({
      x: 9,
      y: DIABLO_PEOPLE_SORT_START_ROW,
      width: DIABLO_PERSON_FRAME_WIDTH,
      height: DIABLO_PERSON_FRAME_HEADER_ROWS + 4,
    });
    expect(people[adamFrontendPerson.id]).toMatchObject({
      x: 16,
      y: DIABLO_PEOPLE_SORT_START_ROW,
      width: DIABLO_PERSON_FRAME_WIDTH,
      height: DIABLO_PERSON_FRAME_HEADER_ROWS + 4,
    });
    expect(people[juliaQaPerson.id]).toMatchObject({
      x: 23,
      y: DIABLO_PEOPLE_SORT_START_ROW,
      width: DIABLO_PERSON_FRAME_WIDTH,
      height: DIABLO_PERSON_FRAME_HEADER_ROWS + 4,
    });
    expect(people[zofiaNoSkillPerson.id]).toMatchObject({
      x: 30,
      y: DIABLO_PEOPLE_SORT_START_ROW,
      width: DIABLO_PERSON_FRAME_WIDTH,
      height: DIABLO_PERSON_FRAME_HEADER_ROWS + 4,
    });
    expect(nextLayout.projects[project.id].x).toBe(projectZoneX + 20);
  });

  it('right-aligns incomplete person-sort rows to the people-zone edge', () => {
    const onLayoutChange = vi.fn();

    renderCanvas({
      activePeople: [person, frontendPerson],
      onLayoutChange,
      peopleById: new Map([
        [person.id, person],
        [frontendPerson.id, frontendPerson],
      ]),
      skillsById: new Map<string, Skill>([
        [skill.id, skill],
        [frontendSkill.id, frontendSkill],
      ]),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sortuj osoby po skillach i nazwie' }));

    const nextLayout = onLayoutChange.mock.calls[0][0] as DiabloBoardLayout;
    const people = nextLayout.people || {};
    const rightmostPerson = people[frontendPerson.id];

    expect(rightmostPerson.x + rightmostPerson.width - 1).toBe(
      getDiabloPeopleZoneColumns(nextLayout) - DIABLO_CANVAS_EDGE_GUTTER
    );
  });

  it('sorts project frames into a five-column project-zone grid when requested', () => {
    const onLayoutChange = vi.fn();
    const betaProject = makeProject('project-beta', 'Beta', 'Platforma', 6);
    const alfaProject = makeProject('project-alfa', 'Alfa', 'Discovery', 8);
    const deltaProject = makeProject('project-delta', 'Delta', 'Support', 4);
    const gammaProject = makeProject('project-gamma', 'Gamma', 'Core', 5);
    const epsilonProject = makeProject('project-epsilon', 'Epsilon', 'Ops', 7);
    const zetaProject = makeProject('project-zeta', 'Zeta', 'QA', 3);
    const projectLayout: DiabloBoardLayout = {
      ...layout,
      projects: {
        [betaProject.id]: { projectId: betaProject.id, x: projectZoneX + 14, y: 12, width: 4, height: 3 },
        [alfaProject.id]: { projectId: alfaProject.id, x: projectZoneX + 10, y: 10, width: 4, height: 2 },
        [deltaProject.id]: { projectId: deltaProject.id, x: projectZoneX + 8, y: 16, width: 3, height: 3 },
        [gammaProject.id]: { projectId: gammaProject.id, x: projectZoneX + 18, y: 18, width: 5, height: 2 },
        [epsilonProject.id]: { projectId: epsilonProject.id, x: projectZoneX + 4, y: 20, width: 4, height: 4 },
        [zetaProject.id]: { projectId: zetaProject.id, x: projectZoneX + 22, y: 22, width: 3, height: 2 },
      },
    };

    renderCanvas({
      layout: projectLayout,
      onLayoutChange,
      projects: [betaProject, alfaProject, deltaProject, gammaProject, epsilonProject, zetaProject],
      projectsById: new Map([
        [betaProject.id, betaProject],
        [alfaProject.id, alfaProject],
        [deltaProject.id, deltaProject],
        [gammaProject.id, gammaProject],
        [epsilonProject.id, epsilonProject],
        [zetaProject.id, zetaProject],
      ]),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sortuj projekty w siatce po kliencie i nazwie' }));

    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    const nextLayout = onLayoutChange.mock.calls[0][0] as DiabloBoardLayout;
    expect(nextLayout.projects[alfaProject.id]).toMatchObject({
      x: projectZoneX,
      y: DIABLO_PROJECT_SORT_START_ROW,
      width: 4,
      height: 2,
    });
    expect(
      nextLayout.projects[betaProject.id].x -
      (nextLayout.projects[alfaProject.id].x + nextLayout.projects[alfaProject.id].width)
    ).toBe(DIABLO_PROJECT_GRID_EMPTY_CELLS);
    expect(
      nextLayout.projects[zetaProject.id].y
    ).toBe(DIABLO_PROJECT_SORT_START_ROW + nextLayout.projects[epsilonProject.id].height + DIABLO_PROJECT_GRID_EMPTY_CELLS);
  });

  it('sorts projects against primary assigned people from the canvas tool island', () => {
    const onLayoutChange = vi.fn();
    const betaProject = makeProject('project-beta', 'Beta', 'Delivery', 6);
    const projectLayout: DiabloBoardLayout = {
      ...layout,
      projects: {
        [project.id]: { projectId: project.id, x: projectZoneX + 10, y: 12, width: 4, height: 2 },
        [betaProject.id]: { projectId: betaProject.id, x: projectZoneX + 16, y: 12, width: 3, height: 2 },
      },
    };
    const tomaszProjectAllocation: PersonTileAllocation = {
      ...projectAllocation,
      id: 'project-person-a',
      personId: person.id,
      target: project.id,
    };
    const juliaBetaAllocations = createPersonAllocations(2, betaProject.id, {
      personId: frontendPerson.id,
      skillId: frontendSkill.id,
    });

    renderCanvas({
      activePeople: [person, frontendPerson],
      layout: projectLayout,
      onLayoutChange,
      peopleById: new Map([
        [person.id, person],
        [frontendPerson.id, frontendPerson],
      ]),
      periodAllocations: [tomaszProjectAllocation, ...juliaBetaAllocations],
      projects: [project, betaProject],
      projectsById: new Map([
        [project.id, project],
        [betaProject.id, betaProject],
      ]),
      skillsById: new Map<string, Skill>([
        [skill.id, skill],
        [frontendSkill.id, frontendSkill],
      ]),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sortuj projekty per ludzie' }));

    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    const nextLayout = onLayoutChange.mock.calls[0][0] as DiabloBoardLayout;
    const people = nextLayout.people || {};
    expect(people[person.id].y).toBe(nextLayout.projects[project.id].y);
    expect(people[frontendPerson.id].y).toBe(nextLayout.projects[betaProject.id].y);
    expect(people[person.id].x + people[person.id].width - 1).toBe(
      getDiabloPeopleZoneColumns(nextLayout) - DIABLO_CANVAS_EDGE_GUTTER
    );
    expect(nextLayout.projects[project.id].x).toBe(getDiabloProjectZoneStart(nextLayout) + DIABLO_CANVAS_EDGE_GUTTER);
  });

  it('renders a compact person frame when all bench tiles are already allocated', () => {
    const compactDimensions = getPersonFrameDimensionsForTileCount(0);
    const compactLayout: DiabloBoardLayout = {
      ...layout,
      people: {
        [person.id]: {
          personId: person.id,
          x: 2,
          y: 2,
          width: compactDimensions.width,
          height: compactDimensions.height,
        },
      },
    };

    const { container } = renderCanvas({
      activePeople: [person],
      layout: compactLayout,
      periodAllocations: [projectAllocation],
    });
    const personFrame = container.querySelector('.diablo-person-frame') as HTMLElement;

    expect(personFrame).toHaveStyle({
      gridColumn: `2 / span ${DIABLO_PERSON_FRAME_WIDTH}`,
      gridRow: `2 / span ${DIABLO_PERSON_FRAME_HEADER_ROWS}`,
    });
    expect(container.querySelector('.diablo-person-frame-grid')).not.toBeInTheDocument();
    expect(screen.getByText('brak wolnych kafelków do alokacji')).toBeInTheDocument();
  });

  it('creates people from selections in the people zone and projects from selections in the project zone', () => {
    const onCreatePersonFromSelection = vi.fn();
    const onCreateProjectFromSelection = vi.fn();
    const { container } = renderCanvas({ onCreatePersonFromSelection, onCreateProjectFromSelection });
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const cellPitch = 54;
    grid.getBoundingClientRect = () => ({
      bottom: 1512,
      height: 1512,
      left: 0,
      right: 1944,
      top: 0,
      width: 1944,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(grid, { button: 0, clientX: cellPitch + 10, clientY: cellPitch * 3 + 10 });
    fireEvent.pointerMove(window, { clientX: cellPitch * 3 + 10, clientY: cellPitch * 4 + 10 });
    fireEvent.pointerUp(window, { clientX: cellPitch * 3 + 10, clientY: cellPitch * 4 + 10 });

    expect(onCreatePersonFromSelection).toHaveBeenCalledWith({ x: 2, y: 4, width: 3, height: 2 });
    expect(onCreateProjectFromSelection).not.toHaveBeenCalled();

    fireEvent.pointerDown(grid, { button: 0, clientX: cellPitch * (projectZoneX - 1) + 10, clientY: cellPitch * 6 + 10 });
    fireEvent.pointerMove(window, { clientX: cellPitch * (projectZoneX + 2) + 10, clientY: cellPitch * 7 + 10 });
    fireEvent.pointerUp(window, { clientX: cellPitch * (projectZoneX + 2) + 10, clientY: cellPitch * 7 + 10 });

    expect(onCreateProjectFromSelection).toHaveBeenCalledWith({ x: projectZoneX, y: 7, width: 4, height: 2 });
  });

  it('keeps project and person frames inside their own canvas zones while dragging', () => {
    const onLayoutChange = vi.fn();
    const { container } = renderCanvas({
      activePeople: [person],
      canvasTool: 'move',
      onLayoutChange,
      peopleById: new Map([[person.id, person]]),
    });
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const projectFrame = screen.getByLabelText(/Client 1 - Discovery/);
    const personFrame = screen.getByLabelText(/Taylor, 0\/18k koszt/);
    const cellPitch = 54;
    grid.getBoundingClientRect = () => ({
      bottom: 1512,
      height: 1512,
      left: 0,
      right: 1944,
      top: 0,
      width: 1944,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(projectFrame, { button: 0, clientX: cellPitch * (projectZoneX - 1) + 10, clientY: cellPitch * 3 + 10 });
    fireEvent.pointerMove(window, { clientX: 10, clientY: cellPitch * 3 + 10 });
    fireEvent.pointerUp(window, { clientX: 10, clientY: cellPitch * 3 + 10 });

    const projectDragLayout = onLayoutChange.mock.calls.at(-1)?.[0] as DiabloBoardLayout;
    expect(projectDragLayout.projects[project.id].x).toBeGreaterThanOrEqual(getDiabloProjectZoneStart(DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS));

    fireEvent.pointerDown(personFrame, { button: 0, clientX: cellPitch + 10, clientY: cellPitch + 10 });
    fireEvent.pointerMove(window, { clientX: cellPitch * (projectZoneX + 4), clientY: cellPitch + 10 });
    fireEvent.pointerUp(window, { clientX: cellPitch * (projectZoneX + 4), clientY: cellPitch + 10 });

    const personDragLayout = onLayoutChange.mock.calls.at(-1)?.[0] as DiabloBoardLayout;
    expect(personDragLayout.people?.[person.id].x).toBeLessThanOrEqual(
      DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS - DIABLO_PERSON_FRAME_WIDTH + 1
    );
  });

  it('moves person frames from non-tile areas and leaves the tile section for tile dragging', () => {
    const onLayoutChange = vi.fn();
    const { container } = renderCanvas({
      activePeople: [person],
      benchAllocations: [benchAllocation],
      canvasTool: 'move',
      onLayoutChange,
      peopleById: new Map([[person.id, person]]),
      periodAllocations: [benchAllocation],
    });
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const personDragArea = container.querySelector('.diablo-person-frame-meta') as HTMLElement;
    const personTileSection = container.querySelector('.diablo-person-frame-tile-section') as HTMLElement;
    const cellPitch = 54;
    grid.getBoundingClientRect = () => ({
      bottom: 1512,
      height: 1512,
      left: 0,
      right: 1944,
      top: 0,
      width: 1944,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(personTileSection, { button: 0, clientX: cellPitch + 10, clientY: cellPitch + 10 });
    fireEvent.pointerMove(window, { clientX: cellPitch * 2 + 10, clientY: cellPitch * 3 + 10 });
    fireEvent.pointerUp(window, { clientX: cellPitch * 2 + 10, clientY: cellPitch * 3 + 10 });
    expect(onLayoutChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(personDragArea, { button: 0, clientX: cellPitch + 10, clientY: cellPitch + 10 });
    fireEvent.pointerMove(window, { clientX: cellPitch * 2 + 10, clientY: cellPitch * 3 + 10 });
    fireEvent.pointerUp(window, { clientX: cellPitch * 2 + 10, clientY: cellPitch * 3 + 10 });

    const personDragLayout = onLayoutChange.mock.calls.at(-1)?.[0] as DiabloBoardLayout;
    expect(personDragLayout.people?.[person.id]).toMatchObject({
      x: 3,
      y: 4,
      width: DIABLO_PERSON_FRAME_WIDTH,
      height: DIABLO_PERSON_FRAME_HEADER_ROWS + 4,
    });
  });

  it('drops a dragged person frame on a project by moving all free tiles to that project', () => {
    const onDropPayload = vi.fn();
    const onLayoutChange = vi.fn();
    const { container } = renderCanvas({
      activePeople: [person],
      benchAllocations: [benchAllocation],
      canvasTool: 'move',
      onDropPayload,
      onLayoutChange,
      peopleById: new Map([[person.id, person]]),
      periodAllocations: [benchAllocation],
    });
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const personPlate = container.querySelector('.diablo-person-plate') as HTMLElement;
    const personFrame = container.querySelector('.diablo-person-frame') as HTMLElement;
    const projectFrame = container.querySelector('.diablo-project-frame:not(.diablo-person-frame)') as HTMLElement;
    const cellPitch = 54;
    grid.getBoundingClientRect = () => ({
      bottom: 1512,
      height: 1512,
      left: 0,
      right: 1944,
      top: 0,
      width: 1944,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const elementFromPoint = vi.spyOn(document, 'elementFromPoint').mockReturnValue(projectFrame);

    try {
      fireEvent.pointerDown(personPlate, { button: 0, clientX: cellPitch + 10, clientY: cellPitch + 10 });
      fireEvent.pointerMove(window, {
        clientX: cellPitch * (projectZoneX - 1) + 10,
        clientY: cellPitch * 3 + 10,
      });
      expect(personFrame).toHaveClass('is-person-drag-preview');
      expect(projectFrame).toHaveClass('is-person-frame-drop-preview');
      fireEvent.pointerUp(window, {
        clientX: cellPitch * (projectZoneX - 1) + 10,
        clientY: cellPitch * 3 + 10,
      });
    } finally {
      elementFromPoint.mockRestore();
    }

    expect(onDropPayload).toHaveBeenCalledWith(
      { type: 'person', personId: person.id },
      project.id,
      period.id,
      undefined
    );
    expect((onLayoutChange.mock.calls.at(-1)?.[0] as DiabloBoardLayout).people?.[person.id]).toMatchObject({
      x: 2,
      y: 2,
    });
  });

  it('lets weekly person cards drop active-week free slots on a project without switching to move mode', () => {
    const onDropPayload = vi.fn();
    const onLayoutChange = vi.fn();
    const { container } = renderCanvas({
      activePeople: [person],
      allowPersonFrameProjectDrop: true,
      benchAllocations: [benchAllocation],
      canvasTool: 'create',
      onDropPayload,
      onLayoutChange,
      peopleById: new Map([[person.id, person]]),
      periodAllocations: [benchAllocation],
      personProjectDragPersonIds: new Set([person.id]),
    });
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const personPlate = container.querySelector('.diablo-person-plate') as HTMLElement;
    const personFrame = container.querySelector('.diablo-person-frame') as HTMLElement;
    const projectFrame = container.querySelector('.diablo-project-frame:not(.diablo-person-frame)') as HTMLElement;
    const cellPitch = 54;
    grid.getBoundingClientRect = () => ({
      bottom: 1512,
      height: 1512,
      left: 0,
      right: 1944,
      top: 0,
      width: 1944,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const elementFromPoint = vi.spyOn(document, 'elementFromPoint').mockReturnValue(projectFrame);

    try {
      fireEvent.pointerDown(personPlate, { button: 0, clientX: cellPitch + 10, clientY: cellPitch + 10 });
      fireEvent.pointerMove(window, {
        clientX: cellPitch * (projectZoneX - 1) + 10,
        clientY: cellPitch * 3 + 10,
      });
      expect(personFrame).toHaveClass('is-person-drag-preview');
      expect(projectFrame).toHaveClass('is-person-frame-drop-preview');
      fireEvent.pointerUp(window, {
        clientX: cellPitch * (projectZoneX - 1) + 10,
        clientY: cellPitch * 3 + 10,
      });
    } finally {
      elementFromPoint.mockRestore();
    }

    expect(onDropPayload).toHaveBeenCalledWith(
      { type: 'person', personId: person.id },
      project.id,
      period.id,
      undefined
    );
    expect(onLayoutChange.mock.calls.at(-1)?.[0]).toMatchObject({
      people: {
        [person.id]: {
          x: 2,
          y: 2,
        },
      },
    });
  });

  it('lets users drop a weekly project tile back on the owner person card', () => {
    const onDropPayload = vi.fn();
    const weeklyProjectAllocation: PersonTileAllocation = {
      ...projectAllocation,
      id: `weekly:${period.id}:${person.id}:0`,
      mode: 'hours_first',
      revenueK: 1.8,
      hours: 8,
    };
    const { container } = renderCanvas({
      activePeople: [person],
      allAllocations: [weeklyProjectAllocation],
      benchAllocations: [],
      onDropPayload,
      peopleById: new Map([[person.id, person]]),
      periodAllocations: [weeklyProjectAllocation],
    });
    const projectTile = container.querySelector('.diablo-project-frame:not(.diablo-person-frame) .diablo-inventory-person-tile') as HTMLButtonElement;
    const personFrame = container.querySelector('.diablo-person-frame') as HTMLElement;

    fireEvent.dragStart(projectTile);
    expect(personFrame).toHaveClass('is-drop-candidate');

    fireEvent.drop(personFrame, {
      dataTransfer: {
        getData: () => JSON.stringify({ type: 'tile', tileId: weeklyProjectAllocation.id }),
      },
    });

    expect(onDropPayload).toHaveBeenCalledWith(
      { type: 'tile', tileId: weeklyProjectAllocation.id },
      'bench',
      period.id,
      undefined
    );
  });

  it('lets a whole-person drag leave the people zone but reverts when it is not dropped on a project', () => {
    const onDropPayload = vi.fn();
    const onLayoutChange = vi.fn();
    const { container } = renderCanvas({
      activePeople: [person],
      benchAllocations: [benchAllocation],
      canvasTool: 'move',
      onDropPayload,
      onLayoutChange,
      peopleById: new Map([[person.id, person]]),
      periodAllocations: [benchAllocation],
    });
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const personPlate = container.querySelector('.diablo-person-plate') as HTMLElement;
    const personFrame = container.querySelector('.diablo-person-frame') as HTMLElement;
    const cellPitch = 54;
    grid.getBoundingClientRect = () => ({
      bottom: 1512,
      height: 1512,
      left: 0,
      right: 1944,
      top: 0,
      width: 1944,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const elementFromPoint = vi.spyOn(document, 'elementFromPoint').mockReturnValue(null);

    try {
      fireEvent.pointerDown(personPlate, { button: 0, clientX: cellPitch + 10, clientY: cellPitch + 10 });
      fireEvent.pointerMove(window, {
        clientX: cellPitch * (projectZoneX + 4),
        clientY: cellPitch * 3 + 10,
      });

      expect(personFrame).toHaveClass('is-person-drag-preview');

      fireEvent.pointerUp(window, {
        clientX: cellPitch * (projectZoneX + 4),
        clientY: cellPitch * 3 + 10,
      });
    } finally {
      elementFromPoint.mockRestore();
    }

    expect(onDropPayload).not.toHaveBeenCalled();
    expect((onLayoutChange.mock.calls.at(-1)?.[0] as DiabloBoardLayout).people?.[person.id]).toMatchObject({
      x: 2,
      y: 2,
    });
  });

  it('lets users Shift-click bench and project tiles into one draggable allocation group', () => {
    const onOpenAllocation = vi.fn();
    const onTileDragStart = vi.fn();
    const { container } = renderCanvas({
      activePeople: [person],
      allAllocations: [benchAllocation, projectAllocation],
      benchAllocations: [benchAllocation],
      onOpenAllocation,
      onTileDragStart,
      peopleById: new Map([[person.id, person]]),
      periodAllocations: [benchAllocation, projectAllocation],
    });
    const benchTile = screen.getByRole('button', { name: /Taylor: wolny kafelek, 8\.9h pracy, 1k capacity/ });
    const projectTile = container.querySelector('.diablo-project-frame:not(.diablo-person-frame) .diablo-inventory-person-tile') as HTMLButtonElement;
    const personFrame = container.querySelector('.diablo-person-frame') as HTMLElement;

    fireEvent.click(benchTile, { shiftKey: true });
    fireEvent.click(projectTile, { shiftKey: true });

    expect(onOpenAllocation).not.toHaveBeenCalled();
    expect(benchTile).toHaveClass('is-multi-selected');
    expect(projectTile).toHaveClass('is-multi-selected');
    expect(benchTile).toHaveAttribute('aria-pressed', 'true');
    expect(projectTile).toHaveAttribute('aria-pressed', 'true');

    const setDragImage = vi.fn();
    fireEvent.dragStart(projectTile, {
      dataTransfer: {
        setDragImage,
      },
    });

    expect(onTileDragStart).toHaveBeenLastCalledWith(expect.anything(), {
      type: 'allocation-group',
      allocationIds: [benchAllocation.id, projectAllocation.id],
    });
    expect(personFrame).toHaveClass('is-drop-candidate');
    expect(setDragImage).toHaveBeenCalledOnce();
    expect((setDragImage.mock.calls[0][0] as HTMLElement).textContent).toContain('2 kaf.');

    onTileDragStart.mockClear();
    fireEvent.click(benchTile, { shiftKey: true });
    expect(benchTile).not.toHaveClass('is-multi-selected');

    fireEvent.dragStart(projectTile);

    expect(onTileDragStart).toHaveBeenLastCalledWith(expect.anything(), {
      type: 'tile',
      tileId: projectAllocation.id,
    });
    expect(personFrame).toHaveClass('is-drop-candidate');
  });

  it('highlights a person project tiles while hovering or focusing the person card action', () => {
    const { container } = renderCanvas({
      activePeople: [person],
      allAllocations: [projectAllocation],
      benchAllocations: [],
      peopleById: new Map([[person.id, person]]),
      periodAllocations: [projectAllocation],
    });
    const highlightButton = screen.getByRole('button', { name: "Pokaż kafelki Taylor na canvasie" });
    const projectTile = container.querySelector('.diablo-project-frame:not(.diablo-person-frame) .diablo-inventory-person-tile') as HTMLButtonElement;
    const canvasGrid = container.querySelector('.diablo-canvas-grid') as HTMLElement;

    expect(highlightButton).toHaveTextContent('Pokaż');
    expect(highlightButton).toBeEnabled();
    expect(highlightButton).toHaveAttribute('aria-pressed', 'false');
    expect(projectTile).not.toHaveClass('is-person-highlighted');

    fireEvent.mouseEnter(highlightButton);
    expect(highlightButton).toHaveAttribute('aria-pressed', 'true');
    expect(canvasGrid).toHaveClass('is-person-highlight-active');
    expect(projectTile).toHaveClass('is-person-highlighted');

    fireEvent.mouseLeave(highlightButton);
    expect(highlightButton).toHaveAttribute('aria-pressed', 'false');
    expect(canvasGrid).not.toHaveClass('is-person-highlight-active');
    expect(projectTile).not.toHaveClass('is-person-highlighted');

    fireEvent.focus(highlightButton);
    expect(projectTile).toHaveClass('is-person-highlighted');

    fireEvent.blur(highlightButton);
    expect(projectTile).not.toHaveClass('is-person-highlighted');
  });

  it('passes the selected project skill zone when dropping a tile on a requirement segment', () => {
    const onDropPayload = vi.fn();
    const projectWithRequirement: ProjectFrame = {
      ...project,
      requirements: [{
        id: 'req-backend',
        skillId: 'backend',
        estimatedHours: 24,
        required: true,
      }],
    };

    renderCanvas({
      activePeople: [person],
      benchAllocations: [benchAllocation],
      onDropPayload,
      peopleById: new Map([[person.id, person]]),
      periodAllocations: [benchAllocation],
      projects: [projectWithRequirement],
      projectsById: new Map([[project.id, projectWithRequirement]]),
    });

    const zoneMap = screen.getByLabelText("Strefy skillowe projektu Client 1");
    const backendZone = within(zoneMap).getByText('Backend').closest('.diablo-skill-zone') as HTMLElement;

    fireEvent.drop(backendZone, {
      dataTransfer: {
        getData: () => JSON.stringify({ type: 'tile', tileId: benchAllocation.id }),
      },
    });

    expect(onDropPayload).toHaveBeenCalledWith(
      { type: 'tile', tileId: benchAllocation.id },
      project.id,
      period.id,
      { requirementId: 'req-backend', projectSlotIndex: 0 }
    );
  });

  it('skips automatic requirement suggestion when dropping on a zoned project frame', () => {
    const onDropPayload = vi.fn();
    const projectWithRequirement: ProjectFrame = {
      ...project,
      requirements: [{
        id: 'req-backend',
        skillId: 'backend',
        estimatedHours: 24,
        required: true,
      }],
    };
    const { container } = renderCanvas({
      activePeople: [person],
      benchAllocations: [benchAllocation],
      onDropPayload,
      peopleById: new Map([[person.id, person]]),
      periodAllocations: [benchAllocation],
      projects: [projectWithRequirement],
      projectsById: new Map([[project.id, projectWithRequirement]]),
    });

    fireEvent.drop(container.querySelector('.diablo-project-frame:not(.diablo-person-frame)') as HTMLElement, {
      dataTransfer: {
        getData: () => JSON.stringify({ type: 'tile', tileId: benchAllocation.id }),
      },
    });

    expect(onDropPayload).toHaveBeenCalledWith(
      { type: 'tile', tileId: benchAllocation.id },
      project.id,
      period.id,
      { disableRequirementSuggestion: true }
    );
  });

  it('uses manually selected zones for placement without auto-sorting by person skill', () => {
    const projectWithRequirements: ProjectFrame = {
      ...project,
      rateConfig: { companyTargetRatePlnH: 1000 },
      requirements: [
        {
          id: 'req-backend',
          skillId: 'backend',
          estimatedHours: 4,
          required: true,
        },
        {
          id: 'req-frontend',
          skillId: 'frontend',
          estimatedHours: 2,
          required: true,
        },
      ],
    };
    const frontendUnmappedAllocation: PersonTileAllocation = {
      ...frontendAllocation,
      id: 'frontend-unmapped',
      requirementId: undefined,
      skillId: 'frontend',
    };
    const backendInFrontendZoneAllocation: PersonTileAllocation = {
      ...projectAllocation,
      id: 'backend-in-frontend-zone',
      requirementId: 'req-frontend',
      projectSlotIndex: 5,
      skillId: 'frontend',
    };
    const { container } = renderCanvas({
      activePeople: [person, frontendPerson],
      allAllocations: [frontendUnmappedAllocation, backendInFrontendZoneAllocation],
      peopleById: new Map([
        [person.id, person],
        [frontendPerson.id, frontendPerson],
      ]),
      periodAllocations: [frontendUnmappedAllocation, backendInFrontendZoneAllocation],
      projects: [projectWithRequirements],
      projectsById: new Map([[project.id, projectWithRequirements]]),
      skillsById: new Map<string, Skill>([
        [skill.id, skill],
        [frontendSkill.id, frontendSkill],
      ]),
    });
    const gridItems = Array.from(
      container.querySelectorAll('.diablo-project-frame:not(.diablo-person-frame) .diablo-inventory-grid > *')
    ) as HTMLElement[];

    expect(gridItems).toHaveLength(8);
    expect(gridItems[0]).toHaveAttribute('data-skill-zone', 'backend');
    expect(gridItems[0]).toHaveTextContent('JU');
    expect(gridItems[1]).toHaveAttribute('data-skill-zone', 'backend');
    expect(gridItems[1]).toHaveClass('diablo-inventory-cell');
    expect(gridItems[4]).toHaveAttribute('data-skill-zone', 'frontend');
    expect(gridItems[4]).toHaveClass('diablo-inventory-cell');
    expect(gridItems[5]).toHaveAttribute('data-skill-zone', 'frontend');
    expect(gridItems[5]).toHaveTextContent("TG");
    expect(gridItems[6]).not.toHaveAttribute('data-skill-zone');
  });

  it('renders unassigned person tiles from monthly cost instead of target revenue on the person card', () => {
    const benchAllocations = createPersonAllocations(18, 'bench', { hours: 5 });
    const { container } = renderCanvas({
      activePeople: [person],
      allAllocations: benchAllocations,
      benchAllocations,
      peopleById: new Map([[person.id, person]]),
      periodAllocations: benchAllocations,
    });
    const benchTiles = container.querySelectorAll('.diablo-person-bench-tile');
    const benchTileMetrics = container.querySelectorAll('.diablo-person-bench-tile .diablo-tile-metric-value');

    expect(screen.getByLabelText(/Taylor, 0\/18k koszt, 160h wolne/)).toBeInTheDocument();
    expect(screen.getByLabelText("Pokrycie kosztu Taylor: 0 z 18k, 0%")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Pokaż kafelki Taylor na canvasie" })).not.toBeInTheDocument();
    expect(benchTiles).toHaveLength(18);
    benchTileMetrics.forEach((tile) => {
      expect(tile).toHaveTextContent('8.9h');
    });
    benchTiles.forEach((tile) => {
      expect(tile).toHaveAttribute('data-cost-coverage', 'unassigned');
      expect(tile).toHaveAttribute('draggable', 'true');
    });
  });

  it('keeps monthly cost mode tied to person cost capacity instead of hours-per-tile', () => {
    const benchAllocations = createPersonAllocations(18, 'bench');
    const { container } = renderCanvas({
      activePeople: [person],
      allAllocations: benchAllocations,
      benchAllocations,
      peopleById: new Map([[person.id, person]]),
      periodAllocations: benchAllocations,
      tileMetricMode: 'cost',
    });
    const benchTiles = container.querySelectorAll('.diablo-person-bench-tile .diablo-tile-metric-value');

    expect(screen.getByLabelText(/Taylor, 0\/18k koszt, 18k koszt wolny/)).toBeInTheDocument();
    expect(benchTiles).toHaveLength(18);
    benchTiles.forEach((tile) => {
      expect(tile).toHaveTextContent('1k');
    });
  });

  it('keeps person cost details collapsed by default on the person card', () => {
    const projectAllocations = createPersonAllocations(18, project.id);
    renderCanvas({
      activePeople: [person],
      allAllocations: projectAllocations,
      benchAllocations: [],
      peopleById: new Map([[person.id, person]]),
      periodAllocations: projectAllocations,
      projects: [project],
      projectsById: new Map([[project.id, project]]),
    });
    const costSummary = screen.getByLabelText("Pokrycie kosztu Taylor: 18 z 18k, 100%") as HTMLDetailsElement;
    const costSummaryHeader = costSummary.querySelector('summary') as HTMLElement;
    const revenueLine = within(costSummary).getByText('18k przychód');
    const balanceLine = within(costSummary).getByText('+0k bilans');

    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    expect(costSummary.tagName).toBe('DETAILS');
    expect(costSummary.open).toBe(false);
    expect(within(costSummaryHeader).getByText('Pokrycie kosztu')).toBeVisible();
    expect(revenueLine).not.toBeVisible();
    expect(balanceLine).not.toBeVisible();

    fireEvent.click(costSummaryHeader);

    expect(costSummary.open).toBe(true);
    expect(revenueLine).toBeVisible();
    expect(balanceLine).toBeVisible();
  });

  it('does not start a whole-person drag to projects when the person has no free tiles', () => {
    const onPersonDragStart = vi.fn();
    const projectAllocations = createPersonAllocations(18, project.id);
    const { container } = renderCanvas({
      activePeople: [person],
      allAllocations: projectAllocations,
      benchAllocations: [],
      onPersonDragStart,
      peopleById: new Map([[person.id, person]]),
      periodAllocations: projectAllocations,
      projects: [project],
      projectsById: new Map([[project.id, project]]),
    });
    const personFrameInner = container.querySelector('.diablo-person-frame-inner') as HTMLElement;

    expect(personFrameInner).toHaveAttribute('draggable', 'false');

    fireEvent.dragStart(personFrameInner);

    expect(onPersonDragStart).not.toHaveBeenCalled();
  });

  it('shows only unassigned person tiles on the card while R&D stays visible but does not cover salary cost', () => {
    const onOpenAllocation = vi.fn();
    const commercialProject: ProjectFrame = {
      ...project,
      budgetK: 15,
      revenuePlan: [{ periodId: period.id, revenueK: 15, probability: 1 }],
    };
    const commercialAllocations = createPersonAllocations(15, commercialProject.id);
    const rdAllocations = createPersonAllocations(3, researchProject.id, { tileIndex: 15 });
    const periodAllocations = [...commercialAllocations, ...rdAllocations];
    const testLayout: DiabloBoardLayout = {
      ...layout,
      projects: {
        [commercialProject.id]: {
          projectId: commercialProject.id,
          x: projectZoneX,
          y: 4,
          width: 5,
          height: 3,
        },
        [researchProject.id]: {
          projectId: researchProject.id,
          x: projectZoneX,
          y: 8,
          width: 3,
          height: 1,
        },
      },
    };
    const { container } = renderCanvas({
      activePeople: [person],
      allAllocations: periodAllocations,
      benchAllocations: [],
      layout: testLayout,
      onOpenAllocation,
      peopleById: new Map([[person.id, person]]),
      periodAllocations,
      projects: [commercialProject, researchProject],
      projectsById: new Map([
        [commercialProject.id, commercialProject],
        [researchProject.id, researchProject],
      ]),
    });
    const commercialFrame = screen.getByLabelText(/Client 1 - Discovery, 15\/15k/);
    const researchFrame = screen.getByLabelText(/R&D - Research, 3\/3k/);
    const commercialTiles = commercialFrame.querySelectorAll('.diablo-inventory-person-tile');
    const researchTiles = researchFrame.querySelectorAll('.diablo-inventory-person-tile');

    expect(screen.getByLabelText("Pokrycie kosztu Taylor: 15 z 18k, 83%")).toBeInTheDocument();
    expect(screen.getByText('ALERT')).toBeInTheDocument();
    expect(screen.getByText('Pokrycie kosztu: 15k vs koszt 18k, 3k poza pokryciem.')).toBeInTheDocument();
    expect(screen.getByText('15k przychód')).toBeInTheDocument();
    expect(screen.getByText('-3k bilans')).toBeInTheDocument();
    expect(screen.getByText('3k poza pokr.')).toBeInTheDocument();
    expect(screen.getByText('R&D poza')).toBeInTheDocument();
    expect(screen.getAllByText(/brak wolnych kafelków/).length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.diablo-person-bench-tile')).toHaveLength(0);
    expect(commercialTiles).toHaveLength(15);
    expect(researchTiles).toHaveLength(3);
    commercialTiles.forEach((tile) => expect(tile).toHaveAttribute('data-cost-coverage', 'pending'));
    researchTiles.forEach((tile) => expect(tile).toHaveAttribute('data-cost-coverage', 'non-covering'));

    const researchTile = researchTiles[0] as HTMLButtonElement;
    fireEvent.click(researchTile, { shiftKey: true });
    expect(onOpenAllocation).not.toHaveBeenCalled();
    expect(researchTile).toHaveClass('is-multi-selected');

    fireEvent.click(researchTile, { shiftKey: true });
    expect(onOpenAllocation).not.toHaveBeenCalled();
    expect(researchTile).not.toHaveClass('is-multi-selected');
  });

  it('marks commercial project tiles as covered only after the full person cost footprint is commercial', () => {
    const commercialProject: ProjectFrame = {
      ...project,
      budgetK: 18,
      revenuePlan: [{ periodId: period.id, revenueK: 18, probability: 1 }],
    };
    const commercialAllocations = createPersonAllocations(18, commercialProject.id);
    const testLayout: DiabloBoardLayout = {
      ...layout,
      projects: {
        [commercialProject.id]: {
          projectId: commercialProject.id,
          x: projectZoneX,
          y: 4,
          width: 6,
          height: 3,
        },
      },
    };
    const { container } = renderCanvas({
      activePeople: [person],
      allAllocations: commercialAllocations,
      benchAllocations: [],
      layout: testLayout,
      peopleById: new Map([[person.id, person]]),
      periodAllocations: commercialAllocations,
      projects: [commercialProject],
      projectsById: new Map([[commercialProject.id, commercialProject]]),
    });
    const commercialFrame = screen.getByLabelText(/Client 1 - Discovery, 18\/18k/);
    const commercialTiles = commercialFrame.querySelectorAll('.diablo-inventory-person-tile');

    expect(screen.getByLabelText("Pokrycie kosztu Taylor: 18 z 18k, 100%")).toBeInTheDocument();
    expect(container.querySelectorAll('.diablo-person-bench-tile')).toHaveLength(0);
    expect(commercialTiles).toHaveLength(18);
    commercialTiles.forEach((tile) => expect(tile).toHaveAttribute('data-cost-coverage', 'covered'));
  });

  it('shows time-off project tiles as cost outside revenue coverage on the person card', () => {
    const commercialProject: ProjectFrame = {
      ...project,
      budgetK: 14,
      revenuePlan: [{ periodId: period.id, revenueK: 14, probability: 1 }],
    };
    const commercialAllocations = createPersonAllocations(14, commercialProject.id);
    const timeOffAllocations = createPersonAllocations(4, timeOffProject.id, { tileIndex: 14 });
    const periodAllocations = [...commercialAllocations, ...timeOffAllocations];
    const testLayout: DiabloBoardLayout = {
      ...layout,
      projects: {
        [commercialProject.id]: {
          projectId: commercialProject.id,
          x: projectZoneX,
          y: 4,
          width: 5,
          height: 3,
        },
        [timeOffProject.id]: {
          projectId: timeOffProject.id,
          x: projectZoneX,
          y: 8,
          width: 4,
          height: 1,
        },
      },
    };
    const { container } = renderCanvas({
      activePeople: [person],
      allAllocations: periodAllocations,
      benchAllocations: [],
      layout: testLayout,
      peopleById: new Map([[person.id, person]]),
      periodAllocations,
      projects: [commercialProject, timeOffProject],
      projectsById: new Map([
        [commercialProject.id, commercialProject],
        [timeOffProject.id, timeOffProject],
      ]),
    });
    const timeOffFrame = screen.getByLabelText(/URLOP - Urlopy, 4\/4k/);
    const timeOffTiles = timeOffFrame.querySelectorAll('.diablo-inventory-person-tile');

    expect(screen.getByLabelText("Pokrycie kosztu Taylor: 14 z 18k, 78%")).toBeInTheDocument();
    expect(screen.getByText('4k urlop')).toBeInTheDocument();
    expect(screen.getByText('URLOP urlop')).toBeInTheDocument();
    expect(screen.getByText('Pokrycie kosztu: 14k vs koszt 18k, 4k poza pokryciem, 4k urlop.')).toBeInTheDocument();
    expect(container.querySelectorAll('.diablo-person-bench-tile')).toHaveLength(0);
    expect(timeOffTiles).toHaveLength(4);
    timeOffTiles.forEach((tile) => expect(tile).toHaveAttribute('data-cost-coverage', 'time-off'));
  });

  it('renders project inventory badges under Diablo project frames with tooltip details', () => {
    renderCanvas();

    const projectPatternRail = screen.getByLabelText("Patterny projektu Client 1");
    const emptyProjectBadge = within(projectPatternRail).getByLabelText(
      '0P: brak ludzi. projekt nie ma przypisanej osoby w tym miesiącu'
    );

    expect(emptyProjectBadge).toHaveTextContent('0P');
    expect(emptyProjectBadge).toHaveAttribute(
      'title',
      'brak ludzi: projekt nie ma przypisanej osoby w tym miesiącu'
    );
  });

  it('collapses the Diablo legend through the persisted panel layout', () => {
    const onLayoutChange = vi.fn();
    renderCanvas({ onLayoutChange });

    const collapseButton = screen.getByRole('button', { name: 'Zwiń' });
    expect(collapseButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(collapseButton);

    expect(onLayoutChange).toHaveBeenCalledWith(
      expect.objectContaining({
        panels: expect.objectContaining({
          legend: expect.objectContaining({
            x: 20,
            y: 2,
            collapsed: true,
          }),
        }),
      }),
      'local'
    );
  });

  it('keeps the Diablo legend collapsed when the saved layout says so', () => {
    renderCanvas({
      layout: {
        ...layout,
        panels: {
          ...layout.panels,
          legend: { ...layout.panels.legend, collapsed: true },
        },
      },
    });

    expect(screen.getByRole('button', { name: 'Rozwiń' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Sekcje legendy Diablo')).not.toBeInTheDocument();
  });

  it('pulls a saved offscreen Diablo legend back into the visible viewport', async () => {
    const onLayoutChange = vi.fn();
    const offscreenLegendLayout: DiabloBoardLayout = {
      ...layout,
      panels: {
        ...layout.panels,
        legend: { x: 120, y: 24 },
      },
    };
    const { container } = renderCanvas({
      layout: offscreenLegendLayout,
      onLayoutChange,
    });
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    setCanvasViewportSize(viewport, 900, 480);

    fireEvent.resize(window);

    await waitFor(() => {
      expect(onLayoutChange).toHaveBeenCalledWith(
        expect.objectContaining({
          panels: expect.objectContaining({
            legend: expect.objectContaining({
              x: expect.any(Number),
              y: expect.any(Number),
            }),
          }),
        }),
        'local'
      );
    });
    const nextLayout = onLayoutChange.mock.calls.find((call) => call[1] === 'local')?.[0] as DiabloBoardLayout;

    expect(nextLayout.panels.legend.x).toBeLessThan(offscreenLegendLayout.panels.legend.x);
    expect(nextLayout.panels.legend.y).toBeLessThan(offscreenLegendLayout.panels.legend.y);
  });

  it('moves the Diablo legend as a local-only panel without changing shared project layout', () => {
    const onLayoutChange = vi.fn();
    const { container } = renderCanvas({ canvasTool: 'move', onLayoutChange });
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const legendHeader = screen.getByText('Legenda').closest('header') as HTMLElement;
    const cellPitch = 54;
    grid.getBoundingClientRect = () => ({
      bottom: 1512,
      height: 1512,
      left: 0,
      right: 1944,
      top: 0,
      width: 1944,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(legendHeader, {
      button: 0,
      clientX: (layout.panels.legend.x - 1) * cellPitch + 10,
      clientY: (layout.panels.legend.y - 1) * cellPitch + 10,
    });
    fireEvent.pointerMove(window, {
      clientX: (layout.panels.legend.x + 4) * cellPitch + 10,
      clientY: (layout.panels.legend.y + 1) * cellPitch + 10,
    });

    expect(onLayoutChange).toHaveBeenCalledWith(
      expect.objectContaining({
        panels: expect.objectContaining({
          legend: expect.objectContaining({
            x: layout.panels.legend.x + 5,
            y: layout.panels.legend.y + 2,
          }),
        }),
        projects: layout.projects,
      }),
      'local'
    );
    expect(onLayoutChange.mock.calls[0][0]).not.toHaveProperty('canvasSize');
  });

  it('renders a dynamically wider grid when saved content sits beyond the starter canvas', () => {
    const extendedLayout: DiabloBoardLayout = {
      ...layout,
      projects: {
        [project.id]: {
          ...layout.projects[project.id],
          x: 42,
          width: 4,
        },
      },
    };
    const expectedCanvasSize = getDiabloCanvasSize(extendedLayout);
    const { container } = renderCanvas({ layout: extendedLayout });
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;

    expect(grid.style.getPropertyValue('--diablo-grid-columns')).toBe(String(expectedCanvasSize.columns));
    expect(grid.style.gridTemplateColumns).toBe(`repeat(${expectedCanvasSize.columns}, var(--diablo-cell))`);
    expect(grid.style.width).toBe(`${expectedCanvasSize.columns * 48 + (expectedCanvasSize.columns - 1) * 6}px`);
  });

  it('pans the canvas viewport by dragging empty canvas in grab mode', () => {
    const { container } = renderCanvas({ canvasTool: 'move' });
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 1200 });
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 600 });

    fireEvent.pointerDown(viewport, { button: 0, clientX: 500, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 430, clientY: 260 });

    expect(getCanvasPan(container)).toEqual({ x: -70, y: -40 });
    expect(viewport.style.getPropertyValue('--diablo-bg-x')).toBe('-70px');
    expect(viewport.style.getPropertyValue('--diablo-bg-y')).toBe('-40px');
  });

  it('grows the canvas when grab-panning beyond the current right edge', () => {
    const onLayoutChange = vi.fn();
    const { container } = renderCanvas({ canvasTool: 'move', onLayoutChange });
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 1200 });
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 600 });

    fireEvent.pointerDown(viewport, { button: 0, clientX: 500, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: -900, clientY: 300 });

    expect(onLayoutChange).toHaveBeenCalledWith(expect.objectContaining({
      canvasSize: expect.objectContaining({
        columns: expect.any(Number),
      }),
    }));
    const nextLayout = onLayoutChange.mock.calls[0][0] as DiabloBoardLayout;
    expect(nextLayout.canvasSize?.columns).toBeGreaterThan(getDiabloCanvasSize(layout, 0).columns);
  });

  it('continues grab-panning smoothly after dynamic left-side canvas growth', () => {
    const onLayoutChange = vi.fn();
    const { container } = renderCanvas({ canvasTool: 'move', onLayoutChange });
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 1200 });
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 600 });

    fireEvent.pointerDown(viewport, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 100 });
    const firstPan = getCanvasPan(container);

    fireEvent.pointerMove(window, { clientX: 220, clientY: 100 });
    const secondPan = getCanvasPan(container);

    expect(onLayoutChange).toHaveBeenCalled();
    expect(secondPan.x - firstPan.x).toBe(20);
    expect(secondPan.y).toBe(firstPan.y);
  });

  it('fits the current canvas view without changing the arranged layout', () => {
    const onLayoutChange = vi.fn();
    const expandedLayout: DiabloBoardLayout = {
      ...layout,
      canvasSize: { columns: 84, rows: 56 },
      projects: {
        [project.id]: {
          ...layout.projects[project.id],
          x: 24,
          y: 18,
        },
      },
      panels: {
        people: { x: 42, y: 34 },
        legend: { x: 58, y: 18, collapsed: true },
      },
    };

    renderCanvas({ layout: expandedLayout, onLayoutChange });

    const fitButton = screen.getByRole('button', { name: 'Dopasuj widok do ludzi i projektów' });
    expect(fitButton).not.toHaveAttribute('title');
    expect(screen.getByText('Dopasuj widok do ludzi i projektów')).toHaveClass('traffic-tooltip-bubble');

    const fitTooltip = fitButton.closest('.traffic-tooltip');
    expect(fitTooltip).toBeInTheDocument();
    fireEvent.pointerEnter(fitTooltip as HTMLElement);
    expect(fitTooltip).toHaveClass('is-visible');

    fireEvent.click(fitButton);

    expect(fitTooltip).not.toHaveClass('is-visible');
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it('reframes the initial canvas when projects would otherwise start outside the viewport', async () => {
    const farProjectLayout: DiabloBoardLayout = {
      ...layout,
      canvasSize: { columns: 120, rows: 48 },
      people: {
        [person.id]: {
          personId: person.id,
          x: 2,
          y: 4,
          width: DIABLO_PERSON_FRAME_WIDTH,
          height: 8,
        },
      },
      projects: {
        [project.id]: {
          ...layout.projects[project.id],
          x: 70,
          y: 4,
          width: 8,
          height: 4,
        },
      },
      panels: {
        people: { x: 2, y: 2 },
        legend: { x: 2, y: 16, collapsed: true },
      },
    };
    const { container } = renderCanvas({
      activePeople: [person],
      layout: farProjectLayout,
      peopleById: new Map([[person.id, person]]),
    });
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    setCanvasViewportSize(viewport, 900, 480);

    fireEvent.resize(window);

    await waitFor(() => {
      const scale = getCanvasScale(container);
      const pan = getCanvasPan(container);
      const projectLeft = pan.x + (farProjectLayout.projects[project.id].x - 1) * 54 * scale;

      expect(scale).toBeGreaterThanOrEqual(0.55);
      expect(projectLeft).toBeGreaterThanOrEqual(0);
      expect(projectLeft).toBeLessThan(900 - 160);
    });
  });

  it('zooms current people and project positions into the available canvas viewport', async () => {
    const onLayoutChange = vi.fn();
    const expandedLayout: DiabloBoardLayout = {
      ...layout,
      canvasSize: { columns: 120, rows: 80 },
      people: {
        [person.id]: {
          personId: person.id,
          x: 2,
          y: 40,
          width: DIABLO_PERSON_FRAME_WIDTH,
          height: 8,
        },
        [frontendPerson.id]: {
          personId: frontendPerson.id,
          x: 9,
          y: 40,
          width: DIABLO_PERSON_FRAME_WIDTH,
          height: 7,
        },
      },
      projects: {
        [project.id]: {
          ...layout.projects[project.id],
          x: 70,
          y: 30,
          width: 8,
          height: 4,
        },
      },
      panels: {
        people: { x: 2, y: 2 },
        legend: { x: 105, y: 30, collapsed: true },
      },
    };
    const { container } = renderCanvas({
      activePeople: [person, frontendPerson],
      layout: expandedLayout,
      onLayoutChange,
    });
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 2500 });
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 720 });

    fireEvent.click(screen.getByRole('button', { name: 'Dopasuj widok do ludzi i projektów' }));

    expect(onLayoutChange).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(getCanvasScale(container)).toBeLessThan(1);
      expect(getCanvasPan(container).x).toBeLessThan(0);
    });
  });

  it('keeps fit zoom at the readable minimum when content is still too wide', async () => {
    const farProject = makeProject('project-far', "Client 2", 'Build');
    const hugeLayout: DiabloBoardLayout = {
      ...layout,
      canvasSize: { columns: 420, rows: 80 },
      people: {
        [person.id]: {
          personId: person.id,
          x: 2,
          y: 20,
          width: DIABLO_PERSON_FRAME_WIDTH,
          height: 8,
        },
      },
      projects: {
        [project.id]: {
          ...layout.projects[project.id],
          x: 70,
          y: 20,
          width: 8,
          height: 4,
        },
        [farProject.id]: {
          projectId: farProject.id,
          x: 360,
          y: 20,
          width: 8,
          height: 4,
        },
      },
      panels: {
        people: { x: 2, y: 2 },
        legend: { x: 390, y: 20, collapsed: true },
      },
    };
    const { container } = renderCanvas({
      activePeople: [person],
      layout: hugeLayout,
      onLayoutChange: vi.fn(),
      projects: [project, farProject],
      projectsById: new Map([
        [project.id, project],
        [farProject.id, farProject],
      ]),
    });
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 900 });
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 480 });

    fireEvent.click(screen.getByRole('button', { name: 'Dopasuj widok do ludzi i projektów' }));

    await waitFor(() => {
      expect(getCanvasScale(container)).toBeCloseTo(0.55);
      expect(screen.getByRole('button', { name: 'Oddal canvas (55%)' })).not.toBeDisabled();
    });
  });

  it('fits only currently rendered people and project cards, ignoring stale saved layout entries', async () => {
    const staleLayout: DiabloBoardLayout = {
      ...layout,
      canvasSize: { columns: 420, rows: 80 },
      people: {
        [person.id]: {
          personId: person.id,
          x: 2,
          y: 8,
          width: DIABLO_PERSON_FRAME_WIDTH,
          height: 8,
        },
        'stale-person': {
          personId: 'stale-person',
          x: 300,
          y: 8,
          width: DIABLO_PERSON_FRAME_WIDTH,
          height: 8,
        },
      },
      projects: {
        [project.id]: {
          ...layout.projects[project.id],
          x: projectZoneX,
          y: 8,
          width: 4,
          height: 2,
        },
        'stale-project': {
          projectId: 'stale-project',
          x: 360,
          y: 8,
          width: 8,
          height: 4,
        },
      },
    };
    const { container } = renderCanvas({
      activePeople: [person],
      layout: staleLayout,
      projects: [project],
      projectsById: new Map([[project.id, project]]),
    });
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 900 });
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 480 });

    fireEvent.click(screen.getByRole('button', { name: 'Dopasuj widok do ludzi i projektów' }));

    await waitFor(() => {
      expect(getCanvasScale(container)).toBeGreaterThan(0.2);
    });
  });

  it('zooms the Diablo canvas in and out from the canvas tool island', async () => {
    const { container } = renderCanvas();
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const scaleShell = container.querySelector('.diablo-canvas-scale-shell') as HTMLElement;
    const peopleZoneBackdrop = container.querySelector('.diablo-people-zone-backdrop') as HTMLElement;
    const projectZoneBackdrop = container.querySelector('.diablo-project-zone-backdrop') as HTMLElement;
    const zoomOutButton = screen.getByRole('button', { name: /Oddal canvas/ });
    const zoomInButton = screen.getByRole('button', { name: /Przybliż canvas/ });
    const initialPeopleZoneWidth = peopleZoneBackdrop.style.width;
    const initialProjectZoneLeft = projectZoneBackdrop.style.left;

    expect(grid.style.getPropertyValue('--diablo-cell')).toBe('48px');
    expect(grid.style.getPropertyValue('--diablo-pitch')).toBe('54px');
    expect(getCanvasScale(container)).toBeCloseTo(1);
    expect(scaleShell.style.width).not.toBe('');
    expect(scaleShell.style.height).not.toBe('');
    expect(scaleShell.style.getPropertyValue('--diablo-visual-pitch')).toBe('54px');

    fireEvent.click(zoomOutButton);

    await waitFor(() => {
      expect(grid.style.getPropertyValue('--diablo-cell')).toBe('48px');
      expect(grid.style.getPropertyValue('--diablo-pitch')).toBe('54px');
      expect(getCanvasScale(container)).toBeLessThan(1);
      expect(peopleZoneBackdrop.style.width).not.toBe(initialPeopleZoneWidth);
      expect(projectZoneBackdrop.style.left).not.toBe(initialProjectZoneLeft);
      expect(Number.parseFloat(peopleZoneBackdrop.style.getPropertyValue('--diablo-people-zone-pitch'))).toBeLessThan(54);
      expect(Number.parseFloat(projectZoneBackdrop.style.getPropertyValue('--diablo-project-zone-pitch'))).toBeLessThan(54);
    });

    for (let index = 0; index < 32; index += 1) {
      fireEvent.click(zoomOutButton);
    }

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Oddal canvas (10%)' })).toBeDisabled();
      expect(grid.style.getPropertyValue('--diablo-cell')).toBe('48px');
      expect(getCanvasScale(container)).toBeCloseTo(0.1);
    });

    for (let index = 0; index < 40; index += 1) {
      fireEvent.click(zoomInButton);
    }

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Przybliż canvas (200%)' })).toBeDisabled();
      expect(grid.style.getPropertyValue('--diablo-cell')).toBe('48px');
      expect(grid.style.getPropertyValue('--diablo-pitch')).toBe('54px');
      expect(getCanvasScale(container)).toBeCloseTo(2);
    });
  });

  it('centers the canvas tool island against the visible canvas viewport', async () => {
    const { container } = renderCanvas();
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    const toolIsland = screen.getByLabelText('Tryb pracy na canvasie');

    viewport.getBoundingClientRect = () => ({
      bottom: 700,
      height: 600,
      left: 320,
      right: 1120,
      top: 100,
      width: 800,
      x: 320,
      y: 100,
      toJSON: () => undefined,
    });

    fireEvent.resize(window);

    await waitFor(() => {
      expect(toolIsland).toHaveStyle('--diablo-tool-island-center-x: 720px');
    });
  });

  it('hides section toolbars when their canvas section is outside the visible viewport', async () => {
    const { container } = renderCanvas();
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const peoplePanel = screen.getByLabelText('Panel ludzi na canvasie');
    const projectPanel = screen.getByLabelText('Panel projektów na canvasie');

    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 500 });
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 2500 });
    viewport.getBoundingClientRect = () => getRect(0, 120, 500, 620);
    grid.getBoundingClientRect = () => getRect(0, 120, 1944, 1512);

    fireEvent.scroll(viewport);

    await waitFor(() => {
      expect(peoplePanel).not.toHaveClass('is-hidden');
      expect(projectPanel).toHaveClass('is-hidden');
    });

    grid.getBoundingClientRect = () => getRect(-1200, 120, 1944, 1512);
    fireEvent.scroll(viewport);

    await waitFor(() => {
      expect(peoplePanel).toHaveClass('is-hidden');
      expect(projectPanel).not.toHaveClass('is-hidden');
    });
  });

  it('keeps the project toolbar visible when the project zone is partially visible', async () => {
    const { container } = renderCanvas();
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const projectPanel = screen.getByLabelText('Panel projektów na canvasie') as HTMLElement;

    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 500 });
    viewport.getBoundingClientRect = () => getRect(0, 120, 500, 620);
    grid.getBoundingClientRect = () => getRect(-760, 120, 1944, 1512);
    projectPanel.getBoundingClientRect = () => getRect(0, 0, 900, 32);

    fireEvent.scroll(viewport);

    await waitFor(() => {
      expect(projectPanel).not.toHaveClass('is-hidden');
      expect(projectPanel).toHaveStyle('--diablo-project-control-panel-left-x: 8px');
    });
  });

  it('hides a section toolbar instead of letting canvas toolbars overlap', async () => {
    const { container } = renderCanvas();
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const peoplePanel = screen.getByLabelText('Panel ludzi na canvasie') as HTMLElement;
    const projectPanel = screen.getByLabelText('Panel projektów na canvasie') as HTMLElement;

    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 1600 });
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 2500 });
    viewport.getBoundingClientRect = () => getRect(0, 120, 1600, 620);
    grid.getBoundingClientRect = () => getRect(0, 120, 2500, 1512);
    peoplePanel.getBoundingClientRect = () => getRect(0, 0, 840, 32);
    projectPanel.getBoundingClientRect = () => getRect(0, 0, 540, 32);

    fireEvent.scroll(viewport);

    await waitFor(() => {
      expect(peoplePanel).toHaveClass('is-hidden');
      expect(projectPanel).not.toHaveClass('is-hidden');
    });
  });

  it('updates project toolbar visibility after transform panning brings the project zone into view', async () => {
    const { container } = renderCanvas({ canvasTool: 'move' });
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const projectPanel = screen.getByLabelText('Panel projektów na canvasie') as HTMLElement;

    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 500 });
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 620 });
    viewport.getBoundingClientRect = () => getRect(0, 120, 500, 620);
    grid.getBoundingClientRect = () => getRect(getCanvasPan(container).x, 120, 1944, 1512);
    projectPanel.getBoundingClientRect = () => getRect(0, 0, 900, 32);

    fireEvent.scroll(viewport);

    await waitFor(() => {
      expect(projectPanel).toHaveClass('is-hidden');
    });

    fireEvent.pointerDown(viewport, { button: 0, clientX: 500, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: -260, clientY: 300 });

    await waitFor(() => {
      expect(projectPanel).not.toHaveClass('is-hidden');
      expect(projectPanel).toHaveStyle('--diablo-project-control-panel-left-x: 8px');
    });
  });

  it('opens hidden projects from the canvas tool island', () => {
    const onOpenHiddenProjects = vi.fn();
    renderCanvas({ hiddenProjectCount: 2, onOpenHiddenProjects });

    const hiddenProjectsButton = screen.getByRole('button', { name: 'Pokaż ukryte projekty w miesiącu: 2' });
    expect(hiddenProjectsButton).toHaveTextContent('Ukryte');
    expect(hiddenProjectsButton).toHaveTextContent('2');

    fireEvent.click(hiddenProjectsButton);
    expect(onOpenHiddenProjects).toHaveBeenCalledTimes(1);
  });

  it('requires confirmation before clearing the active month from the canvas tool island', () => {
    const onClearMonthPlan = vi.fn();
    renderCanvas({
      activePeople: [person],
      onClearMonthPlan,
      periodAllocations: [benchAllocation],
    });

    const clearButton = screen.getByRole('button', { name: 'Wyczyść aktualny miesiąc' });
    expect(clearButton).toHaveTextContent('Wyczyść miesiąc');

    fireEvent.click(clearButton);
    expect(onClearMonthPlan).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Potwierdź wyczyszczenie aktualnego miesiąca' }))
      .toHaveTextContent('Potwierdź');

    fireEvent.click(screen.getByRole('button', { name: 'Potwierdź wyczyszczenie aktualnego miesiąca' }));
    expect(onClearMonthPlan).toHaveBeenCalledTimes(1);
  });

  it('disables month clearing when the canvas month is already empty', () => {
    renderCanvas({ projects: [] });

    expect(screen.getByRole('button', { name: 'Wyczyść aktualny miesiąc' })).toBeDisabled();
  });

  it('disables the hidden projects trigger when the month has no hidden projects', () => {
    renderCanvas({ hiddenProjectCount: 0 });

    expect(screen.getByRole('button', { name: 'Pokaż ukryte projekty w miesiącu: 0' })).toBeDisabled();
  });

  it('keeps growing the canvas when dragging a frame after fitting to content', () => {
    const onLayoutChange = vi.fn();
    const fittedLayout: DiabloBoardLayout = {
      ...layout,
      canvasSize: { columns: 36, rows: 28 },
      projects: {
        [project.id]: {
          ...layout.projects[project.id],
          x: 33,
          y: 4,
        },
      },
      panels: {
        people: { x: 2, y: 2 },
        legend: { x: 20, y: 2, collapsed: true },
      },
    };
    const { container } = renderCanvas({ canvasTool: 'move', layout: fittedLayout, onLayoutChange });
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const projectFrame = screen.getByLabelText(/Client 1 - Discovery/);
    viewport.getBoundingClientRect = () => ({
      bottom: 5000,
      height: 5000,
      left: 0,
      right: 5000,
      top: 0,
      width: 5000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    grid.getBoundingClientRect = () => ({
      bottom: 1512,
      height: 1512,
      left: 0,
      right: 1944,
      top: 0,
      width: 1944,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(projectFrame, { button: 0, clientX: 1733, clientY: 167 });
    fireEvent.pointerMove(window, { clientX: 2111, clientY: 167 });
    fireEvent.pointerUp(window, { clientX: 2111, clientY: 167 });

    const nextLayout = onLayoutChange.mock.calls[0][0] as DiabloBoardLayout;
    expect(nextLayout.canvasSize?.columns).toBeGreaterThan(fittedLayout.canvasSize?.columns || 0);
    expect(nextLayout.projects[project.id].x).toBe(40);
  });

  it('clears grab-panning on pointer cancel so frame dragging can resume', () => {
    const onLayoutChange = vi.fn();
    const { container } = renderCanvas({ canvasTool: 'move', onLayoutChange });
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const projectFrame = screen.getByLabelText(/Client 1 - Discovery/);
    grid.getBoundingClientRect = () => ({
      bottom: 1512,
      height: 1512,
      left: 0,
      right: 1944,
      top: 0,
      width: 1944,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(grid, { button: 0, clientX: 500, clientY: 300 });
    fireEvent.pointerCancel(window);
    fireEvent.pointerDown(projectFrame, { button: 0, clientX: 167, clientY: 221 });
    fireEvent.pointerMove(window, { clientX: 383, clientY: 221 });
    fireEvent.pointerUp(window, { clientX: 383, clientY: 221 });

    const nextLayout = onLayoutChange.mock.calls[0][0] as DiabloBoardLayout;
    expect(nextLayout.projects[project.id].x).toBeGreaterThan(layout.projects[project.id].x);
  });

  it('uses the native canvas viewport for horizontal scrolling instead of a page-fixed proxy', () => {
    const { container } = renderCanvas();
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 1000 });
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 2500 });
    viewport.getBoundingClientRect = () => ({
      bottom: window.innerHeight + 400,
      height: 620,
      left: 0,
      right: 1200,
      top: 120,
      width: 1200,
      x: 0,
      y: 120,
      toJSON: () => ({}),
    });

    fireEvent.scroll(viewport);
    viewport.scrollLeft = 1500;
    fireEvent.scroll(viewport);

    expect(viewport.scrollLeft).toBe(1500);
    expect(viewport).toHaveClass('has-horizontal-scroll');
    expect(container.querySelector('.diablo-canvas-horizontal-scroll')).not.toBeInTheDocument();
  });

  it('does not render a page-fixed horizontal scroller when the native canvas bottom is visible', () => {
    const { container } = renderCanvas();
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 1200 });
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 2500 });
    viewport.getBoundingClientRect = () => ({
      bottom: window.innerHeight - 24,
      height: 620,
      left: 0,
      right: 1200,
      top: 120,
      width: 1200,
      x: 0,
      y: 120,
      toJSON: () => ({}),
    });

    fireEvent.scroll(viewport);

    expect(container.querySelector('.diablo-canvas-horizontal-scroll')).not.toBeInTheDocument();
  });

  it('hides horizontal canvas scrolling when all canvas content is already visible', () => {
    const visibleContentLayout: DiabloBoardLayout = {
      ...layout,
      canvasSize: { columns: 84, rows: 56 },
      panels: {
        people: { x: 42, y: 34 },
        legend: { x: 7, y: 2, collapsed: true },
      },
      projects: {
        [project.id]: {
          ...layout.projects[project.id],
          x: projectZoneX,
          y: 4,
        },
      },
    };
    const { container } = renderCanvas({ layout: visibleContentLayout });
    const viewport = container.querySelector('.diablo-canvas-viewport') as HTMLElement;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 1200 });
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 2500 });
    viewport.getBoundingClientRect = () => ({
      bottom: window.innerHeight + 400,
      height: 620,
      left: 0,
      right: 1200,
      top: 120,
      width: 1200,
      x: 0,
      y: 120,
      toJSON: () => ({}),
    });

    fireEvent.scroll(viewport);

    expect(container.querySelector('.diablo-canvas-horizontal-scroll')).not.toBeInTheDocument();
    expect(viewport).toHaveClass('has-no-horizontal-scroll');
  });

  it('selects an existing project in create mode and exposes resize/archive actions', () => {
    const onArchiveProject = vi.fn();
    const onDeleteProject = vi.fn();
    const onProjectFrameResize = vi.fn();
    renderCanvas({ onArchiveProject, onDeleteProject, onProjectFrameResize });

    fireEvent.pointerDown(screen.getByLabelText(/Client 1 - Discovery/), { button: 0 });

    expect(screen.getByRole('button', { name: /Otwórz szczegóły projektu/ })).toHaveTextContent('Pokaż');
    expect(screen.getByRole('button', { name: 'Zwiększ szerokość ramki o jedną kolumnę' })).toHaveTextContent('S+');
    expect(screen.getByRole('button', { name: /Ukryj projekt w aktywnym miesiącu/ })).toHaveTextContent('Ukryj');
    expect(screen.getByRole('button', { name: /Usuń projekt i przenieś alokacje na ławkę/ })).toHaveTextContent('Usuń');

    fireEvent.click(screen.getByRole('button', { name: 'Zwiększ szerokość ramki o jedną kolumnę' }));
    expect(onProjectFrameResize).toHaveBeenCalledWith(project.id, expect.objectContaining({
      width: 5,
      height: 2,
    }));

    fireEvent.click(screen.getByRole('button', { name: /Ukryj projekt w aktywnym miesiącu/ }));
    expect(onArchiveProject).toHaveBeenCalledWith(project.id, period.id);

    fireEvent.click(screen.getByRole('button', { name: /Usuń projekt i przenieś alokacje na ławkę/ }));
    expect(onDeleteProject).toHaveBeenCalledWith(project.id);
  });

  it('keeps project editing available without blocking frame dragging in weekly grab mode', () => {
    const onEditProject = vi.fn();
    const onLayoutChange = vi.fn();
    const { container } = renderCanvas({
      allocationResetScope: 'week',
      canvasTool: 'move',
      onEditProject,
      onLayoutChange,
    });
    const grid = container.querySelector('.diablo-canvas-grid') as HTMLElement;
    const projectFrame = screen.getByLabelText(/Client 1 - Discovery/);
    grid.getBoundingClientRect = () => getRect(0, 0, 1944, 1512);
    const editButton = screen.getByRole('button', { name: 'Edit' });

    fireEvent.pointerDown(editButton, { button: 0, clientX: 185, clientY: 221 });
    fireEvent.pointerMove(window, { clientX: 383, clientY: 221 });
    fireEvent.pointerUp(window, { clientX: 383, clientY: 221 });
    fireEvent.click(editButton);

    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(onEditProject).toHaveBeenCalledWith(project.id);

    onEditProject.mockClear();
    fireEvent.pointerDown(projectFrame, { button: 0, clientX: 167, clientY: 221 });

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Otwórz szczegóły projektu/ })).not.toBeInTheDocument();

    fireEvent.pointerMove(window, { clientX: 383, clientY: 221 });
    fireEvent.pointerUp(window, { clientX: 383, clientY: 221 });

    expect(onEditProject).not.toHaveBeenCalled();
    expect(onLayoutChange).toHaveBeenCalled();
    const nextLayout = onLayoutChange.mock.calls.at(-1)?.[0] as DiabloBoardLayout;
    expect(nextLayout.projects[project.id].x).toBeGreaterThan(layout.projects[project.id].x);
  });
});
