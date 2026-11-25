// Platform-agnostic Mäka API client. The React Native app wires in SecureStore
// for the token; tests run the same code in Node against the real server.

export class ApiError extends Error {
  status: number;
  code?: string;
  body: any;
  constructor(status: number, body: any) {
    super(body?.message || body?.error || `HTTP ${status}`);
    this.status = status;
    this.code = body?.error;
    this.body = body;
  }
}

export type ApiOptions = {
  baseUrl: string;
  getToken: () => string | null;
  setToken: (t: string | null) => void;
  deviceId: () => string;
  onSignedOut?: () => void;
  fetchImpl?: typeof fetch;
};

export type Api = ReturnType<typeof createApi>;

export function createApi(opts: ApiOptions) {
  const f = opts.fetchImpl || fetch;
  const abs = (p: string | null | undefined): string | null => {
    if (!p) return null;
    return /^https?:\/\//.test(p) ? p : opts.baseUrl.replace(/\/$/, '') + p;
  };

  async function req<T = any>(method: string, path: string, body?: unknown, extra: { headers?: Record<string, string>; raw?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = { 'x-device-id': opts.deviceId(), ...(extra.headers || {}) };
    const token = opts.getToken();
    if (token) headers.authorization = 'Bearer ' + token;
    let payload: any = body;
    if (body !== undefined && !extra.raw) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    let res: Response;
    try {
      res = await f(abs(path)!, { method, headers, body: payload });
    } catch {
      throw new ApiError(0, { error: 'offline', message: 'You appear to be offline. Check your connection and try again.' });
    }
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      if (res.status === 401 && token && path !== '/api/auth/login') { opts.setToken(null); opts.onSignedOut?.(); }
      throw new ApiError(res.status, data);
    }
    return data as T;
  }

  return {
    abs,
    req,
    get: <T = any>(p: string) => req<T>('GET', p),
    post: <T = any>(p: string, b: unknown = {}) => req<T>('POST', p, b),
    patch: <T = any>(p: string, b: unknown = {}) => req<T>('PATCH', p, b),
    del: <T = any>(p: string, b?: unknown) => req<T>('DELETE', p, b),
    putBytes: <T = any>(p: string, bytes: Uint8Array) => req<T>('PUT', p, bytes, { raw: true, headers: { 'content-type': 'application/octet-stream' } }),
  };
}
