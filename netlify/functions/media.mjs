import { getStore } from '@netlify/blobs';

const mediaStore = getStore({ name: 'lika-media', consistency: 'strong' });

function getFilename(request) {
  const pathname = new URL(request.url).pathname;
  let value = '';
  if (pathname.startsWith('/media/')) value = pathname.slice('/media/'.length);
  else {
    const marker = '/.netlify/functions/media/';
    if (pathname.startsWith(marker)) value = pathname.slice(marker.length);
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

export default async (request) => {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
  const filename = getFilename(request);
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return new Response('Not found', { status: 404 });

  const entry = await mediaStore.getWithMetadata(filename, { type: 'arrayBuffer', consistency: 'strong' });
  if (!entry) return new Response('Not found', { status: 404 });

  const headers = {
    'Content-Type': entry.metadata?.contentType || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    ETag: entry.etag
  };
  if (request.headers.get('if-none-match') === entry.etag) return new Response(null, { status: 304, headers });
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
  return new Response(entry.data, { status: 200, headers });
};
