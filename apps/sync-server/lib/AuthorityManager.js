import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export class AuthorityManager {
  constructor(config, systemDir) {
    this.config = config;
    this.systemDir = systemDir;
    this.serverId = config.server.serverId;
    this.keypair = null;

    this.ensureKeypair();
  }

  ensureKeypair() {
    if (this.config.server.keypair) {
      try {
        this.keypair = {
          publicKey: this.config.server.keypair.publicKey,
          privateKey: this.config.server.keypair.privateKey
        };
        console.log(`Loaded existing keypair for server: ${this.serverId}`);
        return;
      } catch (error) {
        console.warn('Invalid keypair in config, generating new one:', error);
      }
    }

    this.generateKeypair();
  }

  generateKeypair() {
    console.log(`Generating new Ed25519 keypair for server: ${this.serverId}`);

    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'der'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'der'
      }
    });

    const publicKeyB64 = `ed25519:${publicKey.toString('base64')}`;
    const privateKeyB64 = `ed25519:${privateKey.toString('base64')}`;

    this.keypair = {
      publicKey: publicKeyB64,
      privateKey: privateKeyB64
    };

    this.config.server.keypair = this.keypair;
    this.saveConfigWithKeypair();

    console.log(`Generated new keypair with public key: ${publicKeyB64.substring(0, 32)}...`);
  }

  saveConfigWithKeypair() {
    try {
      const configPath = path.join(process.cwd(), 'config', 'sync-server-config.json');
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
      console.log('Saved updated config with keypair');
    } catch (error) {
      console.error('Failed to save config with keypair:', error);
    }
  }

  signDocument(roomname, metadata, documentState) {
    if (!this.keypair) {
      throw new Error('No keypair available for signing');
    }

    const payload = this.createSignaturePayload(roomname, metadata, documentState);

    const privateKeyDer = Buffer.from(this.keypair.privateKey.replace('ed25519:', ''), 'base64');
    const privateKey = crypto.createPrivateKey({
      key: privateKeyDer,
      format: 'der',
      type: 'pkcs8'
    });

    const signature = crypto.sign(null, payload, privateKey);
    const signatureB64 = `sha256:${signature.toString('base64')}`;

    return {
      serverId: this.serverId,
      publicKey: this.keypair.publicKey,
      signature: signatureB64,
      signedAt: new Date().toISOString()
    };
  }

  verifyDocumentSignature(roomname, metadata, documentState, authority) {
    try {
      const publicKeyDer = Buffer.from(authority.publicKey.replace('ed25519:', ''), 'base64');
      const publicKey = crypto.createPublicKey({
        key: publicKeyDer,
        format: 'der',
        type: 'spki'
      });

      const payload = this.createSignaturePayload(roomname, metadata, documentState);

      const signature = Buffer.from(authority.signature.replace('sha256:', ''), 'base64');

      return crypto.verify(null, payload, publicKey, signature);
    } catch (error) {
      console.warn(`Signature verification failed for ${roomname}:`, error);
      return false;
    }
  }

  createSignaturePayload(roomname, metadata, documentState) {
    const payload = {
      roomname,
      serverId: this.serverId,
      timestamp: metadata.timestamp,
      timestampMs: metadata.timestampMs,
      size: metadata.size,
      hash: metadata.hash,
      stateVector: metadata.stateVector
    };

    return Buffer.from(JSON.stringify(payload, Object.keys(payload).sort()), 'utf8');
  }

  getPublicKeyInfo() {
    return {
      serverId: this.serverId,
      publicKey: this.keypair?.publicKey,
      algorithm: 'ed25519'
    };
  }

  isAuthorizedSource(authority, expectedServerId = null) {
    if (!authority || !authority.serverId || !authority.publicKey || !authority.signature) {
      return false;
    }

    if (expectedServerId && authority.serverId !== expectedServerId) {
      return false;
    }

    // For now, we trust any properly signed document
    // In production, you might want to maintain a whitelist of trusted servers
    return true;
  }
}
