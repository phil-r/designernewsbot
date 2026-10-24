const BASE_URL = 'https://www.behance.net/v2/';
const TOKEN = process.env.BEHANCE_TOKEN;

type BehanceQuery = {
  api_key?: string;
  time?: string;
  sort?: string;
};

export type BehanceProject = {
  id: number;
  name: string;
  url: string;
  stats: {
    views: number;
    appreciations: number;
    comments: number;
  };
  covers: {
    original: string;
  };
};

// Match the existing scalar query encoding, including spaces and reserved characters.
const encodeQuery = (value: string) =>
  encodeURIComponent(value)
    .replace(/%3A/gi, ':')
    .replace(/%24/g, '$')
    .replace(/%2C/gi, ',')
    .replace(/%20/g, '+')
    .replace(/%5B/gi, '[')
    .replace(/%5D/gi, ']');

async function call(method: string, query: BehanceQuery = {}): Promise<any> {
  query.api_key = TOKEN;
  try {
    const params = Object.entries(query)
      .filter(([, value]) => value != null)
      .map(([key, value]) => `${encodeQuery(key)}=${encodeQuery(value!)}`)
      .join('&');
    const result = await fetch(
      `${BASE_URL}${method}${params ? `?${params}` : ''}`,
      {
        signal: AbortSignal.timeout(10000),
      }
    );
    if (result.status === 200) return await result.json();
  } catch (error) {}
  return null;
}

export async function projects(
  time = 'all',
  sort = ''
): Promise<{ projects: BehanceProject[] } | null> {
  return await call('projects', { time, sort });
}

export async function project(
  id: any
): Promise<{ project: BehanceProject } | null> {
  return await call(`projects/${id}`);
}
