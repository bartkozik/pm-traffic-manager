import { describe, expect, it } from 'vitest';
import { getPersonInitialsFromName } from './personInitials';

describe('getPersonInitialsFromName', () => {
  it('uses the first and last visible name parts', () => {
    expect(getPersonInitialsFromName('Jan Kowalski')).toBe('JK');
    expect(getPersonInitialsFromName("Avery-Maria Nowak Kowalska")).toBe("AK");
    expect(getPersonInitialsFromName('Nowa osoba 5')).toBe('N5');
  });

  it('supports Polish letters and a fallback for empty names', () => {
    expect(getPersonInitialsFromName('Łukasz Żółć')).toBe('ŁŻ');
    expect(getPersonInitialsFromName('', '?')).toBe('?');
  });
});
