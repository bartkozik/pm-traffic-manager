import {
  CostLayers,
  Hours,
  MoneyK,
  MonthlyOverrideStatus,
  MonthlyPersonOverride,
  Person,
  PersonPeriodProfileSnapshot,
  PersonTileAllocation,
  Period,
} from './traffic.model.js';

const monthlyOverrideStatusLabels: Record<MonthlyOverrideStatus, string> = {
  holiday: 'urlop',
  notice_period: 'okres wypowiedzenia',
  partial_availability: 'czesciowa dostepnosc',
  unavailable: 'niedostepny',
  other: 'inne',
};

export function getPersonPeriodOverride(person: Person, periodId: string) {
  return person.monthlyOverrides?.find((entry) => entry.periodId === periodId);
}

export function getPersonPeriodProfile(person: Person, periodId: string): Person {
  const profile = getPersonPeriodOverride(person, periodId)?.profile;
  if (!profile) return person;

  return {
    ...person,
    role: profile.role,
    skillIds: [...profile.skillIds],
    seniority: profile.seniority ?? undefined,
    costModel: { ...profile.costModel },
    monthlyCostK: profile.monthlyCostK,
    hoursPerTile: profile.hoursPerTile,
    layers: { ...profile.layers },
  };
}

export function createPersonPeriodProfileSnapshot(person: Person, periodId: string): PersonPeriodProfileSnapshot {
  const periodProfile = getPersonPeriodProfile(person, periodId);

  return {
    role: periodProfile.role,
    skillIds: [...periodProfile.skillIds],
    seniority: periodProfile.seniority ?? null,
    costModel: { ...periodProfile.costModel },
    monthlyCostK: periodProfile.monthlyCostK,
    hoursPerTile: periodProfile.hoursPerTile,
    layers: { ...periodProfile.layers },
  };
}

export function getPersonPeriodLayers(person: Person, periodId: string): CostLayers {
  return getPersonPeriodOverride(person, periodId)?.layers || getPersonPeriodProfile(person, periodId).layers;
}

export function getPersonPeriodHoursPerTile(person: Person, periodId: string): Hours {
  return getPersonPeriodProfile(person, periodId).hoursPerTile;
}

export function getPersonPeriodAvailableHours(person: Person, periodId: string): Hours {
  const override = getPersonPeriodOverride(person, periodId);
  return override?.availableHours ?? getPersonPeriodProfile(person, periodId).costModel.defaultMonthlyHours;
}

export function getPersonPeriodCostK(person: Person, periodId: string): MoneyK {
  const override = getPersonPeriodOverride(person, periodId);
  const profile = getPersonPeriodProfile(person, periodId);
  if (typeof override?.fixedMonthlyCostK === 'number') return override.fixedMonthlyCostK;

  const internalHourlyCostPln = override?.internalHourlyCostPln ?? profile.costModel.internalHourlyCostPln;
  const hasHourlyOverride = typeof override?.availableHours === 'number' || typeof override?.internalHourlyCostPln === 'number';

  if (
    typeof internalHourlyCostPln === 'number' &&
    hasHourlyOverride &&
    profile.costModel.type !== 'fixed_monthly'
  ) {
    const availableHours = override?.availableHours ?? profile.costModel.defaultMonthlyHours;
    return Math.round((availableHours * internalHourlyCostPln) / 1000);
  }

  return profile.monthlyCostK;
}

export function getPersonPeriodCostTileCount(person: Person, periodId: string) {
  const periodCostK = getPersonPeriodCostK(person, periodId);
  return periodCostK > 0 ? Math.ceil(periodCostK) : 0;
}

export function filterPersonCostCapacityAllocations(
  allocations: PersonTileAllocation[],
  peopleById: Map<string, Person>
) {
  return allocations.filter((allocation) => {
    const person = peopleById.get(allocation.personId);
    if (!person) return true;
    return allocation.tileIndex < getPersonPeriodCostTileCount(person, allocation.periodId);
  });
}

export function getPersonPeriodStatus(person: Person, periodId: string) {
  const override = getPersonPeriodOverride(person, periodId);
  const profile = getPersonPeriodProfile(person, periodId);
  const statusLabel = override?.status ? monthlyOverrideStatusLabels[override.status] : null;
  if (!override?.availableHours && override?.availableHours !== 0) return statusLabel;

  const hoursLabel = override.availableHours === 0
    ? 'niedostepny'
    : override.availableHours < profile.costModel.defaultMonthlyHours
      ? `${override.availableHours}h dostepne`
      : `${override.availableHours}h`;

  return statusLabel ? `${statusLabel} - ${hoursLabel}` : hoursLabel;
}

export function upsertMonthlyOverride(
  person: Person,
  periodId: string,
  patch: Omit<MonthlyPersonOverride, 'periodId'>
): Person {
  const mergedOverride: MonthlyPersonOverride = {
    ...getPersonPeriodOverride(person, periodId),
    ...patch,
    periodId,
  };
  const nextOverride: MonthlyPersonOverride = {
    periodId,
    ...(typeof mergedOverride.availableHours === 'number' ? { availableHours: mergedOverride.availableHours } : {}),
    ...(typeof mergedOverride.internalHourlyCostPln === 'number' ? { internalHourlyCostPln: mergedOverride.internalHourlyCostPln } : {}),
    ...(typeof mergedOverride.fixedMonthlyCostK === 'number' ? { fixedMonthlyCostK: mergedOverride.fixedMonthlyCostK } : {}),
    ...(mergedOverride.layers ? { layers: mergedOverride.layers } : {}),
    ...(mergedOverride.profile ? { profile: mergedOverride.profile } : {}),
    ...(mergedOverride.status ? { status: mergedOverride.status } : {}),
    ...(mergedOverride.note?.trim() ? { note: mergedOverride.note.trim() } : {}),
  };
  const hasOverride =
    typeof nextOverride.availableHours === 'number' ||
    typeof nextOverride.internalHourlyCostPln === 'number' ||
    typeof nextOverride.fixedMonthlyCostK === 'number' ||
    Boolean(nextOverride.layers) ||
    Boolean(nextOverride.profile) ||
    Boolean(nextOverride.status) ||
    Boolean(nextOverride.note);

  if (!hasOverride) {
    return removeMonthlyOverride(person, periodId);
  }

  return {
    ...person,
    monthlyOverrides: [
      ...(person.monthlyOverrides || []).filter((entry) => entry.periodId !== periodId),
      nextOverride,
    ],
  };
}

export function removeMonthlyOverride(person: Person, periodId: string): Person {
  return {
    ...person,
    monthlyOverrides: (person.monthlyOverrides || []).filter((entry) => entry.periodId !== periodId),
  };
}

export function applyPersonProfileUpdateFromPeriod(
  previousPerson: Person | undefined,
  nextPerson: Person,
  activePeriodId: string,
  periods: Period[],
  allocations: PersonTileAllocation[] = []
): Person {
  if (!previousPerson || !hasBaseProfileChanged(previousPerson, nextPerson)) return nextPerson;

  const activePeriod = periods.find((period) => period.id === activePeriodId && period.granularity === 'month');
  if (!activePeriod) return nextPerson;

  const nextOverrides = new Map((nextPerson.monthlyOverrides || []).map((override) => [override.periodId, override]));
  periods
    .filter((period) => (
      period.granularity === 'month' &&
      period.startsOn < activePeriod.startsOn &&
      hasPersonStateInPeriod(previousPerson, allocations, period.id)
    ))
    .forEach((period) => {
      const currentOverride = nextOverrides.get(period.id);
      nextOverrides.set(period.id, {
        ...currentOverride,
        periodId: period.id,
        profile: currentOverride?.profile || createPersonPeriodProfileSnapshot(previousPerson, period.id),
      });
    });

  const monthlyOverrides = Array.from(nextOverrides.values())
    .sort((first, second) => first.periodId.localeCompare(second.periodId));

  return {
    ...nextPerson,
    monthlyOverrides: monthlyOverrides.length ? monthlyOverrides : undefined,
  };
}

function hasPersonStateInPeriod(
  person: Person,
  allocations: PersonTileAllocation[],
  periodId: string
) {
  return (
    person.monthlyOverrides?.some((override) => override.periodId === periodId) ||
    allocations.some((allocation) => allocation.personId === person.id && allocation.periodId === periodId)
  );
}

function hasBaseProfileChanged(previousPerson: Person, nextPerson: Person) {
  return JSON.stringify(createBaseProfileSnapshot(previousPerson)) !== JSON.stringify(createBaseProfileSnapshot(nextPerson));
}

function createBaseProfileSnapshot(person: Person): PersonPeriodProfileSnapshot {
  return {
    role: person.role,
    skillIds: [...person.skillIds],
    seniority: person.seniority ?? null,
    costModel: { ...person.costModel },
    monthlyCostK: person.monthlyCostK,
    hoursPerTile: person.hoursPerTile,
    layers: { ...person.layers },
  };
}
