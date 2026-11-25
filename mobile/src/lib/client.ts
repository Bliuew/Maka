// The app's API client instance, backed by secure token storage.
import { createApi } from '../core/api';
import { API_URL } from './config';
import * as store from './storage';

const signedOutListeners = new Set<() => void>();
export const onSignedOut = (fn: () => void) => { signedOutListeners.add(fn); return () => { signedOutListeners.delete(fn); }; };

function deviceId(): string {
  let d = store.get(store.KEYS.device);
  if (!d) {
    d = 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    store.set(store.KEYS.device, d);
  }
  return d;
}

/** Server origin: build-time default, optionally overridden on the welcome screen (test builds). */
export const serverUrl = () => (store.get(store.KEYS.server) || API_URL).replace(/\/$/, '');

let current = build();
function build() {
  return createApi({
    baseUrl: serverUrl(),
    getToken: () => store.get(store.KEYS.token),
    setToken: (t) => store.set(store.KEYS.token, t),
    deviceId,
    onSignedOut: () => signedOutListeners.forEach((fn) => fn()),
  });
}

export function setServerUrl(url: string | null) {
  store.set(store.KEYS.server, url ? url.trim().replace(/\/$/, '') : null);
  current = build();
}

// Proxy so screens always use the client for the current server.
export const api = new Proxy({} as ReturnType<typeof build>, { get: (_t, k) => (current as any)[k] });
export const token = () => store.get(store.KEYS.token);
export const setToken = (t: string | null) => store.set(store.KEYS.token, t);
export const media = (p: string | null | undefined) => (p ? api.abs(p) : null);
