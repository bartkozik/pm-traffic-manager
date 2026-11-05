import {
  BoardLens,
  ContractType,
  PersonCostModel,
  ProjectPlanningStatus,
  ProjectSourceStatus,
  ProjectStage,
  ProjectWorkType,
  Seniority,
} from '../models/traffic.model';

export const lenses: BoardLens[] = ['management', 'finance', 'sales', 'pm', 'hr'];
export const lensLabels: Record<BoardLens, string> = {
  management: 'Management',
  finance: 'Finance',
  sales: 'Sales',
  pm: 'PM',
  hr: 'HR',
};
export const contractTypes: ContractType[] = [
  'hourly',
  'time_materials_capped',
  'fixed_monthly',
  'fixed_phase',
  'multi_month_fixed',
];
export const projectStages: ProjectStage[] = ['signed', 'likely', 'possible', 'defensive'];
export const projectPlanningStatuses: ProjectPlanningStatus[] = ['active', 'ghost'];
export const projectSourceStatuses: ProjectSourceStatus[] = ['synced', 'scope_changed', 'source_missing'];
export const projectSourceStatusLabels: Record<ProjectSourceStatus, string> = {
  synced: 'Source up to date',
  scope_changed: 'Scope changed, source out of date',
  source_missing: 'Missing source entry',
};
export const projectWorkTypes: ProjectWorkType[] = [
  'commercial',
  'research_development',
  'waiting_room',
  'defensive_maintenance',
  'time_off',
];
export const seniorityOptions: Seniority[] = ['junior', 'mid', 'senior', 'lead'];
export const seniorityLabels: Record<Seniority, string> = {
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
  lead: 'Lead',
};
export const costModelTypes: PersonCostModel['type'][] = ['fixed_monthly', 'hourly', 'monthly_override'];
