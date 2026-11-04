import { isIP } from 'node:net';

export function isTrustedDemoProxy(address: string, hop: number) {
  if (hop !== 0) return false;
  if (address === '::1') return true;
  const normalized = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (isIP(normalized) !== 4) return false;
  const [first, second] = normalized.split('.').map(Number);
  return first === 127 || first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}
