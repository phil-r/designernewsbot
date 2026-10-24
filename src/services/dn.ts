import cache from '../cache';
import db from '../persistence';

export async function getDNStoryUrl(id: number): Promise<string | null> {
  const cacheKey = `dn/${id}`;
  const cached = cache.get(cacheKey) as string;
  if (cached) return cached;

  const story = await db.designerNewsStory.findUnique({ where: { id } });
  if (story) {
    cache.set(cacheKey, story.url);
    return story.url;
  }
  return null;
}

export function getDNStoryCommentsUrl(id: number | string): string {
  return `https://www.designernews.co/stories/${id}`;
}
