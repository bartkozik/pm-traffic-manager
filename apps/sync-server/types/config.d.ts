
export interface ServerKeypair {
  publicKey: string;
  privateKey: string;
}

export interface ServerConfig {
  serverId: string;
  keypair?: ServerKeypair;
}

export interface RetentionPolicyRule {
  interval: string;
  keep: number;
  description?: string;
}

export interface RetentionPolicyDeleteRule {
  action: 'delete';
  description?: string;
}

export interface RetentionPolicy {
  lastHour?: RetentionPolicyRule;
  today?: RetentionPolicyRule;
  thisWeek?: RetentionPolicyRule;
  thisMonth?: RetentionPolicyRule;
  thisYear?: RetentionPolicyRule;
  lastWeek?: RetentionPolicyRule;
  lastMonth?: RetentionPolicyRule;
  older: RetentionPolicyDeleteRule;
}

export interface BackupSource {
  wsUrl: string;
  httpUrl: string;
  documents: string[];
  schedule: string;
  retentionPolicy?: RetentionPolicy;
}

export interface CleanupConfig {
  intervalMinutes: number;
  enableLogging: boolean;
  maxVersionsPerCleanup?: number;
  dryRun?: boolean;
}

export interface StorageConfig {
  compression?: boolean;
  maxDocumentSize?: string;
  maxTotalStorage?: string;
}

export interface SyncServerConfig {
  server: ServerConfig;
  backupSources: BackupSource[];
  defaultRetentionPolicy: RetentionPolicy;
  cleanup: CleanupConfig;
}

export interface RetentionConfig {
  retentionPolicies: {
    [key: string]: RetentionPolicy;
  };
  cleanup: CleanupConfig;
  storage?: StorageConfig;
}
