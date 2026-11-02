import http from 'http';
import url from 'url';
import { NodeExtractor } from './NodeExtractor.js';

export class HttpApiServer {
  constructor(port, host, versionManager, retentionEngine, backupScheduler = null, authorityManager = null) {
    this.port = port;
    this.host = host;
    this.versionManager = versionManager;
    this.retentionEngine = retentionEngine;
    this.backupScheduler = backupScheduler;
    this.authorityManager = authorityManager;
    this.nodeExtractor = new NodeExtractor(versionManager);
    this.getYDoc = null; // Set via setDocResolver after construction
    this.server = null;
  }

  setDocResolver(getYDoc) {
    this.getYDoc = getYDoc;
  }

  // Utility function to sanitize roomnames for safe URL usage
  sanitizeRoomname(roomname) {
    return roomname
      .replace(/[^a-zA-Z0-9]/g, '-')  // Replace non-alphanumeric with dashes
      .replace(/-+/g, '-')            // Replace multiple consecutive dashes with single dash
      .replace(/^-|-$/g, '');         // Remove leading/trailing dashes
  }

  start() {
    this.server = http.createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });

    this.server.listen(this.port, this.host, () => {
      console.log(`HTTP API Server running on http://${this.host}:${this.port}`);
    });

    return this.server;
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }

  async handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // Health check endpoint
      if (pathname === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          service: 'ptm-sync-server'
        }));
        return;
      }

      // Route handling
      if (pathname === '/api/documents' && req.method === 'GET') {
        await this.handleDocumentsList(req, res, query);
      
      } else if (pathname.match(/^\/api\/documents\/([^\/]+)$/) && req.method === 'GET') {
        const roomname = decodeURIComponent(pathname.split('/')[3]);
        await this.handleDocumentInfo(req, res, roomname, query);
      
      } else if (pathname.match(/^\/api\/documents\/([^\/]+)\/versions$/) && req.method === 'GET') {
        const roomname = decodeURIComponent(pathname.split('/')[3]);
        await this.handleVersionHistory(req, res, roomname, query);
      
      } else if (pathname.match(/^\/api\/documents\/([^\/]+)\/versions\/([^\/]+)$/) && req.method === 'GET') {
        const roomname = decodeURIComponent(pathname.split('/')[3]);
        const timestamp = decodeURIComponent(pathname.split('/')[5]);
        await this.handleVersionRetrieval(req, res, roomname, timestamp, query);
      
      } else if (pathname.match(/^\/api\/documents\/([^\/]+)\/versions\/([^\/]+)\/metadata$/) && req.method === 'GET') {
        const roomname = decodeURIComponent(pathname.split('/')[3]);
        const timestamp = decodeURIComponent(pathname.split('/')[5]);
        await this.handleVersionMetadata(req, res, roomname, timestamp);
      
      } else if (pathname === '/api/system/status' && req.method === 'GET') {
        await this.handleSystemStatus(req, res, query);
      
      } else if (pathname === '/api/system/cleanup' && req.method === 'POST') {
        await this.handleManualCleanup(req, res);
      
      } else if (pathname === '/api/system/cleanup/simulate' && req.method === 'GET') {
        await this.handleCleanupSimulation(req, res);
      
      } else if (pathname.match(/^\/api\/documents\/([^\/]+)\/nodes$/) && req.method === 'GET') {
        const roomname = decodeURIComponent(pathname.split('/')[3]);
        await this.handleDocumentNodes(req, res, roomname);
      
      } else if (pathname.match(/^\/api\/documents\/([^\/]+)\/nodes\/([^\/]+)\/content$/) && req.method === 'GET') {
        const roomname = decodeURIComponent(pathname.split('/')[3]);
        const nodeId = decodeURIComponent(pathname.split('/')[5]);
        await this.handleNodeContent(req, res, roomname, nodeId);
      
      } else if (pathname === '/api/backup/status' && req.method === 'GET') {
        await this.handleBackupStatus(req, res);
      
      } else if (pathname === '/api/backup/sources' && req.method === 'GET') {
        await this.handleBackupSources(req, res);
      
      } else if (pathname.match(/^\/api\/backup\/execute\/(.+)$/) && req.method === 'POST') {
        const sourceUrl = decodeURIComponent(pathname.split('/')[4]);
        await this.handleBackupExecute(req, res, sourceUrl);
      
      } else if (pathname === '/api/authority/keypair' && req.method === 'GET') {
        await this.handleAuthorityKeypair(req, res);
      
      } else if (pathname === '/api/authority/verify' && req.method === 'POST') {
        await this.handleAuthorityVerify(req, res);

      // ── Live graph API (reads/writes the live Y.js document) ──
      } else if (pathname.match(/^\/api\/live\/([^\/]+)\/graph$/) && req.method === 'GET') {
        const roomname = decodeURIComponent(pathname.split('/')[3]);
        await this.handleLiveGraph(req, res, roomname);

      } else if (pathname.match(/^\/api\/live\/([^\/]+)\/nodes\/([^\/]+)$/) && req.method === 'GET') {
        const roomname = decodeURIComponent(pathname.split('/')[3]);
        const nodeId = decodeURIComponent(pathname.split('/')[5]);
        await this.handleLiveNodeGet(req, res, roomname, nodeId);

      } else if (pathname.match(/^\/api\/live\/([^\/]+)\/nodes\/([^\/]+)$/) && req.method === 'PATCH') {
        const roomname = decodeURIComponent(pathname.split('/')[3]);
        const nodeId = decodeURIComponent(pathname.split('/')[5]);
        await this.handleLiveNodeUpdate(req, res, roomname, nodeId);

      } else if (pathname.match(/^\/api\/live\/([^\/]+)\/nodes$/) && req.method === 'POST') {
        const roomname = decodeURIComponent(pathname.split('/')[3]);
        await this.handleLiveNodeCreate(req, res, roomname);

      } else if (pathname.match(/^\/api\/live\/([^\/]+)\/nodes\/([^\/]+)$/) && req.method === 'DELETE') {
        const roomname = decodeURIComponent(pathname.split('/')[3]);
        const nodeId = decodeURIComponent(pathname.split('/')[5]);
        await this.handleLiveNodeDelete(req, res, roomname, nodeId);

      } else if (pathname.match(/^\/api\/live\/([^\/]+)\/edges$/) && req.method === 'POST') {
        const roomname = decodeURIComponent(pathname.split('/')[3]);
        await this.handleLiveEdgeCreate(req, res, roomname);

      } else if (pathname.match(/^\/api\/live\/([^\/]+)\/edges\/([^\/]+)$/) && req.method === 'DELETE') {
        const roomname = decodeURIComponent(pathname.split('/')[3]);
        const edgeId = decodeURIComponent(pathname.split('/')[5]);
        await this.handleLiveEdgeDelete(req, res, roomname, edgeId);

      } else {
        this.sendError(res, 404, 'Not found');
      }

    } catch (error) {
      console.error('API Error:', error);
      this.sendError(res, 500, 'Internal server error', error.message);
    }
  }

  // List all documents
  async handleDocumentsList(req, res, query) {
    const result = await this.versionManager.listDocuments();
    this.sendJson(res, result);
  }

  // Get specific document info
  async handleDocumentInfo(req, res, roomname, query) {
    try {
      const result = await this.versionManager.getDocumentInfo(roomname);
      this.sendJson(res, result);
    } catch (error) {
      if (error.message.includes('not found')) {
        this.sendError(res, 404, 'Document not found');
      } else {
        throw error;
      }
    }
  }

  // Get version history for a document
  async handleVersionHistory(req, res, roomname, query) {
    const options = {
      from: query.from,
      to: query.to,
      bucket: query.bucket,
      limit: parseInt(query.limit) || 50,
      page: parseInt(query.page) || 1
    };

    try {
      const result = await this.versionManager.getVersions(roomname, options);
      this.sendJson(res, {
        roomname,
        ...result
      });
    } catch (error) {
      this.sendError(res, 500, 'Failed to get version history', error.message);
    }
  }

  // Get specific version data
  async handleVersionRetrieval(req, res, roomname, timestamp, query) {
    try {
      const versionData = await this.versionManager.getVersionData(roomname, timestamp);
      
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${roomname}-${timestamp.replace(/[:.]/g, '')}.yjs"`);
      res.setHeader('Content-Length', versionData.length);
      
      res.writeHead(200);
      res.end(versionData);
    } catch (error) {
      if (error.message.includes('not found')) {
        this.sendError(res, 404, 'Version not found');
      } else {
        throw error;
      }
    }
  }

  // Get version metadata
  async handleVersionMetadata(req, res, roomname, timestamp) {
    try {
      const metadata = await this.versionManager.getVersionMetadata(roomname, timestamp);
      this.sendJson(res, metadata);
    } catch (error) {
      if (error.message.includes('not found')) {
        this.sendError(res, 404, 'Version metadata not found');
      } else {
        throw error;
      }
    }
  }

  // Get system status
  async handleSystemStatus(req, res, query) {
    const documents = await this.versionManager.listDocuments();
    const cleanupStats = await this.retentionEngine.getCleanupStats();
    
    // Calculate total versions across all documents
    let totalVersions = 0;
    for (const doc of documents.documents) {
      totalVersions += doc.totalVersions;
    }

    const status = {
      totalDocuments: documents.total,
      totalVersions,
      storageUsed: documents.storageUsed,
      retentionPolicies: this.retentionEngine.retentionConfig.retentionPolicies,
      lastCleanup: cleanupStats.lastCleanup,
      nextCleanup: this.versionManager.getNextCleanupTime(),
      cleanupStats: {
        totalCleanups: cleanupStats.totalCleanups,
        totalVersionsRemoved: cleanupStats.totalVersionsRemoved,
        totalStorageFreed: this.versionManager.formatSize(cleanupStats.totalStorageFreed),
        averageVersionsRemoved: cleanupStats.averageVersionsRemoved,
        averageStorageFreed: this.versionManager.formatSize(cleanupStats.averageStorageFreed)
      }
    };

    this.sendJson(res, status);
  }

  // Manual cleanup trigger
  async handleManualCleanup(req, res) {
    try {
      console.log('Manual cleanup triggered via API');
      const result = await this.retentionEngine.runCleanup();
      
      this.sendJson(res, {
        success: true,
        message: 'Cleanup completed successfully',
        result: {
          duration: result.duration,
          documentsProcessed: result.documentsProcessed,
          totalVersionsRemoved: result.totalVersionsRemoved,
          totalStorageFreed: this.versionManager.formatSize(result.totalStorageFreed)
        }
      });
    } catch (error) {
      this.sendError(res, 500, 'Cleanup failed', error.message);
    }
  }

  // Simulate cleanup (dry run)
  async handleCleanupSimulation(req, res) {
    try {
      const simulation = await this.retentionEngine.simulateCleanup();
      
      this.sendJson(res, {
        simulation: true,
        ...simulation,
        totalStorageToFree: this.versionManager.formatSize(simulation.totalStorageToFree),
        documentsAnalyzed: simulation.documentsAnalyzed.map(doc => ({
          ...doc,
          storageToFree: this.versionManager.formatSize(doc.storageToFree)
        }))
      });
    } catch (error) {
      this.sendError(res, 500, 'Cleanup simulation failed', error.message);
    }
  }

  // Get nodes list for a document (efficient - no full Y.js transfer)
  async handleDocumentNodes(req, res, roomname) {
    try {
      console.log(`📋 Extracting nodes from document: ${roomname}`);
      const nodes = await this.nodeExtractor.extractNodes(roomname);
      
      this.sendJson(res, {
        roomname,
        totalNodes: nodes.length,
        nodes
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        this.sendError(res, 404, 'Document not found');
      } else {
        console.error('Failed to extract nodes:', error);
        this.sendError(res, 500, 'Failed to extract nodes', error.message);
      }
    }
  }

  // Get content from a specific node (efficient - targeted extraction)
  async handleNodeContent(req, res, roomname, nodeId) {
    try {
      console.log(`📄 Extracting content from node ${nodeId} in document: ${roomname}`);
      const result = await this.nodeExtractor.extractNodeContent(roomname, nodeId);
      
      this.sendJson(res, {
        roomname,
        nodeId,
        content: result.content,
        nodeType: result.nodeType,
        extracted: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        this.sendError(res, 404, 'Document or node not found');
      } else {
        console.error('Failed to extract node content:', error);
        this.sendError(res, 500, 'Failed to extract node content', error.message);
      }
    }
  }

  // Get backup status for all sources
  async handleBackupStatus(req, res) {
    if (!this.backupScheduler) {
      this.sendError(res, 404, 'Backup functionality not enabled');
      return;
    }

    try {
      const status = this.backupScheduler.getBackupStatus();
      this.sendJson(res, status);
    } catch (error) {
      this.sendError(res, 500, 'Failed to get backup status', error.message);
    }
  }

  // List configured backup sources
  async handleBackupSources(req, res) {
    if (!this.backupScheduler) {
      this.sendError(res, 404, 'Backup functionality not enabled');
      return;
    }

    try {
      const sources = this.backupScheduler.backupSources.map(source => ({
        url: source.url,
        schedule: source.schedule,
        documents: source.documents,
        retentionPolicy: source.retentionPolicy ? 'custom' : 'default'
      }));
      
      this.sendJson(res, {
        sources,
        total: sources.length
      });
    } catch (error) {
      this.sendError(res, 500, 'Failed to get backup sources', error.message);
    }
  }

  // Manually trigger backup for specific source
  async handleBackupExecute(req, res, sourceUrl) {
    if (!this.backupScheduler) {
      this.sendError(res, 404, 'Backup functionality not enabled');
      return;
    }

    try {
      console.log(`Manual backup triggered for: ${sourceUrl}`);
      await this.backupScheduler.triggerManualBackup(sourceUrl);
      
      this.sendJson(res, {
        success: true,
        message: `Backup completed for ${sourceUrl}`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`Manual backup failed for ${sourceUrl}:`, error);
      this.sendError(res, 500, 'Backup execution failed', error.message);
    }
  }

  // Get server's public key information
  async handleAuthorityKeypair(req, res) {
    if (!this.authorityManager) {
      this.sendError(res, 404, 'Authority management not enabled');
      return;
    }

    try {
      const keyInfo = this.authorityManager.getPublicKeyInfo();
      this.sendJson(res, keyInfo);
    } catch (error) {
      this.sendError(res, 500, 'Failed to get authority information', error.message);
    }
  }

  // Verify document signature
  async handleAuthorityVerify(req, res) {
    if (!this.authorityManager) {
      this.sendError(res, 404, 'Authority management not enabled');
      return;
    }

    try {
      // Parse request body
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const { roomname, metadata, documentState, authority } = JSON.parse(body);
          
          if (!roomname || !metadata || !authority) {
            this.sendError(res, 400, 'Missing required fields: roomname, metadata, authority');
            return;
          }

          const isValid = this.authorityManager.verifyDocumentSignature(
            roomname,
            metadata,
            documentState,
            authority
          );

          this.sendJson(res, {
            valid: isValid,
            authority: authority.serverId,
            verifiedAt: new Date().toISOString()
          });
        } catch (parseError) {
          this.sendError(res, 400, 'Invalid JSON in request body', parseError.message);
        }
      });

    } catch (error) {
      this.sendError(res, 500, 'Signature verification failed', error.message);
    }
  }

  // ── Live graph handlers ──

  // Read the full graph: all nodes + all edges from the live Y.js document
  async handleLiveGraph(req, res, roomname) {
    if (!this.getYDoc) {
      return this.sendError(res, 503, 'Live document access not available');
    }

    try {
      const doc = this.getYDoc(roomname);
      const yNodes = doc.getMap('nodes');
      const yEdges = doc.getMap('edges');

      const nodes = [];
      yNodes.forEach((node, id) => {
        if (node && typeof node === 'object') {
          nodes.push({ ...node, id: node.id || id });
        }
      });

      const edges = [];
      yEdges.forEach((edge, id) => {
        if (edge && typeof edge === 'object') {
          edges.push({ ...edge, id: edge.id || id });
        }
      });

      this.sendJson(res, {
        roomname,
        totalNodes: nodes.length,
        totalEdges: edges.length,
        nodes,
        edges,
      });
    } catch (error) {
      this.sendError(res, 500, 'Failed to read live graph', error.message);
    }
  }

  // Get a single node's full config from the live document
  async handleLiveNodeGet(req, res, roomname, nodeId) {
    if (!this.getYDoc) {
      return this.sendError(res, 503, 'Live document access not available');
    }

    try {
      const doc = this.getYDoc(roomname);
      const yNodes = doc.getMap('nodes');
      const node = yNodes.get(nodeId);

      if (!node) {
        return this.sendError(res, 404, `Node "${nodeId}" not found`);
      }

      this.sendJson(res, { roomname, node });
    } catch (error) {
      this.sendError(res, 500, 'Failed to read node', error.message);
    }
  }

  // Update a node in the live document (merges data)
  async handleLiveNodeUpdate(req, res, roomname, nodeId) {
    if (!this.getYDoc) {
      return this.sendError(res, 503, 'Live document access not available');
    }

    try {
      const body = await this.readBody(req);
      const updates = JSON.parse(body);

      const doc = this.getYDoc(roomname);
      const yNodes = doc.getMap('nodes');
      const existing = yNodes.get(nodeId);

      if (!existing) {
        return this.sendError(res, 404, `Node "${nodeId}" not found`);
      }

      // Deep merge: if updates has a 'data' key, merge into existing.data
      const merged = { ...existing };
      if (updates.data) {
        merged.data = { ...existing.data, ...updates.data };
        delete updates.data;
      }
      Object.assign(merged, updates);
      merged.lastModified = Date.now();

      yNodes.set(nodeId, merged);

      this.sendJson(res, { roomname, nodeId, node: merged });
    } catch (error) {
      this.sendError(res, 500, 'Failed to update node', error.message);
    }
  }

  // Create a new node in the live document
  async handleLiveNodeCreate(req, res, roomname) {
    if (!this.getYDoc) {
      return this.sendError(res, 503, 'Live document access not available');
    }

    try {
      const body = await this.readBody(req);
      const node = JSON.parse(body);

      if (!node.id) {
        return this.sendError(res, 400, 'Node must have an id');
      }

      const doc = this.getYDoc(roomname);
      const yNodes = doc.getMap('nodes');

      if (yNodes.has(node.id)) {
        return this.sendError(res, 409, `Node "${node.id}" already exists`);
      }

      const nodeWithTimestamp = {
        ...node,
        created: Date.now(),
        lastModified: Date.now(),
      };
      yNodes.set(node.id, nodeWithTimestamp);

      this.sendJson(res, { roomname, node: nodeWithTimestamp });
    } catch (error) {
      this.sendError(res, 500, 'Failed to create node', error.message);
    }
  }

  // Delete a node and its edges from the live document
  async handleLiveNodeDelete(req, res, roomname, nodeId) {
    if (!this.getYDoc) {
      return this.sendError(res, 503, 'Live document access not available');
    }

    try {
      const doc = this.getYDoc(roomname);
      const yNodes = doc.getMap('nodes');
      const yEdges = doc.getMap('edges');

      if (!yNodes.has(nodeId)) {
        return this.sendError(res, 404, `Node "${nodeId}" not found`);
      }

      // Delete node
      yNodes.delete(nodeId);

      // Delete connected edges
      const deletedEdges = [];
      yEdges.forEach((edge, edgeId) => {
        if (edge && (edge.source === nodeId || edge.target === nodeId)) {
          deletedEdges.push(edgeId);
        }
      });
      deletedEdges.forEach(edgeId => yEdges.delete(edgeId));

      this.sendJson(res, { roomname, deleted: nodeId, deletedEdges });
    } catch (error) {
      this.sendError(res, 500, 'Failed to delete node', error.message);
    }
  }

  // Create an edge in the live document
  async handleLiveEdgeCreate(req, res, roomname) {
    if (!this.getYDoc) {
      return this.sendError(res, 503, 'Live document access not available');
    }

    try {
      const body = await this.readBody(req);
      const edge = JSON.parse(body);

      if (!edge.id || !edge.source || !edge.target) {
        return this.sendError(res, 400, 'Edge must have id, source, and target');
      }

      const doc = this.getYDoc(roomname);
      const yEdges = doc.getMap('edges');

      const edgeWithTimestamp = {
        ...edge,
        created: Date.now(),
      };
      yEdges.set(edge.id, edgeWithTimestamp);

      this.sendJson(res, { roomname, edge: edgeWithTimestamp });
    } catch (error) {
      this.sendError(res, 500, 'Failed to create edge', error.message);
    }
  }

  // Delete an edge from the live document
  async handleLiveEdgeDelete(req, res, roomname, edgeId) {
    if (!this.getYDoc) {
      return this.sendError(res, 503, 'Live document access not available');
    }

    try {
      const doc = this.getYDoc(roomname);
      const yEdges = doc.getMap('edges');

      if (!yEdges.has(edgeId)) {
        return this.sendError(res, 404, `Edge "${edgeId}" not found`);
      }

      yEdges.delete(edgeId);
      this.sendJson(res, { roomname, deleted: edgeId });
    } catch (error) {
      this.sendError(res, 500, 'Failed to delete edge', error.message);
    }
  }

  // Helper: read request body
  readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  // Helper methods
  sendJson(res, data) {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(data, null, 2));
  }

  sendError(res, statusCode, message, details = null) {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(statusCode);
    res.end(JSON.stringify({
      error: message,
      details,
      timestamp: new Date().toISOString()
    }, null, 2));
  }
}
