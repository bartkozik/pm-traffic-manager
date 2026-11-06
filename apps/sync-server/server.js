import WebSocket, { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding.js';
import * as decoding from 'lib0/decoding.js';
import * as syncProtocol from 'y-protocols/sync.js';
import * as awarenessProtocol from 'y-protocols/awareness.js';
import * as fs from 'fs';
import * as path from 'path';

import { VersionManager } from './lib/VersionManager.js';
import { RetentionEngine } from './lib/RetentionEngine.js';
import { HttpApiServer } from './lib/HttpApiServer.js';
import { CleanupScheduler } from './lib/CleanupScheduler.js';
import { AuthorityManager } from './lib/AuthorityManager.js';
import { BackupScheduler } from './lib/BackupScheduler.js';

const configPath = path.join(process.cwd(), 'config', 'sync-server-config.json');
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('Loaded server configuration from sync-server-config.json');
} catch (error) {
  console.error('Failed to load sync-server-config.json:', error);
  process.exit(1);
}

const port = parseInt(process.env.WS_PORT || '3000', 10);
const httpPort = process.env.HTTP_PORT || 3001;
const INTERFACE = process.env.INTERFACE || '0.0.0.0';
const DATA_DIR = process.env.YJS_DATA_DIR || path.join(process.cwd(), 'data-docs');
const PERSIST_DOCUMENTS = process.env.YJS_PERSIST_DOCUMENTS === 'true';
const ALLOW_DOCUMENT_SYNC = process.env.YJS_ALLOW_DOCUMENT_SYNC === 'true';
const SAVE_DEBOUNCE_MS = 10000;

const retentionConfig = {
  retentionPolicies: {
    default: config.defaultRetentionPolicy
  },
  cleanup: config.cleanup
};

const authorityManager = new AuthorityManager(config, path.join(DATA_DIR, 'system'));

const versionManager = new VersionManager(DATA_DIR, retentionConfig, authorityManager);
const retentionEngine = new RetentionEngine(versionManager, retentionConfig);

const backupScheduler = new BackupScheduler(config, authorityManager);

const httpApiServer = new HttpApiServer(httpPort, INTERFACE, versionManager, retentionEngine, backupScheduler, authorityManager);
const cleanupScheduler = new CleanupScheduler(retentionEngine, retentionConfig.cleanup.intervalMinutes);

let wss;
try {
  wss = new WebSocketServer({
    port,
    host: INTERFACE
  });
} catch (error) {
  console.error(`FATAL: Failed to start WebSocket server on port ${port}:`, error);
  process.exit(1);
}

const docs = new Map();

const awarenessStates = new Map();

const ephemeralState = new Map();

const wsMetadata = new Map();

const pendingSaves = new Map();
const saveTimers = new Map();

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`Created data directory: ${DATA_DIR}`);
}

console.log(`Y.js Sync Server running on ws://${INTERFACE}:${port}`);
console.log(`Data directory: ${DATA_DIR}`);
console.log(`Document persistence: ${PERSIST_DOCUMENTS ? 'enabled' : 'disabled'}`);
console.log(`Document sync rooms: ${ALLOW_DOCUMENT_SYNC ? 'all rooms enabled' : 'presence rooms only'}`);

try {
  httpApiServer.start();
} catch (error) {
  console.error(`FATAL: Failed to start HTTP API server on port ${httpPort}:`, error);
  process.exit(1);
}

cleanupScheduler.start();

if (config.backupSources && config.backupSources.length > 0) {
  backupScheduler.start();
  console.log(`Backup scheduler started with ${config.backupSources.length} source(s)`);
} else {
  console.log('No backup sources configured');
}

console.log('Version management system initialized');
console.log(`Server ID: ${config.server.serverId}`);
console.log(`HTTP API available at: http://${INTERFACE}:${httpPort}`);
console.log(`Cleanup running every ${retentionConfig.cleanup.intervalMinutes} minutes`);
console.log(`Authority management: ${authorityManager ? 'enabled' : 'disabled'}`);

function getLatestFilePath(roomname) {
  return path.join(DATA_DIR, 'documents', roomname, 'latest.yjs');
}

function loadDocumentFromFile(roomname) {
  const latestFilePath = getLatestFilePath(roomname);

  console.log(`[DEBUG] Attempting to load document for room: ${roomname}`);
  console.log(`[DEBUG] Latest file path: ${latestFilePath}`);
  console.log(`[DEBUG] File exists: ${fs.existsSync(latestFilePath)}`);

  try {
    if (fs.existsSync(latestFilePath)) {
      const data = fs.readFileSync(latestFilePath);
      console.log(`[DEBUG] Read ${data.length} bytes from latest file`);
      const doc = new Y.Doc();
      Y.applyUpdate(doc, data);
      console.log(`[SUCCESS] Loaded document for room: ${roomname} from latest file (${data.length} bytes)`);
      return doc;
    } else {
      const oldFilePath = path.join(DATA_DIR, `${roomname}.yjs`);
      console.log(`[DEBUG] Trying old file path: ${oldFilePath}`);
      if (fs.existsSync(oldFilePath)) {
        const data = fs.readFileSync(oldFilePath);
        const doc = new Y.Doc();
        Y.applyUpdate(doc, data);
        console.log(`[SUCCESS] Loaded document for room: ${roomname} from old file location (${data.length} bytes)`);
        return doc;
      } else {
        console.log(`[WARNING] No document file found for room: ${roomname}`);
      }
    }
  } catch (error) {
    console.error(`[ERROR] Error loading document for room ${roomname}:`, error);
  }
  return null;
}

async function saveDocumentToFile(roomname, doc) {
  if (!PERSIST_DOCUMENTS) return;

  try {
    await versionManager.createVersion(roomname, doc, 'websocket-sync');
    console.log(`Created version for room: ${roomname}`);
  } catch (error) {
    console.error(`Error creating version for room ${roomname}:`, error);
  }
}

function scheduleSave(roomname, doc) {
  if (saveTimers.has(roomname)) {
    clearTimeout(saveTimers.get(roomname));
  }

  pendingSaves.set(roomname, true);

  const timer = setTimeout(async () => {
    if (pendingSaves.get(roomname)) {
      await saveDocumentToFile(roomname, doc);
      pendingSaves.delete(roomname);
    }
    saveTimers.delete(roomname);
  }, SAVE_DEBOUNCE_MS);

  saveTimers.set(roomname, timer);
}

function getYDoc(roomname) {
  if (!docs.has(roomname)) {
    let doc = PERSIST_DOCUMENTS ? loadDocumentFromFile(roomname) : null;

    if (!doc) {
      doc = new Y.Doc();
      console.log(`Created new document for room: ${roomname}`);
    }

    if (PERSIST_DOCUMENTS) {
      doc.on('update', () => {
        scheduleSave(roomname, doc);
      });
    }

    docs.set(roomname, doc);
  }
  return docs.get(roomname);
}

function getAwareness(roomname, doc) {
  if (!awarenessStates.has(roomname)) {
    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState(null);
    awarenessStates.set(roomname, awareness);
  }
  return awarenessStates.get(roomname);
}

function broadcastYjsRoomMessage(roomname, data, excludeWs = null) {
  wss.clients.forEach((client) => {
    if (client !== excludeWs &&
        client.readyState === WebSocket.OPEN &&
        wsMetadata.get(client)?.roomname === roomname &&
        !wsMetadata.get(client)?.isCollaboration) {
      client.send(data);
    }
  });
}

function readYjsUpdateFromSyncMessage(message) {
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);
  if (messageType !== messageSync) return null;

  const syncMessageType = decoding.readVarUint(decoder);
  if (syncMessageType !== syncProtocol.messageYjsUpdate) return null;

  return decoding.readVarUint8Array(decoder);
}

function readAwarenessClientIds(update) {
  const decoder = decoding.createDecoder(update);
  const clientIds = [];
  const length = decoding.readVarUint(decoder);

  for (let index = 0; index < length; index += 1) {
    clientIds.push(decoding.readVarUint(decoder));
    decoding.readVarUint(decoder);
    decoding.readVarString(decoder);
  }

  return clientIds;
}

function encodeAwarenessMessage(awareness, clientIds) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, clientIds));
  return encoding.toUint8Array(encoder);
}

httpApiServer.setDocResolver(getYDoc);

function getEphemeralState(roomname) {
  if (!ephemeralState.has(roomname)) {
    ephemeralState.set(roomname, {
      cursors: new Map(),
      locks: new Map(),
      presence: new Map(),
      selections: new Map()
    });
  }
  return ephemeralState.get(roomname);
}

function broadcastToRoom(roomname, data, excludeWs = null) {
  wss.clients.forEach((client) => {
    if (client !== excludeWs &&
        client.readyState === WebSocket.OPEN &&
        wsMetadata.get(client)?.roomname === roomname &&
        wsMetadata.get(client)?.isCollaboration) {
      client.send(JSON.stringify(data));
    }
  });
}

const messageSync = 0;
const messageAwareness = 1;

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const pathname = url.pathname.slice(1);

  if (pathname.startsWith('collaboration/')) {
    const roomname = pathname.replace('collaboration/', '');
    wsMetadata.set(ws, { roomname, isCollaboration: true });

    const state = getEphemeralState(roomname);

    ws.send(JSON.stringify({
      type: 'initial-state',
      cursors: Array.from(state.cursors.values()),
      locks: Array.from(state.locks.values()),
      presence: Array.from(state.presence.values())
    }));

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        switch (data.type) {
          case 'cursor':
            state.cursors.set(data.userId, data);
            broadcastToRoom(roomname, data, ws);
            break;

          case 'lock':
            if (data.action === 'acquire') {
              state.locks.set(data.nodeId, data);
              broadcastToRoom(roomname, data, ws);

              setTimeout(() => {
                if (state.locks.has(data.nodeId)) {
                  const lock = state.locks.get(data.nodeId);
                  if (lock.userId === data.userId) {
                    state.locks.delete(data.nodeId);
                    broadcastToRoom(roomname, {
                      type: 'lock-expired',
                      nodeId: data.nodeId
                    });
                  }
                }
              }, data.ttl);
            } else if (data.action === 'release') {
              state.locks.delete(data.nodeId);
              broadcastToRoom(roomname, {
                type: 'lock-expired',
                nodeId: data.nodeId
              }, ws);
            }
            break;

          case 'presence':
            state.presence.set(data.userId, data);
            broadcastToRoom(roomname, data, ws);
            break;

          case 'selection':
            state.selections.set(data.userId, data);
            broadcastToRoom(roomname, data, ws);
            break;
        }
      } catch (error) {
        console.error('Error processing collaboration message:', error);
      }
    });

    ws.on('close', () => {
      console.log(`Collaboration connection closed for room: ${roomname}`);

      const state = getEphemeralState(roomname);

      let userId = null;

      for (const [id, cursor] of state.cursors) {
        if (cursor.userId) {
          userId = cursor.userId;
          state.cursors.delete(id);
          break;
        }
      }

      if (userId) {
        state.presence.delete(userId);

        for (const [nodeId, lock] of state.locks) {
          if (lock.userId === userId) {
            state.locks.delete(nodeId);
          }
        }

        state.selections.delete(userId);

        broadcastToRoom(roomname, { type: 'user-left', userId });
      }
    });

    return;
  }

  const roomname = pathname;
  if (!ALLOW_DOCUMENT_SYNC && !roomname.endsWith(':presence')) {
    console.warn(`Rejected legacy Yjs document room: ${roomname}`);
    ws.close(1008, 'PTM sync-server accepts presence rooms only');
    return;
  }

  wsMetadata.set(ws, { roomname, isCollaboration: false });

  console.log(`New Y.js sync connection to room: ${roomname}`);

  const doc = getYDoc(roomname);
  const awareness = getAwareness(roomname, doc);
  const awarenessClientIds = new Set();

  console.log(`[DEBUG] Preparing sync step 1 for room: ${roomname}`);
  console.log(`[DEBUG] Document state vector length: ${Y.encodeStateVector(doc).length}`);
  console.log(`[DEBUG] Document update size: ${Y.encodeStateAsUpdate(doc).length}`);

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  const syncData = encoding.toUint8Array(encoder);
  console.log(`[DEBUG] Sending sync step 1: ${syncData.length} bytes`);
  ws.send(syncData);

  if (awareness.getStates().size > 0) {
    ws.send(encodeAwarenessMessage(awareness, Array.from(awareness.getStates().keys())));
  }

  ws.on('message', (message) => {
    try {
      // @ts-ignore - RawData handling for WebSocket message
      const uint8Array = new Uint8Array(message);
      console.log(`[DEBUG] Received message: ${uint8Array.length} bytes`);
      const decoder = decoding.createDecoder(uint8Array);
      const messageType = decoding.readVarUint(decoder);
      console.log(`[DEBUG] Message type: ${messageType}`);

      switch (messageType) {
        case messageSync:
          console.log(`[DEBUG] Processing sync message for room: ${roomname}`);
          const update = readYjsUpdateFromSyncMessage(uint8Array);
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, messageSync);
          const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
          console.log(`[DEBUG] Sync message type: ${syncMessageType}`);

          if (encoding.length(encoder) > 1) {
            const responseData = encoding.toUint8Array(encoder);
            console.log(`[DEBUG] Sending sync response: ${responseData.length} bytes`);
            ws.send(responseData);
          }

          if (syncMessageType === syncProtocol.messageYjsUpdate && update) {
            const broadcastEncoder = encoding.createEncoder();
            encoding.writeVarUint(broadcastEncoder, messageSync);
            syncProtocol.writeUpdate(broadcastEncoder, update);
            broadcastYjsRoomMessage(roomname, encoding.toUint8Array(broadcastEncoder), ws);
          }
          break;

        case messageAwareness:
          const awarenessUpdate = decoding.readVarUint8Array(decoder);
          readAwarenessClientIds(awarenessUpdate).forEach((clientId) => awarenessClientIds.add(clientId));
          awarenessProtocol.applyAwarenessUpdate(awareness, awarenessUpdate, ws);
          broadcastYjsRoomMessage(roomname, uint8Array, ws);
          break;
      }
    } catch (error) {
      console.error('Error processing Y.js message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`Y.js sync connection closed for room: ${roomname}`);
    if (awarenessClientIds.size > 0) {
      const clientIds = Array.from(awarenessClientIds);
      awarenessProtocol.removeAwarenessStates(awareness, clientIds, ws);
      broadcastYjsRoomMessage(roomname, encodeAwarenessMessage(awareness, clientIds), ws);
    }
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error in room ${roomname}:`, error);
  });
});

wss.on('error', (error) => {
  console.error('FATAL: WebSocket server error:', error);
  process.exit(1);
});

async function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down Y.js Sync Server...`);

  if (backupScheduler && backupScheduler.isRunning) {
    backupScheduler.stop();
    console.log('Backup scheduler stopped.');
  }

  cleanupScheduler.stop();
  console.log('Cleanup scheduler stopped.');

  httpApiServer.stop();
  console.log('HTTP API server stopped.');

  for (const [roomname, timer] of saveTimers) {
    clearTimeout(timer);
  }
  saveTimers.clear();

  if (PERSIST_DOCUMENTS) {
    console.log('Saving all documents...');
    for (const [roomname, doc] of docs) {
      await saveDocumentToFile(roomname, doc);
    }
    console.log('All documents saved.');
  } else {
    console.log('Document persistence disabled; skipping Yjs document save.');
  }

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close();
    }
  });

  wss.close(() => {
    console.log('Y.js Sync Server closed. Goodbye!');
    process.exit(0);
  });

  setTimeout(() => {
    console.log('\nShutdown timeout reached, exiting...');
    process.exit(0);
  }, 5000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
