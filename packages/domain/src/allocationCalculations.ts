import { getEffectiveAllocationSkillId } from './allocationSkills.js';
import { Person, PersonTileAllocation, ProjectFrame, SkillId } from './traffic.model.js';
import { getPersonPeriodAvailableHours, getPersonPeriodCostK } from './personPeriod.js';
import { getProjectRatePlnH } from './currency.js';

export function getRevenueToHoursRate(
  project: ProjectFrame | undefined,
  skillId: SkillId | undefined,
  periodId?: string
) {
  if (!project) return undefined;
  const projectRatePlnH = getProjectRatePlnH(project, periodId);
  if (typeof projectRatePlnH === 'number') return projectRatePlnH;
  if (skillId && typeof project.rateConfig.skillRatesPlnH?.[skillId] === 'number') {
    return project.rateConfig.skillRatesPlnH[skillId];
  }
  return project.rateConfig.companyTargetRatePlnH;
}

export function getRequiredRevenueRate(project: ProjectFrame | undefined, skillId: SkillId | undefined) {
  if (!project) return undefined;
  if (skillId && typeof project.rateConfig.skillRatesPlnH?.[skillId] === 'number') {
    return project.rateConfig.skillRatesPlnH[skillId];
  }
  return project.rateConfig.companyTargetRatePlnH;
}

export function calculateRevenueToHours(revenueK: number, ratePlnH: number | undefined) {
  if (!ratePlnH) return undefined;
  return Math.round((revenueK * 1000) / ratePlnH);
}

export function calculateHoursToRequiredRevenueK(hours: number, ratePlnH: number | undefined) {
  if (!ratePlnH) return undefined;
  return Math.round((hours * ratePlnH) / 100) / 10;
}

export function getPersonInternalHourlyCostPln(person: Person | undefined, periodId: string) {
  if (!person) return undefined;
  const availableHours = getPersonPeriodAvailableHours(person, periodId);
  if (!availableHours) return undefined;
  return (getPersonPeriodCostK(person, periodId) * 1000) / availableHours;
}

export function calculateHoursToInternalCostK(person: Person | undefined, periodId: string, hours: number) {
  const internalHourlyCostPln = getPersonInternalHourlyCostPln(person, periodId);
  if (!internalHourlyCostPln) return undefined;
  return Math.round((hours * internalHourlyCostPln) / 100) / 10;
}

export function calculateAllocationTargetGapK(
  allocation: PersonTileAllocation,
  project: ProjectFrame | undefined,
  person?: Person
) {
  if (!project || allocation.target === 'bench') return 0;
  const requiredRevenueK = calculateHoursToRequiredRevenueK(
    allocation.hours,
    getRequiredRevenueRate(project, getEffectiveAllocationSkillId(allocation, project, person))
  );
  if (typeof requiredRevenueK !== 'number') return 0;
  return Math.max(0, Math.round((requiredRevenueK - allocation.revenueK) * 10) / 10);
}

export function calculateAllocationInternalMarginGapK(
  allocation: PersonTileAllocation,
  person: Person | undefined
) {
  if (!person || allocation.target === 'bench') return 0;
  const internalCostK = calculateHoursToInternalCostK(person, allocation.periodId, allocation.hours);
  if (typeof internalCostK !== 'number') return 0;
  return Math.max(0, Math.round((internalCostK - allocation.revenueK) * 10) / 10);
}
