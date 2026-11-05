import { OpportunityCheckResponse } from '@ptm/contracts';
import { isProductiveAllocationTarget, Period, Person, PersonTileAllocation, ProjectFrame } from '../models/traffic.model';
import { BoardRisk } from './boardRisks';
import { formatOpportunityConfidence, formatOpportunitySource } from './opportunityCheckFormatting';
import { getPersonPeriodUtilization } from './personUtilization';
import { calculateProjectPressure } from './projectPressure';

export interface ReviewSnapshotMetrics {
  committedRevenue: number;
  expectedRevenue: number;
  loss: number;
  pressureToTarget: number;
  targetRevenue: number;
  totalCost: number;
}

interface GenerateReviewSnapshotInput {
  allocations: PersonTileAllocation[];
  aiOpportunityCheck?: OpportunityCheckResponse | null;
  metrics: ReviewSnapshotMetrics;
  people: Person[];
  period: Period | undefined;
  projects: ProjectFrame[];
  risks: BoardRisk[];
}

export function generateReviewSnapshot({
  allocations,
  aiOpportunityCheck,
  metrics,
  people,
  period,
  projects,
  risks,
}: GenerateReviewSnapshotInput) {
  const periodId = period?.id || 'unknown-period';
  const periodLabel = period ? `${period.label} (${period.startsOn} - ${period.endsOn})` : periodId;
  const periodAllocations = allocations.filter((allocation) => allocation.periodId === periodId);
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const productiveRevenueK = roundMoneyK(periodAllocations
    .filter((allocation) => isProductiveAllocationTarget(allocation, projectsById))
    .reduce((sum, allocation) => sum + allocation.revenueK, 0));
  const peopleLines = people
    .map((person) => ({
      person,
      utilization: getPersonPeriodUtilization(person, periodId, allocations, projectsById),
    }))
    .sort((a, b) => b.utilization.utilizationPercent - a.utilization.utilizationPercent)
    .slice(0, 5)
    .map(({ person, utilization }) => (
      `- ${person.name}: ${utilization.allocatedHours}/${utilization.availableHours}h, ${utilization.utilizationPercent}% utilization, ${utilization.allocatedRevenueK}/${utilization.targetK}k target`
    ));
  const projectLines = projects
    .filter((project) => !project.archivedAt)
    .map((project) => {
      const periodPlan = project.revenuePlan.find((plan) => plan.periodId === periodId);
      const allocatedK = roundMoneyK(periodAllocations
        .filter((allocation) => allocation.target === project.id)
        .reduce((sum, allocation) => sum + allocation.revenueK, 0));
      const pressure = calculateProjectPressure(project, periodId, allocations);
      const pressureLabel = pressure
        ? `; month ${pressure.monthlyAllocatedK}/${pressure.monthlyPlannedK}k, total ${pressure.totalAllocatedK}/${pressure.totalPlannedK}k`
        : '';
      return `- ${project.client} / ${project.name}: ${allocatedK}/${periodPlan?.revenueK ?? project.budgetK}k allocated${pressureLabel}`;
    })
    .slice(0, 6);
  const riskLines = risks.slice(0, 6).map((risk) => `- [${risk.severity}] ${risk.title}: ${risk.detail}`);
  const aiLines = aiOpportunityCheck
    ? [
      `Verdict: ${aiOpportunityCheck.result.verdict} (Confidence: ${formatOpportunityConfidence(aiOpportunityCheck.result.confidence)}, source: ${formatOpportunitySource(aiOpportunityCheck.mode)})`,
      ...aiOpportunityCheck.result.topReasons.slice(0, 3).map((reason) => `- ${reason}`),
      `Next scenario: ${aiOpportunityCheck.result.nextScenarioToTry}`,
    ]
    : ['- Not run for this snapshot.'];

  return [
    `PM Traffic Management review snapshot`,
    `Period: ${periodLabel}`,
    '',
    `KPI`,
    `- People cost: ${metrics.totalCost}k`,
    `- Target revenue: ${metrics.targetRevenue}k`,
    `- Committed revenue: ${roundMoneyK(metrics.committedRevenue)}k`,
    `- Expected revenue: ${roundMoneyK(metrics.expectedRevenue)}k`,
    `- Pressure to target: ${roundMoneyK(metrics.pressureToTarget)}k`,
    `- Productive allocated revenue: ${productiveRevenueK}k`,
    `- Loss/bench pressure: ${metrics.loss}k`,
    '',
    `Top risks`,
    ...(riskLines.length ? riskLines : ['- No generated risks.']),
    '',
    `AI planning assistant`,
    ...aiLines,
    '',
    `Project coverage`,
    ...(projectLines.length ? projectLines : ['- No active projects.']),
    '',
    `People load`,
    ...(peopleLines.length ? peopleLines : ['- No active people.']),
  ].join('\n');
}

function roundMoneyK(value: number) {
  return Math.round(value * 10) / 10;
}
