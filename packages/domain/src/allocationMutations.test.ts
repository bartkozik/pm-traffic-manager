import { describe, expect, it } from 'vitest';
import { createSeedTrafficSnapshot } from './seed.js';
import { moveTrafficAllocations } from './allocationMutations.js';

describe('moveTrafficAllocations', () => {
  it('moves a tile to a project and maps the matching requirement server-side', () => {
    const snapshot = createSeedTrafficSnapshot();
    const project = snapshot.projects.find((item) => item.id === 'alfa');
    const allocation = snapshot.allocations.find((item) => item.personId === 'tomasz');

    if (!project || !allocation) throw new Error('Seed data is missing expected project or allocation.');

    const moved = moveTrafficAllocations(snapshot, [{
      tileId: allocation.id,
      target: project.id,
    }], snapshot.activePeriodId);
    const movedAllocation = moved.allocations.find((item) => item.id === allocation.id);

    expect(movedAllocation?.target).toBe(project.id);
    expect(movedAllocation?.skillId).toBe('backend');
    expect(movedAllocation?.requirementId).toBe('alfa-backend');
  });

  it('uses the selected requirement when a tile is dropped on a project skill zone', () => {
    const snapshot = createSeedTrafficSnapshot();
    const project = snapshot.projects.find((item) => item.id === 'beta');
    const allocation = snapshot.allocations.find((item) => item.personId === 'anna');

    if (!project || !allocation) throw new Error('Seed data is missing expected project or allocation.');

    const moved = moveTrafficAllocations(snapshot, [{
      tileId: allocation.id,
      target: project.id,
      requirementId: 'beta-frontend',
      projectSlotIndex: 3,
    }], snapshot.activePeriodId);
    const movedAllocation = moved.allocations.find((item) => item.id === allocation.id);

    expect(movedAllocation?.target).toBe(project.id);
    expect(movedAllocation?.skillId).toBe('frontend');
    expect(movedAllocation?.requirementId).toBe('beta-frontend');
    expect(movedAllocation?.projectSlotIndex).toBe(3);
  });

  it('can skip automatic requirement suggestion for generic drops on zoned projects', () => {
    const snapshot = createSeedTrafficSnapshot();
    const project = snapshot.projects.find((item) => item.id === 'alfa');
    const allocation = snapshot.allocations.find((item) => item.personId === 'tomasz');

    if (!project || !allocation) throw new Error('Seed data is missing expected project or allocation.');

    const moved = moveTrafficAllocations(snapshot, [{
      tileId: allocation.id,
      target: project.id,
      skipRequirementSuggestion: true,
    }], snapshot.activePeriodId);
    const movedAllocation = moved.allocations.find((item) => item.id === allocation.id);

    expect(movedAllocation?.target).toBe(project.id);
    expect(movedAllocation?.skillId).toBeUndefined();
    expect(movedAllocation?.requirementId).toBeUndefined();
  });

  it('gives the dropped tile priority when two allocations target the same project slot', () => {
    const snapshot = createSeedTrafficSnapshot();
    const project = snapshot.projects.find((item) => item.id === 'beta');
    const pinnedAllocation = snapshot.allocations.find((item) => item.personId === 'anna');
    const movedAllocation = snapshot.allocations.find((item) => item.personId === 'marek');

    if (!project || !pinnedAllocation || !movedAllocation) {
      throw new Error('Seed data is missing expected project or allocations.');
    }

    const slotIndex = 5;
    const snapshotWithPinnedAllocation = {
      ...snapshot,
      allocations: snapshot.allocations.map((allocation) => (
        allocation.id === pinnedAllocation.id
          ? {
            ...allocation,
            target: project.id,
            skillId: 'frontend' as const,
            requirementId: 'beta-frontend',
            projectSlotIndex: slotIndex,
          }
          : allocation
      )),
    };

    const moved = moveTrafficAllocations(snapshotWithPinnedAllocation, [{
      tileId: movedAllocation.id,
      target: project.id,
      requirementId: 'beta-frontend',
      projectSlotIndex: slotIndex,
    }], snapshot.activePeriodId);
    const nextPinnedAllocation = moved.allocations.find((item) => item.id === pinnedAllocation.id);
    const nextMovedAllocation = moved.allocations.find((item) => item.id === movedAllocation.id);

    expect(nextPinnedAllocation?.projectSlotIndex).toBeUndefined();
    expect(nextMovedAllocation?.projectSlotIndex).toBe(slotIndex);
    expect(nextMovedAllocation?.requirementId).toBe('beta-frontend');
  });
});
