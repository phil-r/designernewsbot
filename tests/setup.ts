import { mock } from 'bun:test';
import './offline';

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
mock.module(import.meta.resolve('axios'), () => ({
  default: {
    get: mock(async (url: string, options: any) => {
      if (url.startsWith('https://dribbble-top.dsgnr.news/'))
        trace.push('feed:dribbble');
      else if (url.startsWith('https://www.behance.net/v2/'))
        trace.push('feed:behance');
      else if (url.startsWith('https://www.designernews.co/api/v2/'))
        trace.push('feed:dn');
      else throw new Error('Unexpected outbound GET');
      if (outbound.getError) throw outbound.getError;
      return { status: 200, data: outbound.feeds };
    }),
    post: mock(async (url: string, data: any, options: any) => {
      if (!url.startsWith('https://api.telegram.org/botoffline-test-token/'))
        throw new Error('Unexpected outbound POST');
      trace.push('send');
      outbound.posts.push({ url, data, options });
      if (outbound.postError) throw outbound.postError;
      return { status: 200, data: outbound.result };
    }),
  },
}));

export function resetDoubles() {
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
