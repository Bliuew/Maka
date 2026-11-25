// Realtime events (Server-Sent Events) over XMLHttpRequest, which React Native
// supports with incremental responseText. Reconnects with backoff, and again
// immediately when the network comes back.
import NetInfo from '@react-native-community/netinfo';
import { api, serverUrl, token } from './client';
import { SseParser, backoff } from '../core/sse';

export type RealtimeHandlers = Record<string, (data: any) => void> & { onOpen?: () => void };

export function connectRealtime(handlers: RealtimeHandlers): () => void {
  let closed = false, attempt = 0, xhr: XMLHttpRequest | null = null, timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (ms: number) => { if (closed) return; if (timer) clearTimeout(timer); timer = setTimeout(open, ms); };

  async function open() {
    if (closed || !token()) return;
    xhr?.abort();
    let ticket: string;
    try { ticket = (await api.post<{ ticket: string }>('/api/stream/ticket')).ticket; }
    catch { schedule(backoff(attempt++)); return; }
    const parser = new SseParser();
    let seen = 0;
    const req = new XMLHttpRequest();
    xhr = req;
    req.open('GET', `${serverUrl()}/api/stream?ticket=${encodeURIComponent(ticket)}`);
    req.setRequestHeader('accept', 'text/event-stream');
    req.onreadystatechange = () => {
      if (req.readyState >= 3 && req.status === 200) {
        if (seen === 0) { attempt = 0; handlers.onOpen?.(); }
        const text = req.responseText || '';
        const fresh = text.slice(seen);
        seen = text.length;
        for (const ev of parser.feed(fresh)) {
          const fn = handlers[ev.event];
          if (typeof fn === 'function') { try { fn(JSON.parse(ev.data)); } catch { /* ignore bad event */ } }
        }
        // Long-lived streams grow responseText; recycle the connection after ~1 MB.
        if (seen > 1_000_000) { req.abort(); schedule(0); }
      }
      if (req.readyState === 4 && xhr === req) schedule(parser.retryMs ?? backoff(attempt++));
    };
    req.onerror = () => { if (xhr === req) schedule(backoff(attempt++)); };
    req.send();
  }

  const unsubNet = NetInfo.addEventListener((s) => { if (s.isConnected && !closed) { attempt = 0; schedule(0); } });
  open();
  return () => { closed = true; if (timer) clearTimeout(timer); xhr?.abort(); unsubNet(); };
}
