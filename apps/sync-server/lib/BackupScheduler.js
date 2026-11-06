import cron from 'node-cron';
import { minimatch } from 'minimatch';
import * as fs from 'fs';
import * as path from 'path';
import * as Y from 'yjs';
import { WebSocketClient } from './WebSocketClient.js';
import { VersionManager } from './VersionManager.js';
import { RetentionEngine } from './RetentionEngine.js';

export class BackupScheduler {
  constructor(config, authorityManager) {
    this.config = config;
    this.authorityManager = authorityManager;
    this.backupSources = config.backupSources || [];
    this.scheduledTasks = new Map();
    this.isRunning = false;
    this.backupStats = new Map();

    this.backupStorageDir = path.join(process.env.YJS_DATA_DIR || './data-docs', 'backups');
    this.ensureBackupDirectories();

    this.backupVersionManagers = new Map();
    this.backupRetentionEngines = new Map();
  }

  ensureBackupDirectories() {
    if (!fs.existsSync(this.backupStorageDir)) {
      fs.mkdirSync(this.backupStorageDir, { recursive: true });
      console.log(`Created backup storage directory: ${this.backupStorageDir}`);
    }
  }

  getBackupSourceDir(sourceId) {
    return path.join(this.backupStorageDir, sourceId);
  }

  initializeBackupVersionManager(sourceConfig) {
    const sourceId = this.getSourceId(sourceConfig.wsUrl);
    const sourceDir = this.getBackupSourceDir(sourceId);

    if (!this.backupVersionManagers.has(sourceId)) {
      const retentionPolicy = sourceConfig.retentionPolicy || this.config.defaultRetentionPolicy;
      const retentionConfig = {
        retentionPolicies: { default: retentionPolicy },
        cleanup: this.config.cleanup
      };

      const versionManager = new VersionManager(sourceDir, retentionConfig);
      const retentionEngine = new RetentionEngine(versionManager, retentionConfig);

      this.backupVersionManagers.set(sourceId, versionManager);
      this.backupRetentionEngines.set(sourceId, retentionEngine);
    }

    return {
      versionManager: this.backupVersionManagers.get(sourceId),
      retentionEngine: this.backupRetentionEngines.get(sourceId)
    };
  }

  getSourceId(wsUrl) {
    return wsUrl.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  start() {
    if (this.isRunning) {
      console.log('Backup scheduler is already running');
      return;
    }

    console.log(`Starting backup scheduler with ${this.backupSources.length} sources`);
    this.isRunning = true;

    for (const sourceConfig of this.backupSources) {
      this.scheduleBackupSource(sourceConfig);
    }
  }

  stop() {
    if (!this.isRunning) {
      console.log('Backup scheduler is not running');
      return;
    }

    console.log('Stopping backup scheduler');
    this.isRunning = false;

    for (const [sourceId, task] of this.scheduledTasks) {
      if (task && task.stop) {
        task.stop();
      }
    }
    this.scheduledTasks.clear();
  }

  scheduleBackupSource(sourceConfig) {
    const sourceId = this.getSourceId(sourceConfig.wsUrl);

    if (!sourceConfig.schedule) {
      console.log(`No schedule defined for backup source: ${sourceConfig.wsUrl}`);
      return;
    }

    try {
      const task = cron.createTask(sourceConfig.schedule, async () => {
        await this.executeBackup(sourceConfig);
      });

      this.scheduledTasks.set(sourceId, task);
      task.start();

      console.log(`Scheduled backup for ${sourceConfig.wsUrl} with cron: ${sourceConfig.schedule}`);
    } catch (error) {
      console.error(`Failed to schedule backup for ${sourceConfig.wsUrl}:`, error);
    }
  }

  async executeBackup(sourceConfig) {
    const sourceId = this.getSourceId(sourceConfig.wsUrl);
    console.log(`Starting backup from ${sourceConfig.wsUrl}...`);

    const startTime = Date.now();
    let totalDocuments = 0;
    let successfulBackups = 0;
    let failedBackups = 0;

    try {
      const { versionManager, retentionEngine } = this.initializeBackupVersionManager(sourceConfig);

      const isHealthy = await WebSocketClient.checkServerHealth(sourceConfig.httpUrl);
      if (!isHealthy) {
        throw new Error(`Source server ${sourceConfig.httpUrl} is not reachable`);
      }

      const documents = await WebSocketClient.fetchDocumentList(sourceConfig.httpUrl);
      console.log(`Found ${documents.length} documents on source server`);

      const filteredDocuments = this.filterDocumentsByPatterns(documents, sourceConfig.documents);
      totalDocuments = filteredDocuments.length;

      console.log(`${totalDocuments} documents match backup patterns`);

      for (const document of filteredDocuments) {
        try {
          await this.backupDocument(sourceConfig.wsUrl, document.name, versionManager);
          successfulBackups++;
        } catch (error) {
          console.error(`Failed to backup document ${document.name}:`, error);
          failedBackups++;
        }
      }

      await retentionEngine.runCleanup();

      const duration = Date.now() - startTime;
      this.recordBackupStats(sourceId, {
        timestamp: new Date().toISOString(),
        duration,
        totalDocuments,
        successfulBackups,
        failedBackups,
        sourceUrl: sourceConfig.wsUrl
      });

      console.log(`Backup completed for ${sourceConfig.wsUrl}: ${successfulBackups}/${totalDocuments} documents backed up in ${duration}ms`);

    } catch (error) {
      console.error(`Backup failed for ${sourceConfig.wsUrl}:`, error);

      this.recordBackupStats(sourceId, {
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        totalDocuments: 0,
        successfulBackups: 0,
        failedBackups: 1,
        sourceUrl: sourceConfig.url,
        error: error.message
      });
    }
  }

  filterDocumentsByPatterns(documents, patterns) {
    if (!patterns || patterns.length === 0) {
      return documents;
    }

    return documents.filter(document => {
      return patterns.some(pattern => {
        if (pattern === '*') {
          return true;
        }
        return minimatch(document.name, pattern);
      });
    });
  }

  async backupDocument(sourceUrl, roomname, versionManager) {
    console.log(`Backing up document: ${roomname}`);

    const client = new WebSocketClient();
    const doc = await client.connectAndSync(sourceUrl, roomname);

    const clientId = `backup-${this.config.server.serverId}`;
    const versionMetadata = await versionManager.createVersion(roomname, doc, clientId);

    await this.addBackupMetadata(versionManager, roomname, sourceUrl, versionMetadata);

    console.log(`Successfully backed up document: ${roomname}`);
  }

  async addBackupMetadata(versionManager, roomname, sourceUrl, versionMetadata) {
    const metadataFile = path.join(versionManager.documentsDir, roomname, 'metadata.json');

    if (fs.existsSync(metadataFile)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));

        metadata.backupSource = {
          wsUrl: sourceUrl,
          lastBackup: versionMetadata.timestamp,
          backupServerId: this.config.server.serverId
        };

        fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
      } catch (error) {
        console.warn(`Failed to update backup metadata for ${roomname}:`, error);
      }
    }
  }

  recordBackupStats(sourceId, stats) {
    if (!this.backupStats.has(sourceId)) {
      this.backupStats.set(sourceId, []);
    }

    const sourceStats = this.backupStats.get(sourceId);
    sourceStats.push(stats);

    if (sourceStats.length > 50) {
      sourceStats.splice(0, sourceStats.length - 50);
    }
  }

  async triggerManualBackup(sourceWsUrl) {
    const sourceConfig = this.backupSources.find(source => source.wsUrl === sourceWsUrl);

    if (!sourceConfig) {
      throw new Error(`No backup source configured for WebSocket URL: ${sourceWsUrl}`);
    }

    console.log(`Manual backup triggered for ${sourceWsUrl}`);
    await this.executeBackup(sourceConfig);
  }

  getBackupStatus() {
    const status = {
      isRunning: this.isRunning,
      totalSources: this.backupSources.length,
      scheduledSources: this.scheduledTasks.size,
      sources: []
    };

    for (const sourceConfig of this.backupSources) {
      const sourceId = this.getSourceId(sourceConfig.wsUrl);
      const stats = this.backupStats.get(sourceId) || [];
      const lastBackup = stats.length > 0 ? stats[stats.length - 1] : null;

      status.sources.push({
        wsUrl: sourceConfig.wsUrl,
        httpUrl: sourceConfig.httpUrl,
        schedule: sourceConfig.schedule,
        documents: sourceConfig.documents,
        isScheduled: this.scheduledTasks.has(sourceId),
        lastBackup: lastBackup?.timestamp || null,
        lastBackupStatus: lastBackup?.error ? 'failed' : 'success',
        totalBackups: stats.length
      });
    }

    return status;
  }

  getSourceStats(sourceWsUrl) {
    const sourceId = this.getSourceId(sourceWsUrl);
    return this.backupStats.get(sourceId) || [];
  }
}
