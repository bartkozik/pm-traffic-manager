export function isSamlAuthExpected(value = import.meta.env.VITE_PTM_AUTH_ENABLED) {
  return value === 'true';
}
