'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DATA_DIR = path.join(ROOT, 'data');
const SITE_FILE = path.join(DATA_DIR, 'site.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
const SESSION_TTL = 8 * 60 * 60 * 1000;
const MAX_JSON_BODY = 10 * 1024 * 1024;
const MAX_IMAGE_SIZE = 6 * 1024 * 1024;

for (const directory of [UPLOAD_DIR, DATA_DIR]) fs.mkdirSync(directory, { recursive: true });

const sessions = new Map();
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};
const imageExtensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') console.error(`Could not read ${file}:`, error.message);
    return fallback;
  }
}

function writeJson(file, value) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temporary, file);
}

function getSiteData() {
  return readJson(SITE_FILE, { schedule: {}, gallery: [], promotions: [] });
}

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, item) => {
    const index = item.indexOf('=');
    if (index < 0) return cookies;
    cookies[decodeURIComponent(item.slice(0, index).trim())] = decodeURIComponent(item.slice(index + 1).trim());
    return cookies;
  }, {});
}

function getSession(req) {
  const token = parseCookies(req.headers.cookie).lika_admin_session;
  if (!token) return null;
  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return token;
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `lika_admin_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_TTL / 1000}; SameSite=Strict${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `lika_admin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${secure}`);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

function verifyPassword(password, credentials) {
  const expected = Buffer.from(credentials.hash, 'hex');
  const actual = Buffer.from(hashPassword(password, credentials.salt).hash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
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
  } catch { return ''; }
}

function sendJson(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  res.end(body);
}

function sendText(res, status, value, type = 'text/plain; charset=utf-8') {
  const body = Buffer.from(value);
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, maxBytes = MAX_JSON_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error('Kërkesa është shumë e madhe.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Të dhënat JSON nuk janë të vlefshme.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function isValidImage(buffer, mime) {
  if (mime === 'image/jpeg') return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png') return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (mime === 'image/webp') return buffer.length > 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  return false;
}

function saveImage(image) {
  if (!image || !image.data || !image.type) throw Object.assign(new Error('Zgjidhni një foto.'), { status: 400 });
  const extension = imageExtensions[image.type];
  if (!extension) throw Object.assign(new Error('Lejohen vetëm JPG, PNG dhe WEBP.'), { status: 400 });
  const base64 = String(image.data).replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || !isValidImage(buffer, image.type)) throw Object.assign(new Error('Skedari i fotos nuk është i vlefshëm.'), { status: 400 });
  if (buffer.length > MAX_IMAGE_SIZE) throw Object.assign(new Error('Fotoja është shumë e madhe. Maksimumi është 6 MB.'), { status: 413 });
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

function removeUploadedFile(imagePath) {
  if (!imagePath || !imagePath.startsWith('/uploads/')) return;
  const filename = path.basename(imagePath);
  const absolute = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
}

function requireAuth(req, res) {
  if (getSession(req)) return true;
  sendJson(res, 401, { error: 'Duhet të identifikoheni.' });
  return false;
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/site') return sendJson(res, 200, getSiteData());

  if (req.method === 'GET' && pathname === '/api/admin/status') {
    return sendJson(res, 200, { needsSetup: !fs.existsSync(ADMIN_FILE), authenticated: Boolean(getSession(req)) });
  }

  if (req.method === 'POST' && pathname === '/api/admin/setup') {
    if (fs.existsSync(ADMIN_FILE)) return sendJson(res, 409, { error: 'Administratori është konfiguruar më parë.' });
    const body = await readBody(req, 50 * 1024);
    const password = String(body.password || '');
    if (password.length < 10) return sendJson(res, 400, { error: 'Fjalëkalimi duhet të ketë të paktën 10 karaktere.' });
    writeJson(ADMIN_FILE, hashPassword(password));
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL);
    setSessionCookie(res, token);
    return sendJson(res, 201, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/admin/login') {
    const body = await readBody(req, 50 * 1024);
    const credentials = readJson(ADMIN_FILE, null);
    if (!credentials) return sendJson(res, 409, { error: 'Krijoni fillimisht fjalëkalimin e administratorit.' });
    if (!verifyPassword(String(body.password || ''), credentials)) return sendJson(res, 401, { error: 'Fjalëkalimi nuk është i saktë.' });
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL);
    setSessionCookie(res, token);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/admin/logout') {
    if (!requireAuth(req, res)) return;
    const token = getSession(req);
    if (token) sessions.delete(token);
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  if (!pathname.startsWith('/api/admin/')) return sendJson(res, 404, { error: 'API endpoint nuk u gjet.' });
  if (!requireAuth(req, res)) return;

  if (req.method === 'PUT' && pathname === '/api/admin/schedule') {
    const body = await readBody(req, 100 * 1024);
    const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    const schedule = {};
    for (const day of days) {
      const source = body[day] || {};
      const closed = Boolean(source.closed);
      const open = cleanText(source.open, 5);
      const close = cleanText(source.close, 5);
      if (!closed && (!timePattern.test(open) || !timePattern.test(close))) return sendJson(res, 400, { error: `Orari për ${day} nuk është i vlefshëm.` });
      schedule[day] = { open: open || '10:00', close: close || '21:00', closed };
    }
    const data = getSiteData();
    data.schedule = schedule;
    writeJson(SITE_FILE, data);
    return sendJson(res, 200, { ok: true, schedule });
  }

  if (req.method === 'POST' && pathname === '/api/admin/gallery') {
    const body = await readBody(req);
    const imagePath = saveImage(body.image);
    const item = {
      id: crypto.randomUUID(), image: imagePath,
      altSq: cleanText(body.altSq || body.captionSq || 'Foto nga Lika Barbershop në Tiranë'),
      altEn: cleanText(body.altEn || body.captionEn || 'Photo from Lika Barbershop in Tirana'),
      captionSq: cleanText(body.captionSq, 120), captionEn: cleanText(body.captionEn, 120)
    };
    const data = getSiteData();
    data.gallery = [item, ...(data.gallery || [])];
    writeJson(SITE_FILE, data);
    return sendJson(res, 201, item);
  }

  if (req.method === 'POST' && pathname === '/api/admin/promotions') {
    const body = await readBody(req);
    const titleSq = cleanText(body.titleSq, 90);
    const titleEn = cleanText(body.titleEn, 90);
    if (!titleSq || !titleEn) return sendJson(res, 400, { error: 'Titulli në të dyja gjuhët është i detyrueshëm.' });
    const imagePath = saveImage(body.image);
    const promotion = {
      id: crypto.randomUUID(), titleSq, titleEn,
      descriptionSq: cleanText(body.descriptionSq, 240), descriptionEn: cleanText(body.descriptionEn, 240),
      link: validLink(body.link), image: imagePath, active: true
    };
    const data = getSiteData();
    data.promotions = [promotion, ...(data.promotions || [])];
    writeJson(SITE_FILE, data);
    return sendJson(res, 201, promotion);
  }

  const galleryDelete = pathname.match(/^\/api\/admin\/gallery\/([^/]+)$/);
  if (req.method === 'DELETE' && galleryDelete) {
    const id = decodeURIComponent(galleryDelete[1]);
    const data = getSiteData();
    const item = (data.gallery || []).find(entry => entry.id === id);
    if (!item) return sendJson(res, 404, { error: 'Fotoja nuk u gjet.' });
    data.gallery = data.gallery.filter(entry => entry.id !== id);
    writeJson(SITE_FILE, data);
    removeUploadedFile(item.image);
    return sendJson(res, 200, { ok: true });
  }

  const promotionRoute = pathname.match(/^\/api\/admin\/promotions\/([^/]+)$/);
  if (promotionRoute && req.method === 'PATCH') {
    const id = decodeURIComponent(promotionRoute[1]);
    const body = await readBody(req, 50 * 1024);
    const data = getSiteData();
    const item = (data.promotions || []).find(entry => entry.id === id);
    if (!item) return sendJson(res, 404, { error: 'Reklama nuk u gjet.' });
    item.active = Boolean(body.active);
    writeJson(SITE_FILE, data);
    return sendJson(res, 200, item);
  }

  if (promotionRoute && req.method === 'DELETE') {
    const id = decodeURIComponent(promotionRoute[1]);
    const data = getSiteData();
    const item = (data.promotions || []).find(entry => entry.id === id);
    if (!item) return sendJson(res, 404, { error: 'Reklama nuk u gjet.' });
    data.promotions = data.promotions.filter(entry => entry.id !== id);
    writeJson(SITE_FILE, data);
    removeUploadedFile(item.image);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'API endpoint nuk u gjet.' });
}

function serveStatic(req, res, pathname) {
  let base = PUBLIC_DIR;
  let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (pathname.startsWith('/uploads/')) {
    base = UPLOAD_DIR;
    relative = pathname.slice('/uploads/'.length);
  }
  if (!path.extname(relative) && base === PUBLIC_DIR) relative += '.html';
  let decoded;
  try { decoded = decodeURIComponent(relative); }
  catch { return sendText(res, 400, 'Bad request'); }
  const absolute = path.resolve(base, decoded);
  if (absolute !== base && !absolute.startsWith(`${base}${path.sep}`)) return sendText(res, 403, 'Forbidden');

  fs.stat(absolute, (error, stat) => {
    if (error || !stat.isFile()) {
      const notFound = '<!doctype html><html lang="sq"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>404</title><body style="font-family:system-ui;background:#09090a;color:#fff;padding:3rem"><h1>Faqja nuk u gjet</h1><p><a style="color:#d5ac61" href="/">Kthehu në kryefaqe</a></p></body></html>';
      return sendText(res, 404, notFound, 'text/html; charset=utf-8');
    }
    const extension = path.extname(absolute).toLowerCase();
    const headers = {
      'Content-Type': contentTypes[extension] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ['.jpg','.jpeg','.png','.webp','.svg'].includes(extension) ? 'public, max-age=604800' : 'no-cache'
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(absolute).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  let pathname;
  try { pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname; }
  catch { return sendText(res, 400, 'Bad request'); }

  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (!['GET', 'HEAD'].includes(req.method)) return sendText(res, 405, 'Method not allowed');
    return serveStatic(req, res, pathname);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.message || 'Ndodhi një gabim në server.' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Lika Barbers is running at http://localhost:${PORT}`);
  if (!fs.existsSync(ADMIN_FILE)) console.log('Open /admin.html to create the first admin password.');
});
