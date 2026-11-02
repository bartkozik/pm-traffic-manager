import type {
  AllocationMeetingState,
  FxRateSnapshot,
  MonthOpportunityAnalysis,
  MonthlyPersonOverride,
  MonthlyRevenuePlan,
  OpportunityVerdict,
  Person,
  PersonTileAllocation,
  PlanningRule,
  ProjectFrame,
  TrafficBoardCommand,
  TrafficSnapshot,
  WeeklyAllocation,
} from '@ptm/domain';
import { z } from 'zod';

export const trafficBoardIdSchema = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
export const currencyCodeSchema = z.string().trim().transform((value) => value.toUpperCase()).pipe(
  z.string().regex(/^[A-Z]{3}$/)
);
export const isoDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

export const trafficSnapshotSchema = z.custom<TrafficSnapshot>((value) => {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<TrafficSnapshot>;
  return (
    typeof snapshot.schemaVersion === 'number' &&
    typeof snapshot.activePeriodId === 'string' &&
    typeof snapshot.activeTileUnitId === 'string' &&
    Array.isArray(snapshot.skills) &&
    Array.isArray(snapshot.periods) &&
    Array.isArray(snapshot.tileUnits) &&
    Array.isArray(snapshot.people) &&
    Array.isArray(snapshot.projects) &&
    Array.isArray(snapshot.allocations) &&
    (snapshot.weeklyAllocations === undefined || Array.isArray(snapshot.weeklyAllocations)) &&
    (snapshot.planningRules === undefined || Array.isArray(snapshot.planningRules))
  );
});

export const saveTrafficSnapshotRequestSchema = z.object({
  baseUpdatedAt: z.string().optional(),
  snapshot: trafficSnapshotSchema,
});

export const moveTrafficAllocationsRequestSchema = z.object({
  periodId: z.string().trim().min(1),
  moves: z.array(z.object({
    tileId: z.string().trim().min(1),
    target: z.string().trim().min(1),
    projectSlotIndex: z.number().int().nonnegative().optional(),
    requirementId: z.string().trim().min(1).optional(),
    skipRequirementSuggestion: z.boolean().optional(),
  })).min(1),
});

const domainObjectSchema = <T>() => z.custom<T>((value) => Boolean(value && typeof value === 'object'));

export const trafficAllocationSchema = z.custom<PersonTileAllocation>((value) => (
  Boolean(value && typeof value === 'object') &&
  typeof (value as Partial<PersonTileAllocation>).id === 'string' &&
  typeof (value as Partial<PersonTileAllocation>).personId === 'string' &&
  typeof (value as Partial<PersonTileAllocation>).periodId === 'string' &&
  typeof (value as Partial<PersonTileAllocation>).target === 'string'
));
export const trafficPersonSchema = z.custom<Person>((value) => (
  Boolean(value && typeof value === 'object') &&
  typeof (value as Partial<Person>).id === 'string' &&
  typeof (value as Partial<Person>).name === 'string'
));
export const trafficProjectSchema = z.custom<ProjectFrame>((value) => (
  Boolean(value && typeof value === 'object') &&
  typeof (value as Partial<ProjectFrame>).id === 'string' &&
  typeof (value as Partial<ProjectFrame>).name === 'string'
));
export const trafficPlanningRuleSchema = z.custom<PlanningRule>((value) => (
  isTrafficPlanningRule(value)
));
export const trafficWeeklyAllocationSchema = z.custom<WeeklyAllocation>((value) => (
  Boolean(value && typeof value === 'object') &&
  typeof (value as Partial<WeeklyAllocation>).id === 'string' &&
  typeof (value as Partial<WeeklyAllocation>).personId === 'string' &&
  typeof (value as Partial<WeeklyAllocation>).monthPeriodId === 'string' &&
  typeof (value as Partial<WeeklyAllocation>).weekPeriodId === 'string' &&
  typeof (value as Partial<WeeklyAllocation>).target === 'string' &&
  (
    (value as Partial<WeeklyAllocation>).source === undefined ||
    (value as Partial<WeeklyAllocation>).source === 'baseline' ||
    (value as Partial<WeeklyAllocation>).source === 'manual'
  )
));

function isTrafficPlanningRule(value: unknown): value is PlanningRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Partial<PlanningRule>;
  const timeScope = rule.timeScope || (typeof rule.periodId === 'string' ? 'period' : 'permanent');
  return (
    typeof rule.id === 'string' &&
    rule.type === 'person_pair_block' &&
    (timeScope === 'permanent' || timeScope === 'period') &&
    (timeScope === 'permanent' || typeof rule.periodId === 'string') &&
    typeof rule.personAId === 'string' &&
    typeof rule.personBId === 'string'
  );
}

export const trafficBoardCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('allocations.move'),
    periodId: z.string().trim().min(1),
    moves: moveTrafficAllocationsRequestSchema.shape.moves,
  }),
  z.object({
    type: z.literal('weeklyAllocations.move'),
    monthPeriodId: z.string().trim().min(1),
    weekPeriodId: z.string().trim().min(1),
    moves: z.array(z.object({
      personId: z.string().trim().min(1),
      slotIndex: z.number().int().nonnegative(),
      target: z.string().trim().min(1),
      projectSlotIndex: z.number().int().nonnegative().optional(),
      requirementId: z.string().trim().min(1).optional(),
      skipRequirementSuggestion: z.boolean().optional(),
    })).min(1),
  }),
  z.object({
    type: z.literal('allocations.resetPerson'),
    personId: z.string().trim().min(1),
    periodId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal('allocations.update'),
    allocation: trafficAllocationSchema,
  }),
  z.object({
    type: z.literal('allocations.updateGroupMeetingState'),
    allocation: trafficAllocationSchema,
    groupAllocationIds: z.array(z.string().trim().min(1)),
    meetingState: domainObjectSchema<AllocationMeetingState>().optional(),
  }),
  z.object({
    type: z.literal('person.create'),
    person: trafficPersonSchema,
    periodId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal('person.update'),
    person: trafficPersonSchema,
    activePeriodId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal('person.archive'),
    personId: z.string().trim().min(1),
    archivedAt: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal('person.restore'),
    personId: z.string().trim().min(1),
    periodIds: z.array(z.string().trim().min(1)).optional(),
  }),
  z.object({
    type: z.literal('project.create'),
    project: trafficProjectSchema,
  }),
  z.object({
    type: z.literal('project.update'),
    project: trafficProjectSchema,
  }),
  z.object({
    type: z.literal('project.updateWeeklyRevenuePlan'),
    projectId: z.string().trim().min(1),
    monthPeriodId: z.string().trim().min(1),
    weekPeriodId: z.string().trim().min(1),
    revenueK: z.number().nonnegative(),
  }),
  z.object({
    type: z.literal('project.archivePeriod'),
    projectId: z.string().trim().min(1),
    periodId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal('project.restorePeriod'),
    projectId: z.string().trim().min(1),
    periodId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal('project.delete'),
    projectId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal('planningRules.upsertMany'),
    planningRules: z.array(trafficPlanningRuleSchema).min(1),
  }),
  z.object({
    type: z.literal('planningRules.delete'),
    planningRuleId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal('period.ensureCapacity'),
    periodId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal('period.ensureRange'),
    fromPeriodId: z.string().trim().min(1),
    monthCount: z.number().int().min(1).max(24),
  }),
  z.object({
    type: z.literal('period.createMonth'),
    periodId: z.string().trim().min(1),
    activate: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('period.clearMonthPlan'),
    periodId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal('period.pasteMonthPlan'),
    sourcePeriodId: z.string().trim().min(1).optional(),
    targetPeriodId: z.string().trim().min(1),
    mode: z.enum(['people_with_allocations', 'people_without_allocations', 'projects_without_allocations']),
    people: z.array(z.object({
      personId: z.string().trim().min(1),
      monthlyOverride: domainObjectSchema<MonthlyPersonOverride>().optional(),
    })),
    projects: z.array(z.object({
      projectId: z.string().trim().min(1),
      revenuePlan: domainObjectSchema<MonthlyRevenuePlan>().optional(),
    })),
    allocations: z.array(z.object({
      personId: z.string().trim().min(1),
      tileIndex: z.number().int().nonnegative(),
      target: z.string().trim().min(1),
      mode: z.enum(['revenue_first', 'hours_first']),
      revenueK: z.number().nonnegative(),
      hours: z.number().nonnegative(),
      skillId: z.custom<PersonTileAllocation['skillId']>((value) => typeof value === 'string').optional(),
      requirementId: z.string().trim().min(1).optional(),
      projectSlotIndex: z.number().int().nonnegative().optional(),
      hoursOverridden: z.boolean().optional(),
      revenueOverridden: z.boolean().optional(),
      meetingState: domainObjectSchema<AllocationMeetingState>().optional(),
    })),
  }),
  z.object({
    type: z.literal('settings.setActivePeriod'),
    periodId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal('settings.setActiveTileUnit'),
    tileUnitId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal('board.reset'),
  }),
]) satisfies z.ZodType<TrafficBoardCommand>;

export const trafficCommandMetadataSchema = z.object({
  actorId: z.string().trim().min(1).optional(),
  commandId: z.string().trim().min(1).max(120).optional(),
  sourceSystem: z.string().trim().min(1).max(80).optional(),
  sourceRecordId: z.string().trim().min(1).max(160).optional(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
  diffSummary: z.string().trim().min(1).max(500).optional(),
});

export const executeTrafficBoardCommandRequestSchema = z.object({
  actorId: z.string().trim().min(1).optional(),
  command: trafficBoardCommandSchema,
  commandId: z.string().trim().min(1).max(120),
  metadata: trafficCommandMetadataSchema.optional(),
});

export const trafficBoardRealtimeClientMessageSchema = z.object({
  type: z.literal('command'),
  actorId: z.string().trim().min(1).optional(),
  command: trafficBoardCommandSchema,
  commandId: z.string().trim().min(1).max(120),
});

export const trafficBoardResponseSchema = z.object({
  boardId: trafficBoardIdSchema,
  snapshot: trafficSnapshotSchema,
  updatedAt: z.string(),
  version: z.number().int().nonnegative(),
});

export const trafficBoardSnapshotEventSchema = z.object({
  type: z.literal('board.snapshot'),
  boardId: trafficBoardIdSchema,
  snapshot: trafficSnapshotSchema,
  updatedAt: z.string(),
  version: z.number().int().nonnegative(),
});

export const trafficBoardUpdatedEventSchema = z.object({
  type: z.literal('board.updated'),
  boardId: trafficBoardIdSchema,
  action: z.string(),
  commandId: z.string().optional(),
  snapshot: trafficSnapshotSchema,
  updatedAt: z.string(),
  version: z.number().int().nonnegative(),
});

export const trafficBoardCommandAckEventSchema = z.object({
  type: z.literal('command.ack'),
  boardId: trafficBoardIdSchema,
  commandId: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative(),
});

export const trafficBoardCommandErrorEventSchema = z.object({
  type: z.literal('command.error'),
  boardId: trafficBoardIdSchema,
  commandId: z.string().optional(),
  message: z.string(),
});

export const trafficBoardRealtimeEventSchema = z.discriminatedUnion('type', [
  trafficBoardSnapshotEventSchema,
  trafficBoardUpdatedEventSchema,
  trafficBoardCommandAckEventSchema,
  trafficBoardCommandErrorEventSchema,
]);

export const fxRateSnapshotSchema = z.object({
  currency: currencyCodeSchema,
  rateToPln: z.number().positive(),
  requestedDate: isoDateSchema.optional(),
  effectiveDate: isoDateSchema,
  source: z.enum(['pln', 'nbp_mid', 'manual', 'contract']),
  providerTable: z.enum(['A', 'B']).optional(),
  providerTableNo: z.string().optional(),
  fetchedAt: z.string().optional(),
}) satisfies z.ZodType<FxRateSnapshot>;

export const opportunityVerdictSchema = z.enum([
  'pursue',
  'pursue_with_changes',
  'renegotiate',
  'drop_or_delay',
]) satisfies z.ZodType<OpportunityVerdict>;

export const opportunityCheckProjectActionSchema = z.object({
  projectId: z.string(),
  action: z.enum(['keep', 'drop', 'delay', 'renegotiate', 'reallocate']),
  reason: z.string(),
  evidence: z.array(z.string()),
});

const optionalModelStringSchema = z.preprocess((value) => (
  value === null ? undefined : value
), z.string().optional());

export const opportunityCheckAllocationSuggestionSchema = z.object({
  projectId: z.string(),
  fromPersonId: optionalModelStringSchema,
  toPersonId: optionalModelStringSchema,
  reason: z.string(),
  expectedImpact: z.string(),
});

export const opportunityCheckResultSchema = z.object({
  verdict: opportunityVerdictSchema,
  confidence: z.enum(['low', 'medium', 'high']),
  topReasons: z.array(z.string()),
  projectActions: z.array(opportunityCheckProjectActionSchema),
  allocationSuggestions: z.array(opportunityCheckAllocationSuggestionSchema),
  bottlenecks: z.array(z.string()),
  financialRisks: z.array(z.string()),
  deliveryHrRisks: z.array(z.string()),
  assumptionsToVerify: z.array(z.string()),
  nextScenarioToTry: z.string(),
});

export const monthOpportunityAnalysisSchema = z.custom<MonthOpportunityAnalysis>((value) => (
  Boolean(value && typeof value === 'object' && 'monthSummary' in value && 'projects' in value)
));

export const opportunityCheckResponseSchema = z.object({
  boardId: trafficBoardIdSchema,
  periodId: z.string(),
  mode: z.enum(['mock', 'model']),
  analysis: monthOpportunityAnalysisSchema,
  result: opportunityCheckResultSchema,
  updatedAt: z.string(),
});

export type SaveTrafficSnapshotRequest = z.infer<typeof saveTrafficSnapshotRequestSchema>;
export type MoveTrafficAllocationsRequest = z.infer<typeof moveTrafficAllocationsRequestSchema>;
export type ExecuteTrafficBoardCommandRequest = z.infer<typeof executeTrafficBoardCommandRequestSchema>;
export type TrafficCommandMetadata = z.infer<typeof trafficCommandMetadataSchema>;
export type TrafficBoardResponse = z.infer<typeof trafficBoardResponseSchema>;
export type TrafficBoardRealtimeClientMessage = z.infer<typeof trafficBoardRealtimeClientMessageSchema>;
export type TrafficBoardRealtimeEvent = z.infer<typeof trafficBoardRealtimeEventSchema>;
export type OpportunityCheckResult = z.infer<typeof opportunityCheckResultSchema>;
export type OpportunityCheckResponse = z.infer<typeof opportunityCheckResponseSchema>;
