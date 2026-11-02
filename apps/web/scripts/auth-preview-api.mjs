import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const host = '127.0.0.1';
const apiPort = await findAvailablePort(4011);
const webPort = await findAvailablePort(5181);
const apiOrigin = `http://${host}:${apiPort}`;
const webOrigin = `http://${host}:${webPort}`;
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const timestamp = '2026-07-21T08:00:00.000Z';
let previewAuthenticated = true;
let webProcess;

const users = [
  createAccessUser("admin-1@example.test", 'admin', 'Jacek Głodek'),
  createAccessUser("admin-2@example.test", 'admin', 'Łukasz Sowa'),
  createAccessUser("admin-3@example.test", 'admin', "Workspace Administrator"),
  createAccessUser('member@example.test', 'member', 'Test Member'),
];

let samlConfiguration = {
  acsUrl: 'https://public-host.example/api/auth/saml/acs',
  authEnabled: true,
  configured: true,
  configurationSource: 'database',
  cookieSecure: true,
  idpCertificate: '-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----',
  idpEntityId: 'https://accounts.google.com/o/saml2?idpid=preview',
  idpSsoUrl: 'https://accounts.google.com/o/saml2/idp?idpid=preview',
  metadataUrl: 'https://public-host.example/api/auth/saml/metadata.xml',
  requestTtlMinutes: 5,
  samlEnabled: true,
  sessionSecretConfigured: true,
  sessionTtlHours: 8,
  spCertificateConfigured: true,
  spEntityId: 'https://public-host.example/api/auth/saml/metadata.xml',
  spPrivateKeyConfigured: true,
  updatedAt: timestamp,
  webAppUrl: 'https://public-host.example',
  workspaceDomain: 'example.test',
};

const server = createHttpServer(async (request, response) => {
  if (request.method === 'OPTIONS') return send(response, undefined, 204);

  if (request.url === '/api/auth/session' && request.method === 'GET') {
    if (!previewAuthenticated) {
      return send(response, {
        authenticated: false,
        authEnabled: true,
        workspaceDomain: 'example.test',
      });
    }

    return send(response, {
      authenticated: true,
      authEnabled: true,
      user: {
        email: "admin-3@example.test",
        name: "Workspace Administrator",
        organizationDomain: 'example.test',
        role: 'admin',
        subject: 'local-auth-ui-preview',
      },
      workspaceDomain: 'example.test',
    });
  }

  if (request.url === '/api/auth/logout' && request.method === 'POST') {
    previewAuthenticated = false;
    return send(response, undefined, 204);
  }

  if (request.url?.startsWith('/api/auth/saml/authn?') && request.method === 'GET') {
    return send(response, {
      relayState: 'local-auth-ui-preview',
      samlRequest: 'local-auth-ui-preview',
      ssoUrl: `${apiOrigin}/api/auth-preview/login`,
    });
  }

  if (request.url === '/api/auth-preview/login' && request.method === 'POST') {
    previewAuthenticated = true;
    response.writeHead(303, { Location: `${webOrigin}/diablo-board/ptm-mvp` });
    return response.end();
  }

  if (request.url === '/api/access/users' && request.method === 'GET') {
    return send(response, { samlConfiguration, users });
  }

  if (request.url === '/api/access/users' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const created = createAccessUser(email, body.role === 'admin' ? 'admin' : 'member');
    users.push(created);
    return send(response, created, 201);
  }

  if (request.url?.startsWith('/api/access/users/') && request.method === 'PATCH') {
    const email = decodeURIComponent(request.url.slice('/api/access/users/'.length)).toLowerCase();
    const user = users.find((candidate) => candidate.email === email);
    if (!user) return send(response, { code: 'ACCESS_NOT_FOUND' }, 404);
    const patch = await readJsonBody(request);
    if (patch.role === 'admin' || patch.role === 'member') user.role = patch.role;
    if (patch.status === 'active' || patch.status === 'disabled') user.status = patch.status;
    user.updatedAt = new Date().toISOString();
    return send(response, user);
  }

  if (request.url === '/api/access/saml-configuration' && request.method === 'PUT') {
    const patch = await readJsonBody(request);
    samlConfiguration = {
      ...samlConfiguration,
      idpCertificate: String(patch.idpCertificate || ''),
      idpEntityId: String(patch.idpEntityId || ''),
      idpSsoUrl: String(patch.idpSsoUrl || ''),
      requestTtlMinutes: Number(patch.requestTtlMinutes) || 5,
      samlEnabled: Boolean(patch.samlEnabled),
      updatedAt: new Date().toISOString(),
    };
    return send(response, samlConfiguration);
  }

  return send(response, { code: 'PREVIEW_ENDPOINT_NOT_IMPLEMENTED' }, 404);
});

server.listen(apiPort, host, () => {
  console.log(`PTM auth UI preview: ${webOrigin}/diablo-board/ptm-mvp`);
  console.log(`PTM auth UI preview API: ${apiOrigin}`);

  webProcess = spawn(
    'pnpm',
    ['--filter', '@ptm/web', 'exec', 'vite', '--host', host, '--port', String(webPort), '--strictPort'],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        VITE_PTM_API_URL: `${apiOrigin}/api`,
        VITE_PTM_AUTH_ENABLED: 'true',
        VITE_PTM_SYNC_HOST: host,
        VITE_PTM_SYNC_HTTP_PORT: '3998',
        VITE_PTM_SYNC_WS_PORT: '3999',
      },
      stdio: 'inherit',
    }
  );

  webProcess.once('exit', (code, signal) => {
    server.close(() => process.exit(code ?? (signal ? 1 : 0)));
  });
});

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

function shutdown() {
  if (webProcess && !webProcess.killed) webProcess.kill('SIGTERM');
  server.close(() => process.exit(0));
}

function createAccessUser(email, role, name) {
  return {
    createdAt: timestamp,
    email,
    name,
    role,
    status: 'active',
    updatedAt: timestamp,
  };
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

function send(response, body, status = 200) {
  response.writeHead(status, {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Origin': webOrigin,
    'Content-Type': 'application/json',
    Vary: 'Origin',
  });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

async function findAvailablePort(preferredPort) {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error(`No free local port found in range ${preferredPort}-${preferredPort + 19}.`);
}

function canListen(port) {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}
