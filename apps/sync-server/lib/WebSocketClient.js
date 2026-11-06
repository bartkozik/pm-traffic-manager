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
    this.connectTimeout = 30000;
    this.syncTimeout = 60000;
  }

  async connectAndSync(serverUrl, roomname) {
    return new Promise((resolve, reject) => {
      const wsUrl = `${serverUrl}/${roomname}`;
      console.log(`Connecting to ${wsUrl} for backup sync...`);

      this.doc = new Y.Doc();
      this.isSynced = false;

      const connectTimer = setTimeout(() => {
        this.cleanup();
        reject(new Error(`Connection timeout after ${this.connectTimeout}ms`));
      }, this.connectTimeout);

      let syncTimer = null;

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          console.log(`Connected to ${wsUrl}`);
          this.isConnected = true;
          clearTimeout(connectTimer);

          syncTimer = setTimeout(() => {
            this.cleanup();
            reject(new Error(`Sync timeout after ${this.syncTimeout}ms`));
          }, this.syncTimeout);

          this.sendSyncStep1();
        });

        this.ws.on('message', (data) => {
          try {
            this.handleMessage(data);

            if (this.isSyncComplete()) {
              this.isSynced = true;
              clearTimeout(syncTimer);

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

  sendSyncStep1() {
    if (!this.ws || !this.doc) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    this.ws.send(encoding.toUint8Array(encoder));
  }

  handleMessage(data) {
    const uint8Array = new Uint8Array(data);
    const decoder = decoding.createDecoder(uint8Array);
    const messageType = decoding.readVarUint(decoder);

    if (messageType === 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0);

      const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, this.doc, this.ws);

      if (encoding.length(encoder) > 1) {
        this.ws.send(encoding.toUint8Array(encoder));
      }

      if (syncMessageType === syncProtocol.messageYjsSyncStep2) {
        console.log('Received sync step 2, document synchronized');
      }
    }
  }

  isSyncComplete() {
    if (!this.doc) return false;

    const hasContent = this.doc.store.clients.size > 0;
    const hasState = Y.encodeStateAsUpdate(this.doc).length > 0;

    return hasContent || hasState;
  }

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

  static async fetchDocumentList(httpUrl) {
    try {
      const apiUrl = `${httpUrl}/api/documents`;

      console.log(`Fetching document list from ${apiUrl}`);

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
