import {
  applyTrafficBoardCommand,
  createSeedTrafficSnapshot,
  getTrafficBoardCommandAuditAction,
  MoveTrafficAllocation,
  TrafficBoardCommand,
  TrafficSnapshot,
} from '@ptm/domain';
import {
  TrafficAuditContext,
  TrafficBoardRecord,
  TrafficBoardRepository,
} from '../repositories/trafficBoard.repository.js';

export class TrafficBoardService {
  private readonly boardWriteQueues = new Map<string, Promise<unknown>>();

  constructor(private readonly repository: TrafficBoardRepository) {}

  async getOrCreate(boardId: string): Promise<TrafficBoardRecord> {
    const existing = await this.repository.find(boardId);
    if (existing) return existing;
    return this.repository.upsert(boardId, createSeedTrafficSnapshot());
  }

  async save(boardId: string, snapshot: TrafficSnapshot, options: { baseUpdatedAt?: string } = {}): Promise<TrafficBoardRecord> {
    return this.enqueueBoardWrite(boardId, async () => {
      const existing = await this.repository.find(boardId);

      if (existing && (!options.baseUpdatedAt || existing.updatedAt !== options.baseUpdatedAt)) {
        throw new TrafficBoardConflictError(existing);
      }

      if (this.repository.saveIfCurrent) return this.repository.saveIfCurrent(boardId, snapshot, options.baseUpdatedAt);
      return this.repository.upsert(boardId, snapshot);
    });
  }

  async moveAllocations(
    boardId: string,
    periodId: string,
    moves: MoveTrafficAllocation[],
    auditContext?: TrafficAuditContext
  ): Promise<TrafficBoardRecord> {
    return this.executeCommand(boardId, {
      type: 'allocations.move',
      periodId,
      moves,
    }, auditContext);
  }

  async executeCommand(
    boardId: string,
    command: TrafficBoardCommand,
    auditContext?: TrafficAuditContext
  ): Promise<TrafficBoardRecord> {
    return this.enqueueBoardWrite(boardId, async () => {
      return this.repository.updateAtomically(
        boardId,
        createSeedTrafficSnapshot(),
        (snapshot) => {
          this.repository.validateCommand?.(snapshot, command);
          return applyTrafficBoardCommand(snapshot, command);
        },
        getTrafficBoardCommandAuditAction(command),
        auditContext
      );
    });
  }

  async reset(boardId: string): Promise<TrafficBoardRecord> {
    return this.enqueueBoardWrite(boardId, async () => (
      this.repository.upsert(boardId, createSeedTrafficSnapshot(), 'board_reset')
    ));
  }

  private async enqueueBoardWrite<T>(boardId: string, operation: () => Promise<T>): Promise<T> {
    const previousWrite = this.boardWriteQueues.get(boardId) ?? Promise.resolve();
    const nextWrite = previousWrite
      .catch(() => undefined)
      .then(operation);

    this.boardWriteQueues.set(boardId, nextWrite);
    try {
      return await nextWrite;
    } finally {
      if (this.boardWriteQueues.get(boardId) === nextWrite) {
        this.boardWriteQueues.delete(boardId);
      }
    }
  }
}

export class TrafficBoardConflictError extends Error {
  constructor(readonly current: TrafficBoardRecord) {
    super('Traffic board changed since this snapshot was loaded.');
    this.name = 'TrafficBoardConflictError';
  }
}
