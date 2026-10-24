import { afterEach, expect, test } from 'bun:test';
import cache from '../src/cache';

afterEach(() => cache.clear());

test('URL cache preserves keys, has no TTL, and evicts the least recently used of 1000 entries', () => {
  cache.clear();
  expect(cache.max).toBe(1000);
  expect(cache.ttl).toBe(0);
  expect(cache.get('dn/0')).toBeUndefined();

  const url = 'https://example.com/CaseSensitive?x=1#fragment';
  for (let id = 0; id < 1000; id++) cache.set(`dn/${id}`, url);
  expect(cache.size).toBe(1000);
  expect(cache.get('dn/0')).toBe(url);
  expect(cache.get('DN/0')).toBeUndefined();
  expect(cache.get('d/0')).toBeUndefined();
  expect(cache.get('b/0')).toBeUndefined();

  cache.set('b/0', url);
  expect(cache.size).toBe(1000);
  expect(cache.get('dn/1')).toBeUndefined();
  expect(cache.get('dn/0')).toBe(url);
  expect(cache.get('b/0')).toBe(url);

  cache.clear();
  expect(cache.size).toBe(0);
  expect(cache.get('dn/0')).toBeUndefined();
  expect(cache.get('b/0')).toBeUndefined();
});
