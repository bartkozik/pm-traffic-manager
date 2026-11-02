import {
  calculateHoursToRequiredRevenueK,
  calculateRevenueToHours,
  getEffectiveAllocationRequirement,
  getRevenueToHoursRate,
  Person,
  PersonTileAllocation,
  ProjectFrame,
  ProjectRequirement,
  Skill,
  SkillId,
  TileUnit,
} from '../models/traffic.model';

export interface ProjectSkillZone {
  id: string;
  requirementId: string;
  skillId: SkillId;
  skillLabel: string;
  color: string;
  estimatedHours: number;
  tileCountK: number;
  coveredRevenueK: number;
  share: number;
  isCovered: boolean;
}

export interface ProjectSkillZoneSlot {
  slotIndex: number;
  zone: ProjectSkillZone;
  isZoneStart: boolean;
}

const projectSkillZoneColors: Record<SkillId, string> = {
  backend: '#2563eb',
  frontend: '#16a34a',
  fullstack: '#7c3aed',
  design: '#db2777',
  qa: '#0891b2',
  pm: '#d97706',
  devops: '#ea580c',
  mobile: '#0d9488',
};

export function getProjectSkillZoneColor(skillId: SkillId) {
  return projectSkillZoneColors[skillId] || '#64748b';
}

export function getRequirementTileCountK(
  project: ProjectFrame,
  requirement: Pick<ProjectRequirement, 'skillId' | 'estimatedHours'>,
  periodId: string
) {
  const rate = getRevenueToHoursRate(project, requirement.skillId, periodId);
  const tileCountK = calculateHoursToRequiredRevenueK(requirement.estimatedHours, rate);
  return typeof tileCountK === 'number' ? roundOneDecimal(tileCountK) : 0;
}

export function getRequirementHoursForTileCountK(
  project: ProjectFrame,
  skillId: SkillId,
  periodId: string,
  tileCountK: number
) {
  const hours = calculateRevenueToHours(tileCountK, getRevenueToHoursRate(project, skillId, periodId));
  return typeof hours === 'number' ? Math.max(0, hours) : 0;
}

export function getProjectSkillZones(
  project: ProjectFrame,
  skillsById: Map<string, Skill>,
  periodId: string,
  allocations: PersonTileAllocation[] = [],
  peopleById: Map<string, Person> = new Map()
): ProjectSkillZone[] {
  const rawZones = project.requirements
    .map((requirement) => {
      const tileCountK = getRequirementTileCountK(project, requirement, periodId);
      const coveredRevenueK = roundOneDecimal(allocations
        .filter((allocation) => getEffectiveAllocationRequirement(allocation, project, peopleById.get(allocation.personId))?.id === requirement.id)
        .reduce((sum, allocation) => sum + allocation.revenueK, 0));

      return {
        id: requirement.id,
        requirementId: requirement.id,
        skillId: requirement.skillId,
        skillLabel: skillsById.get(requirement.skillId)?.label || requirement.skillId,
        color: getProjectSkillZoneColor(requirement.skillId),
        estimatedHours: requirement.estimatedHours,
        tileCountK,
        coveredRevenueK,
        share: 0,
        isCovered: coveredRevenueK >= tileCountK,
      };
    })
    .filter((zone) => zone.tileCountK > 0);

  const totalTileCountK = rawZones.reduce((sum, zone) => sum + zone.tileCountK, 0);
  if (totalTileCountK <= 0) return [];

  return rawZones.map((zone) => ({
    ...zone,
    share: Math.max(8, Math.round((zone.tileCountK / totalTileCountK) * 1000) / 10),
  }));
}

export function getProjectSkillZoneForSlot(
  zones: ProjectSkillZone[],
  slotIndex: number,
  tileUnit?: TileUnit
): ProjectSkillZone | undefined {
  const slotStartK = Math.max(0, slotIndex) * getSkillZoneSlotRevenueK(tileUnit);
  let cursorK = 0;

  return zones.find((zone) => {
    cursorK += Math.max(0, zone.tileCountK);
    return slotStartK < cursorK;
  });
}

export function getProjectSkillZoneSlots(
  zones: ProjectSkillZone[],
  frameCapacityCellCount: number,
  canvasSlotCount: number,
  tileUnit?: TileUnit
): ProjectSkillZoneSlot[] {
  const slotCount = Math.max(0, Math.min(frameCapacityCellCount, canvasSlotCount));

  return Array.from({ length: slotCount }, (_, slotIndex) => {
    const zone = getProjectSkillZoneForSlot(zones, slotIndex, tileUnit);
    if (!zone) return null;
    const previousZone = slotIndex > 0
      ? getProjectSkillZoneForSlot(zones, slotIndex - 1, tileUnit)
      : undefined;

    return {
      slotIndex,
      zone,
      isZoneStart: previousZone?.requirementId !== zone.requirementId,
    };
  }).filter((slot): slot is ProjectSkillZoneSlot => Boolean(slot));
}

function getSkillZoneSlotRevenueK(tileUnit?: TileUnit) {
  return tileUnit?.kind === 'money' ? Math.max(1, tileUnit.value) : 1;
}

function roundOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}
