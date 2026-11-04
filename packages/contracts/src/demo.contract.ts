import { z } from 'zod';
import { trafficBoardIdSchema } from './trafficBoard.contract.js';

export const demoSessionResponseSchema = z.object({
  boardId: trafficBoardIdSchema,
  expiresAt: z.string().datetime(),
  aiRemaining: z.number().int().min(0).max(3),
  aiAvailable: z.boolean(),
});
export type DemoSessionResponse = z.infer<typeof demoSessionResponseSchema>;
