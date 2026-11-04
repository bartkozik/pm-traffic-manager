import { describe, expect, it } from 'vitest';
import { trafficSnapshotSchema } from '@ptm/contracts';
import { createDemoSnapshot } from './demo.seed.js';

describe('current demo seed', () => {
  it.each(['2027-02-01', '2028-02-29', '2026-12-31'])('preserves references and valid calendar periods for %s', (date) => {
    const snapshot = createDemoSnapshot(new Date(`${date}T12:00:00Z`));
    expect(trafficSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.activePeriodId).toBe(date.slice(0, 7));
    const periodIds = new Set(snapshot.periods.map((period) => period.id));
    for (const allocation of snapshot.allocations) expect(periodIds.has(allocation.periodId)).toBe(true);
    for (const project of snapshot.projects) {
      expect(periodIds.has(project.startPeriodId)).toBe(true);
      if (project.endPeriodId) expect(periodIds.has(project.endPeriodId)).toBe(true);
      for (const revenue of project.revenuePlan) expect(periodIds.has(revenue.periodId)).toBe(true);
    }
    for (const period of snapshot.periods) {
      expect(new Date(`${period.startsOn}T00:00:00Z`).toISOString().slice(0, 10)).toBe(period.startsOn);
      expect(new Date(`${period.endsOn}T00:00:00Z`).toISOString().slice(0, 10)).toBe(period.endsOn);
      expect(period.startsOn <= period.endsOn).toBe(true);
    }
  });
});
