function webUrl(value: unknown): URL | null {
  if (
    typeof value !== 'string' ||
    !/^https?:\/\/[^/]/i.test(value) ||
    /[\s\u0000-\u001f\u007f\\]/.test(value)
  )
    return null;
  try {
    const url = new URL(value);
    return url.username || url.password ? null : url;
  } catch {
    return null;
  }
}

export function isGalleryLink(value: unknown): boolean {
  return webUrl(value) !== null;
}

// The gallery is served over HTTPS. Do not probe upstream URLs, and use the
// supplied still image rather than the video URL or a Telegram file identifier.
export function galleryImage(value: unknown): string | null {
  const url = webUrl(value);
  return url?.protocol === 'https:' &&
    !/\.(?:mp4|m4v|webm|mov|avi|m3u8)(?:$|\/)/i.test(url.pathname)
    ? (value as string)
    : null;
}
