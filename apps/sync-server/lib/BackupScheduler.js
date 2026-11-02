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
    
    // Create backup storage directory within the main data directory
    this.backupStorageDir = path.join(process.env.YJS_DATA_DIR || './data-docs', 'backups');
    this.ensureBackupDirectories();
    
    // Initialize backup version managers for each source
    this.backupVersionManagers = new Map();
    this.backupRetentionEngines = new Map();
  }

  // Ensure backup directories exist
  ensureBackupDirectories() {
    if (!fs.existsSync(this.backupStorageDir)) {
      fs.mkdirSync(this.backupStorageDir, { recursive: true });
      console.log(`Created backup storage directory: ${this.backupStorageDir}`);
    }
  }

  // Get backup directory for a specific source
  getBackupSourceDir(sourceId) {
    return path.join(this.backupStorageDir, sourceId);
  }

  // Initialize version manager for backup source
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

  // Generate source ID from WebSocket URL
  getSourceId(wsUrl) {
    return wsUrl.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  // Start all scheduled backups
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

  // Stop all scheduled backups
  stop() {
    if (!this.isRunning) {
      console.log('Backup scheduler is not running');
      return;
    }

    console.log('Stopping backup scheduler');
    this.isRunning = false;

    // Stop all scheduled tasks
    for (const [sourceId, task] of this.scheduledTasks) {
      if (task && task.stop) {
        task.stop();
      }
    }
    this.scheduledTasks.clear();
  }

  // Schedule backup for a single source
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

  // Execute backup for a source
  async executeBackup(sourceConfig) {
    const sourceId = this.getSourceId(sourceConfig.wsUrl);
    console.log(`Starting backup from ${sourceConfig.wsUrl}...`);

    const startTime = Date.now();
    let totalDocuments = 0;
    let successfulBackups = 0;
    let failedBackups = 0;

    try {
      // Initialize backup storage for this source
      const { versionManager, retentionEngine } = this.initializeBackupVersionManager(sourceConfig);

      // Check server health first
      const isHealthy = await WebSocketClient.checkServerHealth(sourceConfig.httpUrl);
      if (!isHealthy) {
        throw new Error(`Source server ${sourceConfig.httpUrl} is not reachable`);
      }

      // Fetch document list from source
      const documents = await WebSocketClient.fetchDocumentList(sourceConfig.httpUrl);
      console.log(`Found ${documents.length} documents on source server`);

      // Filter documents by patterns
      const filteredDocuments = this.filterDocumentsByPatterns(documents, sourceConfig.documents);
      totalDocuments = filteredDocuments.length;
      
      console.log(`${totalDocuments} documents match backup patterns`);

      // Backup each document
      for (const document of filteredDocuments) {
        try {
          await this.backupDocument(sourceConfig.wsUrl, document.name, versionManager);
          successfulBackups++;
        } catch (error) {
          console.error(`Failed to backup document ${document.name}:`, error);
          failedBackups++;
        }
      }

      // Run retention cleanup for this source
      await retentionEngine.runCleanup();

      // Record backup statistics
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
      
      // Record failed backup
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

  // Filter documents by pattern matching
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

  // Backup a single document
  async backupDocument(sourceUrl, roomname, versionManager) {
    console.log(`Backing up document: ${roomname}`);

    // Connect and sync document
    const client = new WebSocketClient();
    const doc = await client.connectAndSync(sourceUrl, roomname);

    // Create version with backup client ID
    const clientId = `backup-${this.config.server.serverId}`;
    const versionMetadata = await versionManager.createVersion(roomname, doc, clientId);

    // Add backup metadata
    await this.addBackupMetadata(versionManager, roomname, sourceUrl, versionMetadata);

    console.log(`Successfully backed up document: ${roomname}`);
  }

  // Add backup-specific metadata
  async addBackupMetadata(versionManager, roomname, sourceUrl, versionMetadata) {
    const metadataFile = path.join(versionManager.documentsDir, roomname, 'metadata.json');
    
    if (fs.existsSync(metadataFile)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
        
        // Add backup source information
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

  // Record backup statistics
  recordBackupStats(sourceId, stats) {
    if (!this.backupStats.has(sourceId)) {
      this.backupStats.set(sourceId, []);
    }
    
    const sourceStats = this.backupStats.get(sourceId);
    sourceStats.push(stats);
    
    // Keep only last 50 backup runs
    if (sourceStats.length > 50) {
      sourceStats.splice(0, sourceStats.length - 50);
    }
  }

  // Manual backup trigger
  async triggerManualBackup(sourceWsUrl) {
    const sourceConfig = this.backupSources.find(source => source.wsUrl === sourceWsUrl);
    
    if (!sourceConfig) {
      throw new Error(`No backup source configured for WebSocket URL: ${sourceWsUrl}`);
    }

    console.log(`Manual backup triggered for ${sourceWsUrl}`);
    await this.executeBackup(sourceConfig);
  }

  // Get backup status for all sources
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

  // Get detailed stats for a source
  getSourceStats(sourceWsUrl) {
    const sourceId = this.getSourceId(sourceWsUrl);
    return this.backupStats.get(sourceId) || [];
  }
}
