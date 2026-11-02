import { describe, expect, it } from 'vitest';
import { Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { getPersonPeriodUtilization } from './personUtilization';

const person = {
  id: 'person-1',
  name: 'Unavailable Person',
  role: 'Developer',
  initials: 'UP',
  color: '#000000',
  skillIds: ['backend'],
  costModel: {
    type: 'hourly',
    defaultMonthlyHours: 160,
    internalHourlyCostPln: 100,
  },
  monthlyCostK: 16,
  hoursPerTile: 8,
  layers: { workK: 8, adminK: 10, salesK: 12, targetK: 16 },
  monthlyOverrides: [{ periodId: '2026-03', availableHours: 0 }],
} satisfies Person;

const allocation = {
  id: 'allocation-1',
  personId: person.id,
  tileIndex: 0,
  target: 'project-1',
  periodId: '2026-03',
  mode: 'revenue_first',
  revenueK: 1,
  hours: 8,
} satisfies PersonTileAllocation;

const timeOffProject = {
  id: 'time-off',
  name: 'Urlopy',
  client: 'URLOP',
  contractType: 'fixed_monthly',
  stage: 'signed',
  workType: 'time_off',
  budgetK: 4,
  probability: 1,
  startMonth: 'Marzec 2026',
  startPeriodId: '2026-03',
  rateConfig: { companyTargetRatePlnH: 200 },
  requirements: [],
  revenuePlan: [{ periodId: '2026-03', revenueK: 4 }],
  invoices: [],
  notes: '',
} satisfies ProjectFrame;

describe('person period utilization', () => {
  it('marks unavailable people with productive allocations as over-utilized', () => {
    const utilization = getPersonPeriodUtilization(person, '2026-03', [allocation]);

    expect(utilization.availableHours).toBe(0);
    expect(utilization.allocatedHours).toBe(8);
    expect(utilization.utilizationPercent).toBe(100);
    expect(utilization.status).toBe('over');
  });

  it('ignores bench allocations for utilization', () => {
    const utilization = getPersonPeriodUtilization(person, '2026-03', [{ ...allocation, target: 'bench' }]);

    expect(utilization.allocatedHours).toBe(0);
    expect(utilization.status).toBe('unavailable');
  });

  it('ignores time-off project allocations for productive utilization', () => {
    const utilization = getPersonPeriodUtilization(
      person,
      '2026-03',
      [{ ...allocation, target: timeOffProject.id }],
      new Map([[timeOffProject.id, timeOffProject]])
    );

    expect(utilization.allocatedHours).toBe(0);
    expect(utilization.allocatedRevenueK).toBe(0);
    expect(utilization.status).toBe('unavailable');
  });
});
