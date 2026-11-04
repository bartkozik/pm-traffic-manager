import { TrafficSnapshot, TrafficBoardCommand } from '@ptm/domain';

export interface TrafficBoardRecord {
  boardId: string;
  snapshot: TrafficSnapshot;
  updatedAt: string;
  version: number;
}

export interface TrafficAuditLogEntry {
  id: number;
  boardId: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: unknown;
  actorId?: string;
  commandId?: string;
  sourceSystem?: string;
  sourceRecordId?: string;
  idempotencyKey?: string;
  diffSummary?: string;
  createdAt: string;
}

export interface TrafficAuditContext {
  actorId?: string;
  commandId?: string;
  sourceSystem?: string;
  sourceRecordId?: string;
  idempotencyKey?: string;
  diffSummary?: string;
}

export type TrafficEntityTable =
  | 'traffic_planning_rules'
  | 'traffic_weekly_allocations'
  | 'traffic_allocations'
  | 'traffic_project_invoices'
  | 'traffic_project_revenue_plans'
  | 'traffic_project_requirements'
  | 'traffic_projects'
  | 'traffic_people'
  | 'traffic_tile_units'
  | 'traffic_periods'
  | 'traffic_skills';

export const trafficEntityTables: TrafficEntityTable[] = [
  'traffic_planning_rules',
  'traffic_weekly_allocations',
  'traffic_allocations',
  'traffic_project_invoices',
  'traffic_project_revenue_plans',
  'traffic_project_requirements',
  'traffic_projects',
  'traffic_people',
  'traffic_tile_units',
  'traffic_periods',
  'traffic_skills',
];

export interface TrafficBoardRepository {
  validateCommand?(snapshot: TrafficSnapshot, command: TrafficBoardCommand): void;
  saveIfCurrent?(boardId: string, snapshot: TrafficSnapshot, baseUpdatedAt?: string): Promise<TrafficBoardRecord>;
  find(boardId: string): Promise<TrafficBoardRecord | null>;
  updateAtomically(
    boardId: string,
    initialSnapshot: TrafficSnapshot,
    update: (snapshot: TrafficSnapshot) => TrafficSnapshot,
    action: string,
    auditContext?: TrafficAuditContext
  ): Promise<TrafficBoardRecord>;
  upsert(
    boardId: string,
    snapshot: TrafficSnapshot,
    action?: string,
    auditContext?: TrafficAuditContext
  ): Promise<TrafficBoardRecord>;
  listAuditLog(boardId: string): Promise<TrafficAuditLogEntry[]>;
  countEntityRows(tableName: TrafficEntityTable, boardId: string): Promise<number>;
}
