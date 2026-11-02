export type DragPayload =
  | { type: 'person'; personId: string }
  | { type: 'tile'; tileId: string }
  | { type: 'allocation-group'; allocationIds: string[] };

export interface DropPayloadOptions {
  disableRequirementSuggestion?: boolean;
  projectSlotIndex?: number;
  requirementId?: string;
}
