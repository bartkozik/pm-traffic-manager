/**
 * TypeScript type definitions for sync-server API interfaces
 * These types ensure consistency across HTTP and WebSocket APIs
 */

// Document and Version Management Types
export interface DocumentInfo {
  roomname: string;
  status: 'exists' | 'not_found';
  versions?: number;
  created?: string;
  lastModified?: string;
  size?: number;
}

export interface VersionInfo {
  timestamp: string;
  documentId: string;
  source: string;
  size: number;
  metadata?: {
    signature?: string;
    authority?: string;
    [key: string]: unknown;
  };
}

export interface VersionListResponse {
  roomname: string;
  versions: VersionInfo[];
  totalVersions: number;
}

export interface NodeExtractionQuery {
  selector?: string;
  type?: string;
  content?: string;
  properties?: Record<string, unknown>;
}

export interface NodeExtractionResult {
  id: string;
  type: string;
  content: unknown;
  properties: Record<string, unknown>;
  position?: {
    x: number;
    y: number;
  };
}

export interface ExtractedNodes {
  roomname: string;
  nodes: NodeExtractionResult[];
  totalNodes: number;
  extractedAt: string;
}

// Collaboration Types
export interface CursorState {
  type: 'cursor';
  userId: string;
  x: number;
  y: number;
  userName?: string;
  color?: string;
}

export interface LockState {
  type: 'lock';
  action: 'acquire' | 'release';
  nodeId: string;
  userId: string;
  ttl?: number;
}

export interface PresenceState {
  type: 'presence';
  userId: string;
  status: 'active' | 'idle' | 'away';
  userName?: string;
  lastSeen?: string;
}

export interface SelectionState {
  type: 'selection';
  userId: string;
  nodeIds: string[];
}

export interface EphemeralState {
  cursors: Map<string, CursorState>;
  locks: Map<string, LockState>;
  presence: Map<string, PresenceState>;
  selections: Map<string, SelectionState>;
}

export interface InitialCollaborationState {
  type: 'initial-state';
  cursors: CursorState[];
  locks: LockState[];
  presence: PresenceState[];
}

// Backup Types
export interface BackupStatus {
  isRunning: boolean;
  sources: number;
  lastBackup?: string;
  nextBackup?: string;
  stats: BackupSourceStats[];
}

export interface BackupSourceStats {
  sourceId: string;
  wsUrl: string;
  httpUrl: string;
  status: 'active' | 'error' | 'disabled';
  lastBackup?: string;
  documentsBackedUp: number;
  totalSize: number;
  errors?: string[];
}

// Authority Management Types
export interface AuthorityKeypair {
  publicKey: string;
  algorithm: string;
  format: string;
}

export interface DocumentSignature {
  signature: string;
  publicKey: string;
  algorithm: string;
  timestamp: string;
}

export interface SignatureVerificationResult {
  valid: boolean;
  publicKey?: string;
  timestamp?: string;
  error?: string;
}

// Health Check Response
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  uptime?: number;
  memory?: {
    used: number;
    total: number;
  };
  documents?: {
    count: number;
    totalSize: number;
  };
  websockets?: {
    connections: number;
    rooms: number;
  };
}

// API Error Response
export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// Generic API Response
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiErrorResponse;
  timestamp: string;
}