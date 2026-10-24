import { mock } from 'bun:test';
import './offline';
import { setFetchFixture } from './fixtures/network-policy';

export const trace: string[] = [];
const table = (name: string) => ({
  findUnique: mock(async (_query: any): Promise<any> => null),
  create: mock(async ({ data }: any) => {
    trace.push(`insert:${name}`);
    return data;
  }),
  upsert: mock(async (query: any) => query.create),
});
export const db = {
  designerNewsStory: table('dn'),
  behanceProject: table('behance'),
  dribbbleShot: table('dribbble'),
};
mock.module('../src/persistence', () => ({
  default: db,
  getDatabase: () => {},
  closeDatabase: () => {},
}));

export const outbound = {
  result: { ok: true, result: { message_id: 123 } } as any,
  feeds: { top: [], projects: [], stories: [] } as any,
  getError: null as Error | null,
  postError: null as Error | null,
  posts: [] as { url: string; data: any; options: any }[],
};
function installOutboundFixture() {
  setFetchFixture((url, options) => {
    if (
      (!options?.method || options.method === 'GET') &&
      ((url.origin === 'https://dribbble-top.dsgnr.news' &&
        url.pathname === '/top') ||
        (url.origin === 'https://www.behance.net' &&
          /^\/v2\/projects(?:\/[^/]+)?$/.test(url.pathname)))
    ) {
      trace.push(
        url.hostname === 'www.behance.net' ? 'feed:behance' : 'feed:dribbble'
      );
      return (async () => {
        if (outbound.getError) throw outbound.getError;
        return Response.json(outbound.feeds);
      })();
    }
    if (
      options?.method === 'POST' &&
      url.origin === 'https://api.telegram.org' &&
      /^\/botoffline-test-token\/send(?:Message|Photo|Video|MediaGroup)$/.test(
        url.pathname
      )
    ) {
      trace.push('send');
      outbound.posts.push({
        url: url.href,
        data: JSON.parse(options.body as string),
        options,
      });
      return (async () => {
        if (outbound.postError) throw outbound.postError;
        return Response.json(outbound.result);
      })();
    }
    return undefined;
  });
}
installOutboundFixture();

export function resetDoubles() {
  installOutboundFixture();
  trace.length = 0;
  outbound.posts.length = 0;
  outbound.getError = null;
  outbound.postError = null;
  outbound.result = { ok: true, result: { message_id: 123 } };
  outbound.feeds = { top: [], projects: [], stories: [] };
  for (const [name, t] of Object.entries(db)) {
    t.findUnique.mockReset();
    t.findUnique.mockImplementation(async () => null);
    t.create.mockReset();
    t.create.mockImplementation(async ({ data }: any) => {
      trace.push(`insert:${name}`);
      return data;
    });
    t.upsert.mockClear();
  }
}
