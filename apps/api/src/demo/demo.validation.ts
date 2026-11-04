import { getPersonPeriodCostTileCount, getPersonPeriodAvailableHours, type Person, type MonthlyPersonOverride, type PersonPeriodProfileSnapshot, type ProjectFrame, type TrafficBoardCommand, type TrafficSnapshot } from '@ptm/domain';
import { DemoError } from './demo.errors.js';

const MAX_PEOPLE = 24;
const MAX_MONTHS = 6;
const MAX_TILES = 3000;

export function validateDemoSnapshot(snapshot: TrafficSnapshot) {
  validateTree(snapshot);
  boundedArray(snapshot.people, MAX_PEOPLE);
  boundedArray(snapshot.projects, 24);
  boundedArray(snapshot.periods, MAX_MONTHS * 6);
  boundedArray(snapshot.allocations, MAX_TILES);
  boundedArray(snapshot.weeklyAllocations ?? [], MAX_TILES);
  boundedArray(snapshot.planningRules ?? [], 100);
  boundedArray(snapshot.skills, 24);
  boundedArray(snapshot.tileUnits, 12);
  for (const entities of [snapshot.people, snapshot.projects, snapshot.periods, snapshot.allocations, snapshot.weeklyAllocations ?? [], snapshot.planningRules ?? [], snapshot.skills, snapshot.tileUnits]) uniqueIds(entities);
  const months = snapshot.periods.filter((period) => period.granularity === 'month').map((period) => period.id);
  if (months.length === 0 || months.length > MAX_MONTHS || new Set(months).size !== months.length) throw limit();
  for (const period of snapshot.periods) {
    const month = period.granularity === 'month' ? period.id : period.parentPeriodId;
    validMonth(month);
    const start = Date.parse(`${period.startsOn}T00:00:00Z`);
    const end = Date.parse(`${period.endsOn}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 30 * 86400000 || !period.startsOn.startsWith(`${month}-`) || !period.endsOn.startsWith(`${month}-`)) throw limit();
    if (new Date(start).toISOString().slice(0, 10) !== period.startsOn || new Date(end).toISOString().slice(0, 10) !== period.endsOn) throw limit();
    if (period.granularity !== 'month' && (period.granularity !== 'week' || end - start > 6 * 86400000 || !months.includes(month!))) throw limit();
  }
  validateCapacity(snapshot.people, months);
  for (const project of snapshot.projects) validateProject(project);
}

export function validateDemoCommand(snapshot: TrafficSnapshot, command: TrafficBoardCommand) {
  validateTree(command);
  if (command.type === 'board.reset') throw new DemoError(400, 'DEMO_RESET_REQUIRED', 'Use Reset demo to create a fresh isolated board.');
  let people = snapshot.people;
  const months = new Set(snapshot.periods.filter((period) => period.granularity === 'month').map((period) => period.id));
  if (command.type === 'person.create' || command.type === 'person.update') {
    people = [...people.filter((person) => person.id !== command.person.id), command.person];
  }
  if (command.type === 'person.restore' && command.periodIds) boundedArray(command.periodIds, MAX_MONTHS);
  if (command.type === 'period.ensureCapacity' && !months.has(command.periodId)) throw limit();
  if (command.type === 'period.ensureRange') {
    boundedNumber(command.monthCount, 1, MAX_MONTHS);
    if (!Number.isInteger(command.monthCount) || !months.has(command.fromPeriodId)) throw limit();
    for (let index = 0; index < command.monthCount; index += 1) {
      const date = new Date(`${command.fromPeriodId}-01T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + index);
      months.add(date.toISOString().slice(0, 7));
    }
  }
  if (command.type === 'period.createMonth') { validMonth(command.periodId); months.add(command.periodId); }
  if (command.type === 'period.pasteMonthPlan') {
    boundedArray(command.people, MAX_PEOPLE);
    boundedArray(command.projects, 24);
    boundedArray(command.allocations, MAX_TILES);
    uniqueIds(command.people, 'personId');
    uniqueIds(command.projects, 'projectId');
    for (const copy of command.people) {
      if (copy.monthlyOverride) validateMonthlyOverride(copy.monthlyOverride);
      if (!snapshot.people.some((person) => person.id === copy.personId)) throw limit();
    }
    for (const copy of command.projects) if (!snapshot.projects.some((project) => project.id === copy.projectId)) throw limit();
    if (!months.has(command.targetPeriodId)) throw limit();
    people = people.map((person) => {
      const copy = command.people.find((candidate) => candidate.personId === person.id);
      if (!copy) return person;
      return { ...person, monthlyOverrides: [...(person.monthlyOverrides ?? []).filter((override) => override.periodId !== command.targetPeriodId), ...(copy.monthlyOverride ? [{ ...copy.monthlyOverride, periodId: command.targetPeriodId }] : [])] };
    });
  }
  if (command.type === 'project.create' || command.type === 'project.update') {
    validateProject(command.project);
    if (snapshot.projects.filter((project) => project.id !== command.project.id).length >= 24) throw limit();
  }
  if (command.type === 'planningRules.upsertMany') {
    boundedArray(command.planningRules, 100);
    uniqueIds(command.planningRules);
    if (new Set([...snapshot.planningRules ?? [], ...command.planningRules].map((rule) => rule.id)).size > 100) throw limit();
  }
  if (command.type === 'allocations.move' || command.type === 'weeklyAllocations.move') boundedArray(command.moves, 200);
  if (months.size > MAX_MONTHS) throw limit();
  validateCapacity(people, [...months]);
}

function validateCapacity(people: Person[], months: string[]) {
  boundedArray(people, MAX_PEOPLE);
  uniqueIds(people);
  let totalTiles = 0;
  let totalWeeklySlots = 0;
  for (const person of people) {
    validateProfile(person);
    boundedArray(person.monthlyOverrides ?? [], 12);
    uniqueIds(person.monthlyOverrides ?? [], 'periodId');
    const checkedPeriods = new Set([...months, ...(person.monthlyOverrides ?? []).map((override) => override.periodId)]);
    for (const override of person.monthlyOverrides ?? []) validateMonthlyOverride(override);
    for (const period of checkedPeriods) {
      const tiles = getPersonPeriodCostTileCount(person, period);
      boundedNumber(tiles, 0, 100);
      const hours = getPersonPeriodAvailableHours(person, period);
      boundedNumber(hours, 0, 320);
      if (months.includes(period)) { totalTiles += tiles; totalWeeklySlots += Math.ceil(hours / 8); }
    }
  }
  if (totalTiles > MAX_TILES || totalWeeklySlots > MAX_TILES) throw limit();
}

function validateMonthlyOverride(override: MonthlyPersonOverride) {
  validMonth(override.periodId);
  if (override.availableHours !== undefined) boundedNumber(override.availableHours, 0, 320);
  if (override.fixedMonthlyCostK !== undefined) boundedNumber(override.fixedMonthlyCostK, 0, 100);
  if (override.internalHourlyCostPln !== undefined) boundedNumber(override.internalHourlyCostPln, 0, 10000);
  if (override.profile) validateProfile(override.profile);
}

function validateProfile(profile: PersonPeriodProfileSnapshot | Person) {
  if (!profile || !profile.costModel || !profile.layers) throw limit();
  boundedArray(profile.skillIds, 24);
  boundedNumber(profile.monthlyCostK, 0, 100);
  boundedNumber(profile.hoursPerTile, 0.1, 320);
  boundedNumber(profile.costModel.defaultMonthlyHours, 0, 320);
  if (!['fixed_monthly', 'hourly', 'monthly_override'].includes(profile.costModel.type)) throw limit();
  if (profile.costModel.internalHourlyCostPln !== undefined) boundedNumber(profile.costModel.internalHourlyCostPln, 0, 10000);
  if (profile.costModel.fixedMonthlyCostK !== undefined) boundedNumber(profile.costModel.fixedMonthlyCostK, 0, 100);
  for (const value of Object.values(profile.layers)) boundedNumber(value, 0, 1000);
}

function validateProject(project: ProjectFrame) {
  if (!project) throw limit();
  boundedArray(project.requirements, 24);
  boundedArray(project.revenuePlan, 12);
  boundedArray(project.weeklyRevenuePlan ?? [], 36);
  boundedArray(project.invoices, 24);
  uniqueIds(project.requirements);
  uniqueIds(project.revenuePlan, 'periodId');
  uniqueIds(project.weeklyRevenuePlan ?? [], 'weekPeriodId');
  uniqueIds(project.invoices);
  boundedNumber(project.budgetK, 0, 1000);
  boundedNumber(project.probability, 0, 1);
}

function validateTree(value: unknown) {
  let nodes = 0;
  function visit(current: unknown, depth: number) {
    nodes += 1;
    if (nodes > 100000 || depth > 16) throw limit();
    if (typeof current === 'number' && (!Number.isFinite(current) || Math.abs(current) > 1000000)) throw limit();
    if (typeof current === 'string' && current.length > 4000) throw limit();
    if (Array.isArray(current)) { boundedArray(current, MAX_TILES); for (const child of current) visit(child, depth + 1); }
    else if (current && typeof current === 'object') {
      const entries = Object.entries(current);
      if (entries.length > 100) throw limit();
      for (const [key, child] of entries) { if (key.length > 120) throw limit(); visit(child, depth + 1); }
    }
  }
  visit(value, 0);
}
function uniqueIds(entities: unknown[], field = 'id') {
  const ids = new Set<string>();
  for (const entity of entities) {
    const id = entity && typeof entity === 'object' ? (entity as Record<string, unknown>)[field] : undefined;
    if (typeof id !== 'string' || !id || id.length > 120 || ids.has(id)) throw limit();
    ids.add(id);
  }
}
function validMonth(value: unknown) { if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw limit(); }
function boundedArray(value: unknown, max: number) { if (!Array.isArray(value) || value.length > max) throw limit(); }
function boundedNumber(value: unknown, min: number, max: number) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw limit(); }
function limit() { return new DemoError(400, 'DEMO_BOARD_LIMIT', 'This change exceeds the demo board limits. Use up to 24 people, 6 months and 100 cost tiles per person.'); }
