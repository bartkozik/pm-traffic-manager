export function isAllowedBrowserOrigin(
  origin: string | undefined,
  configuredOrigin: string | undefined
) {
  if (!origin || !configuredOrigin) return false;
  if (origin === configuredOrigin) return true;
  return isLocalHttpOrigin(origin) && isLocalHttpOrigin(configuredOrigin);
}

function isLocalHttpOrigin(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    );
  } catch {
    return false;
  }
}
