import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTrafficBoardRepository } from '../repositories/inMemoryTrafficBoard.repository.testSupport.js';
import { OpportunityCheckModelError, OpportunityCheckService } from './opportunityCheck.service.js';
import { TrafficBoardService } from './trafficBoard.service.js';

const validModelResult = {
  verdict: 'renegotiate',
  confidence: 'high',
  topReasons: ['Project note indicates scope risk.'],
  projectActions: [{
    projectId: 'project-alpha',
    action: 'renegotiate',
    reason: 'Scope risk is noted on the project.',
    evidence: ['project note'],
  }],
  allocationSuggestions: [],
  bottlenecks: [],
  financialRisks: ['Scope may expand.'],
  deliveryHrRisks: [],
  assumptionsToVerify: ['Verify the project note.'],
  nextScenarioToTry: 'Renegotiate scope and rerun AI Check.',
} as const;

describe('OpportunityCheckService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires a model key instead of returning a mock recommendation', async () => {
    const repository = new InMemoryTrafficBoardRepository();
    const boardService = new TrafficBoardService(repository);
    const opportunityService = new OpportunityCheckService({
      model: 'test-model',
      provider: 'openai',
    });
    const board = await boardService.getOrCreate('ptm-mvp');

    await expect(opportunityService.check(board, board.snapshot.activePeriodId)).rejects.toThrow(OpportunityCheckModelError);
  });

  it('returns model recommendations when OpenAI responds with valid structured JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify(validModelResult),
        },
      }],
    }), { status: 200 })));
    const repository = new InMemoryTrafficBoardRepository();
    const boardService = new TrafficBoardService(repository);
    const opportunityService = new OpportunityCheckService({
      model: 'test-model',
      openAiApiKey: 'test-key',
      provider: 'openai',
    });
    const board = await boardService.getOrCreate('ptm-mvp');

    const response = await opportunityService.check(board, board.snapshot.activePeriodId);

    expect(response.mode).toBe('model');
    expect(response.result.verdict).toBe('renegotiate');
  });

  it('returns model recommendations when Anthropic responds with valid structured JSON', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      content: [{
        type: 'text',
        text: `\`\`\`json\n${JSON.stringify(validModelResult)}\n\`\`\``,
      }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const repository = new InMemoryTrafficBoardRepository();
    const boardService = new TrafficBoardService(repository);
    const opportunityService = new OpportunityCheckService({
      anthropicApiKey: 'test-key',
      model: 'claude-test-model',
      provider: 'anthropic',
    });
    const board = await boardService.getOrCreate('ptm-mvp');

    const response = await opportunityService.check(board, board.snapshot.activePeriodId);

    expect(response.mode).toBe('model');
    expect(response.result.verdict).toBe('renegotiate');
    expect(fetchMock).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'anthropic-version': '2023-06-01',
        'x-api-key': 'test-key',
      }),
    }));
  });

  it('normalizes nullable optional allocation suggestion people returned by the model', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            verdict: 'pursue_with_changes',
            confidence: 'medium',
            topReasons: ['Reallocate bench capacity.'],
            projectActions: [],
            allocationSuggestions: [{
              projectId: 'project-alpha',
              fromPersonId: null,
              toPersonId: null,
              reason: 'Use available bench capacity.',
              expectedImpact: 'Covers missing requirement hours.',
            }],
            bottlenecks: [],
            financialRisks: [],
            deliveryHrRisks: [],
            assumptionsToVerify: [],
            nextScenarioToTry: 'Apply the suggested allocation and rerun AI Check.',
          }),
        },
      }],
    }), { status: 200 })));
    const repository = new InMemoryTrafficBoardRepository();
    const boardService = new TrafficBoardService(repository);
    const opportunityService = new OpportunityCheckService({
      model: 'test-model',
      openAiApiKey: 'test-key',
      provider: 'openai',
    });
    const board = await boardService.getOrCreate('ptm-mvp');

    const response = await opportunityService.check(board, board.snapshot.activePeriodId);

    expect(response.result.allocationSuggestions[0]).toEqual({
      projectId: 'project-alpha',
      reason: 'Use available bench capacity.',
      expectedImpact: 'Covers missing requirement hours.',
    });
  });

  it('defaults omitted model list sections to empty arrays', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            verdict: 'pursue_with_changes',
            confidence: 'medium',
            nextScenarioToTry: 'Apply deterministic allocation suggestions and rerun AI Check.',
          }),
        },
      }],
    }), { status: 200 })));
    const repository = new InMemoryTrafficBoardRepository();
    const boardService = new TrafficBoardService(repository);
    const opportunityService = new OpportunityCheckService({
      model: 'test-model',
      openAiApiKey: 'test-key',
      provider: 'openai',
    });
    const board = await boardService.getOrCreate('ptm-mvp');

    const response = await opportunityService.check(board, board.snapshot.activePeriodId);

    expect(response.result.topReasons).toEqual([]);
    expect(response.result.projectActions).toEqual([]);
    expect(response.result.allocationSuggestions).toEqual([]);
    expect(response.result.bottlenecks).toEqual([]);
    expect(response.result.financialRisks).toEqual([]);
    expect(response.result.deliveryHrRisks).toEqual([]);
    expect(response.result.assumptionsToVerify).toEqual([]);
  });

  it('normalizes verdict values accidentally returned as project action values', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            verdict: 'pursue_with_changes',
            confidence: 'medium',
            topReasons: ['The model used verdict names inside project actions.'],
            projectActions: [
              {
                projectId: 'project-alpha',
                action: 'pursue_with_changes',
                reason: 'Change staffing before pursuing.',
                evidence: ['resource gap'],
              },
              {
                projectId: 'project-beta',
                action: 'drop_or_delay',
                reason: 'Delay this project until capacity is available.',
                evidence: ['missing capacity'],
              },
              {
                projectId: 'project-gamma',
                action: 'pursue',
                reason: 'Keep this project in the plan.',
                evidence: ['healthy margin'],
              },
            ],
            allocationSuggestions: [],
            bottlenecks: [],
            financialRisks: [],
            deliveryHrRisks: [],
            assumptionsToVerify: [],
            nextScenarioToTry: 'Apply safer project actions and rerun AI Check.',
          }),
        },
      }],
    }), { status: 200 })));
    const repository = new InMemoryTrafficBoardRepository();
    const boardService = new TrafficBoardService(repository);
    const opportunityService = new OpportunityCheckService({
      model: 'test-model',
      openAiApiKey: 'test-key',
      provider: 'openai',
    });
    const board = await boardService.getOrCreate('ptm-mvp');

    const response = await opportunityService.check(board, board.snapshot.activePeriodId);

    expect(response.result.projectActions.map((action) => action.action)).toEqual([
      'reallocate',
      'delay',
      'keep',
    ]);
  });

  it('fails clearly instead of falling back to deterministic recommendations when the model call fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network unavailable');
    }));
    const repository = new InMemoryTrafficBoardRepository();
    const boardService = new TrafficBoardService(repository);
    const opportunityService = new OpportunityCheckService({
      model: 'test-model',
      openAiApiKey: 'test-key',
      provider: 'openai',
    });
    const board = await boardService.getOrCreate('ptm-mvp');

    await expect(opportunityService.check(board, board.snapshot.activePeriodId)).rejects.toThrow(OpportunityCheckModelError);
  });
});
