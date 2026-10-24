const BASE_URL = 'https://dribbble-top.dsgnr.news/';

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
    const result = await fetch(`${BASE_URL}${method}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (result.status === 200) return await result.json();
  } catch (error) {}
  return null;
}

export async function dribbbleTop(): Promise<{ top: DribbbleShot[] } | null> {
  return await call('top');
}
