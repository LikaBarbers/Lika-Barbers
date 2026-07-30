import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const SITE_KEY = 'site';
const ADMIN_KEY = 'admin';
const SECRET_KEY = 'session-secret';

const contentStore = getStore({ name: 'lika-content', consistency: 'strong' });
const privateStore = getStore({ name: 'lika-private', consistency: 'strong' });
const mediaStore = getStore({ name: 'lika-media', consistency: 'strong' });

const DEFAULT_SITE = {
  schedule: {
    monday: { open: '10:00', close: '21:00', closed: false },
    tuesday: { open: '10:00', close: '21:00', closed: false },
    wednesday: { open: '10:00', close: '21:00', closed: false },
    thursday: { open: '10:00', close: '21:00', closed: false },
    friday: { open: '10:00', close: '21:00', closed: false },
    saturday: { open: '10:00', close: '21:00', closed: false },
    sunday: { open: '10:00', close: '21:00', closed: true }
  },
  gallery: [
    {
      id: 'gallery-1',
      image: '/images/gallery-1.webp',
      altSq: 'Prerje moderne flokësh te Lika Barbershop në Tiranë',
      altEn: 'Modern haircut at Lika Barbershop in Tirana',
      captionSq: 'Prerje moderne me përfundim të pastër',
      captionEn: 'Modern haircut with a clean finish'
    },
    {
      id: 'gallery-2',
      image: '/images/gallery-2.webp',
      altSq: 'Stilim profesional mjekre te Lika Barbershop',
      altEn: 'Professional beard styling at Lika Barbershop',
      captionSq: 'Konture precize dhe stilim profesional i mjekrës',
      captionEn: 'Sharp lines and professional beard styling'
    },
    {
      id: 'gallery-3',
      image: '/images/gallery-3.webp',
      altSq: 'Shërbim kujdesi për meshkuj në Lika Barbershop Tiranë',
      altEn: "Men's grooming service at Lika Barbershop Tirana",
      captionSq: 'Kujdes i plotë për një pamje të freskët',
      captionEn: 'Complete grooming for a fresh look'
    }
  ],
  promotions: [
    {
      id: 'welcome-offer',
      titleSq: 'Rezervo stilin tënd të radhës',
      titleEn: 'Book your next fresh look',
      descriptionSq: 'Zgjidh orarin online dhe eja pa pritje të panevojshme.',
      descriptionEn: 'Choose your appointment online and avoid unnecessary waiting.',
      link: 'https://likabarbershop.setmore.com',
      image: '/images/gallery-2.webp',
      active: true
    }
  ]
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function json(status, value, extraHeaders = {}) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });
}

function errorResponse(error) {
  console.error(error);
  return json(error.status || 500, { error: error.publicMessage || error.message || 'Ndodhi një gabim në server.' });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  return error;
}

function routePath(request) {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith('/api/')) return pathname.slice('/api'.length);
  const marker = '/.netlify/functions/api';
  if (pathname.startsWith(marker)) {
    const rest = pathname.slice(marker.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return pathname;
}

async function readJsonBody(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) throw httpError(413, 'Kërkesa është shumë e madhe.');
  try {
    return await request.json();
  } catch {
    throw httpError(400, 'Të dhënat JSON nuk janë të vlefshme.');
  }
}

function cleanText(value, max = 180) {
  return String(value || '').trim().slice(0, max);
}

function validLink(value) {
  const link = cleanText(value, 500);
  if (!link) return '';
  try {
    const url = new URL(link);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

async function getSiteData() {
  const saved = await contentStore.get(SITE_KEY, { type: 'json', consistency: 'strong' });
  if (saved) return saved;
  const initial = clone(DEFAULT_SITE);
  await contentStore.setJSON(SITE_KEY, initial, { onlyIfNew: true });
  return initial;
}

async function saveSiteData(data) {
  await contentStore.setJSON(SITE_KEY, data);
}

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index < 0) return cookies;
    const key = decodeURIComponent(part.slice(0, index).trim());
    const value = decodeURIComponent(part.slice(index + 1).trim());
    cookies[key] = value;
    return cookies;
  }, {});
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

function verifyPassword(password, credentials) {
  try {
    const expected = Buffer.from(credentials.hash, 'hex');
    const actual = Buffer.from(hashPassword(password, credentials.salt).hash, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

async function getSessionSecret() {
  let secret = await privateStore.get(SECRET_KEY, { consistency: 'strong' });
  if (secret) return secret;
  const generated = crypto.randomBytes(48).toString('base64url');
  const result = await privateStore.set(SECRET_KEY, generated, { onlyIfNew: true });
  if (result.modified) return generated;
  secret = await privateStore.get(SECRET_KEY, { consistency: 'strong' });
  if (!secret) throw httpError(500, 'Sekreti i sesionit nuk mund të krijohej.');
  return secret;
}

function createSessionToken(secret) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySessionToken(token, secret) {
  if (!token || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const left = Buffer.from(signature || '');
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

async function isAuthenticated(request) {
  const token = parseCookies(request.headers.get('cookie') || '').lika_admin_session;
  if (!token) return false;
  const secret = await getSessionSecret();
  return verifySessionToken(token, secret);
}

function sessionCookie(request, token, maxAgeSeconds) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `lika_admin_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Strict${secure}`;
}

async function requireAuth(request) {
  if (!(await isAuthenticated(request))) throw httpError(401, 'Duhet të identifikoheni.');
}

function validateImage(image) {
  if (!image || !image.data || !image.type) throw httpError(400, 'Zgjidhni një foto.');
  const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
  const extension = extensions[image.type];
  if (!extension) throw httpError(400, 'Lejohen vetëm JPG, PNG dhe WEBP.');
  const base64 = String(image.data).replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw httpError(400, 'Skedari i fotos nuk është i vlefshëm.');
  const valid =
    (image.type === 'image/jpeg' && buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
    (image.type === 'image/png' && buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
    (image.type === 'image/webp' && buffer.length > 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP');
  if (!valid) throw httpError(400, 'Skedari i fotos nuk është i vlefshëm.');
  if (buffer.length > MAX_IMAGE_BYTES) throw httpError(413, 'Fotoja është shumë e madhe. Maksimumi është 4 MB.');
  return { buffer, extension, contentType: image.type };
}

async function saveImage(image) {
  const { buffer, extension, contentType } = validateImage(image);
  const filename = `${Date.now()}-${crypto.randomBytes(10).toString('hex')}${extension}`;
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  await mediaStore.set(filename, arrayBuffer, { metadata: { contentType } });
  return `/media/${filename}`;
}

async function removeImage(imagePath) {
  if (!String(imagePath || '').startsWith('/media/')) return;
  const filename = String(imagePath).slice('/media/'.length);
  if (/^[a-zA-Z0-9._-]+$/.test(filename)) await mediaStore.delete(filename);
}

async function handle(request) {
  const method = request.method.toUpperCase();
  const path = routePath(request);

  if (method === 'OPTIONS') return new Response(null, { status: 204 });

  if (method === 'GET' && path === '/site') {
    return json(200, await getSiteData());
  }

  if (method === 'GET' && path === '/admin/status') {
    const credentials = await privateStore.get(ADMIN_KEY, { type: 'json', consistency: 'strong' });
    return json(200, {
      needsSetup: !credentials,
      authenticated: await isAuthenticated(request)
    });
  }

  if (method === 'POST' && path === '/admin/setup') {
    const existing = await privateStore.get(ADMIN_KEY, { type: 'json', consistency: 'strong' });
    if (existing) throw httpError(409, 'Administratori është konfiguruar më parë.');
    const body = await readJsonBody(request);
    const password = String(body.password || '');
    if (password.length < 10) throw httpError(400, 'Fjalëkalimi duhet të ketë të paktën 10 karaktere.');
    const result = await privateStore.setJSON(ADMIN_KEY, hashPassword(password), { onlyIfNew: true });
    if (!result.modified) throw httpError(409, 'Administratori është konfiguruar më parë.');
    const secret = await getSessionSecret();
    const token = createSessionToken(secret);
    return json(201, { ok: true }, { 'Set-Cookie': sessionCookie(request, token, SESSION_TTL_MS / 1000) });
  }

  if (method === 'POST' && path === '/admin/login') {
    const body = await readJsonBody(request);
    const credentials = await privateStore.get(ADMIN_KEY, { type: 'json', consistency: 'strong' });
    if (!credentials) throw httpError(409, 'Krijoni fillimisht fjalëkalimin e administratorit.');
    if (!verifyPassword(String(body.password || ''), credentials)) throw httpError(401, 'Fjalëkalimi nuk është i saktë.');
    const secret = await getSessionSecret();
    const token = createSessionToken(secret);
    return json(200, { ok: true }, { 'Set-Cookie': sessionCookie(request, token, SESSION_TTL_MS / 1000) });
  }

  if (method === 'POST' && path === '/admin/logout') {
    return json(200, { ok: true }, { 'Set-Cookie': sessionCookie(request, '', 0) });
  }

  if (!path.startsWith('/admin/')) throw httpError(404, 'API endpoint nuk u gjet.');
  await requireAuth(request);

  if (method === 'PUT' && path === '/admin/schedule') {
    const body = await readJsonBody(request);
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    const schedule = {};
    for (const day of days) {
      const source = body[day] || {};
      const closed = Boolean(source.closed);
      const open = cleanText(source.open, 5);
      const close = cleanText(source.close, 5);
      if (!closed && (!timePattern.test(open) || !timePattern.test(close))) throw httpError(400, `Orari për ${day} nuk është i vlefshëm.`);
      schedule[day] = { open: open || '10:00', close: close || '21:00', closed };
    }
    const data = await getSiteData();
    data.schedule = schedule;
    await saveSiteData(data);
    return json(200, { ok: true, schedule });
  }

  if (method === 'POST' && path === '/admin/gallery') {
    const body = await readJsonBody(request);
    const imagePath = await saveImage(body.image);
    const item = {
      id: crypto.randomUUID(),
      image: imagePath,
      altSq: cleanText(body.altSq || body.captionSq || 'Foto nga Lika Barbershop në Tiranë'),
      altEn: cleanText(body.altEn || body.captionEn || 'Photo from Lika Barbershop in Tirana'),
      captionSq: cleanText(body.captionSq, 120),
      captionEn: cleanText(body.captionEn, 120)
    };
    const data = await getSiteData();
    data.gallery = [item, ...(data.gallery || [])];
    await saveSiteData(data);
    return json(201, item);
  }

  if (method === 'POST' && path === '/admin/promotions') {
    const body = await readJsonBody(request);
    const titleSq = cleanText(body.titleSq, 90);
    const titleEn = cleanText(body.titleEn, 90);
    if (!titleSq || !titleEn) throw httpError(400, 'Titulli në të dyja gjuhët është i detyrueshëm.');
    const imagePath = await saveImage(body.image);
    const promotion = {
      id: crypto.randomUUID(),
      titleSq,
      titleEn,
      descriptionSq: cleanText(body.descriptionSq, 240),
      descriptionEn: cleanText(body.descriptionEn, 240),
      link: validLink(body.link),
      image: imagePath,
      active: true
    };
    const data = await getSiteData();
    data.promotions = [promotion, ...(data.promotions || [])];
    await saveSiteData(data);
    return json(201, promotion);
  }

  const galleryDelete = path.match(/^\/admin\/gallery\/([^/]+)$/);
  if (method === 'DELETE' && galleryDelete) {
    const id = decodeURIComponent(galleryDelete[1]);
    const data = await getSiteData();
    const item = (data.gallery || []).find(entry => entry.id === id);
    if (!item) throw httpError(404, 'Fotoja nuk u gjet.');
    data.gallery = data.gallery.filter(entry => entry.id !== id);
    await saveSiteData(data);
    await removeImage(item.image);
    return json(200, { ok: true });
  }

  const promotionRoute = path.match(/^\/admin\/promotions\/([^/]+)$/);
  if (promotionRoute && method === 'PATCH') {
    const id = decodeURIComponent(promotionRoute[1]);
    const body = await readJsonBody(request);
    const data = await getSiteData();
    const item = (data.promotions || []).find(entry => entry.id === id);
    if (!item) throw httpError(404, 'Reklama nuk u gjet.');
    item.active = Boolean(body.active);
    await saveSiteData(data);
    return json(200, item);
  }

  if (promotionRoute && method === 'DELETE') {
    const id = decodeURIComponent(promotionRoute[1]);
    const data = await getSiteData();
    const item = (data.promotions || []).find(entry => entry.id === id);
    if (!item) throw httpError(404, 'Reklama nuk u gjet.');
    data.promotions = data.promotions.filter(entry => entry.id !== id);
    await saveSiteData(data);
    await removeImage(item.image);
    return json(200, { ok: true });
  }

  throw httpError(404, 'API endpoint nuk u gjet.');
}

export default async (request) => {
  try {
    return await handle(request);
  } catch (error) {
    return errorResponse(error);
  }
};
