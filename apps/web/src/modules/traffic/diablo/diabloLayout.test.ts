import { describe, expect, it, beforeEach } from 'vitest';
import type { Period, ProjectFrame, TileUnit } from '../models/traffic.model';
import {
  DIABLO_CANVAS_EDGE_GUTTER,
  DIABLO_CANVAS_GROWTH_BUFFER,
  DIABLO_CANVAS_MIN_START,
  DIABLO_FRAME_GAP,
  DIABLO_FLOATING_PANEL_COLUMNS,
  DIABLO_GRID_COLUMNS,
  DIABLO_GRID_ROWS,
  DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS,
  DIABLO_PEOPLE_SORT_START_ROW,
  DIABLO_PERSON_FRAME_HEADER_ROWS,
  DIABLO_PERSON_TILE_COLUMNS,
  DIABLO_PERSON_FRAME_WIDTH,
  DIABLO_PROJECT_PEOPLE_SORT_MAX_PEOPLE_PER_ROW,
  DIABLO_PROJECT_GRID_EMPTY_CELLS,
  DIABLO_PROJECT_SORT_START_ROW,
  arrangeDiabloPersonLayoutsInGrid,
  arrangeDiabloProjectPeopleLayouts,
  arrangeDiabloProjectLayoutsInGrid,
  areDiabloLayoutsEqual,
  areDiabloSharedProjectLayoutsEqual,
  clearDiabloLayout,
  clampCanvasStart,
  cloneDiabloLayout,
  cloneDiabloSharedProjectLayout,
  createDefaultPersonLayouts,
  createDefaultProjectLayouts,
  createEmptyDiabloLayout,
  createInitialDiabloLayout,
  createProjectDraftFromSelection,
  ensureDiabloProjectLayouts,
  fitDiabloCanvasLayoutToContent,
  getDiabloCanvasSize,
  getDiabloProjectZoneStart,
  getFrameCellCount,
  getFrameDimensionsForRevenue,
  getLayoutRevenueK,
  getPersonFrameDimensionsForTileCount,
  getSelectionRevenueK,
  growDiabloCanvasLayout,
  mergeDiabloSharedProjectLayout,
  normalizeSelection,
  parseDiabloLayout,
  readDiabloLayout,
  resolveDiabloLayoutSyncBase,
  snapFrameLayout,
  snapPersonFrameLayout,
  snapProjectFrameLayout,
  writeDiabloLayout,
} from './diabloLayout';

const money5k: TileUnit = {
  id: 'money-5k',
  kind: 'money',
  label: '5k PLN',
  value: 5,
  currency: 'PLN',
};

const period: Period = {
  id: '2026-06',
  label: 'June 2026',
  granularity: 'month',
  startsOn: '2026-06-01',
  endsOn: '2026-06-30',
};

const project: ProjectFrame = {
  id: 'project-a',
  name: 'Build',
  client: 'Client',
  contractType: 'time_materials_capped',
  stage: 'possible',
  planningStatus: 'ghost',
  workType: 'commercial',
  budgetK: 10,
  probability: 0.5,
  startMonth: 'June 2026',
  startPeriodId: '2026-06',
  endPeriodId: '2026-06',
  rateConfig: {
    projectRatePlnH: 220,
    companyTargetRatePlnH: 260,
    skillRatesPlnH: {},
  },
  requirements: [],
  preferredPersonIds: [],
  blockedPersonIds: [],
  revenuePlan: [{ periodId: '2026-06', revenueK: 10, probability: 0.5 }],
  invoices: [],
  notes: '',
};

function doLayoutsOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number }
) {
  return !(
    first.x + first.width - 1 < second.x ||
    second.x + second.width - 1 < first.x ||
    first.y + first.height - 1 < second.y ||
    second.y + second.height - 1 < first.y
  );
}

function doLayoutsHaveAtLeastOneCellGap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number }
) {
  const firstRight = first.x + first.width - 1;
  const secondRight = second.x + second.width - 1;
  const firstBottom = first.y + first.height - 1;
  const secondBottom = second.y + second.height - 1;

  return (
    firstRight + 1 < second.x ||
    secondRight + 1 < first.x ||
    firstBottom + 1 < second.y ||
    secondBottom + 1 < first.y
  );
}

describe('diabloLayout', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('converts revenue to square cells using the visible money unit', () => {
    expect(getFrameCellCount(30)).toBe(30);
    expect(getFrameCellCount(30, money5k)).toBe(6);
    expect(getFrameDimensionsForRevenue(28)).toEqual({ width: 7, height: 4 });
    expect(getFrameDimensionsForRevenue(30)).toEqual({ width: 6, height: 5 });
    expect(getPersonFrameDimensionsForTileCount(18)).toEqual({
      width: DIABLO_PERSON_FRAME_WIDTH,
      height: DIABLO_PERSON_FRAME_HEADER_ROWS + 4,
    });
    expect(getPersonFrameDimensionsForTileCount(10)).toEqual({
      width: DIABLO_PERSON_FRAME_WIDTH,
      height: DIABLO_PERSON_FRAME_HEADER_ROWS + 2,
    });
    expect(getPersonFrameDimensionsForTileCount(0)).toEqual({
      width: DIABLO_PERSON_FRAME_WIDTH,
      height: DIABLO_PERSON_FRAME_HEADER_ROWS,
    });
    expect(DIABLO_PERSON_FRAME_WIDTH).toBe(DIABLO_PERSON_TILE_COLUMNS);
    expect(getLayoutRevenueK({ width: 5, height: 6 })).toBe(30);
    expect(getLayoutRevenueK({ width: 5, height: 6 }, money5k)).toBe(150);
  });

  it('normalizes selected grid area and converts it to planned revenue', () => {
    const selection = normalizeSelection({ x: 7, y: 8 }, { x: 3, y: 4 });

    expect(selection).toEqual({ x: 3, y: 4, width: 5, height: 5 });
    expect(getSelectionRevenueK(selection)).toBe(25);
    expect(getSelectionRevenueK(selection, money5k)).toBe(125);
  });

  it('snaps frames inside the finite v1 canvas', () => {
    expect(snapFrameLayout({
      projectId: 'x',
      x: -2,
      y: 40,
      width: 2,
      height: 1,
    })).toMatchObject({
      x: 1,
      y: DIABLO_GRID_ROWS,
      width: 2,
      height: 1,
    });

    expect(snapFrameLayout({
      projectId: 'x',
      x: DIABLO_GRID_COLUMNS,
      y: DIABLO_GRID_ROWS,
      width: 3,
      height: 4,
    })).toMatchObject({
      x: DIABLO_GRID_COLUMNS - 3 + 1,
      y: DIABLO_GRID_ROWS - 4 + 1,
    });
  });

  it('keeps default and reset canvas objects one square away from canvas edges', () => {
    const empty = createEmptyDiabloLayout('room', '2026-06');
    const defaults = createDefaultProjectLayouts([{ id: 'a', revenueK: 30 }]);
    const projectStart = getDiabloProjectZoneStart(DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS);

    expect(empty.panels.people).toMatchObject({ x: DIABLO_CANVAS_MIN_START, y: DIABLO_CANVAS_MIN_START });
    expect(empty.panels.legend.y).toBe(DIABLO_CANVAS_MIN_START);
    expect(empty.peopleZoneColumns).toBe(DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS);
    expect(defaults.a.x).toBe(projectStart + DIABLO_CANVAS_EDGE_GUTTER);
    expect(clampCanvasStart(1, 8, DIABLO_GRID_COLUMNS, DIABLO_CANVAS_EDGE_GUTTER)).toBe(DIABLO_CANVAS_MIN_START);
    expect(clampCanvasStart(DIABLO_GRID_COLUMNS, 8, DIABLO_GRID_COLUMNS, DIABLO_CANVAS_EDGE_GUTTER)).toBe(28);
    expect(snapFrameLayout({
      projectId: 'default-edge',
      x: 1,
      y: DIABLO_GRID_ROWS,
      width: 3,
      height: 4,
    }, DIABLO_CANVAS_EDGE_GUTTER)).toMatchObject({
      x: DIABLO_CANVAS_MIN_START,
      y: DIABLO_GRID_ROWS - 4,
    });
    expect(snapProjectFrameLayout({
      projectId: 'project-zone',
      x: 1,
      y: 1,
      width: 3,
      height: 4,
    }, empty, DIABLO_CANVAS_EDGE_GUTTER)).toMatchObject({
      x: projectStart + DIABLO_CANVAS_EDGE_GUTTER,
      y: DIABLO_CANVAS_MIN_START,
    });
  });

  it('creates default person layouts inside the initial people zone', () => {
    const defaults = createDefaultPersonLayouts([
      { id: 'person-a', tileCount: 18 },
      { id: 'person-b', tileCount: 10 },
    ]);

    expect(defaults['person-a'].x).toBeGreaterThanOrEqual(DIABLO_CANVAS_MIN_START);
    expect(defaults['person-a'].x + defaults['person-a'].width - 1).toBeLessThanOrEqual(
      DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS - DIABLO_CANVAS_EDGE_GUTTER
    );
    expect(defaults['person-a']).toMatchObject({
      width: DIABLO_PERSON_FRAME_WIDTH,
      height: DIABLO_PERSON_FRAME_HEADER_ROWS + 4,
    });
    expect(defaults['person-b']).toMatchObject({
      width: DIABLO_PERSON_FRAME_WIDTH,
      height: DIABLO_PERSON_FRAME_HEADER_ROWS + 2,
    });
    expect(snapPersonFrameLayout({
      personId: 'person-c',
      x: getDiabloProjectZoneStart(DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS) + 4,
      y: 3,
      width: 4,
      height: 3,
    }, createEmptyDiabloLayout('room', '2026-06'))).toMatchObject({
      x: DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS - DIABLO_PERSON_FRAME_WIDTH + 1,
      y: 3,
      width: DIABLO_PERSON_FRAME_WIDTH,
      height: DIABLO_PERSON_FRAME_HEADER_ROWS,
    });
  });

  it('allows manually moved and persisted canvas objects to sit on canvas edges', () => {
    expect(clampCanvasStart(1, 8, DIABLO_GRID_COLUMNS)).toBe(1);
    expect(clampCanvasStart(DIABLO_GRID_COLUMNS, 8, DIABLO_GRID_COLUMNS)).toBe(29);
    expect(snapFrameLayout({
      projectId: 'edge',
      x: 1,
      y: 1,
      width: 8,
      height: 7,
    })).toMatchObject({ x: 1, y: 1 });
  });

  it('allows manually moved canvas objects beyond the starter grid when the canvas has grown', () => {
    expect(snapFrameLayout({
      projectId: 'far-right',
      x: DIABLO_GRID_COLUMNS + 8,
      y: 6,
      width: 4,
      height: 3,
    }, 0, { columns: DIABLO_GRID_COLUMNS + 20, rows: DIABLO_GRID_ROWS })).toMatchObject({
      x: DIABLO_GRID_COLUMNS + 8,
      y: 6,
    });
  });

  it('grows the logical canvas from the farthest project frame or floating legend panel', () => {
    const layout = createEmptyDiabloLayout('room', '2026-06');
    layout.projects.a = {
      projectId: 'a',
      x: DIABLO_GRID_COLUMNS + 3,
      y: DIABLO_GRID_ROWS + 2,
      width: 4,
      height: 3,
    };
    layout.panels.legend = {
      x: DIABLO_GRID_COLUMNS + 10,
      y: 4,
    };

    expect(getDiabloCanvasSize(layout)).toEqual({
      columns: DIABLO_GRID_COLUMNS + 10 + DIABLO_FLOATING_PANEL_COLUMNS - 1 + DIABLO_CANVAS_GROWTH_BUFFER,
      rows: DIABLO_GRID_ROWS + 2 + 3 - 1 + DIABLO_CANVAS_GROWTH_BUFFER,
    });
  });

  it('can grow the canvas to the left and top while preserving existing canvas object positions', () => {
    const layout = createEmptyDiabloLayout('room', '2026-06');
    layout.projects.a = { projectId: 'a', x: 4, y: 5, width: 6, height: 3 };
    layout.panels.people = { x: 2, y: 2 };
    layout.panels.legend = { x: 10, y: 3 };

    const next = growDiabloCanvasLayout(layout, { left: 3, top: 2 });

    expect(next.canvasSize).toEqual({ columns: DIABLO_GRID_COLUMNS + 3, rows: DIABLO_GRID_ROWS + 2 });
    expect(next.projects.a).toMatchObject({ x: 7, y: 7, width: 6, height: 3 });
    expect(next.panels.people).toMatchObject({ x: 2, y: 2 });
    expect(next.panels.legend).toMatchObject({ x: 13, y: 5 });
  });

  it('fits an expanded canvas to all content with one square of internal margin', () => {
    const layout = createEmptyDiabloLayout('room', '2026-06');
    layout.canvasSize = { columns: 90, rows: 70 };
    layout.projects.a = { projectId: 'a', x: 20, y: 12, width: 4, height: 3 };
    layout.panels.people = { x: 45, y: 30 };
    layout.panels.legend = { x: 50, y: 12, collapsed: true };

    const next = fitDiabloCanvasLayoutToContent(layout);

    expect(next.canvasSize).toEqual({ columns: 52, rows: 28 });
    expect(next.projects.a).toMatchObject({ x: 17, y: 2, width: 4, height: 3 });
    expect(next.panels.people).toMatchObject({ x: 45, y: 30 });
    expect(next.panels.legend).toMatchObject({ x: 47, y: 2, collapsed: true });
    expect(getDiabloCanvasSize(next)).toEqual(next.canvasSize);
  });

  it('arranges person frames into the configured grid when fitting an expanded people zone', () => {
    const layout = createEmptyDiabloLayout('room', '2026-06');
    layout.canvasSize = { columns: 90, rows: 80 };
    layout.peopleZoneColumns = 18;
    layout.people = {
      anna: { personId: 'anna', x: 2, y: 18, width: 5, height: 8 },
      bartek: { personId: 'bartek', x: 10, y: 18, width: 5, height: 6 },
      celina: { personId: 'celina', x: 4, y: 34, width: 5, height: 7 },
    };
    layout.projects.a = { projectId: 'a', x: 30, y: 12, width: 4, height: 3 };
    layout.panels.legend = { x: 56, y: 12, collapsed: true };

    const next = fitDiabloCanvasLayoutToContent(layout);
    const people = next.people || {};

    expect(next.peopleZoneColumns).toBe(35);
    expect(people.anna).toMatchObject({ x: 16, y: DIABLO_CANVAS_MIN_START, width: DIABLO_PERSON_FRAME_WIDTH, height: 8 });
    expect(people.bartek).toMatchObject({
      x: 23,
      y: DIABLO_CANVAS_MIN_START,
      width: DIABLO_PERSON_FRAME_WIDTH,
      height: 6,
    });
    expect(people.celina).toMatchObject({
      x: 30,
      y: DIABLO_CANVAS_MIN_START,
      width: DIABLO_PERSON_FRAME_WIDTH,
      height: 7,
    });
    expect(Object.values(people).every((personLayout) => personLayout.x + personLayout.width - 1 <= 35)).toBe(true);
    expect(doLayoutsOverlap(people.anna, people.bartek)).toBe(false);
    expect(doLayoutsOverlap(people.bartek, people.celina)).toBe(false);
    expect(next.projects.a.x).toBe(getDiabloProjectZoneStart(next) + DIABLO_CANVAS_EDGE_GUTTER);
    expect(getDiabloCanvasSize(next)).toEqual(next.canvasSize);
  });

  it('arranges person frames into a visible five-column grid and grows the people zone when needed', () => {
    const layout = createEmptyDiabloLayout('room', '2026-06');
    layout.people = {
      anna: { personId: 'anna', x: 2, y: 20, width: DIABLO_PERSON_FRAME_WIDTH, height: 5 },
      bartek: { personId: 'bartek', x: 8, y: 12, width: DIABLO_PERSON_FRAME_WIDTH, height: 6 },
      celina: { personId: 'celina', x: 2, y: 34, width: DIABLO_PERSON_FRAME_WIDTH, height: 7 },
      tomasz: { personId: 'tomasz', x: 9, y: 8, width: DIABLO_PERSON_FRAME_WIDTH, height: 8 },
      zofia: { personId: 'zofia', x: 12, y: 26, width: DIABLO_PERSON_FRAME_WIDTH, height: 5 },
    };
    layout.projects.a = { projectId: 'a', x: getDiabloProjectZoneStart() + DIABLO_CANVAS_EDGE_GUTTER, y: 6, width: 4, height: 3 };
    layout.panels.legend = { x: 28, y: 6, collapsed: true };

    const next = arrangeDiabloPersonLayoutsInGrid(layout, ['bartek', 'tomasz', 'anna', 'celina', 'zofia']);
    const people = next.people || {};

    expect(next.peopleZoneColumns).toBe(35);
    expect(people.bartek).toMatchObject({ x: DIABLO_CANVAS_MIN_START, y: DIABLO_PEOPLE_SORT_START_ROW, width: DIABLO_PERSON_FRAME_WIDTH, height: 6 });
    expect(people.tomasz).toMatchObject({ x: 9, y: DIABLO_PEOPLE_SORT_START_ROW, width: DIABLO_PERSON_FRAME_WIDTH, height: 8 });
    expect(people.anna).toMatchObject({ x: 16, y: DIABLO_PEOPLE_SORT_START_ROW, width: DIABLO_PERSON_FRAME_WIDTH, height: 5 });
    expect(people.celina).toMatchObject({ x: 23, y: DIABLO_PEOPLE_SORT_START_ROW, width: DIABLO_PERSON_FRAME_WIDTH, height: 7 });
    expect(people.zofia).toMatchObject({ x: 30, y: DIABLO_PEOPLE_SORT_START_ROW, width: DIABLO_PERSON_FRAME_WIDTH, height: 5 });
    expect(Object.values(people).every((personLayout) => personLayout.x + personLayout.width - 1 <= 35)).toBe(true);
    expect(doLayoutsOverlap(people.bartek, people.tomasz)).toBe(false);
    expect(doLayoutsOverlap(people.tomasz, people.anna)).toBe(false);
    expect(doLayoutsOverlap(people.bartek, people.celina)).toBe(false);
    expect(doLayoutsOverlap(people.celina, people.zofia)).toBe(false);
    expect(next.projects.a.x).toBe(layout.projects.a.x + 20);
    expect(next.panels.legend.x).toBe(48);
    expect(getDiabloCanvasSize(next)).toEqual(next.canvasSize);
  });

  it('arranges project frames into five columns with one empty cell between frames', () => {
    const layout = createEmptyDiabloLayout('room', '2026-06');
    layout.projects = {
      a: { projectId: 'a', x: 30, y: 18, width: 4, height: 3 },
      b: { projectId: 'b', x: 35, y: 18, width: 3, height: 4 },
      c: { projectId: 'c', x: 40, y: 18, width: 5, height: 2 },
      d: { projectId: 'd', x: 45, y: 18, width: 2, height: 5 },
      e: { projectId: 'e', x: 50, y: 18, width: 4, height: 3 },
      f: { projectId: 'f', x: 55, y: 18, width: 3, height: 3 },
    };

    const next = arrangeDiabloProjectLayoutsInGrid(layout, ['a', 'b', 'c', 'd', 'e', 'f']);
    const startX = getDiabloProjectZoneStart(layout) + DIABLO_CANVAS_EDGE_GUTTER;

    expect(next.projects.a).toMatchObject({ x: startX, y: DIABLO_PROJECT_SORT_START_ROW, width: 4, height: 3 });
    expect(next.projects.b.x - (next.projects.a.x + next.projects.a.width)).toBe(DIABLO_PROJECT_GRID_EMPTY_CELLS);
    expect(next.projects.c.x - (next.projects.b.x + next.projects.b.width)).toBe(DIABLO_PROJECT_GRID_EMPTY_CELLS);
    expect(next.projects.d.x - (next.projects.c.x + next.projects.c.width)).toBe(DIABLO_PROJECT_GRID_EMPTY_CELLS);
    expect(next.projects.e.x - (next.projects.d.x + next.projects.d.width)).toBe(DIABLO_PROJECT_GRID_EMPTY_CELLS);
    expect(next.projects.f).toMatchObject({
      x: startX,
      y: DIABLO_PROJECT_SORT_START_ROW + next.projects.d.height + DIABLO_PROJECT_GRID_EMPTY_CELLS,
      width: 3,
      height: 3,
    });
    expect(getDiabloCanvasSize(next)).toEqual(next.canvasSize);
  });

  it('arranges project rows against assigned people and moves time off projects to the bottom', () => {
    const layout = createEmptyDiabloLayout('room', '2026-06');
    layout.projects = {
      main: { projectId: 'main', x: 24, y: 12, width: 4, height: 3 },
      support: { projectId: 'support', x: 30, y: 12, width: 3, height: 2 },
      vacation: { projectId: 'vacation', x: 34, y: 12, width: 2, height: 2 },
    };
    layout.people = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [
        `p${index + 1}`,
        {
          personId: `p${index + 1}`,
          x: 2,
          y: 4 + index,
          width: DIABLO_PERSON_FRAME_WIDTH,
          height: DIABLO_PERSON_FRAME_HEADER_ROWS + 1,
        },
      ])
    );

    const next = arrangeDiabloProjectPeopleLayouts(
      layout,
      [
        { id: 'main', workType: 'commercial' },
        { id: 'support', workType: 'commercial' },
        { id: 'vacation', workType: 'time_off' },
      ],
      Array.from({ length: 10 }, (_, index) => ({ id: `p${index + 1}` })),
      [
        { personId: 'p1', target: 'main' },
        { personId: 'p1', target: 'main' },
        { personId: 'p1', target: 'main' },
        { personId: 'p2', target: 'main' },
        { personId: 'p2', target: 'vacation' },
        { personId: 'p2', target: 'vacation' },
        { personId: 'p3', target: 'main' },
        { personId: 'p4', target: 'main' },
        { personId: 'p5', target: 'main' },
        { personId: 'p6', target: 'main' },
        { personId: 'p6', target: 'support' },
        { personId: 'p6', target: 'support' },
        { personId: 'p7', target: 'support' },
        { personId: 'p8', target: 'main' },
        { personId: 'p10', target: 'vacation' },
      ]
    );
    const people = next.people || {};
    const projectStartX = getDiabloProjectZoneStart(next) + DIABLO_CANVAS_EDGE_GUTTER;
    const secondMainPeopleRowY = DIABLO_PROJECT_SORT_START_ROW + DIABLO_PERSON_FRAME_HEADER_ROWS + 1 + DIABLO_FRAME_GAP;
    const supportRowY = secondMainPeopleRowY + DIABLO_PERSON_FRAME_HEADER_ROWS + 1 + DIABLO_FRAME_GAP;
    const unassignedRowY = supportRowY + DIABLO_PERSON_FRAME_HEADER_ROWS + 1 + DIABLO_FRAME_GAP;

    expect(next.peopleZoneColumns).toBe(35);
    expect(next.projects.main).toMatchObject({ x: projectStartX, y: DIABLO_PROJECT_SORT_START_ROW });
    expect(next.projects.support).toMatchObject({ x: projectStartX, y: supportRowY });
    expect(next.projects.vacation).toMatchObject({
      x: projectStartX,
      y: unassignedRowY + DIABLO_PERSON_FRAME_HEADER_ROWS + 1 + DIABLO_FRAME_GAP,
    });
    expect(people.p1).toMatchObject({ x: 2, y: DIABLO_PROJECT_SORT_START_ROW });
    expect(people.p5).toMatchObject({ x: 30, y: DIABLO_PROJECT_SORT_START_ROW });
    expect(people.p8).toMatchObject({ x: 30, y: secondMainPeopleRowY });
    expect(people.p6).toMatchObject({ x: 23, y: supportRowY });
    expect(people.p7).toMatchObject({ x: 30, y: supportRowY });
    expect(people.p9).toMatchObject({ x: 23, y: unassignedRowY });
    expect(people.p10).toMatchObject({ x: 30, y: unassignedRowY });
    expect(people.p6.y).toBe(next.projects.support.y);
    expect(people.p2.y).toBe(next.projects.main.y);
    expect(people.p2.y).not.toBe(next.projects.vacation.y);
    expect(Object.values(people).every((personLayout) => personLayout.x + personLayout.width - 1 <= 35)).toBe(true);
    const personLayouts = Object.values(people);
    personLayouts.forEach((personLayout, index) => {
      personLayouts.slice(index + 1).forEach((otherPersonLayout) => {
        expect(doLayoutsHaveAtLeastOneCellGap(personLayout, otherPersonLayout)).toBe(true);
      });
    });
    expect(getDiabloCanvasSize(next)).toEqual(next.canvasSize);
    expect(DIABLO_PROJECT_PEOPLE_SORT_MAX_PEOPLE_PER_ROW).toBe(5);
  });

  it('creates deterministic default layouts and preserves existing positions', () => {
    const base = createEmptyDiabloLayout('room', '2026-06');
    const ensured = ensureDiabloProjectLayouts(base, [
      { id: 'a', revenueK: 30 },
      { id: 'b', revenueK: 8 },
    ]);
    const moved = {
      ...ensured,
      projects: {
        ...ensured.projects,
        a: { ...ensured.projects.a, x: 1, y: 1 },
      },
    };

    const next = ensureDiabloProjectLayouts(moved, [
      { id: 'a', revenueK: 30 },
      { id: 'c', revenueK: 12 },
    ]);

    expect(next.projects.a.x).toBe(getDiabloProjectZoneStart());
    expect(next.projects.a.y).toBe(1);
    expect(next.projects.b).toBeUndefined();
    expect(next.projects.c).toBeDefined();
    expect(createDefaultProjectLayouts([{ id: 'a', revenueK: 30 }]).a.y).toBe(9);
    expect(createDefaultProjectLayouts([{ id: 'a', revenueK: 30 }]).a.x).toBe(getDiabloProjectZoneStart() + DIABLO_CANVAS_EDGE_GUTTER);
  });

  it('preserves a manually resized frame shape when its area matches project revenue', () => {
    const base = createEmptyDiabloLayout('room', '2026-06');
    base.projects.a = { projectId: 'a', x: 4, y: 5, width: 10, height: 3 };

    const next = ensureDiabloProjectLayouts(base, [{ id: 'a', revenueK: 30 }]);

    expect(next.projects.a).toMatchObject({ x: getDiabloProjectZoneStart(), y: 5, width: 10, height: 3 });
  });

  it('preserves project layouts that were saved beyond the starter canvas width', () => {
    const base = createEmptyDiabloLayout('room', '2026-06');
    base.projects.a = {
      projectId: 'a',
      x: DIABLO_GRID_COLUMNS + 8,
      y: 5,
      width: 10,
      height: 3,
    };

    const next = ensureDiabloProjectLayouts(base, [{ id: 'a', revenueK: 30 }]);

    expect(next.projects.a).toMatchObject({ x: DIABLO_GRID_COLUMNS + 8, y: 5, width: 10, height: 3 });
  });

  it('persists and clears local board layout', () => {
    const layout = createEmptyDiabloLayout('room', '2026-06');
    layout.projects.a = { projectId: 'a', x: 3, y: 4, width: 5, height: 6 };

    writeDiabloLayout(layout);
    expect(readDiabloLayout('room', '2026-06')?.projects.a).toEqual(layout.projects.a);

    clearDiabloLayout('room', '2026-06');
    expect(readDiabloLayout('room', '2026-06')).toBeNull();
  });

  it('parses shared layout data only for the matching board and month', () => {
    const layout = createEmptyDiabloLayout('room', '2026-06');
    layout.canvasSize = { columns: 60, rows: 42 };
    layout.projects.a = { projectId: 'a', x: 3, y: 4, width: 5, height: 6 };
    layout.panels.legend = { x: 12, y: 6, collapsed: true };

    expect(parseDiabloLayout(JSON.stringify(layout), 'room', '2026-06')).toEqual(layout);
    expect(parseDiabloLayout({ ...layout, roomName: 'other-room' }, 'room', '2026-06')).toBeNull();
    expect(parseDiabloLayout({ ...layout, periodId: '2026-07' }, 'room', '2026-06')).toBeNull();
    expect(parseDiabloLayout({ ...layout, version: 1 }, 'room', '2026-06')).toBeNull();
  });

  it('normalizes corrupted far-off people-zone layouts back to visible canvas zones', () => {
    const corruptedLayout = {
      ...createEmptyDiabloLayout('room', '2026-06'),
      peopleZoneColumns: 781,
      canvasSize: { columns: 820, rows: 42 },
      people: {
        tomasz: { personId: 'tomasz', x: 748, y: 4, width: DIABLO_PERSON_FRAME_WIDTH, height: 8 },
        julia: { personId: 'julia', x: 758, y: 4, width: DIABLO_PERSON_FRAME_WIDTH, height: 7 },
      },
      projects: {
        a: { projectId: 'a', x: 790, y: 4, width: 5, height: 4 },
      },
      panels: {
        people: { x: 2, y: 2 },
        legend: { x: 805, y: 8, collapsed: true },
      },
    };

    const parsed = parseDiabloLayout(corruptedLayout, 'room', '2026-06');

    if (!parsed) throw new Error('Expected corrupted layout to parse');
    const juliaLayout = parsed.people?.julia;
    if (!juliaLayout) throw new Error('Expected normalized Julia layout');

    expect(parsed.peopleZoneColumns).toBe(35);
    expect(juliaLayout.x + juliaLayout.width - 1).toBe(34);
    expect(parsed.projects.a.x).toBeGreaterThanOrEqual(getDiabloProjectZoneStart(35));
    expect(parsed.canvasSize?.columns).toBeLessThan(120);
  });

  it('shrinks corrupted people-zone layouts that already have visible content', () => {
    const corruptedLayout = {
      ...createEmptyDiabloLayout('room', '2026-06'),
      peopleZoneColumns: 781,
      canvasSize: { columns: 820, rows: 42 },
      people: {
        tomasz: { personId: 'tomasz', x: 2, y: 4, width: DIABLO_PERSON_FRAME_WIDTH, height: 8 },
      },
      projects: {
        a: { projectId: 'a', x: 40, y: 4, width: 5, height: 4 },
      },
      panels: {
        people: { x: 2, y: 2 },
        legend: { x: 50, y: 8, collapsed: true },
      },
    };

    const parsed = parseDiabloLayout(corruptedLayout, 'room', '2026-06');

    if (!parsed) throw new Error('Expected corrupted layout to parse');
    expect(parsed.peopleZoneColumns).toBe(35);
    expect(parsed.people?.tomasz.x).toBe(2);
    expect(parsed.projects.a.x).toBe(40);
    expect(parsed.canvasSize?.columns).toBeLessThan(120);
  });

  it('ignores incomplete shared project layouts instead of guessing canvas positions', () => {
    const layout = {
      ...createEmptyDiabloLayout('room', '2026-06'),
      projects: {
        a: { projectId: 'a', x: 3, y: 4, width: 5 },
      },
      panels: {
        people: {},
        legend: { collapsed: true },
      },
    };

    expect(parseDiabloLayout(layout, 'room', '2026-06')).toMatchObject({
      projects: {},
      panels: {
        people: { x: DIABLO_CANVAS_MIN_START, y: DIABLO_CANVAS_MIN_START },
        legend: { x: 27, y: DIABLO_CANVAS_MIN_START, collapsed: true },
      },
    });
  });

  it('compares and clones layouts independently of project insertion order', () => {
    const first = createEmptyDiabloLayout('room', '2026-06');
    first.projects.b = { projectId: 'b', x: 8, y: 4, width: 2, height: 2 };
    first.projects.a = { projectId: 'a', x: 3, y: 4, width: 5, height: 6 };
    const second = {
      ...first,
      projects: {
        a: { ...first.projects.a },
        b: { ...first.projects.b },
      },
    };

    expect(areDiabloLayoutsEqual(first, second)).toBe(true);

    const cloned = cloneDiabloLayout(first);
    cloned.projects.a.x += 1;

    expect(cloned.projects.a.x).not.toBe(first.projects.a.x);
    expect(areDiabloLayoutsEqual(first, cloned)).toBe(false);
  });

  it('keeps local floating panels when shared project layout is applied', () => {
    const shared = createEmptyDiabloLayout('room', '2026-06');
    shared.canvasSize = { columns: 58, rows: 40 };
    shared.projects.a = { projectId: 'a', x: 20, y: 9, width: 5, height: 6 };
    shared.panels.legend = { x: 27, y: 2 };

    const local = createEmptyDiabloLayout('room', '2026-06');
    local.projects.a = { projectId: 'a', x: 3, y: 4, width: 5, height: 6 };
    local.panels.legend = { x: 6, y: 18, collapsed: true };

    const merged = mergeDiabloSharedProjectLayout(shared, local);

    expect(merged.canvasSize).toEqual(shared.canvasSize);
    expect(merged.projects.a).toEqual(shared.projects.a);
    expect(merged.panels.legend).toEqual(local.panels.legend);
  });

  it('keeps a pending local layout from being overwritten by stale shared layout', () => {
    const shared = createEmptyDiabloLayout('room', '2026-07');
    shared.projects.a = { projectId: 'a', x: 22, y: 12, width: 2, height: 3 };
    shared.people = {
      p1: { personId: 'p1', x: 2, y: 15, width: 5, height: 4 },
    };

    const local = createEmptyDiabloLayout('room', '2026-07');
    local.projects.a = { projectId: 'a', x: 16, y: 4, width: 5, height: 6 };
    local.people = {
      p1: { personId: 'p1', x: 3, y: 4, width: 5, height: 8 },
    };
    local.peopleZoneColumns = 24;

    const resolved = resolveDiabloLayoutSyncBase(shared, local, true);

    expect(resolved.projects.a).toEqual(local.projects.a);
    expect(resolved.people?.p1).toEqual(local.people?.p1);
    expect(resolved.peopleZoneColumns).toBe(24);
  });

  it('uses shared layout when there is no pending local layout', () => {
    const shared = createEmptyDiabloLayout('room', '2026-07');
    shared.projects.a = { projectId: 'a', x: 22, y: 12, width: 2, height: 3 };
    shared.panels.legend = { x: 27, y: 2 };

    const local = createEmptyDiabloLayout('room', '2026-07');
    local.projects.a = { projectId: 'a', x: 16, y: 4, width: 5, height: 6 };
    local.panels.legend = { x: 6, y: 18, collapsed: true };

    const resolved = resolveDiabloLayoutSyncBase(shared, local);

    expect(resolved.projects.a).toEqual(shared.projects.a);
    expect(resolved.panels.legend).toEqual(local.panels.legend);
  });

  it('compares shared project layout without treating local legend changes as shared changes', () => {
    const first = createEmptyDiabloLayout('room', '2026-06');
    first.projects.a = { projectId: 'a', x: 3, y: 4, width: 5, height: 6 };
    first.panels.legend = { x: 20, y: 6 };

    const second = cloneDiabloLayout(first);
    second.panels.legend = { x: 4, y: 15, collapsed: true };

    expect(areDiabloLayoutsEqual(first, second)).toBe(false);
    expect(areDiabloSharedProjectLayoutsEqual(first, second)).toBe(true);

    second.projects.a.x += 1;

    expect(areDiabloSharedProjectLayoutsEqual(first, second)).toBe(false);
  });

  it('strips personal legend placement before publishing shared project layout', () => {
    const layout = createEmptyDiabloLayout('room', '2026-06');
    layout.projects.a = { projectId: 'a', x: 3, y: 4, width: 5, height: 6 };
    layout.panels.legend = { x: 4, y: 15, collapsed: true };

    const shared = cloneDiabloSharedProjectLayout(layout);

    expect(shared.projects.a).toEqual(layout.projects.a);
    expect(shared.panels.legend).toEqual({ x: 27, y: DIABLO_CANVAS_MIN_START });
  });

  it('uses the persisted month layout as the initial canvas state', () => {
    const layout = createEmptyDiabloLayout('room', '2026-06');
    layout.projects.a = { projectId: 'a', x: 12, y: 11, width: 5, height: 6 };
    layout.panels.people = { x: 4, y: 5 };
    layout.panels.legend = { x: 20, y: 6, collapsed: true };

    writeDiabloLayout(layout);

    expect(createInitialDiabloLayout('room', '2026-06')).toMatchObject({
      projects: {
        a: { projectId: 'a', x: 12, y: 11, width: 5, height: 6 },
      },
      panels: {
        people: { x: 4, y: 5 },
        legend: { x: 20, y: 6, collapsed: true },
      },
    });
  });

  it('creates a project draft from selected square revenue', () => {
    const draft = createProjectDraftFromSelection({ x: 1, y: 1, width: 6, height: 5 }, period, project);

    expect(draft.budgetK).toBe(30);
    expect(draft.revenuePlan.find((entry) => entry.periodId === period.id)?.revenueK).toBe(30);
    expect(draft.startPeriodId).toBe(period.id);
  });
});
