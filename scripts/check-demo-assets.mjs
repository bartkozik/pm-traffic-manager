import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../apps/web/dist/', import.meta.url);
async function inspect(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) await inspect(file);
    else if (/\.(js|html|css|map)$/.test(entry.name)) {
      const content = await readFile(file, 'utf8');
      if (/sk-(?:proj-|svcacct-)?[a-zA-Z0-9_-]{24,}/.test(content)) {
        throw new Error(`Possible API credential in built asset: ${entry.name}`);
      }
    }
  }
}
await inspect(root.pathname);
console.log('Built assets contain no detected OpenAI credentials.');
