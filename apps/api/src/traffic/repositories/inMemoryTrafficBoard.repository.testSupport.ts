import { TrafficSnapshot } from '@ptm/domain';
import {
  TrafficAuditContext,
  TrafficAuditLogEntry,
  TrafficBoardRecord,
  TrafficBoardRepository,
  TrafficEntityTable,
} from './trafficBoard.repository.js';

export class InMemoryTrafficBoardRepository implements TrafficBoardRepository {
  private readonly boards = new Map<string, TrafficBoardRecord>();
  private readonly auditLog: TrafficAuditLogEntry[] = [];
  private readonly boardUpdateQueues = new Map<string, Promise<unknown>>();

  async find(boardId: string): Promise<TrafficBoardRecord | null> {
    const board = this.boards.get(boardId);
    return board ? cloneBoardRecord(board) : null;
  }

  async upsert(
    boardId: string,
    snapshot: TrafficSnapshot,
    action = 'board_snapshot_saved',
    auditContext: TrafficAuditContext = {}
  ): Promise<TrafficBoardRecord> {
    const now = new Date().toISOString();
    const record = {
      boardId,
      snapshot: cloneSnapshot(snapshot),
      updatedAt: now,
      version: (this.boards.get(boardId)?.version ?? 0) + 1,
    };
    this.boards.set(boardId, record);
    this.auditLog.push({
      id: this.auditLog.length + 1,
      boardId,
      action,
      entityType: 'board',
      entityId: boardId,
      payload: {
        allocations: snapshot.allocations.length,
        people: snapshot.people.length,
        planningRules: snapshot.planningRules?.length || 0,
        projects: snapshot.projects.length,
        schemaVersion: snapshot.schemaVersion,
        weeklyAllocations: snapshot.weeklyAllocations?.length || 0,
      },
      actorId: auditContext.actorId,
      commandId: auditContext.commandId,
      sourceSystem: auditContext.sourceSystem,
      sourceRecordId: auditContext.sourceRecordId,
      idempotencyKey: auditContext.idempotencyKey,
      diffSummary: auditContext.diffSummary,
      createdAt: now,
    });
    return cloneBoardRecord(record);
  }

  async updateAtomically(
    boardId: string,
    initialSnapshot: TrafficSnapshot,
    update: (snapshot: TrafficSnapshot) => TrafficSnapshot,
    action: string,
    auditContext: TrafficAuditContext = {}
  ): Promise<TrafficBoardRecord> {
    const previousUpdate = this.boardUpdateQueues.get(boardId) ?? Promise.resolve();
    const nextUpdate = previousUpdate
      .catch(() => undefined)
      .then(async () => {
        if (!this.boards.has(boardId)) {
          await this.upsert(boardId, initialSnapshot);
        }
        const current = this.boards.get(boardId);
        if (!current) throw new Error(`Traffic board ${boardId} could not be initialized.`);
        return this.upsert(boardId, update(cloneSnapshot(current.snapshot)), action, auditContext);
      });

    this.boardUpdateQueues.set(boardId, nextUpdate);
    try {
      return await nextUpdate;
    } finally {
      if (this.boardUpdateQueues.get(boardId) === nextUpdate) {
        this.boardUpdateQueues.delete(boardId);
      }
    }
  }

  async listAuditLog(boardId: string): Promise<TrafficAuditLogEntry[]> {
    return this.auditLog
      .filter((entry) => entry.boardId === boardId)
      .map((entry) => ({ ...entry, payload: structuredClone(entry.payload) as unknown }));
  }

  async countEntityRows(tableName: TrafficEntityTable, boardId: string): Promise<number> {
    const board = this.boards.get(boardId);
    if (!board) return 0;

    switch (tableName) {
      case 'traffic_planning_rules':
        return board.snapshot.planningRules?.length || 0;
      case 'traffic_allocations':
        return board.snapshot.allocations.length;
      case 'traffic_weekly_allocations':
        return board.snapshot.weeklyAllocations?.length || 0;
      case 'traffic_project_invoices':
        return board.snapshot.projects.reduce((sum, project) => sum + project.invoices.length, 0);
      case 'traffic_project_revenue_plans':
        return board.snapshot.projects.reduce((sum, project) => sum + project.revenuePlan.length, 0);
      case 'traffic_project_requirements':
        return board.snapshot.projects.reduce((sum, project) => sum + project.requirements.length, 0);
      case 'traffic_projects':
        return board.snapshot.projects.length;
      case 'traffic_people':
        return board.snapshot.people.length;
      case 'traffic_tile_units':
        return board.snapshot.tileUnits.length;
      case 'traffic_periods':
        return board.snapshot.periods.length;
      case 'traffic_skills':
        return board.snapshot.skills.length;
    }
  }
}

function cloneBoardRecord(record: TrafficBoardRecord): TrafficBoardRecord {
  return {
    ...record,
    snapshot: cloneSnapshot(record.snapshot),
  };
}

function cloneSnapshot(snapshot: TrafficSnapshot): TrafficSnapshot {
  return structuredClone(snapshot) as TrafficSnapshot;
}
