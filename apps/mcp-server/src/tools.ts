import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  generateMonthOpportunityAnalysis,
  type BenchAlertSeverity,
  type ContractType,
  type CostModelType,
  type MonthlyRevenuePlan,
  type PlanningRuleSeverity,
  type ProjectFrame,
  type ProjectStage,
  type ProjectWorkType,
  type Seniority,
  type SkillId,
  type TrafficSnapshot,
} from '@ptm/domain';
import { z } from 'zod';
import {
  buildPerson,
  buildPersonPairBlockRule,
  buildProject,
  findPersonByExternalRef,
  findProjectByExternalRef,
  mergeExternalRefs,
  selectPersonCapacityReconciliation,
  selectPersonCapacityMoves,
  summarizeBoard,
  validateImportReferences,
} from './builders.js';
import type { PtmApiClient, TrafficBoardResponse } from './client.js';
import type { PtmMcpConfig } from './config.js';

const skillSchema = z.enum(['backend', 'frontend', 'fullstack', 'design', 'pm', 'qa', 'devops', 'mobile']);
const senioritySchema = z.enum(['junior', 'mid', 'senior', 'lead']);
const contractTypeSchema = z.enum(['hourly', 'time_materials_capped', 'fixed_monthly', 'fixed_phase', 'multi_month_fixed']);
const projectStageSchema = z.enum(['signed', 'likely', 'possible', 'defensive']);
const planningStatusSchema = z.enum(['active', 'ghost']);
const projectWorkTypeSchema = z.enum(['commercial', 'research_development', 'waiting_room', 'defensive_maintenance', 'time_off']);
const benchAlertSeveritySchema = z.enum(['auto', 'none', 'watch', 'warning', 'critical']);
const planningRuleSeveritySchema = z.enum(['hard', 'warning']);
const costModelTypeSchema = z.enum(['fixed_monthly', 'hourly', 'monthly_override']);
const sourceStatusSchema = z.enum(['synced', 'scope_changed', 'source_missing']);
const fxModeSchema = z.enum(['pln', 'provider_daily_mid', 'manual', 'fixed_contract_rate']);
const entityActionSchema = z.enum(['archive', 'restore', 'delete']);

const costLayersSchema = z.object({
  workK: z.number().positive(),
  adminK: z.number().positive(),
  salesK: z.number().positive(),
  targetK: z.number().positive(),
});

const monthlyPersonOverrideSchema = z.object({
  periodId: z.string().min(1),
  availableHours: z.number().nonnegative().optional(),
  internalHourlyCostPln: z.number().positive().optional(),
  fixedMonthlyCostK: z.number().positive().optional(),
  layers: costLayersSchema.optional(),
  status: z.enum(['holiday', 'notice_period', 'partial_availability', 'unavailable', 'other']).optional(),
  note: z.string().optional(),
});

const fxRateSnapshotSchema = z.object({
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  rateToPln: z.number().positive(),
  requestedDate: z.string().optional(),
  effectiveDate: z.string().min(1),
  source: z.enum(['pln', 'nbp_mid', 'manual', 'contract']),
  providerTable: z.enum(['A', 'B']).optional(),
  providerTableNo: z.string().optional(),
  fetchedAt: z.string().optional(),
});

const revenuePlanInputSchema = z.object({
  periodId: z.string().min(1),
  nativeRevenueK: z.number().nonnegative().optional(),
  nativeCommittedRevenueK: z.number().nonnegative().optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  fx: fxRateSnapshotSchema.optional(),
  revenueK: z.number().positive(),
  committedRevenueK: z.number().nonnegative().optional(),
  probability: z.number().min(0).max(100).optional(),
});

const requirementInputSchema = z.object({
  id: z.string().optional(),
  skillId: skillSchema,
  seniority: senioritySchema.optional(),
  estimatedHours: z.number().positive(),
  required: z.boolean().optional(),
  phaseLabel: z.string().optional(),
});

const weeklyOverrideSchema = z.object({
  periodId: z.string().min(1),
  hours: z.number().nonnegative().optional(),
});

const meetingStateSchema = z.object({
  unchanged: z.boolean().optional(),
  changedThisWeek: z.boolean().optional(),
  handoffRequired: z.boolean().optional(),
  planB: z.boolean().optional(),
  mentoring: z.boolean().optional(),
  backup: z.boolean().optional(),
});

const personImportSchema = z.object({
  id: z.string().optional(),
  externalId: z.string().optional(),
  sourceSystem: z.string().optional(),
  periodId: z.string().optional(),
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  initials: z.string().optional(),
  color: z.string().optional(),
  skillIds: z.array(skillSchema).optional(),
  seniority: senioritySchema.optional(),
  monthlyCostK: z.number().positive(),
  costModelType: costModelTypeSchema.optional(),
  defaultMonthlyHours: z.number().positive().optional(),
  internalHourlyCostPln: z.number().positive().optional(),
  fixedMonthlyCostK: z.number().positive().optional(),
  hoursPerTile: z.number().positive().optional(),
  layers: costLayersSchema.optional(),
  monthlyOverrides: z.array(monthlyPersonOverrideSchema).optional(),
  benchAlertSeverity: benchAlertSeveritySchema.optional(),
  archivedAt: z.string().optional(),
});

const projectImportSchema = z.object({
  id: z.string().optional(),
  externalId: z.string().optional(),
  sourceSystem: z.string().optional(),
  name: z.string().trim().min(1),
  client: z.string().trim().min(1),
  periodId: z.string().optional(),
  contractType: contractTypeSchema.optional(),
  stage: projectStageSchema.optional(),
  planningStatus: planningStatusSchema.optional(),
  workType: projectWorkTypeSchema.optional(),
  revenueK: z.number().positive(),
  committedRevenueK: z.number().nonnegative().optional(),
  probability: z.number().min(0).max(100).optional(),
  projectRatePlnH: z.number().positive().optional(),
  projectRateNativeH: z.number().positive().optional(),
  projectRateCurrency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  companyTargetRatePlnH: z.number().positive().optional(),
  skillRatesPlnH: z.partialRecord(skillSchema, z.number().positive()).optional(),
  billingCurrency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  fxMode: fxModeSchema.optional(),
  fx: fxRateSnapshotSchema.optional(),
  notes: z.string().optional(),
  endPeriodId: z.string().optional(),
  sourceStatus: sourceStatusSchema.optional(),
  sourceStatusNote: z.string().optional(),
  preferredPersonIds: z.array(z.string().min(1)).optional(),
  blockedPersonIds: z.array(z.string().min(1)).optional(),
  revenuePlans: z.array(revenuePlanInputSchema).optional(),
  requirements: z.array(requirementInputSchema).optional(),
});

export function registerPtmTools(server: McpServer, client: PtmApiClient, config: PtmMcpConfig) {
  server.tool(
    'ptm_get_board_overview',
    'Get a compact PTM board overview: active period, people, projects, period allocation counts, and IDs needed by other tools.',
    {
      boardId: optionalBoardId(),
      periodId: z.string().optional().describe('Month period id such as 2026-06. Defaults to the board active period.'),
    },
    async ({ boardId, periodId }): Promise<CallToolResult> => withToolErrors(async () => {
      const board = await client.getBoard(resolveBoardId(config, boardId));
      return jsonResult(summarizeBoard(board.snapshot, periodId || board.snapshot.activePeriodId));
    })
  );

  server.tool(
    'ptm_get_board_snapshot',
    'Get the full PTM board snapshot. Use only when the compact overview is not enough.',
    {
      boardId: optionalBoardId(),
    },
    async ({ boardId }): Promise<CallToolResult> => withToolErrors(async () => {
      const board = await client.getBoard(resolveBoardId(config, boardId));
      return jsonResult(board);
    })
  );

  server.tool(
    'ptm_analyze_month',
    'Generate deterministic month analysis from the current board without calling an AI model.',
    {
      boardId: optionalBoardId(),
      periodId: z.string().optional().describe('Month period id such as 2026-06. Defaults to the board active period.'),
    },
    async ({ boardId, periodId }): Promise<CallToolResult> => withToolErrors(async () => {
      const board = await client.getBoard(resolveBoardId(config, boardId));
      return jsonResult(generateMonthOpportunityAnalysis(board.snapshot, periodId || board.snapshot.activePeriodId));
    })
  );

  server.tool(
    'ptm_create_person',
    'Create a real person/capacity lane through the PTM API command path. The API creates the matching period capacity tiles.',
    {
      boardId: optionalBoardId(),
      periodId: z.string().optional().describe('Month period id for initial capacity tiles. Defaults to active period.'),
      id: z.string().optional().describe('Optional stable person id. Usually omit and let PTM generate one from the name.'),
      name: z.string().trim().min(1).describe('Person display name.'),
      role: z.string().trim().min(1).describe('Role label, e.g. Senior Backend Developer.'),
      initials: z.string().optional().describe('Optional initials. Defaults to initials derived from name.'),
      color: z.string().optional().describe('Optional CSS color for board badges.'),
      skillIds: z.array(skillSchema).optional().describe('Skills this person can cover. Defaults to fullstack.'),
      seniority: senioritySchema.optional(),
      monthlyCostK: z.number().positive().describe('Monthly internal cost footprint in thousands PLN.'),
      defaultMonthlyHours: z.number().positive().optional().describe('Default available hours per month. Defaults to 160.'),
      internalHourlyCostPln: z.number().positive().optional().describe('Internal hourly cost in PLN. Defaults from monthlyCostK/defaultMonthlyHours.'),
      fixedMonthlyCostK: z.number().positive().optional().describe('Fixed monthly cost in thousands PLN. Defaults to monthlyCostK.'),
      hoursPerTile: z.number().positive().optional().describe('Hours represented by one 1k PLN person tile. Defaults to 5.'),
      benchAlertSeverity: benchAlertSeveritySchema.optional(),
    },
    async ({ boardId, periodId, ...input }): Promise<CallToolResult> => withToolErrors(async () => {
      const resolvedBoardId = resolveBoardId(config, boardId);
      const board = await client.getBoard(resolvedBoardId);
      const person = buildPerson(board.snapshot, {
        ...input,
        skillIds: input.skillIds as SkillId[] | undefined,
        seniority: input.seniority as Seniority | undefined,
        benchAlertSeverity: input.benchAlertSeverity as BenchAlertSeverity | undefined,
      });
      const response = await client.executeCommand(resolvedBoardId, {
        type: 'person.create',
        person,
        periodId: periodId || board.snapshot.activePeriodId,
      });
      return jsonResult({
        createdPerson: person,
        board: compactBoardResult(response, periodId || response.snapshot.activePeriodId),
      });
    })
  );

  server.tool(
    'ptm_create_project',
    'Create a real PTM project/deal frame with revenue plan and optional skill requirements through the API command path.',
    {
      boardId: optionalBoardId(),
      id: z.string().optional().describe('Optional stable project id. Usually omit and let PTM generate one from the name.'),
      name: z.string().trim().min(1).describe('Project/deal name.'),
      client: z.string().trim().min(1).describe('Client name.'),
      periodId: z.string().optional().describe('Start month period id for the initial revenue plan. Defaults to active period.'),
      contractType: contractTypeSchema.optional(),
      stage: projectStageSchema.optional(),
      planningStatus: planningStatusSchema.optional(),
      workType: projectWorkTypeSchema.optional(),
      revenueK: z.number().positive().describe('Planned revenue/capacity for the selected month in thousands PLN.'),
      committedRevenueK: z.number().nonnegative().optional().describe('Signed/committed revenue in thousands PLN.'),
      probability: z.number().min(0).max(100).optional().describe('Probability as 0-1 or 0-100.'),
      projectRatePlnH: z.number().positive().optional().describe('Client/project hourly rate in PLN.'),
      companyTargetRatePlnH: z.number().positive().optional().describe('Fallback company target hourly rate in PLN. Defaults to 260.'),
      notes: z.string().optional(),
      endPeriodId: z.string().optional(),
      requirements: z.array(z.object({
        id: z.string().optional(),
        skillId: skillSchema,
        seniority: senioritySchema.optional(),
        estimatedHours: z.number().positive(),
        required: z.boolean().optional(),
        phaseLabel: z.string().optional(),
      })).optional().describe('Project skill/hour requirements.'),
    },
    async ({ boardId, ...input }): Promise<CallToolResult> => withToolErrors(async () => {
      const resolvedBoardId = resolveBoardId(config, boardId);
      const board = await client.getBoard(resolvedBoardId);
      const project = buildProject(board.snapshot, {
        ...input,
        contractType: input.contractType as ContractType | undefined,
        stage: input.stage as ProjectStage | undefined,
        workType: input.workType as ProjectWorkType | undefined,
        requirements: input.requirements?.map((requirement) => ({
          ...requirement,
          skillId: requirement.skillId as SkillId,
          seniority: requirement.seniority as Seniority | undefined,
        })),
      });
      const response = await client.executeCommand(resolvedBoardId, { type: 'project.create', project });
      return jsonResult({
        createdProject: project,
        board: compactBoardResult(response, project.startPeriodId),
      });
    })
  );

  server.tool(
    'ptm_prepare_period_range',
    'Ensure month periods and matching person capacity exist before importing revenue plans or allocations.',
    {
      boardId: optionalBoardId(),
      actorId: z.string().optional(),
      sourceSystem: z.string().optional(),
      fromPeriodId: z.string().min(1).describe('Existing or first month period id such as 2026-06.'),
      monthCount: z.number().int().min(1).max(24).describe('Number of consecutive months to ensure.'),
      activate: z.boolean().optional().describe('When true, set fromPeriodId as the active period after ensuring it exists.'),
      dryRun: z.boolean().optional(),
    },
    async ({ boardId, actorId, sourceSystem, fromPeriodId, monthCount, activate, dryRun }): Promise<CallToolResult> => withToolErrors(async () => {
      const resolvedBoardId = resolveBoardId(config, boardId);
      const board = await client.getBoard(resolvedBoardId);
      const plannedCommands = [
        { type: 'period.createMonth' as const, periodId: fromPeriodId, activate: activate === true },
        { type: 'period.ensureRange' as const, fromPeriodId, monthCount },
      ];
      if (dryRun) return jsonResult({ plannedCommands, board: compactBoardResult(board, fromPeriodId) });

      let response = await client.executeCommand(resolvedBoardId, plannedCommands[0], {
        actorId,
        sourceSystem,
        diffSummary: `Ensure import start period ${fromPeriodId}`,
      });
      response = await client.executeCommand(resolvedBoardId, plannedCommands[1], {
        actorId,
        sourceSystem,
        diffSummary: `Ensure ${monthCount} import month(s) from ${fromPeriodId}`,
      });
      return jsonResult({ board: compactBoardResult(response, fromPeriodId) });
    })
  );

  server.tool(
    'ptm_upsert_people',
    'Idempotently create or update people from a source system, preserving source ids for later allocation imports.',
    {
      boardId: optionalBoardId(),
      actorId: z.string().optional(),
      sourceSystem: z.string().min(1).describe('Name of the source system being imported, e.g. crm, harvest, legacy-pm.'),
      periodId: z.string().optional().describe('Month period id for capacity creation when a person is new.'),
      dryRun: z.boolean().optional(),
      people: z.array(personImportSchema).min(1).max(200),
    },
    async ({ boardId, actorId, sourceSystem, periodId, dryRun, people }): Promise<CallToolResult> => withToolErrors(async () => {
      const resolvedBoardId = resolveBoardId(config, boardId);
      let board = await client.getBoard(resolvedBoardId);
      const issues = validateImportReferences(board.snapshot, {
        sourceSystem,
        people: people.map((person) => ({ ...person, periodId: person.periodId || periodId })),
      });
      if (dryRun || issues.some((issue) => issue.severity === 'error')) {
        return jsonResult({
          dryRun: true,
          issues,
          planned: people.map((person) => {
            const resolvedSource = person.sourceSystem || sourceSystem;
            const existing = person.id
              ? board.snapshot.people.find((item) => item.id === person.id)
              : findPersonByExternalRef(board.snapshot, resolvedSource, person.externalId);
            return {
              action: existing ? 'update' : 'create',
              sourceRecordId: person.externalId || person.id,
              ptmId: existing?.id,
              name: person.name,
            };
          }),
        });
      }

      const results = [];
      for (const personInput of people) {
        const resolvedSource = personInput.sourceSystem || sourceSystem;
        const existing = personInput.id
          ? board.snapshot.people.find((item) => item.id === personInput.id)
          : findPersonByExternalRef(board.snapshot, resolvedSource, personInput.externalId);
        const builtPerson = buildPerson(board.snapshot, {
          ...personInput,
          id: existing?.id || personInput.id,
          sourceSystem: resolvedSource,
          skillIds: personInput.skillIds as SkillId[] | undefined,
          seniority: personInput.seniority as Seniority | undefined,
          costModelType: personInput.costModelType as CostModelType | undefined,
          benchAlertSeverity: personInput.benchAlertSeverity as BenchAlertSeverity | undefined,
        });
        const person = existing
          ? {
            ...existing,
            ...builtPerson,
            preferences: existing.preferences,
            blockedCollaborationPersonIds: existing.blockedCollaborationPersonIds,
            externalRefs: mergeExternalRefs(existing.externalRefs, resolvedSource, personInput.externalId),
            archivedAt: personInput.archivedAt ?? existing.archivedAt,
          }
          : builtPerson;
        const command = existing
          ? { type: 'person.update' as const, person, activePeriodId: personInput.periodId || periodId || board.snapshot.activePeriodId }
          : { type: 'person.create' as const, person, periodId: personInput.periodId || periodId || board.snapshot.activePeriodId };
        board = await client.executeCommand(resolvedBoardId, command, {
          actorId,
          sourceSystem: resolvedSource,
          sourceRecordId: personInput.externalId,
          idempotencyKey: buildIdempotencyKey(resolvedSource, 'person', personInput.externalId || person.id),
          diffSummary: `${existing ? 'Update' : 'Create'} imported person ${person.name}`,
        });
        results.push({
          action: existing ? 'updated' : 'created',
          sourceRecordId: personInput.externalId,
          ptmId: person.id,
          name: person.name,
        });
      }

      return jsonResult({ results, board: compactBoardResult(board, periodId || board.snapshot.activePeriodId) });
    })
  );

  server.tool(
    'ptm_upsert_projects',
    'Idempotently create or update projects/deals from a source system, including requirements and multi-month revenue plans.',
    {
      boardId: optionalBoardId(),
      actorId: z.string().optional(),
      sourceSystem: z.string().min(1),
      dryRun: z.boolean().optional(),
      projects: z.array(projectImportSchema).min(1).max(200),
    },
    async ({ boardId, actorId, sourceSystem, dryRun, projects }): Promise<CallToolResult> => withToolErrors(async () => {
      const resolvedBoardId = resolveBoardId(config, boardId);
      let board = await client.getBoard(resolvedBoardId);
      const issues = validateImportReferences(board.snapshot, { sourceSystem, projects });
      if (dryRun || issues.some((issue) => issue.severity === 'error')) {
        return jsonResult({
          dryRun: true,
          issues,
          planned: projects.map((project) => {
            const resolvedSource = project.sourceSystem || sourceSystem;
            const existing = project.id
              ? board.snapshot.projects.find((item) => item.id === project.id)
              : findProjectByExternalRef(board.snapshot, resolvedSource, project.externalId);
            return {
              action: existing ? 'update' : 'create',
              sourceRecordId: project.externalId || project.id,
              ptmId: existing?.id,
              name: project.name,
            };
          }),
        });
      }

      const results = [];
      for (const projectInput of projects) {
        const resolvedSource = projectInput.sourceSystem || sourceSystem;
        const existing = projectInput.id
          ? board.snapshot.projects.find((item) => item.id === projectInput.id)
          : findProjectByExternalRef(board.snapshot, resolvedSource, projectInput.externalId);
        const builtProject = buildProject(board.snapshot, {
          ...projectInput,
          id: existing?.id || projectInput.id,
          sourceSystem: resolvedSource,
          contractType: projectInput.contractType as ContractType | undefined,
          stage: projectInput.stage as ProjectStage | undefined,
          workType: projectInput.workType as ProjectWorkType | undefined,
          revenuePlans: projectInput.revenuePlans as MonthlyRevenuePlan[] | undefined,
          requirements: projectInput.requirements?.map((requirement) => ({
            ...requirement,
            skillId: requirement.skillId as SkillId,
            seniority: requirement.seniority as Seniority | undefined,
          })),
        });
        const project = existing
          ? mergeProject(existing, builtProject, resolvedSource, projectInput.externalId)
          : builtProject;
        board = await client.executeCommand(resolvedBoardId, {
          type: existing ? 'project.update' : 'project.create',
          project,
        }, {
          actorId,
          sourceSystem: resolvedSource,
          sourceRecordId: projectInput.externalId,
          idempotencyKey: buildIdempotencyKey(resolvedSource, 'project', projectInput.externalId || project.id),
          diffSummary: `${existing ? 'Update' : 'Create'} imported project ${project.name}`,
        });
        results.push({
          action: existing ? 'updated' : 'created',
          sourceRecordId: projectInput.externalId,
          ptmId: project.id,
          name: project.name,
        });
      }

      return jsonResult({ results, board: compactBoardResult(board, board.snapshot.activePeriodId) });
    })
  );

  server.tool(
    'ptm_update_project_revenue_plans',
    'Upsert monthly revenue plans for an existing project without replacing other project metadata.',
    {
      boardId: optionalBoardId(),
      actorId: z.string().optional(),
      sourceSystem: z.string().optional(),
      projectId: z.string().optional(),
      projectExternalId: z.string().optional(),
      revenuePlans: z.array(revenuePlanInputSchema).min(1),
      dryRun: z.boolean().optional(),
    },
    async ({ boardId, actorId, sourceSystem, projectId, projectExternalId, revenuePlans, dryRun }): Promise<CallToolResult> => withToolErrors(async () => {
      const resolvedBoardId = resolveBoardId(config, boardId);
      const board = await client.getBoard(resolvedBoardId);
      const project = resolveProject(board.snapshot, sourceSystem, projectId, projectExternalId);
      const issues = validateImportReferences(board.snapshot, {
        sourceSystem,
        projects: [{ id: project.id, name: project.name, revenuePlans }],
      });
      if (dryRun || issues.some((issue) => issue.severity === 'error')) {
        return jsonResult({ dryRun: true, issues, projectId: project.id, plannedRevenuePlans: revenuePlans });
      }

      const nextProject = {
        ...project,
        revenuePlan: mergeRevenuePlans(project.revenuePlan, revenuePlans as MonthlyRevenuePlan[]),
      };
      const response = await client.executeCommand(resolvedBoardId, {
        type: 'project.update',
        project: nextProject,
      }, {
        actorId,
        sourceSystem,
        sourceRecordId: projectExternalId || projectId,
        idempotencyKey: buildIdempotencyKey(sourceSystem, 'project-revenue', projectExternalId || projectId || project.id),
        diffSummary: `Upsert ${revenuePlans.length} revenue plan(s) for ${project.name}`,
      });
      return jsonResult({ updatedProjectId: project.id, board: compactBoardResult(response, response.snapshot.activePeriodId) });
    })
  );

  server.tool(
    'ptm_update_project_requirements',
    'Replace or merge project skill requirements for an existing project.',
    {
      boardId: optionalBoardId(),
      actorId: z.string().optional(),
      sourceSystem: z.string().optional(),
      projectId: z.string().optional(),
      projectExternalId: z.string().optional(),
      mode: z.enum(['replace', 'merge']).optional(),
      requirements: z.array(requirementInputSchema).min(1),
      dryRun: z.boolean().optional(),
    },
    async ({ boardId, actorId, sourceSystem, projectId, projectExternalId, mode, requirements, dryRun }): Promise<CallToolResult> => withToolErrors(async () => {
      const resolvedBoardId = resolveBoardId(config, boardId);
      const board = await client.getBoard(resolvedBoardId);
      const project = resolveProject(board.snapshot, sourceSystem, projectId, projectExternalId);
      if (dryRun) return jsonResult({ dryRun: true, projectId: project.id, plannedRequirements: requirements });

      const rebuilt = buildProject(board.snapshot, {
        ...project,
        revenueK: Math.max(1, project.budgetK),
        periodId: project.startPeriodId,
        requirements: requirements.map((requirement) => ({
          ...requirement,
          skillId: requirement.skillId as SkillId,
          seniority: requirement.seniority as Seniority | undefined,
        })),
      });
      const nextProject = {
        ...project,
        requirements: mode === 'merge'
          ? mergeRequirements(project.requirements, rebuilt.requirements)
          : rebuilt.requirements,
      };
      const response = await client.executeCommand(resolvedBoardId, {
        type: 'project.update',
        project: nextProject,
      }, {
        actorId,
        sourceSystem,
        sourceRecordId: projectExternalId || projectId,
        idempotencyKey: buildIdempotencyKey(sourceSystem, 'project-requirements', projectExternalId || projectId || project.id),
        diffSummary: `${mode || 'replace'} requirements for ${project.name}`,
      });
      return jsonResult({ updatedProjectId: project.id, board: compactBoardResult(response, response.snapshot.activePeriodId) });
    })
  );

  server.tool(
    'ptm_move_person_capacity',
    'Move a number of 1k PLN person capacity tiles between bench and project frames. This uses normal PTM allocation move validation.',
    {
      boardId: optionalBoardId(),
      periodId: z.string().optional().describe('Month period id such as 2026-06. Defaults to active period.'),
      personId: z.string().min(1).describe('Person id from ptm_get_board_overview.'),
      toTarget: z.string().min(1).describe('Target project id or bench.'),
      fromTarget: z.string().optional().describe('Optional source target project id or bench. If omitted, bench tiles are preferred.'),
      tileCount: z.number().int().min(1).max(200).optional().describe('Number of 1k PLN capacity tiles to move. Defaults to 1.'),
    },
    async ({ boardId, ...input }): Promise<CallToolResult> => withToolErrors(async () => {
      const resolvedBoardId = resolveBoardId(config, boardId);
      const board = await client.getBoard(resolvedBoardId);
      const selection = selectPersonCapacityMoves(board.snapshot, input);
      const response = await client.executeCommand(resolvedBoardId, {
        type: 'allocations.move',
        periodId: selection.periodId,
        moves: selection.moves,
      });
      return jsonResult({
        moved: selection,
        board: compactBoardResult(response, selection.periodId),
      });
    })
  );

  server.tool(
    'ptm_apply_allocations',
    'Idempotently reconcile desired person-to-project tile counts for import/migration. Moves only the delta needed.',
    {
      boardId: optionalBoardId(),
      actorId: z.string().optional(),
      sourceSystem: z.string().optional(),
      dryRun: z.boolean().optional(),
      allocations: z.array(z.object({
        sourceRecordId: z.string().optional(),
        periodId: z.string().optional(),
        personId: z.string().optional(),
        personExternalId: z.string().optional(),
        projectId: z.string().optional(),
        projectExternalId: z.string().optional(),
        target: z.literal('bench').optional(),
        desiredTileCount: z.number().int().min(0).max(200),
        fromTarget: z.string().optional(),
        allowReduce: z.boolean().optional(),
        requirementId: z.string().optional(),
        projectSlotStart: z.number().int().nonnegative().optional(),
        skipRequirementSuggestion: z.boolean().optional(),
      })).min(1).max(500),
    },
    async ({ boardId, actorId, sourceSystem, dryRun, allocations }): Promise<CallToolResult> => withToolErrors(async () => {
      const resolvedBoardId = resolveBoardId(config, boardId);
      let board = await client.getBoard(resolvedBoardId);
      const issues = validateImportReferences(board.snapshot, { sourceSystem, allocations });
      if (dryRun || issues.some((issue) => issue.severity === 'error')) {
        const planned = allocations.map((allocation) => {
          const person = resolvePerson(board.snapshot, sourceSystem, allocation.personId, allocation.personExternalId, false);
          const target = allocation.target || resolveProject(board.snapshot, sourceSystem, allocation.projectId, allocation.projectExternalId, false)?.id;
          return {
            sourceRecordId: allocation.sourceRecordId,
            personId: person?.id,
            target,
            desiredTileCount: allocation.desiredTileCount,
          };
        });
        return jsonResult({ dryRun: true, issues, planned });
      }

      const results = [];
      for (const allocation of allocations) {
        const person = resolvePerson(board.snapshot, sourceSystem, allocation.personId, allocation.personExternalId);
        const target = allocation.target || resolveProject(board.snapshot, sourceSystem, allocation.projectId, allocation.projectExternalId)?.id;
        if (!target) throw new Error('Allocation target must resolve to a project or bench.');
        const selection = selectPersonCapacityReconciliation(board.snapshot, {
          personId: person.id,
          target,
          desiredTileCount: allocation.desiredTileCount,
          periodId: allocation.periodId,
          fromTarget: allocation.fromTarget,
          allowReduce: allocation.allowReduce,
          requirementId: allocation.requirementId,
          projectSlotStart: allocation.projectSlotStart,
          skipRequirementSuggestion: allocation.skipRequirementSuggestion,
        });
        if (selection.moves.length) {
          board = await client.executeCommand(resolvedBoardId, {
            type: 'allocations.move',
            periodId: selection.periodId,
            moves: selection.moves,
          }, {
            actorId,
            sourceSystem,
            sourceRecordId: allocation.sourceRecordId || allocation.personExternalId || allocation.personId,
            idempotencyKey: buildIdempotencyKey(sourceSystem, 'allocation', allocation.sourceRecordId || `${selection.periodId}:${person.id}:${target}`),
            diffSummary: `Reconcile ${person.id} allocation to ${target} at ${allocation.desiredTileCount} tile(s)`,
          });
        }
        results.push({
          sourceRecordId: allocation.sourceRecordId,
          personId: person.id,
          target,
          periodId: selection.periodId,
          desiredTileCount: selection.desiredTileCount,
          previousTileCount: selection.currentTileCount,
          movedTiles: selection.moves.length,
        });
      }

      return jsonResult({ results, board: compactBoardResult(board, board.snapshot.activePeriodId) });
    })
  );

  server.tool(
    'ptm_update_allocation_details',
    'Update imported allocation details such as hours, revenue, skill mapping, weekly overrides, and meeting state.',
    {
      boardId: optionalBoardId(),
      actorId: z.string().optional(),
      sourceSystem: z.string().optional(),
      sourceRecordId: z.string().optional(),
      allocationId: z.string().min(1),
      mode: z.enum(['revenue_first', 'hours_first']).optional(),
      revenueK: z.number().positive().optional(),
      hours: z.number().nonnegative().optional(),
      skillId: skillSchema.optional(),
      requirementId: z.string().optional(),
      projectSlotIndex: z.number().int().nonnegative().optional(),
      hoursOverridden: z.boolean().optional(),
      revenueOverridden: z.boolean().optional(),
      meetingState: meetingStateSchema.optional(),
      weeklyOverrides: z.array(weeklyOverrideSchema).optional(),
      dryRun: z.boolean().optional(),
    },
    async ({ boardId, actorId, sourceSystem, sourceRecordId, allocationId, dryRun, ...updates }): Promise<CallToolResult> => withToolErrors(async () => {
      const resolvedBoardId = resolveBoardId(config, boardId);
      const board = await client.getBoard(resolvedBoardId);
      const allocation = board.snapshot.allocations.find((item) => item.id === allocationId);
      if (!allocation) throw new Error(`Unknown allocationId: ${allocationId}`);
      const nextAllocation = {
        ...allocation,
        ...removeUndefined({
          ...updates,
          skillId: updates.skillId as SkillId | undefined,
        }),
      };
      if (dryRun) return jsonResult({ dryRun: true, currentAllocation: allocation, nextAllocation });

      const response = await client.executeCommand(resolvedBoardId, {
        type: 'allocations.update',
        allocation: nextAllocation,
      }, {
        actorId,
        sourceSystem,
        sourceRecordId: sourceRecordId || allocationId,
        idempotencyKey: buildIdempotencyKey(sourceSystem, 'allocation-update', sourceRecordId || allocationId),
        diffSummary: `Update allocation details ${allocationId}`,
      });
      return jsonResult({ updatedAllocationId: allocationId, board: compactBoardResult(response, nextAllocation.periodId) });
    })
  );

  server.tool(
    'ptm_archive_restore_entity',
    'Archive, restore, or delete people/projects through explicit backend commands. Destructive actions require confirm=true.',
    {
      boardId: optionalBoardId(),
      actorId: z.string().optional(),
      sourceSystem: z.string().optional(),
      entityType: z.enum(['person', 'project']),
      action: entityActionSchema,
      entityId: z.string().optional(),
      externalId: z.string().optional(),
      periodId: z.string().optional().describe('Required for project archive/restore because project hiding is period-scoped.'),
      confirm: z.boolean().optional(),
    },
    async ({ boardId, actorId, sourceSystem, entityType, action, entityId, externalId, periodId, confirm }): Promise<CallToolResult> => withToolErrors(async () => {
      const resolvedBoardId = resolveBoardId(config, boardId);
      const board = await client.getBoard(resolvedBoardId);
      if ((action === 'archive' || action === 'delete') && confirm !== true) {
        throw new Error(`${action} requires confirm=true.`);
      }

      if (entityType === 'person') {
        const person = resolvePerson(board.snapshot, sourceSystem, entityId, externalId);
        if (action === 'delete') throw new Error('People support archive/restore, not hard delete.');
        const command = action === 'archive'
          ? { type: 'person.archive' as const, personId: person.id, archivedAt: new Date().toISOString() }
          : { type: 'person.restore' as const, personId: person.id, periodIds: periodId ? [periodId] : undefined };
        const response = await client.executeCommand(resolvedBoardId, command, {
          actorId,
          sourceSystem,
          sourceRecordId: externalId || entityId,
          idempotencyKey: buildIdempotencyKey(sourceSystem, `person-${action}`, externalId || entityId || person.id),
          diffSummary: `${action} person ${person.name}`,
        });
        return jsonResult({ action, personId: person.id, board: compactBoardResult(response, periodId || response.snapshot.activePeriodId) });
      }

      const project = resolveProject(board.snapshot, sourceSystem, entityId, externalId);
      if (action !== 'delete' && !periodId) throw new Error('periodId is required for project archive/restore.');
      const command = action === 'archive'
        ? { type: 'project.archivePeriod' as const, projectId: project.id, periodId: periodId! }
        : action === 'restore'
          ? { type: 'project.restorePeriod' as const, projectId: project.id, periodId: periodId! }
          : { type: 'project.delete' as const, projectId: project.id };
      const response = await client.executeCommand(resolvedBoardId, command, {
        actorId,
        sourceSystem,
        sourceRecordId: externalId || entityId,
        idempotencyKey: buildIdempotencyKey(sourceSystem, `project-${action}`, externalId || entityId || project.id),
        diffSummary: `${action} project ${project.name}`,
      });
      return jsonResult({ action, projectId: project.id, board: compactBoardResult(response, periodId || response.snapshot.activePeriodId) });
    })
  );

  server.tool(
    'ptm_create_person_pair_block_rule',
    'Create a hard or warning person-pair planning rule through PTM persistence. Manual moves remain possible but will be validated.',
    {
      boardId: optionalBoardId(),
      personAId: z.string().min(1),
      personBId: z.string().min(1),
      periodId: z.string().optional().describe('When set, the rule applies only in this month. Omit for permanent.'),
      projectId: z.string().optional().describe('Optional project-specific scope. Omit to apply to all projects in scope.'),
      severity: planningRuleSeveritySchema.optional(),
      reason: z.string().optional(),
    },
    async ({ boardId, ...input }): Promise<CallToolResult> => withToolErrors(async () => {
      const resolvedBoardId = resolveBoardId(config, boardId);
      const board = await client.getBoard(resolvedBoardId);
      const rule = buildPersonPairBlockRule(board.snapshot, {
        ...input,
        severity: input.severity as PlanningRuleSeverity | undefined,
      });
      const response = await client.executeCommand(resolvedBoardId, {
        type: 'planningRules.upsertMany',
        planningRules: [rule],
      });
      return jsonResult({
        createdPlanningRule: rule,
        board: compactBoardResult(response, input.periodId || response.snapshot.activePeriodId),
      });
    })
  );

  server.tool(
    'ptm_delete_planning_rule',
    'Delete a planning rule by id through the PTM API command path. Requires confirm=true.',
    {
      boardId: optionalBoardId(),
      actorId: z.string().optional(),
      sourceSystem: z.string().optional(),
      planningRuleId: z.string().min(1),
      confirm: z.boolean(),
    },
    async ({ boardId, actorId, sourceSystem, planningRuleId, confirm }): Promise<CallToolResult> => withToolErrors(async () => {
      if (confirm !== true) throw new Error('planning rule delete requires confirm=true.');
      const resolvedBoardId = resolveBoardId(config, boardId);
      const response = await client.executeCommand(resolvedBoardId, {
        type: 'planningRules.delete',
        planningRuleId,
      }, {
        actorId,
        sourceSystem,
        sourceRecordId: planningRuleId,
        idempotencyKey: buildIdempotencyKey(sourceSystem, 'planning-rule-delete', planningRuleId),
        diffSummary: `Delete planning rule ${planningRuleId}`,
      });
      return jsonResult({ deletedPlanningRuleId: planningRuleId, board: compactBoardResult(response, response.snapshot.activePeriodId) });
    })
  );

  server.tool(
    'ptm_validate_import',
    'Dry-run validation for a planned import batch. This never mutates the board.',
    {
      boardId: optionalBoardId(),
      sourceSystem: z.string().optional(),
      people: z.array(personImportSchema.pick({ id: true, externalId: true, name: true })).optional(),
      projects: z.array(projectImportSchema.pick({
        id: true,
        externalId: true,
        name: true,
        periodId: true,
        revenuePlans: true,
      })).optional(),
      allocations: z.array(z.object({
        sourceRecordId: z.string().optional(),
        periodId: z.string().optional(),
        personId: z.string().optional(),
        personExternalId: z.string().optional(),
        projectId: z.string().optional(),
        projectExternalId: z.string().optional(),
        desiredTileCount: z.number().optional(),
      })).optional(),
    },
    async ({ boardId, sourceSystem, people, projects, allocations }): Promise<CallToolResult> => withToolErrors(async () => {
      const board = await client.getBoard(resolveBoardId(config, boardId));
      const issues = validateImportReferences(board.snapshot, { sourceSystem, people, projects, allocations });
      return jsonResult({
        ok: !issues.some((issue) => issue.severity === 'error'),
        issues,
        counts: {
          people: people?.length || 0,
          projects: projects?.length || 0,
          allocations: allocations?.length || 0,
        },
      });
    })
  );
}

function resolvePerson(
  snapshot: TrafficSnapshot,
  sourceSystem: string | undefined,
  personId: string | undefined,
  externalId: string | undefined
): TrafficSnapshot['people'][number];
function resolvePerson(
  snapshot: TrafficSnapshot,
  sourceSystem: string | undefined,
  personId: string | undefined,
  externalId: string | undefined,
  strict: false
): TrafficSnapshot['people'][number] | undefined;
function resolvePerson(
  snapshot: TrafficSnapshot,
  sourceSystem: string | undefined,
  personId: string | undefined,
  externalId: string | undefined,
  strict = true
): TrafficSnapshot['people'][number] | undefined {
  const person = personId
    ? snapshot.people.find((item) => item.id === personId)
    : findPersonByExternalRef(snapshot, sourceSystem, externalId);
  if (!person && strict) {
    throw new Error(`Unable to resolve person ${personId || externalId || 'unknown'}.`);
  }
  return person;
}

function resolveProject(
  snapshot: TrafficSnapshot,
  sourceSystem: string | undefined,
  projectId: string | undefined,
  externalId: string | undefined
): ProjectFrame;
function resolveProject(
  snapshot: TrafficSnapshot,
  sourceSystem: string | undefined,
  projectId: string | undefined,
  externalId: string | undefined,
  strict: false
): ProjectFrame | undefined;
function resolveProject(
  snapshot: TrafficSnapshot,
  sourceSystem: string | undefined,
  projectId: string | undefined,
  externalId: string | undefined,
  strict = true
): ProjectFrame | undefined {
  const project = projectId
    ? snapshot.projects.find((item) => item.id === projectId)
    : findProjectByExternalRef(snapshot, sourceSystem, externalId);
  if (!project && strict) {
    throw new Error(`Unable to resolve project ${projectId || externalId || 'unknown'}.`);
  }
  return project;
}

function mergeProject(
  existing: ProjectFrame,
  imported: ProjectFrame,
  sourceSystem: string,
  externalId: string | undefined
): ProjectFrame {
  return {
    ...existing,
    ...imported,
    invoices: existing.invoices,
    archivedAt: existing.archivedAt,
    archivedPeriodIds: existing.archivedPeriodIds,
    externalRefs: mergeExternalRefs(existing.externalRefs, sourceSystem, externalId),
    revenuePlan: mergeRevenuePlans(existing.revenuePlan, imported.revenuePlan),
    requirements: imported.requirements.length ? imported.requirements : existing.requirements,
  };
}

function mergeRevenuePlans(existing: MonthlyRevenuePlan[], imported: MonthlyRevenuePlan[]) {
  const byPeriod = new Map(existing.map((plan) => [plan.periodId, plan]));
  imported.forEach((plan) => {
    byPeriod.set(plan.periodId, {
      ...byPeriod.get(plan.periodId),
      ...plan,
      currency: plan.currency?.toUpperCase(),
      probability: normalizeProbability(plan.probability),
    });
  });
  return Array.from(byPeriod.values()).sort((a, b) => a.periodId.localeCompare(b.periodId));
}

function mergeRequirements(existing: ProjectFrame['requirements'], imported: ProjectFrame['requirements']) {
  const byId = new Map(existing.map((requirement) => [requirement.id, requirement]));
  imported.forEach((requirement) => byId.set(requirement.id, requirement));
  return Array.from(byId.values());
}

function normalizeProbability(value: number | undefined) {
  if (value === undefined) return value;
  if (value > 1) return Math.min(100, value) / 100;
  return Math.max(0, Math.min(1, value));
}

function buildIdempotencyKey(sourceSystem: string | undefined, entityType: string, sourceRecordId: string) {
  return [sourceSystem || 'ptm-mcp', entityType, sourceRecordId].join(':');
}

function removeUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as Partial<T>;
}

function compactBoardResult(board: TrafficBoardResponse, periodId = board.snapshot.activePeriodId) {
  return {
    boardId: board.boardId,
    updatedAt: board.updatedAt,
    version: board.version,
    ...summarizeBoard(board.snapshot, periodId, { includeEntities: false }),
    fullSnapshotOmitted: true,
    next: 'Call ptm_get_board_overview for entity ids or ptm_get_board_snapshot only for full-state debugging.',
  };
}

function optionalBoardId() {
  return z.string().optional().describe('PTM board id. Defaults to PTM_MCP_BOARD_ID or ptm-mvp.');
}

async function withToolErrors(action: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await action();
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
      isError: true,
    };
  }
}

function jsonResult(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

function resolveBoardId(config: PtmMcpConfig, boardId?: string) {
  return boardId?.trim() || config.defaultBoardId;
}
