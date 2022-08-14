import axios from 'axios';

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

async function call(method: string, query: BehanceQuery = {}): Promise<any> {
  query.api_key = TOKEN;
  try {
    const result = await axios.get(`${BASE_URL}${method}`, {
      timeout: 10000,
      params: query,
    });
    if (result.status === 200) return result.data;
  } catch (error) {}
  return null;
}

export async function projects(
  time = 'all',
  sort = ''
): Promise<{ projects: BehanceProject[] } | null> {
  return await call('projects', { time, sort });
}
