import {
  generateMonthOpportunityAnalysis,
  MonthOpportunityAnalysis,
} from '@ptm/domain';
import {
  OpportunityCheckResponse,
  OpportunityCheckResult,
  opportunityCheckResultSchema,
} from '@ptm/contracts';
import { TrafficBoardRecord } from '../repositories/trafficBoard.repository.js';

export interface OpportunityCheckConfig {
  anthropicApiKey?: string;
  model: string;
  openAiApiKey?: string;
  provider: 'openai' | 'anthropic';
}

export class OpportunityCheckModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpportunityCheckModelError';
  }
}

export class OpportunityCheckService {
  constructor(private readonly config: OpportunityCheckConfig) {}

  async check(board: TrafficBoardRecord, periodId: string): Promise<OpportunityCheckResponse> {
    const analysis = generateMonthOpportunityAnalysis(board.snapshot, periodId);
    const result = await this.tryModelCheck(analysis);

    return {
      boardId: board.boardId,
      periodId,
      mode: 'model',
      analysis,
      result,
      updatedAt: new Date().toISOString(),
    };
  }

  private async tryModelCheck(analysis: MonthOpportunityAnalysis): Promise<OpportunityCheckResult> {
    try {
      const content = await this.callConfiguredModel(analysis);
      return opportunityCheckResultSchema.parse(normalizeOpportunityModelResult(JSON.parse(extractJsonText(content))));
    } catch (error) {
      if (error instanceof OpportunityCheckModelError) throw error;
      if (error instanceof Error) {
        throw new OpportunityCheckModelError(`AI model response could not be used: ${error.message}`);
      }
      throw new OpportunityCheckModelError('AI model response could not be used.');
    }
  }

  private async callConfiguredModel(analysis: MonthOpportunityAnalysis): Promise<string> {
    if (this.config.provider === 'anthropic') {
      return this.callAnthropic(analysis);
    }
    return this.callOpenAi(analysis);
  }

  private async callOpenAi(analysis: MonthOpportunityAnalysis): Promise<string> {
    if (!this.config.openAiApiKey) {
      throw new OpportunityCheckModelError('OpenAI API key is not configured for AI Check.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.openAiApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: getOpportunitySystemPrompt(),
          },
          {
            role: 'user',
            content: getOpportunityUserPrompt(analysis),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new OpportunityCheckModelError(`OpenAI request failed with ${response.status}: ${sanitizeModelError(errorBody)}`);
    }
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new OpportunityCheckModelError('OpenAI response did not include model content.');
    }
    return content;
  }

  private async callAnthropic(analysis: MonthOpportunityAnalysis): Promise<string> {
    if (!this.config.anthropicApiKey) {
      throw new OpportunityCheckModelError('Anthropic API key is not configured for AI Check.');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'x-api-key': this.config.anthropicApiKey,
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 3000,
        temperature: 0.2,
        system: getOpportunitySystemPrompt(),
        messages: [
          {
            role: 'user',
            content: getOpportunityUserPrompt(analysis),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new OpportunityCheckModelError(`Anthropic request failed with ${response.status}: ${sanitizeModelError(errorBody)}`);
    }
    const payload = await response.json() as {
      content?: Array<{ text?: string; type?: string }>;
    };
    const content = payload.content?.find((block) => block.type === 'text' && block.text)?.text;
    if (!content) {
      throw new OpportunityCheckModelError('Anthropic response did not include model content.');
    }
    return content;
  }
}

function sanitizeModelError(message: string) {
  return message
    .replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]')
    .replace(/sk-ant-[a-zA-Z0-9_-]+/g, '[redacted]')
    .slice(0, 600);
}

function extractJsonText(content: string) {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch?.[1]?.trim() || trimmed;
}

export function getOpportunitySystemPrompt() {
  return [
    'You are an operations and commercial planning analyst for a software house.',
    'Use only the supplied data. Do not invent numbers.',
    'The selected month is the financial planning container, while week planning is the default operational surface in Diablo Board.',
    'Revenue tiles represent client revenue/capacity; internal person cost is calculated separately.',
    'Expected and committed revenue are separate.',
    'Use commercial revenue fields for margin decisions. Non-commercial capacity fields such as nonCommercialCapacityK are internal capacity/cost signals, not client revenue.',
    'Client payment collection is managed outside PTM in this MVP; do not analyze invoice schedules or payment inflows.',
    'Treat analysis.allocationRisks and each project.validationWarnings as first-class evidence. If any invalid or warning risks exist, mention the most important concrete people/projects in topReasons, projectActions, deliveryHrRisks, financialRisks, or assumptionsToVerify.',
    'Treat each project.requirementCoverage item as the source of truth for missing requirement hours, including skill, seniority, and phase. Do not collapse separate requirements just because they share the same skill.',
    'Treat project.resourceGapK and analysis.monthSummary.unallocatedPlannedRevenueK as explicit resource coverage gaps. If a project has planned revenue not covered by allocated tiles, state which project lacks human resources or capacity coverage.',
    'Use each project.allocationCandidates as deterministic evidence for allocationSuggestions. Candidates may come from bench or from currently misallocated/low-value project tiles; use source, sourceTargetIds, and sourceReason to explain corrections. Prefer candidates with higher fitScore and estimatedGrossProfitK when they satisfy requirements, seniority, blocked/preferred people, and available source hours.',
    'Balance commercial margin with bench utilization: after profitable feasible allocations, call out people from analysis.benchUtilizationSuggestions that should get an in-house R&D, sales-support, or bench goal instead of sitting idle.',
    'Do not put verdict values inside projectActions[].action. projectActions[].action must be exactly one of keep, drop, delay, renegotiate, or reallocate. Map pursue to keep, pursue_with_changes to reallocate or renegotiate for the concrete project, and drop_or_delay to drop or delay for the concrete project.',
    'Always include every array field from the output schema. Use [] when there are no items, especially for allocationSuggestions.',
    'For optional JSON fields, omit the field when unknown instead of returning null.',
    'Return only valid JSON matching the requested schema. Do not wrap JSON in markdown fences.',
  ].join(' ');
}

export function getOpportunityUserPrompt(analysis: MonthOpportunityAnalysis) {
  return JSON.stringify({
    objective: 'Assess whether this monthly pipeline is worth pursuing and what to change.',
    outputSchema: {
      verdict: 'pursue | pursue_with_changes | renegotiate | drop_or_delay',
      confidence: 'low | medium | high',
      topReasons: ['string'],
      projectActions: [{
        projectId: 'string',
        action: 'keep | drop | delay | renegotiate | reallocate (project action only; never use verdict values here)',
        reason: 'string',
        evidence: ['string'],
      }],
      allocationSuggestions: [{ projectId: 'string', fromPersonId: 'string?', toPersonId: 'string?', reason: 'string', expectedImpact: 'string' }],
      bottlenecks: ['string'],
      financialRisks: ['string'],
      deliveryHrRisks: ['string'],
      assumptionsToVerify: ['string'],
      nextScenarioToTry: 'string',
    },
    analysis,
  });
}

export function normalizeOpportunityModelResult(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;

  const result = value as Record<string, unknown>;
  const projectActions = Array.isArray(result.projectActions)
    ? result.projectActions.map(normalizeOpportunityProjectAction)
    : result.projectActions;

  return {
    ...result,
    topReasons: defaultMissingArray(result.topReasons),
    projectActions: defaultMissingArray(projectActions),
    allocationSuggestions: defaultMissingArray(result.allocationSuggestions),
    bottlenecks: defaultMissingArray(result.bottlenecks),
    financialRisks: defaultMissingArray(result.financialRisks),
    deliveryHrRisks: defaultMissingArray(result.deliveryHrRisks),
    assumptionsToVerify: defaultMissingArray(result.assumptionsToVerify),
  };
}

function defaultMissingArray(value: unknown) {
  return value === undefined ? [] : value;
}

function normalizeOpportunityProjectAction(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;

  const action = (value as Record<string, unknown>).action;
  if (typeof action !== 'string') return value;

  return {
    ...(value as Record<string, unknown>),
    action: normalizeOpportunityProjectActionValue(action),
  };
}

function normalizeOpportunityProjectActionValue(action: string) {
  switch (action) {
    case 'pursue':
      return 'keep';
    case 'pursue_with_changes':
      return 'reallocate';
    case 'drop_or_delay':
      return 'delay';
    default:
      return action;
  }
}
