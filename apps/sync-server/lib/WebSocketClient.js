import WebSocket from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding.js';
import * as decoding from 'lib0/decoding.js';
import * as syncProtocol from 'y-protocols/sync.js';

export class WebSocketClient {
  constructor() {
    this.ws = null;
    this.doc = null;
    this.isConnected = false;
    this.isSynced = false;
    this.connectTimeout = 30000; // 30 seconds
    this.syncTimeout = 60000; // 60 seconds
  }

  // Connect to remote server and sync document
  async connectAndSync(serverUrl, roomname) {
    return new Promise((resolve, reject) => {
      const wsUrl = `${serverUrl}/${roomname}`;
      console.log(`Connecting to ${wsUrl} for backup sync...`);

      // Create new Y.Doc for this sync operation
      this.doc = new Y.Doc();
      this.isSynced = false;

      // Setup connection timeout
      const connectTimer = setTimeout(() => {
        this.cleanup();
        reject(new Error(`Connection timeout after ${this.connectTimeout}ms`));
      }, this.connectTimeout);

      // Setup sync timeout
      let syncTimer = null;

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          console.log(`Connected to ${wsUrl}`);
          this.isConnected = true;
          clearTimeout(connectTimer);

          // Start sync timeout
          syncTimer = setTimeout(() => {
            this.cleanup();
            reject(new Error(`Sync timeout after ${this.syncTimeout}ms`));
          }, this.syncTimeout);

          // Send sync step 1 (request current state)
          this.sendSyncStep1();
        });

        this.ws.on('message', (data) => {
          try {
            this.handleMessage(data);

            // Check if sync is complete
            if (this.isSyncComplete()) {
              this.isSynced = true;
              clearTimeout(syncTimer);
              
              // Wait a bit for any final updates
              setTimeout(() => {
                const syncedDoc = this.doc;
                this.cleanup();
                resolve(syncedDoc);
              }, 1000);
            }
          } catch (error) {
            console.error('Error handling WebSocket message:', error);
            clearTimeout(syncTimer);
            this.cleanup();
            reject(error);
          }
        });

        this.ws.on('error', (error) => {
          console.error(`WebSocket error for ${wsUrl}:`, error);
          clearTimeout(connectTimer);
          clearTimeout(syncTimer);
          this.cleanup();
          reject(error);
        });

        this.ws.on('close', () => {
          console.log(`WebSocket connection closed for ${wsUrl}`);
          if (!this.isSynced) {
            clearTimeout(connectTimer);
            clearTimeout(syncTimer);
            reject(new Error('Connection closed before sync completed'));
          }
        });

      } catch (error) {
        clearTimeout(connectTimer);
        clearTimeout(syncTimer);
        this.cleanup();
        reject(error);
      }
    });
  }

  // Send sync step 1 to request current document state
  sendSyncStep1() {
    if (!this.ws || !this.doc) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0); // messageSync
    syncProtocol.writeSyncStep1(encoder, this.doc);
    this.ws.send(encoding.toUint8Array(encoder));
  }

  // Handle incoming WebSocket messages
  handleMessage(data) {
    const uint8Array = new Uint8Array(data);
    const decoder = decoding.createDecoder(uint8Array);
    const messageType = decoding.readVarUint(decoder);

    if (messageType === 0) { // messageSync
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0); // messageSync
      
      const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, this.doc, this.ws);

      // Send response if needed
      if (encoding.length(encoder) > 1) {
        this.ws.send(encoding.toUint8Array(encoder));
      }

      // Mark initial sync as complete after first sync step 2
      if (syncMessageType === syncProtocol.messageYjsSyncStep2) {
        console.log('Received sync step 2, document synchronized');
      }
    }
  }

  // Check if sync is complete (simplified heuristic)
  isSyncComplete() {
    if (!this.doc) return false;

    // Basic heuristic: document has some content and we've received initial sync
    const hasContent = this.doc.store.clients.size > 0;
    const hasState = Y.encodeStateAsUpdate(this.doc).length > 0;
    
    return hasContent || hasState;
  }

  // Cleanup connection and resources
  cleanup() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        // Ignore cleanup errors
      }
      this.ws = null;
    }
    
    this.isConnected = false;
    this.isSynced = false;
    // Note: Don't destroy this.doc here, caller might still need it
  }

  // Static method to fetch document list from remote server
  static async fetchDocumentList(httpUrl) {
    try {
      const apiUrl = `${httpUrl}/api/documents`;
      
      console.log(`Fetching document list from ${apiUrl}`);
      
      // Use dynamic import to avoid issues with fetch in Node.js
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        // @ts-ignore - node-fetch timeout option
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      // @ts-ignore - API response typing
      return data.documents || [];
    } catch (error) {
      console.error(`Failed to fetch document list from ${httpUrl}:`, error);
      throw error;
    }
  }

  // Static method to check if server is reachable
  static async checkServerHealth(httpUrl) {
    try {
      const healthUrl = `${httpUrl}/health`;
      
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(healthUrl, {
        method: 'GET',
        // @ts-ignore - node-fetch timeout option
        timeout: 5000
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }
}