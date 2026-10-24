import './setup';
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { resetDoubles } from './setup';
import { resolve } from 'node:path';
import { setFetchFixture } from './fixtures/network-policy';
import { projects, project } from '../src/apis/behance';
import { dribbbleTop } from '../src/apis/dribbble';
import {
  sendMessage,
  sendPhoto,
  sendVideo,
  sendMediaGroup,
} from '../src/apis/telegram';

const calls: { url: string; init: RequestInit }[] = [];
let respond: (init: RequestInit) => Promise<Response>;
let deadlines: number[] = [];
let timeoutSpy: ReturnType<typeof spyOn>;
const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
beforeEach(() => {
  calls.length = 0;
  deadlines = [];
  timeoutSpy = spyOn(AbortSignal, 'timeout').mockImplementation(
    (ms: number) => {
      deadlines.push(ms);
      return nativeTimeout(ms);
    }
  );
  respond = async () => Response.json({ synthetic: true });
  setFetchFixture((url, init = {}) => {
    const feed =
      (!init.method || init.method === 'GET') &&
      ((url.origin === 'https://www.behance.net' &&
        /^\/v2\/projects(?:\/[^/]+)?$/.test(url.pathname)) ||
        (url.origin === 'https://dribbble-top.dsgnr.news' &&
          url.pathname === '/top'));
    const telegram =
      init.method === 'POST' &&
      url.origin === 'https://api.telegram.org' &&
      /^\/botoffline-test-token\/send(?:Message|Photo|Video|MediaGroup)$/.test(
        url.pathname
      );
    if (!feed && !telegram) return undefined;
    calls.push({ url: url.href, init });
    return respond(init);
  });
});
afterEach(() => {
  timeoutSpy.mockRestore();
  resetDoubles();
});

test('Behance preserves query order, empty strings and scalar encoding', async () => {
  await projects();
  await projects("a :$,[]~!'()*&+=/?雪", '');
  await project(42);
  expect(calls.map(({ url }) => url)).toEqual([
    'https://www.behance.net/v2/projects?time=all&sort=&api_key=offline-test-token',
    'https://www.behance.net/v2/projects?time=a+:$,[]~!%27()*%26%2B%3D%2F%3F%E9%9B%AA&sort=&api_key=offline-test-token',
    'https://www.behance.net/v2/projects/42?api_key=offline-test-token',
  ]);
  expect(deadlines).toEqual([10000, 10000, 10000]);
  for (const { init } of calls) {
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
    expect(init.redirect).toBeUndefined();
  }
});

test('Behance omits absent/null query values and encodes the captured token', () => {
  for (const token of [undefined, 'key :$,[]~&+=雪']) {
    const child = Bun.spawnSync(
      [
        process.execPath,
        '--no-env-file',
        '--preload',
        resolve(import.meta.dir, 'fixtures/block-network.ts'),
        '-e',
        `
        import assert from 'node:assert/strict';
        const { setFetchFixture } = await import(${JSON.stringify(resolve(import.meta.dir, 'fixtures/network-policy.ts'))});
        const urls = [];
        setFetchFixture((url, init) => {
          assert.equal(url.origin, 'https://www.behance.net');
          assert.equal(init.method, undefined);
          urls.push(url.href);
          return Promise.resolve(Response.json({ projects: [] }));
        });
        const { projects, project } = await import(${JSON.stringify(resolve(import.meta.dir, '../src/apis/behance.ts'))});
        await projects(null, undefined);
        await project(42);
        assert.deepEqual(urls, ${JSON.stringify(
          token === undefined
            ? [
                'https://www.behance.net/v2/projects?sort=',
                'https://www.behance.net/v2/projects/42',
              ]
            : [
                'https://www.behance.net/v2/projects?sort=&api_key=key+:$,[]~%26%2B%3D%E9%9B%AA',
                'https://www.behance.net/v2/projects/42?api_key=key+:$,[]~%26%2B%3D%E9%9B%AA',
              ]
        )});
      `,
      ],
      { env: token === undefined ? {} : { BEHANCE_TOKEN: token } }
    );
    expect(child.stderr.toString()).toBe('');
    expect(child.exitCode).toBe(0);
  }
});

test('Dribbble preserves endpoint and deadline', async () => {
  respond = async () => Response.json({ top: [] });
  expect(await dribbbleTop()).toEqual({ top: [] });
  expect(calls[0].url).toBe('https://dribbble-top.dsgnr.news/top');
  expect(deadlines).toEqual([15000]);
});

test('Telegram preserves every JSON body, headers, defaults, overrides and media deadlines', async () => {
  const markup = {
    inline_keyboard: [[{ text: 'open', url: 'https://example.invalid' }]],
  };
  await sendMessage('chat', 'hello');
  await sendMessage('chat', 'override', markup, 'Markdown', false);
  await sendPhoto('chat', 'photo');
  await sendVideo('chat', 'video', 'caption', markup, 'Markdown', false);
  await sendMediaGroup(
    'chat',
    ['one', 'two'],
    'caption',
    markup,
    'Markdown',
    false
  );
  expect(deadlines).toEqual([10000, 10000, 30000, 30000, 30000]);
  expect(calls.map(({ url }) => url.split('/').at(-1))).toEqual([
    'sendMessage',
    'sendMessage',
    'sendPhoto',
    'sendVideo',
    'sendMediaGroup',
  ]);
  for (const { init } of calls) {
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.redirect).toBeUndefined();
  }
  expect(calls.map(({ init }) => JSON.parse(init.body as string))).toEqual([
    {
      chat_id: 'chat',
      text: 'hello',
      parse_mode: 'HTML',
      disable_notification: true,
    },
    {
      chat_id: 'chat',
      text: 'override',
      parse_mode: 'Markdown',
      disable_notification: false,
      reply_markup: markup,
    },
    {
      chat_id: 'chat',
      photo: 'photo',
      caption: '',
      parse_mode: 'HTML',
      disable_notification: true,
    },
    {
      chat_id: 'chat',
      video: 'video',
      caption: 'caption',
      parse_mode: 'Markdown',
      disable_notification: false,
      reply_markup: markup,
    },
    {
      chat_id: 'chat',
      media: ['one', 'two'].map((media) => ({
        type: 'photo',
        media,
        caption: 'caption',
        parse_mode: 'Markdown',
      })),
      disable_notification: false,
      reply_markup: markup,
    },
  ]);
});

const adapters = [
  { name: 'Behance', invoke: () => projects(), logs: false },
  { name: 'Dribbble', invoke: () => dribbbleTop(), logs: false },
  {
    name: 'Telegram',
    invoke: () => sendMessage('chat', 'synthetic'),
    logs: true,
  },
];
for (const adapter of adapters) {
  test(`${adapter.name} accepts only 200, preserves JSON values and rejects failed bodies`, async () => {
    const log = spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const status of [201, 204, 206, 301, 302, 400, 429, 500]) {
        log.mockClear();
        respond = async () => new Response(null, { status });
        expect(await adapter.invoke()).toBeNull();
        expect(log.mock.calls).toEqual(
          adapter.logs && status >= 300 ? [['Telegram request failed']] : []
        );
      }
      for (const value of [{ ok: false }, [], false, null, 0, 'synthetic']) {
        respond = async () => Response.json(value);
        expect(await adapter.invoke()).toEqual(value);
      }
      for (const body of ['', 'not JSON', '{']) {
        respond = async () => new Response(body);
        expect(await adapter.invoke()).toBeNull();
      }
      for (const failure of [
        () => {
          throw Error('offline-test-token');
        },
        () => Promise.reject(Error('offline-test-token')),
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(Error('offline-test-token'));
              },
            })
          ),
      ]) {
        log.mockClear();
        respond = failure;
        expect(await adapter.invoke()).toBeNull();
        expect(log.mock.calls).toEqual(
          adapter.logs ? [['Telegram request failed']] : []
        );
      }
    } finally {
      log.mockRestore();
    }
  });
  for (const phase of ['request', 'body']) {
    test(`${adapter.name} timeout aborts during ${phase}`, async () => {
      timeoutSpy.mockImplementation((ms: number) => {
        deadlines.push(ms);
        return nativeTimeout(5);
      });
      const log = spyOn(console, 'error').mockImplementation(() => {});
      try {
        respond = (init) => {
          const signal = init.signal!;
          if (phase === 'request')
            return new Promise((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(signal.reason), {
                once: true,
              });
            });
          return Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  signal.addEventListener(
                    'abort',
                    () => controller.error(signal.reason),
                    { once: true }
                  );
                },
              })
            )
          );
        };
        expect(await adapter.invoke()).toBeNull();
        expect(calls[0].init.signal?.aborted).toBe(true);
        expect(log.mock.calls).toEqual(
          adapter.logs ? [['Telegram request failed']] : []
        );
      } finally {
        log.mockRestore();
      }
    });
  }
}
