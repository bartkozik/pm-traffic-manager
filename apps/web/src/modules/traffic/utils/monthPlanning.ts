import type {
  AllocationTarget,
  Period,
  Person,
  PersonTileAllocation,
  ProjectFrame,
} from '../models/traffic.model';
import { isProjectActiveInPeriod } from './projectPeriod';
import { type ProjectSortMode, sortProjectsForPlanningBoard } from './projectOrdering';
import type { PeriodRelationshipConnectorSignal } from './visualInventory';

export interface RelationshipConnectorPath extends PeriodRelationshipConnectorSignal {
  path: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface RelationshipConnectorCanvas {
  width: number;
  height: number;
  paths: RelationshipConnectorPath[];
}

export const emptyRelationshipConnectorCanvas: RelationshipConnectorCanvas = {
  width: 0,
  height: 0,
  paths: [],
};

export function getProjectsForPeriod(
  projects: ProjectFrame[],
  period: Period,
  allocationsByTarget: Map<string, PersonTileAllocation[]>,
  peopleById: Map<string, Person>,
  sortMode: ProjectSortMode
) {
  return sortProjectsForPlanningBoard(
    projects.filter((project) => isProjectActiveInPeriod(project, period.id, allocationsByTarget)),
    { allocationsByTarget, peopleById, periodId: period.id, sortMode }
  );
}

export function getArchivedProjectsForPeriod(projects: ProjectFrame[], period: Period) {
  return projects.filter((project) => !project.archivedAt && project.archivedPeriodIds?.includes(period.id));
}

export function getRelationshipConnectorPoints(
  sourceRect: DOMRect,
  targetRect: DOMRect,
  gridRect: DOMRect
) {
  const sourceCenterX = sourceRect.left + sourceRect.width / 2;
  const sourceCenterY = sourceRect.top + sourceRect.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const isMostlyVertical = Math.abs(targetCenterX - sourceCenterX) < Math.min(sourceRect.width, targetRect.width) * 0.52;

  if (isMostlyVertical) {
    const targetIsBelow = targetCenterY >= sourceCenterY;
    return {
      startX: Math.round(sourceCenterX - gridRect.left),
      startY: Math.round((targetIsBelow ? sourceRect.bottom : sourceRect.top) - gridRect.top),
      endX: Math.round(targetCenterX - gridRect.left),
      endY: Math.round((targetIsBelow ? targetRect.top : targetRect.bottom) - gridRect.top),
    };
  }

  const targetIsRight = targetCenterX >= sourceCenterX;
  return {
    startX: Math.round((targetIsRight ? sourceRect.right : sourceRect.left) - gridRect.left),
    startY: Math.round(sourceCenterY - gridRect.top),
    endX: Math.round((targetIsRight ? targetRect.left : targetRect.right) - gridRect.left),
    endY: Math.round(targetCenterY - gridRect.top),
  };
}

export function getRelationshipConnectorPath({
  startX,
  startY,
  endX,
  endY,
}: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}) {
  const deltaX = endX - startX;
  const deltaY = endY - startY;

  if (Math.abs(deltaX) < 24) {
    const controlOffsetY = Math.max(40, Math.abs(deltaY) * 0.38);
    const direction = deltaY >= 0 ? 1 : -1;
    return [
      `M ${startX} ${startY}`,
      `C ${startX} ${startY + controlOffsetY * direction}`,
      `${endX} ${endY - controlOffsetY * direction}`,
      `${endX} ${endY}`,
    ].join(' ');
  }

  const controlOffsetX = Math.max(46, Math.abs(deltaX) * 0.42);
  const direction = deltaX >= 0 ? 1 : -1;
  return [
    `M ${startX} ${startY}`,
    `C ${startX + controlOffsetX * direction} ${startY}`,
    `${endX - controlOffsetX * direction} ${endY}`,
    `${endX} ${endY}`,
  ].join(' ');
}

export function areRelationshipConnectorCanvasesEqual(
  current: RelationshipConnectorCanvas,
  next: RelationshipConnectorCanvas
) {
  if (current.width !== next.width || current.height !== next.height || current.paths.length !== next.paths.length) {
    return false;
  }

  return current.paths.every((path, index) => (
    path.id === next.paths[index].id &&
    path.path === next.paths[index].path &&
    path.startX === next.paths[index].startX &&
    path.startY === next.paths[index].startY &&
    path.endX === next.paths[index].endX &&
    path.endY === next.paths[index].endY
  ));
}

export function setAllocationTargetElementRef(
  refs: Map<AllocationTarget, HTMLElement>,
  target: AllocationTarget,
  element: HTMLElement | null
) {
  if (element) {
    refs.set(target, element);
    return;
  }
  refs.delete(target);
}
