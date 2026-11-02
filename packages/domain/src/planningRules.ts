import {
  AllocationValidation,
  Person,
  PersonTileAllocation,
  PlanningRule,
  PlanningRuleTimeScope,
} from './traffic.model.js';

export interface PersonPairPlanningRuleInput {
  timeScope?: PlanningRuleTimeScope;
  periodId?: string;
  personAId: string;
  personBId: string;
  projectId?: string;
}

export interface PlanningRuleConflict {
  person: Person;
  rule?: PlanningRule;
  source: 'planning_rule' | 'legacy_person_block';
}

export function normalizePersonPair(personAId: string, personBId: string): [string, string] {
  return [personAId, personBId].sort((a, b) => a.localeCompare(b)) as [string, string];
}

export function createPersonPairPlanningRuleId(input: PersonPairPlanningRuleInput) {
  const [personAId, personBId] = normalizePersonPair(input.personAId, input.personBId);
  return [
    'person-pair-block',
    sanitizeRuleIdPart(getPlanningRuleScopeId(input)),
    sanitizeRuleIdPart(input.projectId || 'all'),
    sanitizeRuleIdPart(personAId),
    sanitizeRuleIdPart(personBId),
  ].join(':');
}

export function getPlanningRuleTimeScope(rule: Pick<PlanningRule, 'timeScope' | 'periodId'>): PlanningRuleTimeScope {
  return rule.timeScope || (rule.periodId ? 'period' : 'permanent');
}

export function isPlanningRuleActiveInPeriod(rule: PlanningRule, periodId: string) {
  const timeScope = getPlanningRuleTimeScope(rule);
  return timeScope === 'permanent' || rule.periodId === periodId;
}

export function normalizePlanningRule(rule: PlanningRule): PlanningRule {
  if (rule.type !== 'person_pair_block') return rule;
  const [personAId, personBId] = normalizePersonPair(rule.personAId, rule.personBId);
  const timeScope = getPlanningRuleTimeScope(rule);
  const periodId = timeScope === 'period' ? rule.periodId : undefined;
  return {
    ...rule,
    id: rule.id || createPersonPairPlanningRuleId({ ...rule, timeScope, periodId, personAId, personBId }),
    timeScope,
    periodId,
    personAId,
    personBId,
    projectId: rule.projectId || undefined,
    severity: rule.severity || 'hard',
  };
}

export function createPersonPairPlanningRule(input: PersonPairPlanningRuleInput & {
  reason?: string;
  severity?: PlanningRule['severity'];
  now?: string;
}): PlanningRule {
  const now = input.now || new Date().toISOString();
  const timeScope = input.timeScope || (input.periodId ? 'period' : 'permanent');
  if (timeScope === 'period' && !input.periodId) {
    throw new Error('Period-scoped planning rule requires periodId.');
  }
  const periodId = timeScope === 'period' ? input.periodId : undefined;
  const [personAId, personBId] = normalizePersonPair(input.personAId, input.personBId);
  return {
    id: createPersonPairPlanningRuleId({ ...input, timeScope, periodId, personAId, personBId }),
    type: 'person_pair_block',
    timeScope,
    periodId,
    personAId,
    personBId,
    projectId: input.projectId || undefined,
    severity: input.severity || 'hard',
    reason: input.reason?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertPlanningRules(currentRules: PlanningRule[] = [], nextRules: PlanningRule[]) {
  const rulesById = new Map(currentRules.map((rule) => [rule.id, normalizePlanningRule(rule)]));
  nextRules.map(normalizePlanningRule).forEach((rule) => {
    const currentRule = rulesById.get(rule.id);
    rulesById.set(rule.id, {
      ...currentRule,
      ...rule,
      createdAt: currentRule?.createdAt || rule.createdAt,
      updatedAt: rule.updatedAt || new Date().toISOString(),
    });
  });
  return Array.from(rulesById.values());
}

export function deletePlanningRule(currentRules: PlanningRule[] = [], ruleId: string) {
  return currentRules.filter((rule) => rule.id !== ruleId);
}

export function getActivePlanningRules(
  planningRules: PlanningRule[] = [],
  periodId: string,
  projectId?: string
) {
  return planningRules
    .map(normalizePlanningRule)
    .filter((rule) => isPlanningRuleActiveInPeriod(rule, periodId))
    .filter((rule) => !rule.projectId || rule.projectId === projectId);
}

export function getPersonPairPlanningRuleConflicts({
  person,
  peopleById,
  periodId,
  planningRules = [],
  projectAllocations,
  projectId,
}: {
  person: Person | undefined;
  peopleById: Map<string, Person>;
  periodId: string;
  planningRules?: PlanningRule[];
  projectAllocations: PersonTileAllocation[];
  projectId?: string;
}): PlanningRuleConflict[] {
  if (!person) return [];

  const conflicts = new Map<string, PlanningRuleConflict>();
  projectAllocations
    .filter((allocation) => allocation.personId !== person.id)
    .map((allocation) => peopleById.get(allocation.personId))
    .filter((otherPerson): otherPerson is Person => Boolean(otherPerson))
    .forEach((otherPerson) => {
      const rule = getActivePersonPairRuleBetween(planningRules, periodId, person.id, otherPerson.id, projectId);
      if (rule) {
        conflicts.set(otherPerson.id, { person: otherPerson, rule, source: 'planning_rule' });
        return;
      }

      if (hasLegacyPersonPairBlock(person, otherPerson)) {
        conflicts.set(otherPerson.id, { person: otherPerson, source: 'legacy_person_block' });
      }
    });

  return Array.from(conflicts.values());
}

export function hasHardPersonPairPlanningConflict({
  candidatePersonId,
  existingPersonIds,
  peopleById,
  periodId,
  planningRules = [],
  projectId,
}: {
  candidatePersonId: string;
  existingPersonIds: string[];
  peopleById: Map<string, Person>;
  periodId: string;
  planningRules?: PlanningRule[];
  projectId?: string;
}) {
  const candidate = peopleById.get(candidatePersonId);
  if (!candidate) return false;

  return existingPersonIds.some((existingPersonId) => {
    if (existingPersonId === candidatePersonId) return false;
    const existingPerson = peopleById.get(existingPersonId);
    if (!existingPerson) return false;
    const rule = getActivePersonPairRuleBetween(planningRules, periodId, candidatePersonId, existingPersonId, projectId);
    if (rule?.severity === 'hard') return true;
    return hasLegacyPersonPairBlock(candidate, existingPerson);
  });
}

export function formatPlanningRuleConflictMessage(
  person: Person,
  conflicts: PlanningRuleConflict[]
): AllocationValidation {
  const names = conflicts.map((conflict) => conflict.person.name).join(', ');
  const reasons = Array.from(new Set(conflicts.map((conflict) => conflict.rule?.reason).filter(Boolean)));
  return {
    code: 'person_collaboration_conflict',
    severity: 'warning',
    message: `${person.name} nie powinien/powinna pracować w tym projekcie z: ${names}.${reasons.length ? ` Powód: ${reasons.join('; ')}.` : ''}`,
  };
}

function getActivePersonPairRuleBetween(
  planningRules: PlanningRule[],
  periodId: string,
  personAId: string,
  personBId: string,
  projectId?: string
) {
  const [normalizedAId, normalizedBId] = normalizePersonPair(personAId, personBId);
  return getActivePlanningRules(planningRules, periodId, projectId).find((rule) => (
    rule.type === 'person_pair_block' &&
    rule.personAId === normalizedAId &&
    rule.personBId === normalizedBId
  ));
}

function hasLegacyPersonPairBlock(person: Person, otherPerson: Person) {
  return (
    Boolean(person.blockedCollaborationPersonIds?.includes(otherPerson.id)) ||
    Boolean(otherPerson.blockedCollaborationPersonIds?.includes(person.id))
  );
}

function sanitizeRuleIdPart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
}

function getPlanningRuleScopeId(rule: PersonPairPlanningRuleInput) {
  const timeScope = rule.timeScope || (rule.periodId ? 'period' : 'permanent');
  if (timeScope === 'permanent') return 'permanent';
  return rule.periodId || 'period';
}
