import {
  allocationCoversRequirement,
  getEffectiveAllocationRequirement,
  getEffectiveAllocationSkillId,
  hasEnoughSeniority,
  personCanCoverRequirement,
} from './allocationSkills.js';
import {
  calculateAllocationInternalMarginGapK,
  calculateAllocationTargetGapK,
  calculateHoursToInternalCostK,
  calculateHoursToRequiredRevenueK,
  getRequiredRevenueRate,
} from './allocationCalculations.js';
import {
  AllocationValidation,
  Person,
  PersonTileAllocation,
  PlanningRule,
  ProjectFrame,
} from './traffic.model.js';
import {
  formatPlanningRuleConflictMessage,
  getPersonPairPlanningRuleConflicts,
} from './planningRules.js';

function formatMoneyK(value: number | undefined) {
  if (typeof value !== 'number') return '?';
  return Number.isInteger(value) ? `${value}k` : `${value.toFixed(1)}k`;
}

function roundMoneyK(value: number) {
  return Math.round(value * 10) / 10;
}

export function validateAllocation(
  allocation: PersonTileAllocation,
  person: Person | undefined,
  project: ProjectFrame | undefined,
  projectAllocations: PersonTileAllocation[],
  peopleById = new Map<string, Person>(person ? [[person.id, person]] : []),
  planningRules: PlanningRule[] = []
): AllocationValidation[] {
  if (!project || allocation.target === 'bench') return [];

  const validations: AllocationValidation[] = [];
  const requiredRequirements = project.requirements.filter((requirement) => requirement.required);
  const effectiveRequirement = getEffectiveAllocationRequirement(allocation, project, person);
  const effectiveSkillId = getEffectiveAllocationSkillId(allocation, project, person);
  const internalMarginGapK = calculateAllocationInternalMarginGapK(allocation, person);
  const targetGapK = calculateAllocationTargetGapK(allocation, project, person);
  const internalCostK = calculateHoursToInternalCostK(person, allocation.periodId, allocation.hours);
  const requiredRevenueK = calculateHoursToRequiredRevenueK(
    allocation.hours,
    getRequiredRevenueRate(project, effectiveSkillId)
  );
  const targetSurplusK = typeof requiredRevenueK === 'number'
    ? Math.max(0, roundMoneyK(allocation.revenueK - requiredRevenueK))
    : 0;

  if (internalMarginGapK > 0) {
    validations.push({
      code: 'internal_margin_gap',
      severity: 'invalid',
      message: `This allocation generates ${formatMoneyK(allocation.revenueK)} PLN in revenue. The person’s cost for ${allocation.hours}h is ${formatMoneyK(internalCostK)} PLN, leaving ${formatMoneyK(internalMarginGapK)} PLN uncovered.`,
    });
  }

  if (targetGapK > 0) {
    validations.push({
      code: 'target_revenue_gap',
      severity: 'warning',
      message: `This allocation generates ${formatMoneyK(allocation.revenueK)} PLN in revenue. The target for ${allocation.hours}h is ${formatMoneyK(requiredRevenueK)} PLN, leaving a shortfall of ${formatMoneyK(targetGapK)} PLN.`,
    });
  } else if (targetSurplusK > 0) {
    validations.push({
      code: 'target_revenue_surplus',
      severity: 'info',
      message: `This allocation generates ${formatMoneyK(allocation.revenueK)} PLN in revenue. The target for ${allocation.hours}h is ${formatMoneyK(requiredRevenueK)} PLN, exceeding it by ${formatMoneyK(targetSurplusK)} PLN.`,
    });
  }

  if (person && project.blockedPersonIds?.includes(person.id)) {
    validations.push({
      code: 'blocked_person',
      severity: 'invalid',
      message: `${person.name} is blocked from this project.`,
    });
  }

  if (
    person &&
    project.preferredPersonIds?.length &&
    !project.preferredPersonIds.includes(person.id)
  ) {
    validations.push({
      code: 'not_preferred_person',
      severity: 'warning',
      message: `${person.name} is not on the preferred people list for this project.`,
    });
  }

  const collaborationConflicts = getPersonPairPlanningRuleConflicts({
    person,
    peopleById,
    periodId: allocation.periodId,
    planningRules,
    projectAllocations: projectAllocations.filter((item) => item.id !== allocation.id),
    projectId: project.id,
  });
  if (person && collaborationConflicts.length > 0) {
    validations.push(formatPlanningRuleConflictMessage(person, collaborationConflicts));
  }

  if (requiredRequirements.length && !effectiveRequirement) {
    validations.push({
      code: 'missing_required_skill',
      severity: 'invalid',
      message: 'This tile cannot be matched unambiguously to a required project skill.',
    });
  }

  if (effectiveRequirement && person && !personCanCoverRequirement(person, effectiveRequirement)) {
    validations.push({
      code: 'role_mismatch',
      severity: 'warning',
      message: `${person.name} does not have ${effectiveSkillId} in their skill profile.`,
    });
  }

  if (effectiveRequirement && !hasEnoughSeniority(person?.seniority, effectiveRequirement.seniority)) {
    validations.push({
      code: 'insufficient_seniority',
      severity: 'invalid',
      message: `Required seniority: ${effectiveRequirement.seniority}; the person has ${person?.seniority || 'none'}.`,
    });
  }

  requiredRequirements.forEach((requirement) => {
    const coveredHours = projectAllocations
      .filter((item) => allocationCoversRequirement(item, requirement, project, peopleById.get(item.personId)))
      .reduce((sum, item) => sum + item.hours, 0);

    if (coveredHours < requirement.estimatedHours) {
      validations.push({
        code: 'insufficient_hours',
        severity: 'warning',
        message: `${requirement.skillId}: ${coveredHours}/${requirement.estimatedHours}h covered.`,
      });
    }
  });

  return validations;
}
