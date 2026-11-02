import {
  getEffectiveAllocationRequirement,
  type Person,
  type PersonTileAllocation,
  type ProjectFrame,
  type Skill,
} from '../models/traffic.model';
import { getRevenueToHoursRate } from './allocationCalculations';
import { getFrameBehavior } from './visualInventory';

type AllocationValidationItem = NonNullable<PersonTileAllocation['validation']>[number];

export interface MissingRequirementPlaceholder {
  id: string;
  skillLabel: string;
  missingHours: number;
  slotCount: number;
}

export interface ProjectValidationSummaryItem {
  id: string;
  personName: string;
  severity: AllocationValidationItem['severity'];
  count: number;
  details: Array<{
    key: string;
    requirementLabel: string;
    message: string;
    count: number;
  }>;
}

const validationSeverityRank: Record<AllocationValidationItem['severity'], number> = {
  info: 0,
  warning: 1,
  invalid: 2,
};

export function formatRevenueK(value: number) {
  return Number.isInteger(value) ? `${value}k` : `${value.toFixed(1)}k`;
}

export function formatHours(hours: number) {
  return Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 10) / 10);
}

export function getFrameBehaviorLabel(frameBehavior: ReturnType<typeof getFrameBehavior>) {
  switch (frameBehavior) {
    case 'elastic':
      return 'ramka elastyczna';
    case 'capped':
      return 'ramka z limitem';
    case 'pooled':
      return 'ramka z pulą';
  }
}

export function getProjectValidationSummaryItems({
  allocations,
  peopleById,
  project,
  skillsById,
}: {
  allocations: PersonTileAllocation[];
  peopleById: Map<string, Person>;
  project: ProjectFrame;
  skillsById: Map<string, Skill>;
}): ProjectValidationSummaryItem[] {
  return Array.from(allocations.reduce((result, allocation) => {
    (allocation.validation || []).forEach((validation) => {
      const person = peopleById.get(allocation.personId);
      const personName = person?.name || allocation.personId;
      const requirement = getEffectiveAllocationRequirement(allocation, project, person);
      const skill = requirement ? skillsById.get(requirement.skillId) : undefined;
      const requirementLabel = requirement
        ? `${skill?.label || requirement.skillId}${requirement.seniority ? ` ${requirement.seniority}` : ''}`
        : 'Bez przypisanego wymagania';
      const key = allocation.personId;
      const detailKey = `${validation.severity}:${validation.code}:${requirementLabel}:${validation.message}`;
      const current = result.get(key);
      const currentDetails = current?.details || [];
      const detailIndex = currentDetails.findIndex((detail) => detail.key === detailKey);
      const details = detailIndex >= 0
        ? currentDetails.map((detail, index) => (
          index === detailIndex ? { ...detail, count: detail.count + 1 } : detail
        ))
        : [
          ...currentDetails,
          {
            key: detailKey,
            requirementLabel,
            message: validation.message,
            count: 1,
          },
        ];

      result.set(key, {
        id: key,
        personName,
        severity: current && validationSeverityRank[current.severity] > validationSeverityRank[validation.severity]
          ? current.severity
          : validation.severity,
        count: (current?.count || 0) + 1,
        details,
      });
    });
    return result;
  }, new Map<string, ProjectValidationSummaryItem>()).values());
}

export function getMissingRequirementPlaceholders(
  project: ProjectFrame,
  skillsById: Map<string, Skill>,
  allocatedHoursBySkill: Record<string, number>
): MissingRequirementPlaceholder[] {
  if (!project.requirements.length) return [];

  return project.requirements.flatMap((requirement) => {
    const missingHours = Math.max(0, requirement.estimatedHours - (allocatedHoursBySkill[requirement.skillId] || 0));
    if (missingHours <= 0) return [];

    const skill = skillsById.get(requirement.skillId);
    const projectRatePlnH = getRevenueToHoursRate(project, requirement.skillId, project.startPeriodId) || 200;
    const hoursPerRevenueTile = 1000 / projectRatePlnH;

    return [{
      id: `${project.id}-${requirement.id}`,
      skillLabel: `${skill?.label || requirement.skillId}${requirement.seniority ? ` ${requirement.seniority}` : ''}`,
      missingHours,
      slotCount: Math.max(1, Math.ceil(missingHours / hoursPerRevenueTile)),
    }];
  });
}
