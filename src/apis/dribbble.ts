import axios from 'axios';

const BASE_URL = 'https://dribbble-top.herokuapp.com/';

export type DribbbleShot = {
  id: number;
  img: string;
  video?: string;
  url: string;
  likes: number;
  title: string;
  author: {
    name: string;
    url: string;
  };
};

async function call(method: string): Promise<any> {
  try {
    const result = await axios.get(`${BASE_URL}${method}`, { timeout: 15000 });
    if (result.status === 200) return result.data;
  } catch (error) {}
  return null;
}

export async function dribbbleTop(): Promise<{ top: DribbbleShot[] } | null> {
  return await call('top');
}
