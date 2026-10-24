import { describe, expect, test } from 'bun:test';
import { encode, decode } from '../src/shortener';

describe('legacy case-sensitive short IDs', () => {
  test.each([
    [0, '2'],
    [1, '3'],
    [42, 'L'],
    [54, 'Y'],
    [56, '32'],
    [123456, 'HnA'],
  ])('%s encodes as %s', (id, short) => {
    expect(encode(id as number)).toBe(short);
    expect(decode(short as string)).toBe(id);
  });
  test('malformed alphabet and case remain distinct', () => {
    for (const short of ['0', '1', 'l', 'o', 'I', 'O', '%', 'a/b', 'é'])
      expect(Number.isNaN(decode(short))).toBe(true);
    expect(decode('a')).not.toBe(decode('A'));
    expect(decode('')).toBe(0); // Legacy helper behavior; an empty HTTP parameter never routes.
  });
});
