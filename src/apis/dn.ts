import axios from 'axios';

const BASE_URL = "https://www.designernews.co/api/v2/"

export type DesignerNewsStory = {
  id: string;
  title: string;
  url: string;
  sponsored: boolean;
  vote_count: number;
  comment_count: number;
  comment: string;
}

async function call(method: string): Promise<any> {
  try {
    const result = await axios.get(`${BASE_URL}${method}`, { timeout: 10000 });
    if (result.status === 200) return result.data
  } catch (error) {
  }
  return null;
}

export async function stories(): Promise<{ stories: DesignerNewsStory[] } | null> {
  return await call('stories');
}

export async function story(id: string): Promise<DesignerNewsStory | null> {
  return await call(`stories/${id}`);
}
