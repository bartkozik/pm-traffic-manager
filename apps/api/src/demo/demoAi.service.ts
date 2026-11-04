import { randomUUID } from 'node:crypto';
import { generateMonthOpportunityAnalysis } from '@ptm/domain';
import { opportunityCheckResultSchema, type OpportunityCheckResponse } from '@ptm/contracts';
import type { TrafficBoardRecord } from '../traffic/repositories/trafficBoard.repository.js';
import { getOpportunitySystemPrompt, getOpportunityUserPrompt, normalizeOpportunityModelResult } from '../traffic/services/opportunityCheck.service.js';
import { DemoError, DemoRepository, hash } from './demo.repository.js';

const MODEL = 'gpt-5.4-mini-2026-03-17';
const MAX_PROMPT_BYTES = 100000;
const MAX_INPUT_TOKENS = MAX_PROMPT_BYTES + 4096;
const MAX_OUTPUT_TOKENS = 4096;
const RESERVATION_NANO = MAX_INPUT_TOKENS * 750 + MAX_OUTPUT_TOKENS * 4500;

export class DemoOpportunityCheckService {
  constructor(private readonly repository: DemoRepository, private readonly apiKey?: string) {}

  async check(board: TrafficBoardRecord, periodId: string): Promise<OpportunityCheckResponse> {
    if (!this.apiKey) throw unavailable();
    if (!board.snapshot.periods.some((period) => period.id === periodId && period.granularity === 'month')) throw new DemoError(400, 'DEMO_AI_PERIOD', 'Select a month for AI analysis.');
    const analysis = generateMonthOpportunityAnalysis(board.snapshot, periodId, board.updatedAt);
    const messages = [{ role: 'system', content: getOpportunitySystemPrompt() }, { role: 'user', content: getOpportunityUserPrompt(analysis) }];
    const prompt = JSON.stringify(messages);
    if (Buffer.byteLength(prompt) > MAX_PROMPT_BYTES) throw new DemoError(413, 'DEMO_AI_INPUT_LIMIT', 'This board is too large for demo AI analysis.');
    const cacheKey = hash(JSON.stringify({ model: MODEL, messages, periodId, snapshot: board.snapshot }));
    const reservation = await this.reserve(board.boardId, cacheKey);
    if ('cached' in reservation) return { boardId: board.boardId, periodId, analysis, result: opportunityCheckResultSchema.parse(reservation.cached), mode: 'model', updatedAt: new Date().toISOString() };
    let responseReceived = false;
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ model: MODEL, messages, response_format: { type: 'json_object' }, max_completion_tokens: MAX_OUTPUT_TOKENS, reasoning_effort: 'none', service_tier: 'default', store: false }),
      });
      responseReceived = true;
      if (!response.ok) { await response.body?.cancel(); throw unavailable(); }
      const payload = await readBoundedJson(response) as { model?: string; service_tier?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
      const usage = payload.usage;
      if (payload.model === MODEL && (!payload.service_tier || payload.service_tier === 'default') && usage && validCount(usage.prompt_tokens, MAX_INPUT_TOKENS) && validCount(usage.completion_tokens, MAX_OUTPUT_TOKENS) && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens) {
        await this.reconcile(reservation.id, usage.prompt_tokens * 750 + usage.completion_tokens * 4500);
      }
      const content = payload.choices?.[0]?.message?.content;
      if (!content || payload.choices?.[0]?.finish_reason === 'length') throw unavailable();
      const result = opportunityCheckResultSchema.parse(normalizeOpportunityModelResult(JSON.parse(content)));
      await this.repository.pool.query('UPDATE demo_ai_reservations SET result_json=$2 WHERE id=$1', [reservation.id, JSON.stringify(result)]);
      return { boardId: board.boardId, periodId, analysis, result, mode: 'model', updatedAt: new Date().toISOString() };
    } catch {
      throw unavailable();
    } finally {
      if (responseReceived) await this.repository.pool.query('UPDATE demo_ai_reservations SET finished=TRUE WHERE id=$1', [reservation.id]);
    }
  }

  private async reserve(boardId: string, cacheKey: string): Promise<{ id: string } | { cached: unknown }> {
    return this.repository.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(71829302)');
      const session = await client.query<{ token_hash: string; ai_attempts: number }>('SELECT token_hash,ai_attempts FROM demo_sessions WHERE board_id=$1 AND expires_at>NOW() FOR UPDATE', [boardId]);
      if (!session.rows[0]) throw new DemoError(401, 'DEMO_SESSION_REQUIRED', 'Start a new demo session to continue.');
      const tokenHash = session.rows[0].token_hash;
      const cache = await client.query('SELECT result_json FROM demo_ai_reservations WHERE token_hash=$1 AND cache_key=$2 AND result_json IS NOT NULL ORDER BY created_at DESC LIMIT 1', [tokenHash, cacheKey]);
      if (cache.rows[0]) return { cached: cache.rows[0].result_json };
      if (session.rows[0].ai_attempts >= 3) throw new DemoError(429, 'DEMO_AI_LIMIT', 'This demo session has used all 3 AI analyses.');
      const active = await client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM demo_ai_reservations WHERE NOT finished AND created_at>NOW()-INTERVAL '2 minutes'");
      if (active.rows[0].count >= 2) throw new DemoError(429, 'DEMO_AI_BUSY', 'AI is busy. Please try again shortly.');
      const month = (await client.query<{ month: string }>("SELECT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM') AS month")).rows[0].month;
      await client.query('INSERT INTO demo_ai_months(month) VALUES($1) ON CONFLICT DO NOTHING', [month]);
      const reserved = await client.query('UPDATE demo_ai_months SET reserved_nano=reserved_nano+$2 WHERE month=$1 AND reserved_nano+$2<=5000000000 RETURNING month', [month, RESERVATION_NANO]);
      if (!reserved.rowCount) throw new DemoError(429, 'DEMO_AI_BUDGET', 'The demo monthly AI budget is used up. The board remains available.');
      await client.query('UPDATE demo_sessions SET ai_attempts=ai_attempts+1 WHERE token_hash=$1', [tokenHash]);
      const id = randomUUID();
      await client.query('INSERT INTO demo_ai_reservations(id,token_hash,month,reserved_nano,cache_key) VALUES($1,$2,$3,$4,$5)', [id, tokenHash, month, RESERVATION_NANO, cacheKey]);
      return { id };
    });
  }

  private async reconcile(id: string, actualNano: number) {
    await this.repository.transaction(async (client) => {
      const reservation = await client.query<{ month: string; reserved_nano: string }>('SELECT month,reserved_nano FROM demo_ai_reservations WHERE id=$1 FOR UPDATE', [id]);
      if (!reservation.rows[0]) return;
      const reservedNano = Number(reservation.rows[0].reserved_nano);
      if (actualNano > reservedNano) return;
      await client.query('UPDATE demo_ai_months SET reserved_nano=reserved_nano-$2 WHERE month=$1', [reservation.rows[0].month, reservedNano - actualNano]);
      await client.query('UPDATE demo_ai_reservations SET reserved_nano=$2 WHERE id=$1', [id, Math.max(actualNano, 1)]);
    });
  }
}
function validCount(value: unknown, max: number): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max; }
function unavailable() { return new DemoError(503, 'DEMO_AI_UNAVAILABLE', 'AI analysis is currently unavailable. You can continue using the board.'); }
async function readBoundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw unavailable();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 100000) throw unavailable();
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel(); }
}
