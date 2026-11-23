// API client: bearer auth, resumable chunked uploads, realtime events.
const TOKEN_KEY = 'maka_token';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } },
};
function deviceId() {
  let d = store.get('maka_device');
  if (!d) { d = crypto.randomUUID(); store.set('maka_device', d); }
  return d;
}

export class ApiError extends Error {
  constructor(status, body) { super(body?.message || body?.error || `HTTP ${status}`); this.status = status; this.code = body?.error; this.body = body; }
}

export const api = {
  get token() { return store.get(TOKEN_KEY); },
  set token(t) { store.set(TOKEN_KEY, t); },
  async req(method, path, body, opts = {}) {
    const headers = { 'x-device-id': deviceId(), ...(opts.headers || {}) };
    if (this.token) headers.authorization = 'Bearer ' + this.token;
    let payload = body;
    if (body !== undefined && !(body instanceof Blob)) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    let res;
    try { res = await fetch(path, { method, headers, body: payload, signal: opts.signal }); }
    catch (e) { throw new ApiError(0, { error: 'offline', message: 'You appear to be offline. Check your connection and try again.' }); }
    const text = await res.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const err = new ApiError(res.status, data);
      if (res.status === 401 && this.token && path !== '/api/auth/login') { this.token = null; window.dispatchEvent(new Event('maka:signedout')); }
      throw err;
    }
    return data;
  },
  get(p) { return this.req('GET', p); },
  post(p, b = {}) { return this.req('POST', p, b); },
  patch(p, b = {}) { return this.req('PATCH', p, b); },
  del(p, b) { return this.req('DELETE', p, b); },

  /** Resumable upload: survives dropped connections by resuming from the server offset. */
  async upload(file, kind, onProgress) {
    const start = await this.post('/api/uploads', { kind, size: file.size });
    const { uploadId, chunkSize } = start;
    let offset = 0, failures = 0;
    while (offset < file.size) {
      const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
      try {
        const r = await this.req('PUT', `/api/uploads/${uploadId}?offset=${offset}`, chunk, { headers: { 'content-type': 'application/octet-stream' } });
        offset = r.received; failures = 0;
        onProgress?.(offset / file.size);
      } catch (e) {
        if (e.code === 'offset_mismatch') { offset = e.body.received; continue; }
        if (++failures > 6) throw e;
        await new Promise((r) => setTimeout(r, 500 * 2 ** failures));
        const s = await this.get(`/api/uploads/${uploadId}`).catch(() => null);
        if (s) offset = s.received;
      }
    }
    await this.post(`/api/uploads/${uploadId}/complete`);
    return uploadId;
  },
  async waitForMedia(uploadId, timeoutMs = 10 * 60000) {
    const t0 = Date.now();
    for (;;) {
      const s = await this.get(`/api/uploads/${uploadId}`);
      if (s.status === 'ready' || s.status === 'rejected') return s;
      if (Date.now() - t0 > timeoutMs) return s;
      await new Promise((r) => setTimeout(r, 800));
    }
  },

  /** Realtime events with automatic reconnect. */
  connectEvents(handlers) {
    let es = null, closed = false, delay = 1000;
    const open = async () => {
      if (closed || !this.token) return;
      try {
        const { ticket } = await this.post('/api/stream/ticket');
        es = new EventSource('/api/stream?ticket=' + encodeURIComponent(ticket));
        es.onopen = () => { delay = 1000; };
        for (const [type, fn] of Object.entries(handlers)) es.addEventListener(type, (ev) => fn(JSON.parse(ev.data)));
        es.onerror = () => { es.close(); if (!closed) setTimeout(open, delay = Math.min(delay * 2, 30000)); };
      } catch { if (!closed) setTimeout(open, delay = Math.min(delay * 2, 30000)); }
    };
    open();
    window.addEventListener('online', () => { if (es?.readyState !== 1) open(); });
    return () => { closed = true; es?.close(); };
  },
};
