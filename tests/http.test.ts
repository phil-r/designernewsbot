import './setup';
import { afterAll, beforeAll, beforeEach, expect, test, spyOn } from 'bun:test';
import type { Server } from 'bun';
import { createConnection } from 'node:net';
import { db, resetDoubles, outbound } from './setup';
import cache from '../src/cache';
import { encode } from '../src/shortener';
const { handleRequest } = await import('../src/http');
const { parsePort } = await import('../src/index');
let server: Server<undefined>;
let base: string;
beforeAll(() => {
  server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: handleRequest });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(async () => {
  await server.stop(true);
});
beforeEach(() => {
  resetDoubles();
  cache.clear();
});
const request = (path: string, init?: RequestInit) =>
  fetch(base + path, { redirect: 'manual', ...init });

test('health and status methods, case and trailing slashes', async () => {
  for (const path of ['/yo', '/YO/', '/status', '/STATUS/']) {
    const response = await request(path);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe(
      path.toLowerCase().includes('yo') ? 'yo' : 'ok'
    );
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await request('/status', { method });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  }
  expect((await request('/yo', { method: 'POST' })).status).toBe(404);
});

// Fetch/Request normalize or reject these inputs before Bun's server sees them.
function rawRequest(method: string, target: string, host: string) {
  return new Promise<string>((resolve, reject) => {
    let response = '';
    const socket = createConnection(
      { host: '127.0.0.1', port: server.port! },
      () => {
        socket.write(
          `${method} ${target} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`
        );
      }
    );
    socket.setEncoding('utf8');
    socket.setTimeout(2000, () => socket.destroy(new Error('HTTP timeout')));
    socket.on('data', (data) => {
      response += data;
    });
    socket.on('error', reject);
    socket.on('close', () => resolve(response));
  });
}

test('raw CONNECT and malformed Host requests are client errors without logging or persistence', async () => {
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (const method of ['GET', 'HEAD']) {
      const response = await rawRequest(method, '/status', '[');
      expect(response).toStartWith('HTTP/1.1 400 ');
      expect(response.split('\r\n\r\n')[1]).toBe(
        method === 'HEAD' ? '' : 'Malformed request'
      );
    }
    const connect = await rawRequest(
      'CONNECT',
      '1.2.3.4:443',
      'example.invalid'
    );
    expect(connect).toStartWith('HTTP/1.1 404 ');
    expect(log).not.toHaveBeenCalled();
    for (const table of Object.values(db))
      expect(table.findUnique).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});

test('static assets preserve content, content type and HEAD semantics', async () => {
  for (const path of ['/', '/index.html', '/robots.txt']) {
    const response = await request(path);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain(
      path.endsWith('.txt') ? 'text/plain' : 'text/html'
    );
    expect(text).toBe(
      await Bun.file(
        `${import.meta.dir}/../static/${path.endsWith('.txt') ? 'robots.txt' : 'index.html'}`
      ).text()
    );
    const head = await request(path, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(head.headers.get('content-length')).toBe(
      response.headers.get('content-length')
    );
  }
});

test('static validators, conditional requests and byte ranges', async () => {
  for (const path of ['/index.html', '/robots.txt']) {
    const original = await request(path);
    const text = await original.text();
    const etag = original.headers.get('etag');
    const modified = original.headers.get('last-modified');
    expect(etag).toBeTruthy();
    expect(modified).toBeTruthy();
    expect(original.headers.get('accept-ranges')).toBe('bytes');
    expect(original.headers.get('cache-control')).toBe('public, max-age=0');
    const conditionals: Record<string, string>[] = [
      { 'If-None-Match': etag! },
      { 'If-Modified-Since': modified! },
    ];
    for (const headers of conditionals) {
      const response = await request(path, { headers });
      expect(response.status).toBe(304);
      expect(await response.text()).toBe('');
    }
    const range = await request(path, { headers: { Range: 'bytes=0-9' } });
    expect(range.status).toBe(206);
    expect(range.headers.get('content-range')).toBe(
      `bytes 0-9/${new TextEncoder().encode(text).length}`
    );
    expect(await range.text()).toBe(text.slice(0, 10));
    expect(
      (await request(path, { headers: { Range: 'bytes=9999999-' } })).status
    ).toBe(416);
  }
});

for (const [prefix, table] of [
  ['s', db.designerNewsStory],
  ['b', db.behanceProject],
  ['d', db.dribbbleShot],
] as const) {
  test(`${prefix} stored redirects retain ID case, query and trailing slash behavior`, async () => {
    table.findUnique.mockImplementation(async ({ where }: any) => ({
      url: `https://example.invalid/${where.id}`,
    }));
    for (const [path, id] of [
      [`/${prefix}/L`, 42],
      [`/${prefix.toUpperCase()}/L/?tracking=ignored`, 42],
      [`/${prefix}/a`, 8],
      [`/${prefix}/A`, 32],
    ] as const) {
      cache.clear();
      const response = await request(path);
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(
        `https://example.invalid/${id}`
      );
      expect(table.findUnique.mock.calls.at(-1)?.[0]).toEqual({
        where: { id },
      });
    }
    expect(outbound.posts).toEqual([]);
    const head = await request(`/${prefix}/L`, { method: 'HEAD' });
    expect(head.status).toBe(302);
    expect(head.headers.get('location')).toBe('https://example.invalid/42');
    expect(await head.text()).toBe('');
    expect((await request(`/${prefix}/L`, { method: 'POST' })).status).toBe(
      404
    );
  });
  test(`${prefix} missing links remain retryable`, async () => {
    const response = await request(`/${prefix}/L`);
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('5');
    expect(await response.text()).toBe(
      '<h1>Service Unavailable</h1><p>Try again later</p>'
    );
  });
}

test('comments redirect does not consult persistence', async () => {
  for (const path of ['/c/L', '/C/L/?query=yes']) {
    const response = await request(path);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://www.designernews.co/stories/42'
    );
  }
  for (const table of Object.values(db))
    expect(table.findUnique).not.toHaveBeenCalled();
});

test('malformed alphabet, percent escapes and unknown/traversal paths', async () => {
  for (const prefix of ['s', 'b', 'c', 'd']) {
    for (const id of ['0', 'I', '%25', '%ZZ', '%E0%A4%A']) {
      expect((await request(`/${prefix}/${id}`)).status).toBe(400);
    }
  }
  for (const path of [
    '/missing',
    '/s/',
    '/src/index.ts',
    '/%2e%2e%2fsrc/index.ts',
    '/.env',
  ]) {
    expect((await request(path)).status).toBe(404);
  }
});

test('oversized short-link IDs are rejected before persistence, including HEAD', async () => {
  for (const prefix of ['s', 'b', 'c', 'd']) {
    for (const id of [
      encode(2147483648),
      encode(Number.MAX_SAFE_INTEGER),
      'Z'.repeat(200),
    ]) {
      for (const method of ['GET', 'HEAD']) {
        const response = await request(`/${prefix}/${id}`, { method });
        expect(response.status).toBe(400);
        expect(await response.text()).toBe(
          method === 'HEAD' ? '' : 'Malformed request'
        );
      }
    }
  }
  for (const table of Object.values(db))
    expect(table.findUnique).not.toHaveBeenCalled();
});

test('maximum signed 32-bit short-link ID remains valid', async () => {
  const id = 2147483647;
  for (const table of Object.values(db))
    table.findUnique.mockResolvedValue({ url: 'https://example.invalid/max' });
  for (const prefix of ['s', 'b', 'c', 'd']) {
    const response = await request(`/${prefix}/${encode(id)}`);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      prefix === 'c'
        ? `https://www.designernews.co/stories/${id}`
        : 'https://example.invalid/max'
    );
  }
  for (const table of Object.values(db))
    expect(table.findUnique).toHaveBeenCalledWith({ where: { id } });
});

test('HEAD suppresses body for health and error responses', async () => {
  for (const [path, status] of [
    ['/yo', 200],
    ['/status', 200],
    ['/s/0', 400],
    ['/s/L', 503],
    ['/missing', 404],
  ] as const) {
    const response = await request(path, { method: 'HEAD' });
    expect(response.status).toBe(status);
    expect(await response.text()).toBe('');
  }
});

test('repository rejection is a sanitized 500, including HEAD', async () => {
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    db.designerNewsStory.findUnique.mockImplementation(async () => {
      throw new Error('secret database path /private/password?token=secret');
    });
    for (const method of ['GET', 'HEAD']) {
      const response = await request('/s/L?credential=secret', { method });
      expect(response.status).toBe(500);
      expect(await response.text()).toBe(
        method === 'HEAD' ? '' : 'Internal Server Error'
      );
    }
    expect(log.mock.calls).toHaveLength(2);
    for (const call of log.mock.calls) {
      expect(call).toEqual([
        'HTTP request failed',
        {
          timestamp: expect.stringMatching(
            /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/
          ),
          category: 'error',
          routeType: 'short-story',
        },
      ]);
    }
  } finally {
    log.mockRestore();
  }
});

test('failure diagnostics use only fixed categories, never error properties or request secrets', async () => {
  const secret =
    'token=private /private/database.sqlite https://stored.invalid/secret';
  const namedError = new Error(secret);
  Object.defineProperty(namedError, 'name', {
    get() {
      throw new Error('must not read error.name');
    },
  });
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (const [error, category] of [
      [new TypeError(secret), 'type_error'],
      [new RangeError(secret), 'range_error'],
      [new URIError(secret), 'uri_error'],
      [namedError, 'error'],
      [{ name: secret, message: secret, stack: secret }, 'unknown'],
      [secret, 'unknown'],
      [null, 'unknown'],
    ] as const) {
      for (const [prefix, table, routeType] of [
        ['b', db.behanceProject, 'short-behance'],
        ['d', db.dribbbleShot, 'short-dribbble'],
      ] as const) {
        table.findUnique.mockRejectedValue(error);
        for (const method of ['GET', 'HEAD']) {
          cache.clear();
          log.mockClear();
          const start = Date.now();
          const response = await handleRequest(
            new Request(
              `https://user:password@example.invalid/${prefix.toUpperCase()}/%4c/?token=query-secret`,
              { method, headers: { Authorization: 'Bearer header-secret' } }
            )
          );
          expect(response.status).toBe(500);
          expect(await response.text()).toBe(
            method === 'HEAD' ? '' : 'Internal Server Error'
          );
          expect(log.mock.calls).toEqual([
            [
              'HTTP request failed',
              {
                timestamp: expect.any(String),
                category,
                routeType,
              },
            ],
          ]);
          const timestamp = Date.parse(
            (log.mock.calls[0][1] as { timestamp: string }).timestamp
          );
          expect(timestamp).toBeGreaterThanOrEqual(start);
          expect(timestamp).toBeLessThanOrEqual(Date.now());
        }
      }
    }
  } finally {
    log.mockRestore();
  }
});

test('static, comments and other failures get safe route labels, including HEAD', async () => {
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (const method of ['GET', 'HEAD']) {
      for (const routeType of ['static', 'short-comments', 'other']) {
        const request = new Request(
          `https://example.invalid/${routeType === 'static' ? 'robots.txt' : 'C/L'}?token=secret`,
          { method }
        );
        let restore = () => {};
        if (routeType === 'static') {
          const file = spyOn(Bun, 'file').mockImplementation(() => {
            throw new TypeError('/private/secret.sqlite?token=secret');
          });
          restore = () => file.mockRestore();
        } else if (routeType === 'short-comments') {
          const encode = spyOn(globalThis, 'encodeURI').mockImplementation(
            () => {
              throw new TypeError('https://stored.invalid/?token=secret');
            }
          );
          restore = () => encode.mockRestore();
        } else {
          Object.defineProperty(request, 'url', {
            get() {
              throw new TypeError(
                'https://user:secret@example.invalid/private?token=secret'
              );
            },
          });
        }
        try {
          log.mockClear();
          const response = await handleRequest(request);
          expect(response.status).toBe(500);
          expect(await response.text()).toBe(
            method === 'HEAD' ? '' : 'Internal Server Error'
          );
          expect(log.mock.calls).toEqual([
            [
              'HTTP request failed',
              {
                timestamp: expect.any(String),
                category: 'type_error',
                routeType,
              },
            ],
          ]);
        } finally {
          restore();
        }
      }
    }
  } finally {
    log.mockRestore();
  }
});

test('port validation rejects pipe names, empty and out-of-range values', () => {
  expect(parsePort(undefined)).toBe(8080);
  expect(parsePort('8080')).toBe(8080);
  expect(parsePort('1')).toBe(1);
  expect(parsePort('65535')).toBe(65535);
  for (const value of [
    '',
    '0',
    '-1',
    '65536',
    'NaN',
    'pipe',
    ' 8080',
    '80.5',
    '1e3',
  ])
    expect(() => parsePort(value)).toThrow(
      'PORT must be an integer from 1 to 65535'
    );
});

test('static range variants, validator precedence and if-range', async () => {
  const original = await request('/robots.txt');
  const bytes = await original.text();
  const etag = original.headers.get('etag')!;
  expect(
    (
      await request('/robots.txt', {
        headers: {
          'If-None-Match': '"other"',
          'If-Modified-Since': 'Thu, 01 Jan 2099 00:00:00 GMT',
        },
      })
    ).status
  ).toBe(200);
  expect(
    (
      await request('/robots.txt', {
        headers: { 'If-None-Match': `W/${etag}` },
      })
    ).status
  ).toBe(304);
  for (const [range, expected] of [
    ['bytes=10-', bytes.slice(10)],
    ['bytes=-10', bytes.slice(-10)],
  ]) {
    const response = await request('/robots.txt', {
      headers: { Range: range },
    });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe(expected);
  }
  const ranges: Record<string, string>[] = [
    { Range: 'bytes=0-1,4-5' },
    { Range: 'invalid' },
    { Range: 'bytes=0-9', 'If-Range': '"old"' },
  ];
  for (const headers of ranges) {
    const response = await request('/robots.txt', { headers });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(bytes);
  }
  const head = await request('/robots.txt', {
    method: 'HEAD',
    headers: { Range: 'bytes=0-9' },
  });
  expect(head.status).toBe(206);
  expect(await head.text()).toBe('');
});

test('allowlist is module-root anchored and does not expose directories', async () => {
  const cwd = process.cwd();
  try {
    process.chdir(import.meta.dir);
    expect((await request('/index.html')).status).toBe(200);
    for (const path of [
      '/static/index.html',
      '/index.html/',
      '/robots.txt/',
      '/%2e%2e%2f.env',
      '/%2fetc%2fpasswd',
      '/.git/config',
    ])
      expect((await request(path)).status).toBe(404);
  } finally {
    process.chdir(cwd);
  }
});

test('stored targets retain escapes, path and query without URL normalization', async () => {
  for (const [url, location] of [
    [
      'https://example.invalid/a/../b?x=%2f#part',
      'https://example.invalid/a/../b?x=%2f#part',
    ],
    [
      'https://example.invalid/привет hello',
      'https://example.invalid/%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82%20hello',
    ],
    ['https://[::1]/path', 'https://[::1]/path'],
  ]) {
    cache.clear();
    db.designerNewsStory.findUnique.mockImplementation(async () => ({ url }));
    const response = await request('/s/L');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(location);
  }
});
