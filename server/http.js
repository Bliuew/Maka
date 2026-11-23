// Minimal dependency-free HTTP layer: routing, JSON, errors, rate limiting,
// security headers and static files with Range support.
import fs from 'node:fs';
import path from 'node:path';

export class HttpError extends Error {
  constructor(status, code, message, extra) { super(message || code); this.status = status; this.code = code; this.extra = extra; }
}
export const fail = (status, code, message, extra) => { throw new HttpError(status, code, message, extra); };

export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, ...handlers) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handlers });
  }
  get(p, ...h) { this.add('GET', p, ...h); }
  post(p, ...h) { this.add('POST', p, ...h); }
  put(p, ...h) { this.add('PUT', p, ...h); }
  patch(p, ...h) { this.add('PATCH', p, ...h); }
  delete(p, ...h) { this.add('DELETE', p, ...h); }
  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}

export function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'payload_too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson(req) {
  if (req._json !== undefined) return req._json;
  const ct = req.headers['content-type'] || '';
  const buf = await readBody(req);
  if (!buf.length) return (req._json = {});
  if (!ct.includes('application/json')) fail(415, 'json_required');
  try { req._json = JSON.parse(buf.toString('utf8')); } catch { fail(400, 'invalid_json'); }
  if (typeof req._json !== 'object' || req._json === null || Array.isArray(req._json)) fail(400, 'invalid_json');
  return req._json;
}

export function send(res, status, body, headers = {}) {
  if (res.headersSent) return;
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(data);
}

export function securityHeaders(res) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('permissions-policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('content-security-policy',
    "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
}

// Token-bucket rate limiter (in-memory; production should back this with Redis
// so limits hold across instances).
export class RateLimiter {
  constructor() { this.buckets = new Map(); }
  take(key, capacity, refillPerMin) {
    const t = Date.now();
    let b = this.buckets.get(key);
    if (!b) { b = { tokens: capacity, at: t }; this.buckets.set(key, b); }
    b.tokens = Math.min(capacity, b.tokens + ((t - b.at) / 60000) * refillPerMin);
    b.at = t;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
  check(key, capacity, refillPerMin) {
    if (!this.take(key, capacity, refillPerMin)) fail(429, 'rate_limited', 'You are doing that too quickly. Please slow down.');
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.vtt': 'text/vtt', '.ico': 'image/x-icon' };

export function sendFile(req, res, file, { cache = 'no-cache' } = {}) {
  let stat;
  try { stat = fs.statSync(file); } catch { return send(res, 404, { error: 'not_found' }); }
  if (!stat.isFile()) return send(res, 404, { error: 'not_found' });
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;
  const base = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': cache };
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start = m && m[1] ? Number(m[1]) : NaN, end = m && m[2] ? Number(m[2]) : stat.size - 1;
    if (m && !m[1] && m[2]) { start = stat.size - Number(m[2]); end = stat.size - 1; }
    if (!m || isNaN(start) || start > end || end >= stat.size) {
      res.writeHead(416, { 'content-range': `bytes */${stat.size}` }); return res.end();
    }
    res.writeHead(206, { ...base, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...base, 'content-length': stat.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

export function clientIp(req) {
  // Behind a trusted host proxy (Render, Railway, etc.) the real client is the
  // first address in X-Forwarded-For. Only trusted when TRUST_PROXY=1.
  if (process.env.TRUST_PROXY === '1') {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xf) return xf;
  }
  return req.socket.remoteAddress || 'unknown';
}
