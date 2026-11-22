const BASE_URL = 'https://dribbble-top.dsgnr.news/';
const MAX_FEED_BYTES = 1024 * 1024;

export type DribbbleShot = {
  id: number;
  img?: string;
  video?: string;
  url: string;
  likes: number;
  title: string;
  author: {
    name: string;
    url: string;
  };
};

export async function dribbbleTop(
  timeoutMs = 15000
): Promise<{ top: DribbbleShot[] } | null> {
  try {
    const result = await fetch(`${BASE_URL}top`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (result.status !== 200 || !result.body) return null;

    const reader = result.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_FEED_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    // Includes timeout while fetching headers or consuming the response body.
  }
  return null;
}
