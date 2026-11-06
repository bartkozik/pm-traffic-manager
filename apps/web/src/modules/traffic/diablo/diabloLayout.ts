import type { ContractType, Period, PersonTileAllocation, ProjectFrame, TileUnit } from '../models/traffic.model';
import { getProjectMonthRevenueKWithWeeklyPlan } from '../models/traffic.model';

export const DIABLO_LAYOUT_VERSION = 3;
export const DIABLO_GRID_COLUMNS = 36;
export const DIABLO_GRID_ROWS = 28;
export const DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS = 15;
export const DIABLO_PROJECT_ZONE_DEFAULT_COLUMNS = DIABLO_GRID_COLUMNS - DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS;
export const DIABLO_MIN_FRAME_WIDTH = 1;
export const DIABLO_MIN_FRAME_HEIGHT = 1;
export const DIABLO_MAX_FRAME_WIDTH = 14;
export const DIABLO_MAX_PERSON_FRAME_WIDTH = DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS - 3;
export const DIABLO_PERSON_TILE_COLUMNS = 5;
export const DIABLO_PERSON_FRAME_WIDTH = DIABLO_PERSON_TILE_COLUMNS;
export const DIABLO_PERSON_FRAME_HEADER_ROWS = 4;
export const DIABLO_PERSON_GRID_MAX_COLUMNS = 5;
export const DIABLO_PROJECT_GRID_MAX_COLUMNS = 5;
export const DIABLO_PROJECT_PEOPLE_SORT_MAX_PEOPLE_PER_ROW = 5;
export const DIABLO_PROJECT_GRID_EMPTY_CELLS = 1;
export const DIABLO_FRAME_GAP = 2;
export const DIABLO_CANVAS_EDGE_GUTTER = 1;
export const DIABLO_CANVAS_MIN_START = 1 + DIABLO_CANVAS_EDGE_GUTTER;
export const DIABLO_PEOPLE_SORT_TOP_GUTTER_ROWS = 3;
export const DIABLO_PEOPLE_SORT_START_ROW = 1 + DIABLO_PEOPLE_SORT_TOP_GUTTER_ROWS;
export const DIABLO_PROJECT_SORT_TOP_GUTTER_ROWS = 3;
export const DIABLO_PROJECT_SORT_START_ROW = 1 + DIABLO_PROJECT_SORT_TOP_GUTTER_ROWS;
export const DIABLO_CANVAS_GROWTH_BUFFER = 6;
const DIABLO_CORRUPT_PEOPLE_ZONE_COLUMNS = 120;
export const DIABLO_FLOATING_PANEL_COLUMNS = 8;
export const DIABLO_FLOATING_PANEL_ROWS = 7;
export const DIABLO_COLLAPSED_LEGEND_PANEL_COLUMNS = 5;
export const DIABLO_COLLAPSED_LEGEND_PANEL_ROWS = 1;
export const DIABLO_SHARED_LAYOUT_MAP = 'diabloLayouts';

export interface DiabloProjectLayout {
  projectId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiabloPersonLayout {
  personId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiabloPanelLayout {
  x: number;
  y: number;
  collapsed?: boolean;
}

export interface DiabloBoardLayout {
  version: number;
  roomName: string;
  periodId: string;
  canvasSize?: DiabloCanvasSize;
  peopleZoneColumns?: number;
  projects: Record<string, DiabloProjectLayout>;
  people?: Record<string, DiabloPersonLayout>;
  panels: {
    people: DiabloPanelLayout;
    legend: DiabloPanelLayout;
  };
}

export type DiabloCanvasZoneId = 'people' | 'projects';

export interface DiabloSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiabloCanvasSize {
  columns: number;
  rows: number;
}

export interface DiabloCanvasGrowth {
  bottom?: number;
  left?: number;
  right?: number;
  top?: number;
}

export interface DiabloLayoutProjectInput {
  id: string;
  revenueK: number;
  contractType?: ContractType;
  workType?: ProjectFrame['workType'];
  allocatedTileCount?: number;
  allocatedPeopleCount?: number;
}

export interface DiabloLayoutPersonInput {
  id: string;
  tileCount: number;
}

export interface DiabloProjectPeopleSortProjectInput {
  id: string;
  workType?: ProjectFrame['workType'];
}

export interface DiabloProjectPeopleSortPersonInput {
  id: string;
}

export const defaultDiabloPanels: DiabloBoardLayout['panels'] = {
  people: { x: DIABLO_CANVAS_MIN_START, y: DIABLO_CANVAS_MIN_START },
  legend: { x: 27, y: DIABLO_CANVAS_MIN_START },
};

export function getDiabloLayoutStorageKey(roomName: string, periodId: string) {
  return `ptm-diablo-layout:${roomName}:${periodId}`;
}

export function getProjectPeriodRevenueK(project: ProjectFrame, periodId: string) {
  return getProjectMonthRevenueKWithWeeklyPlan(project, periodId);
}

export function getMoneyUnitValue(tileUnit?: TileUnit) {
  return tileUnit?.kind === 'money' ? Math.max(1, tileUnit.value) : 1;
}

export function getDiabloPeopleZoneColumns(layoutOrColumns?: Pick<DiabloBoardLayout, 'peopleZoneColumns'> | number) {
  const rawColumns = typeof layoutOrColumns === 'number'
    ? layoutOrColumns
    : layoutOrColumns?.peopleZoneColumns;
  return Math.max(DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS, Math.round(rawColumns || DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS));
}

export function getDiabloProjectZoneStart(layoutOrColumns?: Pick<DiabloBoardLayout, 'peopleZoneColumns'> | number) {
  return getDiabloPeopleZoneColumns(layoutOrColumns) + 1;
}

export function getDiabloCanvasZoneForPoint(
  point: { x: number },
  layout: Pick<DiabloBoardLayout, 'peopleZoneColumns'>
): DiabloCanvasZoneId {
  return point.x < getDiabloProjectZoneStart(layout) ? 'people' : 'projects';
}

export function clampPointToDiabloZone(
  point: { x: number; y: number },
  zone: DiabloCanvasZoneId,
  layout: Pick<DiabloBoardLayout, 'peopleZoneColumns'>,
  canvasSize: DiabloCanvasSize
) {
  const peopleColumns = getDiabloPeopleZoneColumns(layout);
  const minX = zone === 'people' ? 1 : peopleColumns + 1;
  const maxX = zone === 'people' ? peopleColumns : canvasSize.columns;
  return {
    x: clamp(Math.round(point.x), minX, Math.max(minX, maxX)),
    y: clamp(Math.round(point.y), 1, canvasSize.rows),
  };
}

export function clampSelectionToDiabloZone(
  selection: DiabloSelection,
  zone: DiabloCanvasZoneId,
  layout: Pick<DiabloBoardLayout, 'peopleZoneColumns'>,
  canvasSize: DiabloCanvasSize
): DiabloSelection {
  const peopleColumns = getDiabloPeopleZoneColumns(layout);
  const minX = zone === 'people' ? 1 : peopleColumns + 1;
  const maxX = zone === 'people' ? peopleColumns : canvasSize.columns;
  const startX = clamp(selection.x, minX, maxX);
  const endX = clamp(selection.x + selection.width - 1, minX, maxX);
  const startY = clamp(selection.y, 1, canvasSize.rows);
  const endY = clamp(selection.y + selection.height - 1, 1, canvasSize.rows);
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.max(1, Math.abs(endX - startX) + 1),
    height: Math.max(1, Math.abs(endY - startY) + 1),
  };
}

export function getFrameCellCount(revenueK: number, tileUnit?: TileUnit) {
  return Math.max(1, Math.ceil(Math.max(0, revenueK) / getMoneyUnitValue(tileUnit)));
}

export function getLayoutRevenueK(layout: Pick<DiabloProjectLayout, 'width' | 'height'>, tileUnit?: TileUnit) {
  return Math.max(1, layout.width * layout.height * getMoneyUnitValue(tileUnit));
}

export function getFrameDimensionsForRevenue(revenueK: number, tileUnit?: TileUnit) {
  const cellCount = getFrameCellCount(revenueK, tileUnit);
  const maxWidth = Math.min(DIABLO_MAX_FRAME_WIDTH, cellCount);
  let best = { width: 1, height: cellCount, area: cellCount, score: Number.POSITIVE_INFINITY };

  for (let width = DIABLO_MIN_FRAME_WIDTH; width <= maxWidth; width += 1) {
    const height = Math.ceil(cellCount / width);
    const area = width * height;
    const aspect = width / height;
    const aspectScore = Math.abs(aspect - 1.55);
    const portraitPenalty = width < height ? 0.45 : 0;
    const score = (area - cellCount) * 10 + aspectScore + portraitPenalty;

    if (score < best.score) {
      best = { width, height, area, score };
    }
  }

  return { width: best.width, height: best.height };
}

export function getFrameDimensionsForCellCount(cellCount: number) {
  const cells = Math.max(1, Math.ceil(Math.max(0, cellCount)));
  const width = clamp(Math.round(Math.sqrt(cells)), DIABLO_MIN_FRAME_WIDTH, DIABLO_MAX_FRAME_WIDTH);
  const height = Math.max(DIABLO_MIN_FRAME_HEIGHT, Math.ceil(cells / width));
  return { width, height };
}

export function getPersonFrameDimensionsForTileCount(tileCount: number) {
  const normalizedTileCount = Math.max(0, Math.ceil(Math.max(0, tileCount)));
  const width = Math.min(DIABLO_PERSON_FRAME_WIDTH, DIABLO_MAX_PERSON_FRAME_WIDTH);
  const tileRows = normalizedTileCount > 0
    ? Math.ceil(normalizedTileCount / DIABLO_PERSON_TILE_COLUMNS)
    : 0;

  return { width, height: DIABLO_PERSON_FRAME_HEADER_ROWS + tileRows };
}

export function getSelectionRevenueK(selection: DiabloSelection, tileUnit?: TileUnit) {
  return Math.max(1, selection.width * selection.height * getMoneyUnitValue(tileUnit));
}

export function normalizeSelection(start: { x: number; y: number }, end: { x: number; y: number }): DiabloSelection {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.max(1, Math.abs(end.x - start.x) + 1),
    height: Math.max(1, Math.abs(end.y - start.y) + 1),
  };
}

export function snapFrameLayout(
  layout: DiabloProjectLayout,
  edgeGutter = 0,
  canvasSize: DiabloCanvasSize = { columns: DIABLO_GRID_COLUMNS, rows: DIABLO_GRID_ROWS }
): DiabloProjectLayout {
  const width = clamp(Math.round(layout.width), DIABLO_MIN_FRAME_WIDTH, canvasSize.columns);
  const height = clamp(Math.round(layout.height), DIABLO_MIN_FRAME_HEIGHT, canvasSize.rows);
  return {
    ...layout,
    width,
    height,
    x: clampCanvasStart(Math.round(layout.x), width, canvasSize.columns, edgeGutter),
    y: clampCanvasStart(Math.round(layout.y), height, canvasSize.rows, edgeGutter),
  };
}

export function snapProjectFrameLayout(
  layout: DiabloProjectLayout,
  boardLayout: Pick<DiabloBoardLayout, 'peopleZoneColumns'>,
  edgeGutter = 0,
  canvasSize: DiabloCanvasSize = { columns: DIABLO_GRID_COLUMNS, rows: DIABLO_GRID_ROWS }
): DiabloProjectLayout {
  const width = clamp(Math.round(layout.width), DIABLO_MIN_FRAME_WIDTH, canvasSize.columns);
  const height = clamp(Math.round(layout.height), DIABLO_MIN_FRAME_HEIGHT, canvasSize.rows);
  const minX = getDiabloProjectZoneStart(boardLayout) + edgeGutter;
  const maxX = Math.max(minX, canvasSize.columns - width - edgeGutter + 1);
  return {
    ...layout,
    width,
    height,
    x: clamp(Math.round(layout.x), minX, maxX),
    y: clampCanvasStart(Math.round(layout.y), height, canvasSize.rows, edgeGutter),
  };
}

export function snapPersonFrameLayout(
  layout: DiabloPersonLayout,
  boardLayout: Pick<DiabloBoardLayout, 'peopleZoneColumns'>,
  edgeGutter = 0,
  canvasSize: DiabloCanvasSize = { columns: DIABLO_GRID_COLUMNS, rows: DIABLO_GRID_ROWS }
): DiabloPersonLayout {
  const peopleColumns = getDiabloPeopleZoneColumns(boardLayout);
  const width = clamp(
    DIABLO_PERSON_FRAME_WIDTH,
    DIABLO_MIN_FRAME_WIDTH,
    Math.max(DIABLO_MIN_FRAME_WIDTH, peopleColumns - edgeGutter)
  );
  const height = clamp(Math.round(layout.height), DIABLO_PERSON_FRAME_HEADER_ROWS, canvasSize.rows);
  const minX = 1 + edgeGutter;
  const maxX = Math.max(minX, peopleColumns - width - edgeGutter + 1);
  return {
    ...layout,
    width,
    height,
    x: clamp(Math.round(layout.x), minX, maxX),
    y: clampCanvasStart(Math.round(layout.y), height, canvasSize.rows, edgeGutter),
  };
}

export function clampCanvasStart(start: number, span: number, canvasSize: number, edgeGutter = 0) {
  const min = 1 + edgeGutter;
  const max = Math.max(min, canvasSize - span - edgeGutter + 1);
  return clamp(start, min, max);
}

export function getDiabloPanelGridSpan(panelId: 'people' | 'legend', panelLayout: DiabloPanelLayout) {
  if (panelId === 'legend' && panelLayout.collapsed) {
    return {
      columns: DIABLO_COLLAPSED_LEGEND_PANEL_COLUMNS,
      rows: DIABLO_COLLAPSED_LEGEND_PANEL_ROWS,
    };
  }

  return {
    columns: DIABLO_FLOATING_PANEL_COLUMNS,
    rows: DIABLO_FLOATING_PANEL_ROWS,
  };
}

export function getDiabloCanvasSize(
  layout: DiabloBoardLayout,
  growthBuffer = DIABLO_CANVAS_GROWTH_BUFFER
): DiabloCanvasSize {
  const peopleZoneColumns = getDiabloPeopleZoneColumns(layout);
  let columns = Math.max(DIABLO_GRID_COLUMNS, peopleZoneColumns + DIABLO_PROJECT_ZONE_DEFAULT_COLUMNS, layout.canvasSize?.columns || 0);
  let rows = Math.max(DIABLO_GRID_ROWS, layout.canvasSize?.rows || 0);
  const contentBuffer = layout.canvasSize ? 0 : growthBuffer;

  Object.values(layout.projects).forEach((projectLayout) => {
    columns = Math.max(columns, projectLayout.x + projectLayout.width - 1 + contentBuffer);
    rows = Math.max(rows, projectLayout.y + projectLayout.height - 1 + contentBuffer);
  });

  Object.values(layout.people || {}).forEach((personLayout) => {
    columns = Math.max(columns, personLayout.x + personLayout.width - 1 + contentBuffer);
    rows = Math.max(rows, personLayout.y + personLayout.height - 1 + contentBuffer);
  });

  const panels = layout.panels || defaultDiabloPanels;
  const legendSpan = getDiabloPanelGridSpan('legend', panels.legend);

  columns = Math.max(columns, panels.legend.x + legendSpan.columns - 1 + contentBuffer);
  rows = Math.max(rows, panels.legend.y + legendSpan.rows - 1 + contentBuffer);

  return { columns, rows };
}

export function growDiabloCanvasLayout(
  layout: DiabloBoardLayout,
  growth: DiabloCanvasGrowth
): DiabloBoardLayout {
  const left = Math.max(0, Math.round(growth.left || 0));
  const right = Math.max(0, Math.round(growth.right || 0));
  const top = Math.max(0, Math.round(growth.top || 0));
  const bottom = Math.max(0, Math.round(growth.bottom || 0));
  if (!left && !right && !top && !bottom) return layout;

  const currentCanvasSize = getDiabloCanvasSize(layout, 0);
  const shiftProject = (projectLayout: DiabloProjectLayout): DiabloProjectLayout => ({
    ...projectLayout,
    x: projectLayout.x + left,
    y: projectLayout.y + top,
  });
  const shiftPerson = (personLayout: DiabloPersonLayout): DiabloPersonLayout => ({
    ...personLayout,
    x: personLayout.x + left,
    y: personLayout.y + top,
  });
  const shiftCanvasPanel = (panelLayout: DiabloPanelLayout): DiabloPanelLayout => ({
    ...panelLayout,
    x: panelLayout.x + left,
    y: panelLayout.y + top,
  });

  return {
    ...layout,
    peopleZoneColumns: getDiabloPeopleZoneColumns(layout) + left,
    canvasSize: {
      columns: currentCanvasSize.columns + left + right,
      rows: currentCanvasSize.rows + top + bottom,
    },
    projects: Object.fromEntries(
      Object.entries(layout.projects).map(([projectId, projectLayout]) => [projectId, shiftProject(projectLayout)])
    ),
    people: Object.fromEntries(
      Object.entries(layout.people || {}).map(([personId, personLayout]) => [personId, shiftPerson(personLayout)])
    ),
    panels: {
      people: layout.panels.people,
      legend: shiftCanvasPanel(layout.panels.legend),
    },
  };
}

export function fitDiabloCanvasLayoutToContent(
  layout: DiabloBoardLayout,
  margin = DIABLO_CANVAS_EDGE_GUTTER
): DiabloBoardLayout {
  const safeMargin = Math.max(0, Math.round(margin));
  const layoutPeople = layout.people || {};
  const peopleZoneColumns = getFitPeopleZoneColumns(layoutPeople, safeMargin);
  const projectAndLegendBounds = getLayoutItemBounds(getProjectAndLegendLayoutItems(layout));

  if (!projectAndLegendBounds) {
    return {
      ...layout,
      peopleZoneColumns,
      canvasSize: { columns: DIABLO_GRID_COLUMNS, rows: DIABLO_GRID_ROWS },
      people: arrangePersonLayoutsForFit(layoutPeople, peopleZoneColumns, safeMargin),
    };
  }

  const projectShiftX = getDiabloProjectZoneStart(peopleZoneColumns) + safeMargin - projectAndLegendBounds.minX;
  const projectShiftY = safeMargin + 1 - projectAndLegendBounds.minY;
  const nextProjects = Object.fromEntries(
    Object.entries(layout.projects).map(([projectId, projectLayout]) => [
      projectId,
      {
        ...projectLayout,
        x: projectLayout.x + projectShiftX,
        y: projectLayout.y + projectShiftY,
      },
    ])
  );
  const nextPeople = arrangePersonLayoutsForFit(layoutPeople, peopleZoneColumns, safeMargin);
  const nextLegend = {
    ...layout.panels.legend,
    x: layout.panels.legend.x + projectShiftX,
    y: layout.panels.legend.y + projectShiftY,
  };
  const nextBounds = getDiabloLayoutContentBounds({
    ...layout,
    peopleZoneColumns,
    projects: nextProjects,
    people: nextPeople,
    panels: {
      ...layout.panels,
      legend: nextLegend,
    },
  });

  if (!nextBounds) {
    return {
      ...layout,
      peopleZoneColumns,
      canvasSize: { columns: DIABLO_GRID_COLUMNS, rows: DIABLO_GRID_ROWS },
      people: nextPeople,
    };
  }

  const columns = Math.max(DIABLO_GRID_COLUMNS, nextBounds.maxX + safeMargin);
  const rows = Math.max(DIABLO_GRID_ROWS, nextBounds.maxY + safeMargin);

  return {
    ...layout,
    peopleZoneColumns,
    canvasSize: { columns, rows },
    projects: nextProjects,
    people: nextPeople,
    panels: {
      people: layout.panels.people,
      legend: nextLegend,
    },
  };
}

export function arrangeDiabloPersonLayoutsInGrid(
  layout: DiabloBoardLayout,
  orderedPersonIds: string[],
  margin = DIABLO_CANVAS_EDGE_GUTTER
): DiabloBoardLayout {
  const people = layout.people || {};
  const personIds = orderedPersonIds.filter((personId) => Boolean(people[personId]));
  if (!personIds.length) return layout;

  const safeMargin = Math.max(0, Math.round(margin));
  const currentPeopleZoneColumns = getDiabloPeopleZoneColumns(layout);
  const columnCount = Math.max(1, Math.min(DIABLO_PERSON_GRID_MAX_COLUMNS, personIds.length));
  const requiredPeopleZoneColumns = Math.max(
    currentPeopleZoneColumns,
    safeMargin * 2 + columnCount * DIABLO_PERSON_FRAME_WIDTH + (columnCount - 1) * DIABLO_FRAME_GAP
  );
  const peopleZoneGrowth = requiredPeopleZoneColumns - currentPeopleZoneColumns;
  const gridWidth = columnCount * DIABLO_PERSON_FRAME_WIDTH + (columnCount - 1) * DIABLO_FRAME_GAP;
  const firstColumnX = Math.max(
    safeMargin + 1,
    requiredPeopleZoneColumns - safeMargin - gridWidth + 1
  );
  const xPositions = Array.from(
    { length: columnCount },
    (_, index) => firstColumnX + index * (DIABLO_PERSON_FRAME_WIDTH + DIABLO_FRAME_GAP)
  );
  const nextPeople = { ...people };
  let rowY = Math.max(safeMargin + 1, DIABLO_PEOPLE_SORT_START_ROW);
  let maxPeopleY = rowY;

  for (let index = 0; index < personIds.length; index += columnCount) {
    const rowPersonIds = personIds.slice(index, index + columnCount);
    const rowHeights = rowPersonIds.map((personId) => (
      Math.max(DIABLO_PERSON_FRAME_HEADER_ROWS, Math.round(people[personId].height))
    ));
    const rowHeight = Math.max(...rowHeights);

    rowPersonIds.forEach((personId, columnIndex) => {
      const rightAlignedColumnIndex = columnIndex + columnCount - rowPersonIds.length;
      nextPeople[personId] = {
        ...people[personId],
        personId,
        x: xPositions[rightAlignedColumnIndex],
        y: rowY,
        width: DIABLO_PERSON_FRAME_WIDTH,
        height: rowHeights[columnIndex],
      };
    });

    maxPeopleY = Math.max(maxPeopleY, rowY + rowHeight - 1);
    rowY += rowHeight + DIABLO_FRAME_GAP;
  }

  const currentCanvasSize = getDiabloCanvasSize(layout, 0);
  const shiftedProjects = peopleZoneGrowth
    ? Object.fromEntries(
      Object.entries(layout.projects).map(([projectId, projectLayout]) => [
        projectId,
        {
          ...projectLayout,
          x: projectLayout.x + peopleZoneGrowth,
        },
      ])
    )
    : layout.projects;
  const shiftedLegend = peopleZoneGrowth
    ? {
      ...layout.panels.legend,
      x: layout.panels.legend.x + peopleZoneGrowth,
    }
    : layout.panels.legend;
  const shiftedCanvasSize = {
    columns: currentCanvasSize.columns + peopleZoneGrowth,
    rows: currentCanvasSize.rows,
  };
  const nextLayout = {
    ...layout,
    peopleZoneColumns: requiredPeopleZoneColumns,
    projects: shiftedProjects,
    people: nextPeople,
    panels: {
      ...layout.panels,
      legend: shiftedLegend,
    },
    canvasSize: shiftedCanvasSize,
  };
  const contentCanvasSize = getDiabloCanvasSize(nextLayout, 0);

  return {
    ...nextLayout,
    canvasSize: {
      columns: contentCanvasSize.columns,
      rows: Math.max(contentCanvasSize.rows, maxPeopleY + safeMargin),
    },
  };
}

export function arrangeDiabloProjectLayoutsInGrid(
  layout: DiabloBoardLayout,
  orderedProjectIds: string[],
  margin = DIABLO_CANVAS_EDGE_GUTTER
): DiabloBoardLayout {
  const projectIds = orderedProjectIds.filter((projectId) => Boolean(layout.projects[projectId]));
  if (!projectIds.length) return layout;

  const safeMargin = Math.max(0, Math.round(margin));
  const columnCount = Math.max(1, Math.min(DIABLO_PROJECT_GRID_MAX_COLUMNS, projectIds.length));
  const projectStartX = getDiabloProjectZoneStart(layout) + safeMargin;
  const nextProjects = { ...layout.projects };
  let cursorY = Math.max(safeMargin + 1, DIABLO_PROJECT_SORT_START_ROW);
  let maxProjectX = projectStartX;
  let maxProjectY = cursorY;

  for (let index = 0; index < projectIds.length; index += columnCount) {
    const rowProjectIds = projectIds.slice(index, index + columnCount);
    let cursorX = projectStartX;
    let rowHeight = 0;

    rowProjectIds.forEach((projectId) => {
      const projectLayout = layout.projects[projectId];
      const width = Math.max(DIABLO_MIN_FRAME_WIDTH, Math.round(projectLayout.width));
      const height = Math.max(DIABLO_MIN_FRAME_HEIGHT, Math.round(projectLayout.height));

      nextProjects[projectId] = {
        ...projectLayout,
        projectId,
        x: cursorX,
        y: cursorY,
        width,
        height,
      };

      maxProjectX = Math.max(maxProjectX, cursorX + width - 1);
      maxProjectY = Math.max(maxProjectY, cursorY + height - 1);
      cursorX += width + DIABLO_PROJECT_GRID_EMPTY_CELLS;
      rowHeight = Math.max(rowHeight, height);
    });

    cursorY += rowHeight + DIABLO_PROJECT_GRID_EMPTY_CELLS;
  }

  const currentCanvasSize = getDiabloCanvasSize(layout, 0);
  const nextLayout = {
    ...layout,
    projects: nextProjects,
    canvasSize: {
      columns: Math.max(currentCanvasSize.columns, maxProjectX + safeMargin),
      rows: Math.max(currentCanvasSize.rows, maxProjectY + safeMargin),
    },
  };
  const contentCanvasSize = getDiabloCanvasSize(nextLayout, 0);

  return {
    ...nextLayout,
    canvasSize: contentCanvasSize,
  };
}

export function arrangeDiabloProjectPeopleLayouts(
  layout: DiabloBoardLayout,
  orderedProjects: DiabloProjectPeopleSortProjectInput[],
  orderedPeople: DiabloProjectPeopleSortPersonInput[],
  allocations: Array<Pick<PersonTileAllocation, 'personId' | 'target'>>,
  margin = DIABLO_CANVAS_EDGE_GUTTER
): DiabloBoardLayout {
  const people = layout.people || {};
  const safeMargin = Math.max(0, Math.round(margin));
  const projectInputs = orderedProjects.filter((project) => Boolean(layout.projects[project.id]));
  const projectIds = projectInputs.filter((project) => project.workType !== 'time_off').map((project) => project.id);
  const timeOffProjectIds = projectInputs.filter((project) => project.workType === 'time_off').map((project) => project.id);
  if (!projectIds.length && !timeOffProjectIds.length) return layout;

  const currentPeopleZoneColumns = getDiabloPeopleZoneColumns(layout);
  const requiredPeopleZoneColumns = Math.max(
    currentPeopleZoneColumns,
    safeMargin * 2 +
    DIABLO_PROJECT_PEOPLE_SORT_MAX_PEOPLE_PER_ROW * DIABLO_PERSON_FRAME_WIDTH +
    (DIABLO_PROJECT_PEOPLE_SORT_MAX_PEOPLE_PER_ROW - 1) * DIABLO_FRAME_GAP
  );
  const peopleZoneGrowth = requiredPeopleZoneColumns - currentPeopleZoneColumns;
  const peopleGridWidth = (
    DIABLO_PROJECT_PEOPLE_SORT_MAX_PEOPLE_PER_ROW * DIABLO_PERSON_FRAME_WIDTH +
    (DIABLO_PROJECT_PEOPLE_SORT_MAX_PEOPLE_PER_ROW - 1) * DIABLO_FRAME_GAP
  );
  const firstPeopleColumnX = Math.max(
    safeMargin + 1,
    requiredPeopleZoneColumns - safeMargin - peopleGridWidth + 1
  );
  const peopleXPositions = Array.from(
    { length: DIABLO_PROJECT_PEOPLE_SORT_MAX_PEOPLE_PER_ROW },
    (_, index) => firstPeopleColumnX + index * (DIABLO_PERSON_FRAME_WIDTH + DIABLO_FRAME_GAP)
  );
  const projectStartX = getDiabloProjectZoneStart(requiredPeopleZoneColumns) + safeMargin;
  const projectIdsToArrange = new Set([...projectIds, ...timeOffProjectIds]);
  const shiftedProjects = Object.fromEntries(
    Object.entries(layout.projects).map(([projectId, projectLayout]) => [
      projectId,
      peopleZoneGrowth && !projectIdsToArrange.has(projectId)
        ? { ...projectLayout, x: projectLayout.x + peopleZoneGrowth }
        : projectLayout,
    ])
  );
  const nextPeople = { ...people };
  const nextProjects = { ...shiftedProjects };
  const projectOrder = new Map(projectIds.map((projectId, index) => [projectId, index]));
  const personOrder = new Map(
    orderedPeople
      .filter((person) => Boolean(people[person.id]))
      .map((person, index) => [person.id, index])
  );
  const allocationCountsByPerson = new Map<string, Map<string, number>>();

  allocations.forEach((allocation) => {
    if (!personOrder.has(allocation.personId) || !projectOrder.has(allocation.target)) return;
    const personCounts = allocationCountsByPerson.get(allocation.personId) || new Map<string, number>();
    personCounts.set(allocation.target, (personCounts.get(allocation.target) || 0) + 1);
    allocationCountsByPerson.set(allocation.personId, personCounts);
  });

  const personAssignmentsByProject = new Map<string, Array<{ personId: string; tileCount: number }>>();
  orderedPeople.forEach((person) => {
    if (!people[person.id]) return;
    const counts = allocationCountsByPerson.get(person.id);
    if (!counts?.size) return;

    const [targetProjectId, tileCount] = Array.from(counts.entries())
      .sort(([firstProjectId, firstCount], [secondProjectId, secondCount]) => (
        secondCount - firstCount ||
        (projectOrder.get(firstProjectId) ?? Number.MAX_SAFE_INTEGER) -
        (projectOrder.get(secondProjectId) ?? Number.MAX_SAFE_INTEGER) ||
        firstProjectId.localeCompare(secondProjectId)
      ))[0];
    const projectPeople = personAssignmentsByProject.get(targetProjectId) || [];
    projectPeople.push({ personId: person.id, tileCount });
    personAssignmentsByProject.set(targetProjectId, projectPeople);
  });

  let cursorY = Math.max(safeMargin + 1, DIABLO_PROJECT_SORT_START_ROW);
  let maxPeopleY = cursorY;
  let maxProjectX = projectStartX;
  let maxProjectY = cursorY;
  const arrangedPersonIds = new Set<string>();

  const arrangePersonRows = (peopleToArrange: Array<{ personId: string }>, startY: number) => {
    let peopleBlockHeight = 0;
    let personRowY = startY;

    for (let index = 0; index < peopleToArrange.length; index += DIABLO_PROJECT_PEOPLE_SORT_MAX_PEOPLE_PER_ROW) {
      const rowPeople = peopleToArrange.slice(index, index + DIABLO_PROJECT_PEOPLE_SORT_MAX_PEOPLE_PER_ROW);
      const rowHeights = rowPeople.map(({ personId }) => (
        Math.max(DIABLO_PERSON_FRAME_HEADER_ROWS, Math.round(people[personId].height))
      ));
      const rowHeight = Math.max(...rowHeights);

      rowPeople.forEach(({ personId }, columnIndex) => {
        const rightAlignedColumnIndex = columnIndex + DIABLO_PROJECT_PEOPLE_SORT_MAX_PEOPLE_PER_ROW - rowPeople.length;
        nextPeople[personId] = {
          ...people[personId],
          personId,
          x: peopleXPositions[rightAlignedColumnIndex],
          y: personRowY,
          width: DIABLO_PERSON_FRAME_WIDTH,
          height: rowHeights[columnIndex],
        };
        arrangedPersonIds.add(personId);
      });

      maxPeopleY = Math.max(maxPeopleY, personRowY + rowHeight - 1);
      peopleBlockHeight += rowHeight;
      if (index + DIABLO_PROJECT_PEOPLE_SORT_MAX_PEOPLE_PER_ROW < peopleToArrange.length) {
        peopleBlockHeight += DIABLO_FRAME_GAP;
        personRowY += rowHeight + DIABLO_FRAME_GAP;
      }
    }

    return peopleBlockHeight;
  };

  projectIds.forEach((projectId) => {
    const projectLayout = nextProjects[projectId];
    const projectWidth = Math.max(DIABLO_MIN_FRAME_WIDTH, Math.round(projectLayout.width));
    const projectHeight = Math.max(DIABLO_MIN_FRAME_HEIGHT, Math.round(projectLayout.height));
    const projectPeople = (personAssignmentsByProject.get(projectId) || [])
      .sort((firstPerson, secondPerson) => (
        secondPerson.tileCount - firstPerson.tileCount ||
        (personOrder.get(firstPerson.personId) ?? Number.MAX_SAFE_INTEGER) -
        (personOrder.get(secondPerson.personId) ?? Number.MAX_SAFE_INTEGER) ||
        firstPerson.personId.localeCompare(secondPerson.personId)
      ));

    nextProjects[projectId] = {
      ...projectLayout,
      projectId,
      x: projectStartX,
      y: cursorY,
      width: projectWidth,
      height: projectHeight,
    };

    const peopleBlockHeight = arrangePersonRows(projectPeople, cursorY);

    maxProjectX = Math.max(maxProjectX, projectStartX + projectWidth - 1);
    maxProjectY = Math.max(maxProjectY, cursorY + projectHeight - 1);
    cursorY += Math.max(projectHeight, peopleBlockHeight) + DIABLO_FRAME_GAP;
  });

  const unassignedPeople = orderedPeople
    .filter((person) => Boolean(people[person.id]) && !arrangedPersonIds.has(person.id))
    .map((person) => ({ personId: person.id }));
  const unassignedPeopleBlockHeight = arrangePersonRows(unassignedPeople, cursorY);

  if (unassignedPeopleBlockHeight) {
    cursorY += unassignedPeopleBlockHeight + DIABLO_FRAME_GAP;
  }

  timeOffProjectIds.forEach((projectId) => {
    const projectLayout = nextProjects[projectId];
    const projectWidth = Math.max(DIABLO_MIN_FRAME_WIDTH, Math.round(projectLayout.width));
    const projectHeight = Math.max(DIABLO_MIN_FRAME_HEIGHT, Math.round(projectLayout.height));

    nextProjects[projectId] = {
      ...projectLayout,
      projectId,
      x: projectStartX,
      y: cursorY,
      width: projectWidth,
      height: projectHeight,
    };

    maxProjectX = Math.max(maxProjectX, projectStartX + projectWidth - 1);
    maxProjectY = Math.max(maxProjectY, cursorY + projectHeight - 1);
    cursorY += projectHeight + DIABLO_FRAME_GAP;
  });

  const currentCanvasSize = getDiabloCanvasSize(layout, 0);
  const shiftedLegend = peopleZoneGrowth
    ? {
      ...layout.panels.legend,
      x: layout.panels.legend.x + peopleZoneGrowth,
    }
    : layout.panels.legend;
  const nextLayout = {
    ...layout,
    peopleZoneColumns: requiredPeopleZoneColumns,
    projects: nextProjects,
    people: nextPeople,
    panels: {
      ...layout.panels,
      legend: shiftedLegend,
    },
    canvasSize: {
      columns: Math.max(currentCanvasSize.columns + peopleZoneGrowth, maxProjectX + safeMargin),
      rows: Math.max(currentCanvasSize.rows, maxPeopleY + safeMargin, maxProjectY + safeMargin),
    },
  };
  const contentCanvasSize = getDiabloCanvasSize(nextLayout, 0);

  return {
    ...nextLayout,
    canvasSize: contentCanvasSize,
  };
}

function arrangePersonLayoutsForFit(
  people: Record<string, DiabloPersonLayout>,
  peopleZoneColumns: number,
  margin: number
) {
  const sortedEntries = Object.entries(people)
    .sort(([firstPersonId, firstLayout], [secondPersonId, secondLayout]) => (
      firstLayout.y - secondLayout.y ||
      firstLayout.x - secondLayout.x ||
      firstPersonId.localeCompare(secondPersonId)
    ));
  const columnCount = Math.max(1, Math.min(DIABLO_PERSON_GRID_MAX_COLUMNS, sortedEntries.length));
  const width = Math.min(
    DIABLO_PERSON_FRAME_WIDTH,
    Math.max(DIABLO_MIN_FRAME_WIDTH, peopleZoneColumns - margin * 2)
  );
  const gridWidth = columnCount * width + (columnCount - 1) * DIABLO_FRAME_GAP;
  const firstColumnX = clamp(
    peopleZoneColumns - margin - gridWidth + 1,
    1 + margin,
    Math.max(1 + margin, peopleZoneColumns - width - margin + 1)
  );
  const xPositions = Array.from(
    { length: columnCount },
    (_, index) => firstColumnX + index * (width + DIABLO_FRAME_GAP)
  );
  const nextPeople: Record<string, DiabloPersonLayout> = {};
  let cursorY = margin + 1;

  for (let index = 0; index < sortedEntries.length; index += columnCount) {
    const rowEntries = sortedEntries.slice(index, index + columnCount);
    const rowHeights = rowEntries.map(([, personLayout]) => (
      Math.max(DIABLO_PERSON_FRAME_HEADER_ROWS, Math.round(personLayout.height))
    ));
    const rowHeight = Math.max(...rowHeights);

    rowEntries.forEach(([personId, personLayout], columnIndex) => {
      const rightAlignedColumnIndex = columnIndex + columnCount - rowEntries.length;
      nextPeople[personId] = {
        ...personLayout,
        personId,
        x: xPositions[rightAlignedColumnIndex],
        y: cursorY,
        width,
        height: rowHeights[columnIndex],
      };
    });

    cursorY += rowHeight + DIABLO_FRAME_GAP;
  }

  return nextPeople;
}

function getFitPeopleZoneColumns(people: Record<string, DiabloPersonLayout>, margin: number) {
  if (!Object.keys(people).length) return DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS;

  return Math.max(
    DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS,
    margin * 2 + DIABLO_PERSON_GRID_MAX_COLUMNS * DIABLO_PERSON_FRAME_WIDTH + (DIABLO_PERSON_GRID_MAX_COLUMNS - 1) * DIABLO_FRAME_GAP
  );
}

function getProjectAndLegendLayoutItems(layout: DiabloBoardLayout) {
  const legendSpan = getDiabloPanelGridSpan('legend', layout.panels.legend);
  return [
    ...Object.values(layout.projects).map((projectLayout) => ({
      x: projectLayout.x,
      y: projectLayout.y,
      width: projectLayout.width,
      height: projectLayout.height,
    })),
    {
      x: layout.panels.legend.x,
      y: layout.panels.legend.y,
      width: legendSpan.columns,
      height: legendSpan.rows,
    },
  ];
}

function getLayoutItemBounds(items: Array<{ x: number; y: number; width: number; height: number }>) {
  if (!items.length) return null;

  return items.reduce((bounds, item) => ({
    minX: Math.min(bounds.minX, item.x),
    minY: Math.min(bounds.minY, item.y),
    maxX: Math.max(bounds.maxX, item.x + item.width - 1),
    maxY: Math.max(bounds.maxY, item.y + item.height - 1),
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });
}

function getDiabloLayoutContentBounds(layout: DiabloBoardLayout) {
  const items = [
    ...getProjectAndLegendLayoutItems(layout),
    ...Object.values(layout.people || {}).map((personLayout) => ({
      x: personLayout.x,
      y: personLayout.y,
      width: personLayout.width,
      height: personLayout.height,
    })),
  ];

  return getLayoutItemBounds(items);
}

function normalizeCorruptDiabloLayout(layout: DiabloBoardLayout): DiabloBoardLayout {
  const peopleZoneColumns = getDiabloPeopleZoneColumns(layout);
  if (peopleZoneColumns <= DIABLO_CORRUPT_PEOPLE_ZONE_COLUMNS) return layout;

  const people = layout.people || {};
  const normalizedPeopleZoneColumns = getFitPeopleZoneColumns(people, DIABLO_CANVAS_EDGE_GUTTER);
  const peopleBounds = getLayoutItemBounds(
    Object.values(people).map((personLayout) => ({
      x: personLayout.x,
      y: personLayout.y,
      width: personLayout.width,
      height: personLayout.height,
    }))
  );
  const targetPeopleRightEdge = normalizedPeopleZoneColumns - DIABLO_CANVAS_EDGE_GUTTER;
  const shiftLeft = peopleBounds
    ? Math.max(0, peopleBounds.maxX - targetPeopleRightEdge)
    : peopleZoneColumns - normalizedPeopleZoneColumns;

  if (shiftLeft <= 0) {
    const resizedLayout = {
      ...layout,
      peopleZoneColumns: normalizedPeopleZoneColumns,
      canvasSize: undefined,
    };

    return {
      ...resizedLayout,
      canvasSize: getDiabloCanvasSize(resizedLayout, 0),
    };
  }

  const shiftLayoutItem = <T extends { x: number; y: number }>(item: T): T => ({
    ...item,
    x: item.x - shiftLeft,
  });
  const shiftedLayout: DiabloBoardLayout = {
    ...layout,
    peopleZoneColumns: normalizedPeopleZoneColumns,
    ...(layout.canvasSize ? {
      canvasSize: {
        columns: Math.max(DIABLO_GRID_COLUMNS, layout.canvasSize.columns - shiftLeft),
        rows: layout.canvasSize.rows,
      },
    } : {}),
    projects: Object.fromEntries(
      Object.entries(layout.projects).map(([projectId, projectLayout]) => [
        projectId,
        shiftLayoutItem(projectLayout),
      ])
    ),
    people: Object.fromEntries(
      Object.entries(people).map(([personId, personLayout]) => [
        personId,
        shiftLayoutItem(personLayout),
      ])
    ),
    panels: {
      ...layout.panels,
      legend: shiftLayoutItem(layout.panels.legend),
    },
  };
  const shiftedCanvasSize = getDiabloCanvasSize(shiftedLayout, 0);
  const snappedProjects = Object.fromEntries(
    Object.entries(shiftedLayout.projects).map(([projectId, projectLayout]) => [
      projectId,
      snapProjectFrameLayout(projectLayout, shiftedLayout, 0, shiftedCanvasSize),
    ])
  );
  const snappedPeople = Object.fromEntries(
    Object.entries(shiftedLayout.people || {}).map(([personId, personLayout]) => [
      personId,
      snapPersonFrameLayout(personLayout, shiftedLayout, 0, shiftedCanvasSize),
    ])
  );
  const legendSpan = getDiabloPanelGridSpan('legend', shiftedLayout.panels.legend);
  const snappedLegend = {
    ...shiftedLayout.panels.legend,
    x: clampCanvasStart(shiftedLayout.panels.legend.x, legendSpan.columns, shiftedCanvasSize.columns),
    y: clampCanvasStart(shiftedLayout.panels.legend.y, legendSpan.rows, shiftedCanvasSize.rows),
  };
  const normalizedLayout: DiabloBoardLayout = {
    ...shiftedLayout,
    projects: snappedProjects,
    people: snappedPeople,
    panels: {
      ...shiftedLayout.panels,
      legend: snappedLegend,
    },
  };

  return {
    ...normalizedLayout,
    canvasSize: getDiabloCanvasSize(normalizedLayout, 0),
  };
}

export function createEmptyDiabloLayout(roomName: string, periodId: string): DiabloBoardLayout {
  return {
    version: DIABLO_LAYOUT_VERSION,
    roomName,
    periodId,
    peopleZoneColumns: DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS,
    projects: {},
    people: {},
    panels: structuredClone(defaultDiabloPanels),
  };
}

export function createInitialDiabloLayout(roomName: string, periodId: string): DiabloBoardLayout {
  return readDiabloLayout(roomName, periodId) || createEmptyDiabloLayout(roomName, periodId);
}

export function cloneDiabloLayout(layout: DiabloBoardLayout): DiabloBoardLayout {
  return {
    version: layout.version,
    roomName: layout.roomName,
    periodId: layout.periodId,
    ...(layout.canvasSize ? { canvasSize: { ...layout.canvasSize } } : {}),
    peopleZoneColumns: getDiabloPeopleZoneColumns(layout),
    projects: Object.fromEntries(
      Object.entries(layout.projects).map(([projectId, projectLayout]) => [
        projectId,
        { ...projectLayout },
      ])
    ),
    people: Object.fromEntries(
      Object.entries(layout.people || {}).map(([personId, personLayout]) => [
        personId,
        { ...personLayout },
      ])
    ),
    panels: {
      people: { ...layout.panels.people },
      legend: { ...layout.panels.legend },
    },
  };
}

export function cloneDiabloSharedProjectLayout(layout: DiabloBoardLayout): DiabloBoardLayout {
  return {
    ...cloneDiabloLayout(layout),
    panels: structuredClone(defaultDiabloPanels),
  };
}

export function mergeDiabloSharedProjectLayout(
  sharedLayout: DiabloBoardLayout,
  localLayout: DiabloBoardLayout
): DiabloBoardLayout {
  return {
    ...cloneDiabloLayout(sharedLayout),
    panels: {
      people: { ...localLayout.panels.people },
      legend: { ...localLayout.panels.legend },
    },
  };
}

export function resolveDiabloLayoutSyncBase(
  sharedLayout: DiabloBoardLayout | null,
  localLayout: DiabloBoardLayout,
  preferLocalLayout = false
): DiabloBoardLayout {
  if (preferLocalLayout || !sharedLayout) return cloneDiabloLayout(localLayout);
  return mergeDiabloSharedProjectLayout(sharedLayout, localLayout);
}

export function parseDiabloLayout(value: unknown, roomName: string, periodId: string): DiabloBoardLayout | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!isRecord(parsed)) return null;
    if (
      (parsed.version !== DIABLO_LAYOUT_VERSION && parsed.version !== 2) ||
      parsed.roomName !== roomName ||
      parsed.periodId !== periodId
    ) {
      return null;
    }

    const canvasSize = parseCanvasSize(parsed.canvasSize);
    const peopleZoneColumns = parsed.version === 2
      ? DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS
      : getDiabloPeopleZoneColumns(parsePositiveInteger(parsed.peopleZoneColumns, DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS));
    const projects = parseProjectLayouts(parsed.projects);

    return normalizeCorruptDiabloLayout({
      version: DIABLO_LAYOUT_VERSION,
      roomName,
      periodId,
      ...(canvasSize ? { canvasSize: parsed.version === 2 ? { ...canvasSize, columns: canvasSize.columns + peopleZoneColumns } : canvasSize } : {}),
      peopleZoneColumns,
      projects: parsed.version === 2 ? shiftProjectLayoutsForPeopleZone(projects, peopleZoneColumns) : projects,
      people: parsePersonLayouts(parsed.people),
      panels: parsePanelLayouts(parsed.panels),
    });
  } catch {
    return null;
  }
}

export function areDiabloLayoutsEqual(
  first: DiabloBoardLayout | null | undefined,
  second: DiabloBoardLayout | null | undefined
) {
  if (!first || !second) return first === second;
  return getDiabloLayoutSignature(first) === getDiabloLayoutSignature(second);
}

export function areDiabloSharedProjectLayoutsEqual(
  first: DiabloBoardLayout | null | undefined,
  second: DiabloBoardLayout | null | undefined
) {
  if (!first || !second) return first === second;
  return getDiabloSharedProjectLayoutSignature(first) === getDiabloSharedProjectLayoutSignature(second);
}

export function createDefaultProjectLayouts(
  projects: DiabloLayoutProjectInput[],
  tileUnit?: TileUnit,
  peopleZoneColumns = DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS
) {
  const layouts: Record<string, DiabloProjectLayout> = {};
  const projectStart = getDiabloProjectZoneStart(peopleZoneColumns) + DIABLO_CANVAS_EDGE_GUTTER;
  let cursorX = projectStart;
  let cursorY = 9;
  let rowHeight = 0;

  projects.forEach((project) => {
    const dimensions = getFrameDimensionsForRevenue(project.revenueK, tileUnit);
    if (cursorX + dimensions.width - 1 > DIABLO_GRID_COLUMNS - DIABLO_CANVAS_EDGE_GUTTER) {
      cursorX = projectStart;
      cursorY += rowHeight + DIABLO_FRAME_GAP;
      rowHeight = 0;
    }

    layouts[project.id] = snapProjectFrameLayout({
      projectId: project.id,
      x: cursorX,
      y: cursorY,
      width: dimensions.width,
      height: dimensions.height,
    }, { peopleZoneColumns }, DIABLO_CANVAS_EDGE_GUTTER);

    cursorX += dimensions.width + DIABLO_FRAME_GAP;
    rowHeight = Math.max(rowHeight, dimensions.height);
  });

  return layouts;
}

export function createDefaultPersonLayouts(
  people: DiabloLayoutPersonInput[],
  peopleZoneColumns = DIABLO_PEOPLE_ZONE_DEFAULT_COLUMNS
) {
  const layouts: Record<string, DiabloPersonLayout> = {};
  let cursorX = DIABLO_CANVAS_MIN_START;
  let cursorY = DIABLO_CANVAS_MIN_START;
  let rowHeight = 0;
  const canvasSize = { columns: Math.max(DIABLO_GRID_COLUMNS, peopleZoneColumns + DIABLO_PROJECT_ZONE_DEFAULT_COLUMNS), rows: DIABLO_GRID_ROWS };

  people.forEach((person) => {
    const dimensions = getPersonFrameDimensionsForTileCount(person.tileCount);
    if (cursorX + dimensions.width - 1 > peopleZoneColumns - DIABLO_CANVAS_EDGE_GUTTER) {
      cursorX = DIABLO_CANVAS_MIN_START;
      cursorY += rowHeight + DIABLO_FRAME_GAP;
      rowHeight = 0;
    }

    layouts[person.id] = snapPersonFrameLayout({
      personId: person.id,
      x: cursorX,
      y: cursorY,
      width: dimensions.width,
      height: dimensions.height,
    }, { peopleZoneColumns }, DIABLO_CANVAS_EDGE_GUTTER, canvasSize);

    cursorX += dimensions.width + DIABLO_FRAME_GAP;
    rowHeight = Math.max(rowHeight, dimensions.height);
  });

  return layouts;
}

export function ensureDiabloProjectLayouts(
  layout: DiabloBoardLayout,
  projects: DiabloLayoutProjectInput[],
  tileUnit?: TileUnit
): DiabloBoardLayout {
  const peopleZoneColumns = getDiabloPeopleZoneColumns(layout);
  const defaultLayouts = createDefaultProjectLayouts(projects, tileUnit, peopleZoneColumns);
  const canvasSize = getDiabloCanvasSize(layout);
  const activeProjectIds = new Set(projects.map((project) => project.id));
  const nextProjects = Object.fromEntries(
    Object.entries(layout.projects)
      .filter(([projectId]) => activeProjectIds.has(projectId))
      .map(([projectId, projectLayout]) => {
        const snappedLayout = snapProjectFrameLayout(projectLayout, layout, 0, canvasSize);
        const project = projects.find((item) => item.id === projectId);
        if (!project) return [projectId, snappedLayout];

        // Auto-size R&D and uncapped T&M to fit content; fixed and capped contracts retain their manual frame.
        const autoContentCells = project.workType === 'research_development'
          ? project.allocatedPeopleCount
          : project.contractType === 'hourly'
            ? project.allocatedTileCount
            : undefined;
        if (autoContentCells === undefined) return [projectId, snappedLayout];

        const requiredCells = Math.max(1, autoContentCells);
        if (snappedLayout.width * snappedLayout.height >= requiredCells) {
          return [projectId, snappedLayout];
        }

        const dimensions = getFrameDimensionsForCellCount(requiredCells);
        return [projectId, snapProjectFrameLayout({
          ...snappedLayout,
          width: dimensions.width,
          height: dimensions.height,
        }, layout, 0, canvasSize)];
      })
  );

  projects.forEach((project) => {
    if (!nextProjects[project.id]) nextProjects[project.id] = defaultLayouts[project.id];
  });

  return {
    ...layout,
    peopleZoneColumns,
    projects: nextProjects,
    people: layout.people || {},
    panels: {
      people: layout.panels?.people || defaultDiabloPanels.people,
      legend: layout.panels?.legend || defaultDiabloPanels.legend,
    },
  };
}

export function ensureDiabloPersonLayouts(
  layout: DiabloBoardLayout,
  people: DiabloLayoutPersonInput[]
): DiabloBoardLayout {
  const peopleZoneColumns = getDiabloPeopleZoneColumns(layout);
  const defaultLayouts = createDefaultPersonLayouts(people, peopleZoneColumns);
  const canvasSize = getDiabloCanvasSize(layout);
  const activePersonIds = new Set(people.map((person) => person.id));
  const nextPeople = Object.fromEntries(
    Object.entries(layout.people || {})
      .filter(([personId]) => activePersonIds.has(personId))
      .map(([personId, personLayout]) => {
        const person = people.find((item) => item.id === personId);
        const snappedLayout = snapPersonFrameLayout(personLayout, layout, 0, canvasSize);
        if (!person) return [personId, snappedLayout];

        const dimensions = getPersonFrameDimensionsForTileCount(person.tileCount);
        if (snappedLayout.width === dimensions.width && snappedLayout.height === dimensions.height) {
          return [personId, snappedLayout];
        }

        return [personId, snapPersonFrameLayout({
          ...snappedLayout,
          width: dimensions.width,
          height: dimensions.height,
        }, layout, 0, canvasSize)];
      })
  );

  people.forEach((person) => {
    if (!nextPeople[person.id]) nextPeople[person.id] = defaultLayouts[person.id];
  });

  return {
    ...layout,
    peopleZoneColumns,
    people: nextPeople,
  };
}

export function readDiabloLayout(roomName: string, periodId: string): DiabloBoardLayout | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(getDiabloLayoutStorageKey(roomName, periodId));
  if (!raw) return null;
  return parseDiabloLayout(raw, roomName, periodId);
}

export function writeDiabloLayout(layout: DiabloBoardLayout) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getDiabloLayoutStorageKey(layout.roomName, layout.periodId), JSON.stringify(layout));
}

export function clearDiabloLayout(roomName: string, periodId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(getDiabloLayoutStorageKey(roomName, periodId));
}

export function createProjectDraftFromSelection(
  selection: DiabloSelection,
  period: Period,
  project: ProjectFrame,
  tileUnit?: TileUnit
): ProjectFrame {
  const revenueK = getSelectionRevenueK(selection, tileUnit);
  return {
    ...project,
    budgetK: revenueK,
    startMonth: period.label,
    startPeriodId: period.id,
    endPeriodId: period.id,
    revenuePlan: [
      ...project.revenuePlan.filter((entry) => entry.periodId !== period.id),
      {
        periodId: period.id,
        nativeRevenueK: revenueK,
        currency: 'PLN',
        revenueK,
        probability: project.probability,
      },
    ],
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePositiveInteger(value: unknown, minimum = 1, fallback = minimum) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.round(value))
    : fallback;
}

function parseRequiredPositiveInteger(value: unknown, minimum = 1) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.round(value))
    : null;
}

function parseCanvasSize(value: unknown): DiabloCanvasSize | null {
  if (!isRecord(value)) return null;
  return {
    columns: parsePositiveInteger(value.columns, DIABLO_GRID_COLUMNS),
    rows: parsePositiveInteger(value.rows, DIABLO_GRID_ROWS),
  };
}

function parseProjectLayouts(value: unknown): Record<string, DiabloProjectLayout> {
  if (!isRecord(value)) return {};
  const projects: Record<string, DiabloProjectLayout> = {};

  Object.entries(value).forEach(([projectId, projectLayout]) => {
    if (!isRecord(projectLayout)) return;
    const x = parseRequiredPositiveInteger(projectLayout.x);
    const y = parseRequiredPositiveInteger(projectLayout.y);
    const width = parseRequiredPositiveInteger(projectLayout.width);
    const height = parseRequiredPositiveInteger(projectLayout.height);
    if (x === null || y === null || width === null || height === null) return;

    projects[projectId] = {
      projectId,
      x,
      y,
      width,
      height,
    };
  });

  return projects;
}

function parsePersonLayouts(value: unknown): Record<string, DiabloPersonLayout> {
  if (!isRecord(value)) return {};
  const people: Record<string, DiabloPersonLayout> = {};

  Object.entries(value).forEach(([personId, personLayout]) => {
    if (!isRecord(personLayout)) return;
    const x = parseRequiredPositiveInteger(personLayout.x);
    const y = parseRequiredPositiveInteger(personLayout.y);
    const width = parseRequiredPositiveInteger(personLayout.width);
    const height = parseRequiredPositiveInteger(personLayout.height);
    if (x === null || y === null || width === null || height === null) return;

    people[personId] = {
      personId,
      x,
      y,
      width,
      height,
    };
  });

  return people;
}

function shiftProjectLayoutsForPeopleZone(
  projects: Record<string, DiabloProjectLayout>,
  peopleZoneColumns: number
) {
  return Object.fromEntries(
    Object.entries(projects).map(([projectId, projectLayout]) => [
      projectId,
      {
        ...projectLayout,
        x: projectLayout.x + peopleZoneColumns,
      },
    ])
  );
}

function parsePanelLayouts(value: unknown): DiabloBoardLayout['panels'] {
  if (!isRecord(value)) {
    return {
      people: { ...defaultDiabloPanels.people },
      legend: { ...defaultDiabloPanels.legend },
    };
  }

  return {
    people: parsePanelLayout(value.people, defaultDiabloPanels.people),
    legend: parsePanelLayout(value.legend, defaultDiabloPanels.legend),
  };
}

function parsePanelLayout(value: unknown, fallback: DiabloPanelLayout): DiabloPanelLayout {
  if (!isRecord(value)) return { ...fallback };
  return {
    x: parsePositiveInteger(value.x, 1, fallback.x),
    y: parsePositiveInteger(value.y, 1, fallback.y),
    ...(value.collapsed === true ? { collapsed: true } : {}),
  };
}

function getDiabloLayoutSignature(layout: DiabloBoardLayout) {
  return JSON.stringify({
    ...getDiabloSharedProjectLayoutSignaturePayload(layout),
    panels: {
      people: {
        x: layout.panels.people.x,
        y: layout.panels.people.y,
        collapsed: layout.panels.people.collapsed === true,
      },
      legend: {
        x: layout.panels.legend.x,
        y: layout.panels.legend.y,
        collapsed: layout.panels.legend.collapsed === true,
      },
    },
  });
}

function getDiabloSharedProjectLayoutSignature(layout: DiabloBoardLayout) {
  return JSON.stringify(getDiabloSharedProjectLayoutSignaturePayload(layout));
}

function getDiabloSharedProjectLayoutSignaturePayload(layout: DiabloBoardLayout) {
  return {
    version: layout.version,
    roomName: layout.roomName,
    periodId: layout.periodId,
    peopleZoneColumns: getDiabloPeopleZoneColumns(layout),
    canvasSize: layout.canvasSize ? {
      columns: layout.canvasSize.columns,
      rows: layout.canvasSize.rows,
    } : null,
    projects: Object.keys(layout.projects)
      .sort()
      .map((projectId) => ({
        key: projectId,
        projectLayout: layout.projects[projectId],
      }))
      .map(({ key, projectLayout }) => ({
        key,
        projectId: projectLayout.projectId,
        x: projectLayout.x,
        y: projectLayout.y,
        width: projectLayout.width,
        height: projectLayout.height,
      })),
    people: Object.keys(layout.people || {})
      .sort()
      .map((personId) => ({
        key: personId,
        personLayout: (layout.people || {})[personId],
      }))
      .map(({ key, personLayout }) => ({
        key,
        personId: personLayout.personId,
        x: personLayout.x,
        y: personLayout.y,
        width: personLayout.width,
        height: personLayout.height,
      })),
  };
}
