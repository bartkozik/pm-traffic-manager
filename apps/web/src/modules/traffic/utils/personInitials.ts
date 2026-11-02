export function getPersonInitialsFromName(name: string, fallback = '') {
  const nameParts = name.trim().split(/[\s-]+/).filter(Boolean);
  const initialsSource = nameParts.length > 1 ? [nameParts[0], nameParts[nameParts.length - 1]] : nameParts;
  const initials = initialsSource
    .map((part) => part.match(/[\p{L}\p{N}]/u)?.[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return initials || fallback;
}
