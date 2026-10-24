import { getBehanceProjectUrl } from './services/behance';
import { getDNStoryCommentsUrl, getDNStoryUrl } from './services/dn';
import { getDribbleShotUrl } from './services/dribbble';
import { decode } from './shortener';

const unavailable = '<h1>Service Unavailable</h1><p>Try again later</p>';
const assets = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/robots.txt', 'robots.txt'],
]);

function text(body: string, status = 200, headers?: Record<string, string>) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers },
  });
}

async function staticResponse(request: Request, name: string) {
  // Only fixed allowlisted filenames reach here; never resolve user input on disk.
  const file = Bun.file(new URL(`../static/${name}`, import.meta.url));
  if (!(await file.exists())) return text('Not Found', 404);
  const bytes = await file.arrayBuffer();
  const size = bytes.byteLength;
  const modified = new Date(file.lastModified).toUTCString();
  const etag = `"${Bun.hash(new Uint8Array(bytes)).toString(16)}"`;
  const headers = new Headers({
    'Content-Type': name.endsWith('.txt')
      ? 'text/plain; charset=utf-8'
      : 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=0',
    'Accept-Ranges': 'bytes',
    ETag: etag,
    'Last-Modified': modified,
  });
  const noneMatch = request.headers.get('if-none-match');
  const since = request.headers.get('if-modified-since');
  if (
    noneMatch !== null
      ? noneMatch
          .split(',')
          .some((tag) => ['*', etag].includes(tag.trim().replace(/^W\//, '')))
      : since !== null && Date.parse(since) >= Date.parse(modified)
  ) {
    return new Response(null, { status: 304, headers });
  }

  // Single byte ranges cover these small assets. Multi-range/malformed requests
  // are intentionally served in full, rather than implementing multipart output.
  const range = request.headers.get('range');
  const ifRange = request.headers.get('if-range');
  const useRange =
    !ifRange || ifRange === etag || Date.parse(ifRange) >= Date.parse(modified);
  const match = useRange && range?.match(/^bytes=(\d*)-(\d*)$/);
  if (match && (match[1] || match[2])) {
    const start = match[1]
      ? Number(match[1])
      : Math.max(0, size - Number(match[2]));
    const end =
      match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (start >= size || end < start || (!match[1] && Number(match[2]) === 0)) {
      headers.set('Content-Range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(bytes.slice(start, end + 1), { status: 206, headers });
  }
  headers.set('Content-Length', String(size));
  return new Response(bytes, { headers });
}

async function route(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (/^\/status\/?$/i.test(path)) return text('ok');
  if (!['GET', 'HEAD'].includes(request.method)) return text('Not Found', 404);
  const asset = assets.get(path);
  if (asset) return staticResponse(request, asset);
  if (/^\/yo\/?$/i.test(path)) return text('yo');
  const match = path.match(/^\/([sbcd])\/([^/]+)\/?$/i);
  if (!match) return text('Not Found', 404);
  let shortId: string;
  try {
    shortId = decodeURIComponent(match[2]);
  } catch {
    return text('Malformed request', 400);
  }
  const id = decode(shortId);
  if (!Number.isFinite(id)) return text('Malformed request', 400);
  const prefix = match[1].toLowerCase();
  const target =
    prefix === 'c'
      ? getDNStoryCommentsUrl(id)
      : await (
          prefix === 's'
            ? getDNStoryUrl
            : prefix === 'b'
              ? getBehanceProjectUrl
              : getDribbleShotUrl
        )(id);
  if (!target) return text(unavailable, 503, { 'Retry-After': '5' });
  // Encode only for HTTP transport (as the old redirect did), not with URL(),
  // which would normalize stored paths. Keep existing escapes and IPv6 brackets.
  const location = encodeURI(target)
    .replace(/%25([0-9a-f]{2})/gi, '%$1')
    .replace(/%5B/gi, '[')
    .replace(/%5D/gi, ']');
  return new Response(null, { status: 302, headers: { Location: location } });
}

export async function handleRequest(request: Request): Promise<Response> {
  let response: Response;
  try {
    response = await route(request);
  } catch {
    // Error objects/URLs can contain database paths, request queries or tokens.
    console.error('HTTP request failed');
    response = text('Internal Server Error', 500);
  }
  return request.method === 'HEAD'
    ? new Response(null, { status: response.status, headers: response.headers })
    : response;
}
