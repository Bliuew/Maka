import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, onSignedOut, setToken, token } from './client';
import * as store from './storage';
import { connectRealtime } from './realtime';
import { emit } from './events';
import { areaFor, type Area, type Me } from '../core/gate';
import { useToast } from './toast';

type Session = {
  ready: boolean;
  me: Me | null;
  area: Area;
  unread: number;
  setMe: (m: Me | null) => void;
  signIn: (token: string, me: Me) => void;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  refreshUnread: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [unread, setUnread] = useState(0);
  const toast = useToast();
  const toastRef = useRef(toast);
  useLayoutEffect(() => { toastRef.current = toast; });

  useEffect(() => {
    (async () => {
      await store.load(Object.values(store.KEYS));
      if (token()) {
        try { setMe(await api.get('/api/me')); }
        catch (e: any) { if (e.status === 401 || e.status === 403) setToken(null); }
      }
      setReady(true);
    })();
    return onSignedOut(() => setMe(null));
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const [n, c] = await Promise.all([api.get('/api/notifications'), api.get<any[]>('/api/conversations')]);
      setUnread(n.unread + c.reduce((a, x) => a + x.unread, 0));
    } catch { /* offline */ }
  }, []);

  const verified = me?.ageStatus === 'verified';
  useEffect(() => {
    if (!verified) return;
    // Unread counts are refreshed whenever the stream (re)connects, which also catches up after being offline.
    return connectRealtime({
      onOpen: () => { emit('realtime:open'); refreshUnread(); },
      message: (m) => { emit('message', m); setUnread((u) => u + 1); },
      notification: (n) => { emit('notification', n); setUnread((u) => u + 1); toastRef.current.show(n.text); },
      post_status: (s) => { emit('post_status', s); toastRef.current.show(s.status === 'published' ? 'Your post is live' : 'Your upload could not be processed: ' + (s.error || ''), s.status !== 'published'); },
      media_status: (s) => emit('media_status', s),
    });
  }, [verified, refreshUnread]);

  const value = useMemo<Session>(() => ({
    ready, me, unread, area: areaFor(token(), me), setMe,
    signIn: (t, m) => { setToken(t); setMe(m); },
    signOut: async () => { try { await api.post('/api/auth/logout'); } catch { /* already out */ } setToken(null); setMe(null); },
    refreshMe: async () => { setMe(await api.get('/api/me')); },
    refreshUnread,
  }), [ready, me, unread, refreshUnread]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
