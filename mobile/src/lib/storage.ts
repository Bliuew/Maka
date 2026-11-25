// Small key/value store: SecureStore on iOS/Android (Keychain / Keystore),
// localStorage on web. Values are cached in memory after boot.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const cache = new Map<string, string | null>();
const web = Platform.OS === 'web';

export async function load(keys: string[]): Promise<void> {
  for (const k of keys) {
    try {
      cache.set(k, web ? globalThis.localStorage?.getItem(k) ?? null : await SecureStore.getItemAsync(k));
    } catch { cache.set(k, null); }
  }
}

export function get(k: string): string | null { return cache.get(k) ?? null; }

export function set(k: string, v: string | null): void {
  cache.set(k, v);
  try {
    if (web) {
      if (v == null) globalThis.localStorage?.removeItem(k); else globalThis.localStorage?.setItem(k, v);
      return;
    }
    (v == null ? SecureStore.deleteItemAsync(k) : SecureStore.setItemAsync(k, v)).catch(() => {});
  } catch { /* storage unavailable */ }
}

export const KEYS = { token: 'maka_token', device: 'maka_device', server: 'maka_server', pendingUpload: 'maka_pending_upload' };
