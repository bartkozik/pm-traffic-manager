import * as fs from 'fs';
import * as path from 'path';

export class RetentionEngine {
  constructor(versionManager, retentionConfig) {
    this.versionManager = versionManager;
    this.retentionConfig = retentionConfig;
    this.logFile = path.join(versionManager.systemDir, 'cleanup-log.json');
  }

  // Run retention cleanup for all documents
  async runCleanup() {
    console.log('Starting retention cleanup...');
    const startTime = Date.now();
    
    let totalVersionsRemoved = 0;
    let totalStorageFreed = 0;
    const processedDocuments = [];

    try {
      const { documents } = await this.versionManager.listDocuments();
      
      for (const doc of documents) {
        try {
          const result = await this.cleanupDocument(doc.name);
          totalVersionsRemoved += result.versionsRemoved;
          totalStorageFreed += result.storageFreed;
          processedDocuments.push({
            roomname: doc.name,
            versionsRemoved: result.versionsRemoved,
            storageFreed: result.storageFreed,
            status: 'success'
          });
        } catch (error) {
          console.error(`Failed to cleanup document ${doc.name}:`, error);
          processedDocuments.push({
            roomname: doc.name,
            status: 'error',
            error: error.message
          });
        }
      }

      const cleanupResult = {
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        documentsProcessed: processedDocuments.length,
        totalVersionsRemoved,
        totalStorageFreed,
        processedDocuments
      };

      await this.logCleanup(cleanupResult);
      
      console.log(`Cleanup completed: ${totalVersionsRemoved} versions removed, ${this.versionManager.formatSize(totalStorageFreed)} freed`);
      return cleanupResult;

    } catch (error) {
      console.error('Cleanup failed:', error);
      throw error;
    }
  }

  // Cleanup a single document according to retention policy
  async cleanupDocument(roomname) {
    const policy = this.retentionConfig.retentionPolicies.default;
    const versions = await this.versionManager.getVersions(roomname);
    
    if (versions.versions.length === 0) {
      return { versionsRemoved: 0, storageFreed: 0 };
    }

    // Group versions by bucket
    const buckets = this.groupVersionsByBucket(versions.versions);
    
    let versionsToRemove = [];
    
    // Apply retention rules to each bucket
    for (const [bucketName, bucketVersions] of Object.entries(buckets)) {
      const policyRule = policy[bucketName];
      
      if (!policyRule) continue;
      
      if (policyRule.action === 'delete') {
        // Delete all versions in this bucket
        versionsToRemove.push(...bucketVersions);
      } else {
        // Apply interval-based retention
        const toRemove = this.applyIntervalRetention(bucketVersions, policyRule);
        versionsToRemove.push(...toRemove);
      }
    }

    // Remove versions
    let storageFreed = 0;
    let versionsRemoved = 0;

    for (const version of versionsToRemove) {
      try {
        await this.removeVersion(roomname, version);
        storageFreed += version.size;
        versionsRemoved++;
      } catch (error) {
        console.error(`Failed to remove version ${version.timestamp}:`, error);
      }
    }

    // Update document metadata
    if (versionsRemoved > 0) {
      await this.updateDocumentAfterCleanup(roomname, versionsRemoved, storageFreed);
    }

    return { versionsRemoved, storageFreed };
  }

  // Group versions by their bucket classification
  groupVersionsByBucket(versions) {
    const buckets = {
      lastHour: [],
      today: [],
      thisWeek: [],
      thisMonth: [],
      thisYear: [],
      older: []
    };

    for (const version of versions) {
      if (buckets[version.bucket]) {
        buckets[version.bucket].push(version);
      }
    }

    // Sort each bucket by timestamp
    for (const bucket in buckets) {
      buckets[bucket].sort((a, b) => a.timestampMs - b.timestampMs);
    }

    return buckets;
  }

  // Apply interval-based retention to a bucket
  applyIntervalRetention(versions, policyRule) {
    if (versions.length <= policyRule.keep) {
      return []; // Keep all versions if under limit
    }

    const toRemove = [];
    const intervalMs = this.getIntervalMs(policyRule.interval);
    
    // Sort by timestamp
    const sortedVersions = [...versions].sort((a, b) => a.timestampMs - b.timestampMs);
    
    let lastKeptTimestamp = 0;
    let keptCount = 0;
    
    // Keep versions at specified intervals, starting from most recent
    for (let i = sortedVersions.length - 1; i >= 0; i--) {
      const version = sortedVersions[i];
      
      if (keptCount < policyRule.keep && 
          (version.timestampMs - lastKeptTimestamp >= intervalMs || keptCount === 0)) {
        // Keep this version
        lastKeptTimestamp = version.timestampMs;
        keptCount++;
      } else {
        // Mark for removal
        toRemove.push(version);
      }
    }

    return toRemove;
  }

  // Convert interval string to milliseconds
  getIntervalMs(interval) {
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;

    switch (interval) {
      case 'minute': return minute;
      case 'hour': return hour;
      case 'day': return day;
      case '2days': return 2 * day;
      case 'week': return week;
      default: return hour;
    }
  }

  // Remove a specific version
  async removeVersion(roomname, version) {
    const timestamp = new Date(version.timestamp);
    const versionDir = this.versionManager.getVersionDir(roomname, timestamp);
    const timestampMs = version.timestampMs;
    
    // Find and remove the version file
    if (fs.existsSync(versionDir)) {
      const files = fs.readdirSync(versionDir);
      const versionFile = files.find(file => 
        file.endsWith('.yjs') && file.includes(String(timestampMs))
      );
      
      if (versionFile) {
        const versionPath = path.join(versionDir, versionFile);
        fs.unlinkSync(versionPath);
      }

      // Update index file
      await this.updateIndexAfterRemoval(versionDir, version);
      
      // Remove directory if empty
      if (this.isDirectoryEmpty(versionDir)) {
        fs.rmdirSync(versionDir);
        
        // Check parent directories for cleanup
        await this.cleanupEmptyDirectories(path.dirname(versionDir));
      }
    }
  }

  // Update index file after version removal
  async updateIndexAfterRemoval(versionDir, removedVersion) {
    const indexFile = path.join(versionDir, 'index.json');
    
    if (fs.existsSync(indexFile)) {
      try {
        const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        index.versions = index.versions.filter(v => v.timestamp !== removedVersion.timestamp);
        
        if (index.versions.length > 0) {
          fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
        } else {
          fs.unlinkSync(indexFile);
        }
      } catch (error) {
        console.warn(`Failed to update index file ${indexFile}:`, error);
      }
    }
  }

  // Check if directory is empty
  isDirectoryEmpty(dir) {
    if (!fs.existsSync(dir)) return true;
    
    const files = fs.readdirSync(dir);
    return files.length === 0;
  }

  // Clean up empty parent directories
  async cleanupEmptyDirectories(dir) {
    if (!fs.existsSync(dir)) return;
    
    const versionsPath = path.join(this.versionManager.documentsDir);
    
    // Don't remove directories above the versions folder
    if (!dir.startsWith(versionsPath)) return;
    
    if (this.isDirectoryEmpty(dir)) {
      fs.rmdirSync(dir);
      
      // Recursively check parent
      const parentDir = path.dirname(dir);
      if (parentDir !== dir && parentDir.startsWith(versionsPath)) {
        await this.cleanupEmptyDirectories(parentDir);
      }
    }
  }

  // Update document metadata after cleanup
  async updateDocumentAfterCleanup(roomname, versionsRemoved, storageFreed) {
    const metadataFile = path.join(this.versionManager.documentsDir, roomname, 'metadata.json');
    
    if (fs.existsSync(metadataFile)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
        
        metadata.totalVersions = Math.max(0, (metadata.totalVersions || 0) - versionsRemoved);
        metadata.storageSize = Math.max(0, (metadata.storageSize || 0) - storageFreed);
        metadata.lastCleanup = new Date().toISOString();
        
        fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
      } catch (error) {
        console.warn(`Failed to update metadata for ${roomname}:`, error);
      }
    }
  }

  // Log cleanup results
  async logCleanup(cleanupResult) {
    if (!this.retentionConfig.cleanup.enableLogging) return;

    let logs = [];
    
    if (fs.existsSync(this.logFile)) {
      try {
        logs = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
      } catch (error) {
        console.warn('Failed to read cleanup log:', error);
      }
    }

    logs.push(cleanupResult);
    
    // Keep only last 50 cleanup logs (reduced from 100 to be more conservative)
    if (logs.length > 50) {
      logs = logs.slice(-50);
    }

    try {
      fs.writeFileSync(this.logFile, JSON.stringify(logs, null, 2));
    } catch (error) {
      console.error('Failed to write cleanup log:', error);
    }
  }

  // Get cleanup statistics
  async getCleanupStats() {
    if (!fs.existsSync(this.logFile)) {
      return {
        lastCleanup: null,
        totalCleanups: 0,
        averageVersionsRemoved: 0,
        averageStorageFreed: 0
      };
    }

    try {
      const logs = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
      
      if (logs.length === 0) {
        return {
          lastCleanup: null,
          totalCleanups: 0,
          averageVersionsRemoved: 0,
          averageStorageFreed: 0
        };
      }

      const lastCleanup = logs[logs.length - 1];
      const totalVersionsRemoved = logs.reduce((sum, log) => sum + log.totalVersionsRemoved, 0);
      const totalStorageFreed = logs.reduce((sum, log) => sum + log.totalStorageFreed, 0);

      return {
        lastCleanup: lastCleanup.timestamp,
        totalCleanups: logs.length,
        totalVersionsRemoved,
        totalStorageFreed,
        averageVersionsRemoved: Math.round(totalVersionsRemoved / logs.length),
        averageStorageFreed: Math.round(totalStorageFreed / logs.length)
      };
    } catch (error) {
      console.error('Failed to read cleanup stats:', error);
      return {
        lastCleanup: null,
        totalCleanups: 0,
        averageVersionsRemoved: 0,
        averageStorageFreed: 0
      };
    }
  }

  // Simulate cleanup (dry run)
  async simulateCleanup() {
    const originalDryRun = this.retentionConfig.cleanup.dryRun;
    this.retentionConfig.cleanup.dryRun = true;
    
    const { documents } = await this.versionManager.listDocuments();
    const simulation = {
      timestamp: new Date().toISOString(),
      totalVersionsToRemove: 0,
      totalStorageToFree: 0,
      documentsAnalyzed: []
    };

    for (const doc of documents) {
      try {
        const versions = await this.versionManager.getVersions(doc.roomname);
        const policy = this.retentionConfig.retentionPolicies.default;
        const buckets = this.groupVersionsByBucket(versions.versions);
        
        let versionsToRemove = 0;
        let storageToFree = 0;
        
        for (const [bucketName, bucketVersions] of Object.entries(buckets)) {
          const policyRule = policy[bucketName];
          
          if (!policyRule) continue;
          
          if (policyRule.action === 'delete') {
            versionsToRemove += bucketVersions.length;
            storageToFree += bucketVersions.reduce((sum, v) => sum + v.size, 0);
          } else {
            const toRemove = this.applyIntervalRetention(bucketVersions, policyRule);
            versionsToRemove += toRemove.length;
            storageToFree += toRemove.reduce((sum, v) => sum + v.size, 0);
          }
        }

        simulation.documentsAnalyzed.push({
          roomname: doc.roomname,
          currentVersions: versions.versions.length,
          versionsToRemove,
          storageToFree
        });

        simulation.totalVersionsToRemove += versionsToRemove;
        simulation.totalStorageToFree += storageToFree;

      } catch (error) {
        console.error(`Failed to simulate cleanup for ${doc.roomname}:`, error);
      }
    }

    this.retentionConfig.cleanup.dryRun = originalDryRun;
    
    return simulation;
  }
}