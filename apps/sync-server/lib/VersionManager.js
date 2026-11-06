import * as fs from 'fs';
import * as path from 'path';
import * as Y from 'yjs';
import * as crypto from 'crypto';

export class VersionManager {
  constructor(dataDir, retentionConfig, authorityManager = null) {
    this.dataDir = dataDir;
    this.retentionConfig = retentionConfig;
    this.authorityManager = authorityManager;
    this.documentsDir = path.join(dataDir, 'documents');
    this.systemDir = path.join(dataDir, 'system');
    this.tempDir = path.join(dataDir, 'temp');

    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.documentsDir, this.systemDir, this.tempDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async createVersion(roomname, doc, clientId = 'system') {
    const timestamp = new Date();
    const timestampMs = timestamp.getTime();

    const update = Y.encodeStateAsUpdate(doc);
    const stateVector = Y.encodeStateVector(doc);
    const hash = crypto.createHash('sha256').update(update).digest('hex');

    const versionMetadata = {
      timestamp: timestamp.toISOString(),
      timestampMs,
      bucket: this.determineBucket(timestamp),
      size: update.length,
      stateVector: Buffer.from(stateVector).toString('base64'),
      clientId,
      hash: `sha256:${hash}`,
      operations: this.countOperations(update)
    };

    if (this.authorityManager) {
      try {
        versionMetadata.authority = this.authorityManager.signDocument(roomname, versionMetadata, update);
      } catch (error) {
        console.warn(`Failed to sign document ${roomname}:`, error);
      }
    }

    const versionDir = this.getVersionDir(roomname, timestamp);
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }

    const versionFile = path.join(versionDir, `${timestamp.getMinutes()}-${timestampMs}.yjs`);
    fs.writeFileSync(versionFile, update);

    await this.updateVersionIndex(roomname, timestamp, versionMetadata);

    const latestFile = path.join(this.documentsDir, roomname, 'latest.yjs');
    fs.writeFileSync(latestFile, update);

    await this.updateDocumentMetadata(roomname, versionMetadata);

    console.log(`Created version for ${roomname} at ${timestamp.toISOString()}`);
    return versionMetadata;
  }

  getVersionDir(roomname, timestamp) {
    const year = timestamp.getFullYear();
    const month = String(timestamp.getMonth() + 1).padStart(2, '0');
    const day = String(timestamp.getDate()).padStart(2, '0');
    const hour = String(timestamp.getHours()).padStart(2, '0');

    return path.join(this.documentsDir, roomname, 'versions',
                    String(year), month, day, hour);
  }

  determineBucket(timestamp) {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();

    const hour = 60 * 60 * 1000;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;

    if (diffMs <= hour) return 'lastHour';
    if (diffMs <= day) return 'today';
    if (diffMs <= week) return 'thisWeek';
    if (diffMs <= month) return 'thisMonth';
    if (diffMs <= year) return 'thisYear';
    return 'older';
  }

  countOperations(update) {
    return Math.max(1, Math.floor(update.length / 50));
  }

  async updateVersionIndex(roomname, timestamp, versionMetadata) {
    const versionDir = this.getVersionDir(roomname, timestamp);
    const indexFile = path.join(versionDir, 'index.json');

    let index = { versions: [] };
    if (fs.existsSync(indexFile)) {
      try {
        index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
      } catch (error) {
        console.warn(`Failed to read index file ${indexFile}:`, error);
      }
    }

    index.versions.push(versionMetadata);
    index.versions.sort((a, b) => b.timestampMs - a.timestampMs);

    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
  }

  async updateDocumentMetadata(roomname, versionMetadata) {
    const docDir = path.join(this.documentsDir, roomname);
    const metadataFile = path.join(docDir, 'metadata.json');

    let metadata = {
      roomname,
      created: versionMetadata.timestamp,
      lastModified: versionMetadata.timestamp,
      totalVersions: 1,
      storageSize: versionMetadata.size,
      retentionPolicy: 'default'
    };

    if (fs.existsSync(metadataFile)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
      } catch (error) {
        console.warn(`Failed to read metadata file ${metadataFile}:`, error);
      }
    }

    metadata.lastModified = versionMetadata.timestamp;
    metadata.totalVersions = (metadata.totalVersions || 0) + 1;
    metadata.storageSize = (metadata.storageSize || 0) + versionMetadata.size;

    if (versionMetadata.authority) {
      metadata.authority = versionMetadata.authority;
    }

    if (!fs.existsSync(docDir)) {
      fs.mkdirSync(docDir, { recursive: true });
    }

    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
  }

  async listDocuments() {
    const documents = [];
    let totalStorage = 0;

    if (fs.existsSync(this.documentsDir)) {
      const roomnames = fs.readdirSync(this.documentsDir);

      for (const roomname of roomnames) {
        const metadataFile = path.join(this.documentsDir, roomname, 'metadata.json');

        if (fs.existsSync(metadataFile)) {
          try {
            const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
            documents.push({
              name: metadata.roomname,
              created: metadata.created,
              lastModified: metadata.lastModified,
              size: this.formatSize(metadata.storageSize),
              versions: metadata.totalVersions,
              isActive: this.isDocumentActive(roomname),
              retentionPolicy: metadata.retentionPolicy || 'default'
            });
            totalStorage += metadata.storageSize;
          } catch (error) {
            console.warn(`Failed to read metadata for ${roomname}:`, error);
          }
        }
      }
    }

    if (fs.existsSync(this.dataDir)) {
      const files = fs.readdirSync(this.dataDir).filter(file => file.endsWith('.yjs'));

      for (const file of files) {
        const roomname = file.replace('.yjs', '');

        if (documents.some(doc => doc.name === roomname)) {
          continue;
        }

        const filePath = path.join(this.dataDir, file);
        try {
          const stats = fs.statSync(filePath);
          documents.push({
            name: roomname,
            created: stats.birthtime.toISOString(),
            lastModified: stats.mtime.toISOString(),
            size: this.formatSize(stats.size),
            versions: 1,
            isActive: this.isDocumentActive(roomname),
            retentionPolicy: 'default'
          });
          totalStorage += stats.size;
        } catch (error) {
          console.warn(`Failed to read legacy file ${file}:`, error);
        }
      }
    }

    return {
      documents: documents.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()),
      total: documents.length,
      storageUsed: this.formatSize(totalStorage)
    };
  }

  isDocumentActive(roomname) {
    const metadataFile = path.join(this.documentsDir, roomname, 'metadata.json');

    if (!fs.existsSync(metadataFile)) return false;

    try {
      const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
      const lastModified = new Date(metadata.lastModified);
      const now = new Date();
      const hoursSinceModified = (now.getTime() - lastModified.getTime()) / (1000 * 60 * 60);

      return hoursSinceModified < 24;
    } catch (error) {
      return false;
    }
  }

  async getDocumentInfo(roomname) {
    const metadataFile = path.join(this.documentsDir, roomname, 'metadata.json');

    if (!fs.existsSync(metadataFile)) {
      throw new Error(`Document ${roomname} not found`);
    }

    const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    const storageBreakdown = await this.getStorageBreakdown(roomname);

    return {
      ...metadata,
      size: this.formatSize(metadata.storageSize),
      isActive: this.isDocumentActive(roomname),
      storageBreakdown,
      nextCleanup: this.getNextCleanupTime()
    };
  }

  async getStorageBreakdown(roomname) {
    const breakdown = {
      lastHour: { versions: 0, size: 0 },
      today: { versions: 0, size: 0 },
      thisWeek: { versions: 0, size: 0 },
      thisMonth: { versions: 0, size: 0 },
      thisYear: { versions: 0, size: 0 }
    };

    const versionsResult = await this.getVersions(roomname);

    for (const version of versionsResult.versions) {
      if (breakdown[version.bucket]) {
        breakdown[version.bucket].versions++;
        breakdown[version.bucket].size += version.size;
      }
    }

    for (const bucket in breakdown) {
      breakdown[bucket].size = this.formatSize(breakdown[bucket].size);
    }

    return breakdown;
  }

  async getVersions(roomname, options = {}) {
    const { from, to, bucket, limit = 50, page = 1 } = options;
    const versions = [];

    const versionsDir = path.join(this.documentsDir, roomname, 'versions');
    if (!fs.existsSync(versionsDir)) {
      return {
        versions: [],
        pagination: { total: 0, page: 1, limit, hasNext: false },
        bucketSummary: {}
      };
    }

    const indexFiles = this.findIndexFiles(versionsDir);

    for (const indexFile of indexFiles) {
      try {
        const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        versions.push(...index.versions);
      } catch (error) {
        console.warn(`Failed to read index file ${indexFile}:`, error);
      }
    }

    versions.sort((a, b) => b.timestampMs - a.timestampMs);

    let filteredVersions = versions;

    if (from) {
      const fromMs = new Date(from).getTime();
      filteredVersions = filteredVersions.filter(v => v.timestampMs >= fromMs);
    }

    if (to) {
      const toMs = new Date(to).getTime();
      filteredVersions = filteredVersions.filter(v => v.timestampMs <= toMs);
    }

    if (bucket) {
      filteredVersions = filteredVersions.filter(v => v.bucket === bucket);
    }

    const bucketSummary = {};
    for (const version of versions) {
      bucketSummary[version.bucket] = (bucketSummary[version.bucket] || 0) + 1;
    }

    const total = filteredVersions.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedVersions = filteredVersions.slice(startIndex, endIndex);

    return {
      versions: paginatedVersions,
      pagination: {
        total,
        page,
        limit,
        hasNext: endIndex < total
      },
      bucketSummary
    };
  }

  findIndexFiles(dir) {
    const indexFiles = [];

    if (!fs.existsSync(dir)) return indexFiles;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        indexFiles.push(...this.findIndexFiles(fullPath));
      } else if (entry.name === 'index.json') {
        indexFiles.push(fullPath);
      }
    }

    return indexFiles;
  }

  async getVersionData(roomname, timestamp) {
    const targetTimestamp = new Date(timestamp);
    const versionDir = this.getVersionDir(roomname, targetTimestamp);
    const timestampMs = targetTimestamp.getTime();

    if (!fs.existsSync(versionDir)) {
      throw new Error(`Version not found: ${timestamp}`);
    }

    const files = fs.readdirSync(versionDir);
    const versionFile = files.find(file =>
      file.endsWith('.yjs') && file.includes(String(timestampMs))
    );

    if (!versionFile) {
      throw new Error(`Version file not found: ${timestamp}`);
    }

    const versionPath = path.join(versionDir, versionFile);
    return fs.readFileSync(versionPath);
  }

  async getVersionMetadata(roomname, timestamp) {
    const versions = await this.getVersions(roomname);
    const version = versions.versions.find(v => v.timestamp === timestamp);

    if (!version) {
      throw new Error(`Version metadata not found: ${timestamp}`);
    }

    const allVersions = versions.versions.sort((a, b) => a.timestampMs - b.timestampMs);
    const currentIndex = allVersions.findIndex(v => v.timestamp === timestamp);

    const previous = currentIndex > 0 ? allVersions[currentIndex - 1].timestamp : null;
    const next = currentIndex < allVersions.length - 1 ? allVersions[currentIndex + 1].timestamp : null;

    return {
      ...version,
      previous,
      next
    };
  }

  formatSize(bytes) {
    if (bytes === 0) return '0B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
  }

  getNextCleanupTime() {
    const now = new Date();
    const intervalMinutes = this.retentionConfig.cleanup.intervalMinutes;
    const nextCleanup = new Date(now.getTime() + intervalMinutes * 60 * 1000);
    return nextCleanup.toISOString();
  }
}
