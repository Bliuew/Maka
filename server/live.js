// Live streaming. The video itself runs through a streaming service; Mäka keeps
// the stream records, the 19+ gate, title screening, reporting and moderation.
//
// Provider interface:
//   create({ id, title, hostId }) -> { providerRef, ingestUrl, streamKey, playbackUrl }
//   status(providerRef)           -> 'live' | 'waiting' | 'ended'
//   end(providerRef)              -> void
//   verifyWebhook(raw, headers)   -> { type: 'live'|'ended', providerRef } | null (ignored) | throws on bad signature
// Built: Mux (LIVE_PROVIDER=mux, MUX_TOKEN_ID, MUX_TOKEN_SECRET, MUX_WEBHOOK_SECRET).
// Hosts broadcast with any RTMP app (Larix Broadcaster, Streamlabs, OBS); viewers watch HLS.
// Nothing here pretends to stream: without a provider every create call is refused.
import crypto from 'node:crypto';
import { config } from './config.js';

const unconfigured = {
  name: null,
  create() {
    throw Object.assign(new Error('Live streaming isn’t connected yet. It needs a streaming service (for example LiveKit, Mux or Cloudflare Stream).'), { code: 'live_not_configured', status: 503 });
  },
  async end() {},
};

export function createMux(env = process.env) {
  const base = env.MUX_API_BASE || 'https://api.mux.com';
  const auth = 'Basic ' + Buffer.from(`${env.MUX_TOKEN_ID}:${env.MUX_TOKEN_SECRET}`).toString('base64');
  async function mux(method, path, body) {
    const res = await fetch(base + path, { method, headers: { authorization: auth, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error('The streaming service couldn’t start this live. Try again in a minute.'), { code: 'live_provider_error', status: 502, detail: data });
    return data.data;
  }
  return {
    name: 'mux',
    async create({ id }) {
      const d = await mux('POST', '/video/v1/live-streams', {
        playback_policy: ['public'], latency_mode: 'low', reconnect_window: 60, passthrough: id,
        new_asset_settings: { playback_policy: ['public'] },
      });
      return { providerRef: d.id, ingestUrl: 'rtmps://global-live.mux.com:443/app', streamKey: d.stream_key,
        playbackUrl: d.playback_ids?.[0] ? `https://stream.mux.com/${d.playback_ids[0].id}.m3u8` : null };
    },
    async status(ref) {
      const d = await mux('GET', `/video/v1/live-streams/${encodeURIComponent(ref)}`);
      return d.status === 'active' ? 'live' : d.status === 'disabled' ? 'ended' : 'waiting';
    },
    async end(ref) {
      await mux('PUT', `/video/v1/live-streams/${encodeURIComponent(ref)}/complete`).catch(() => {});
      await mux('PUT', `/video/v1/live-streams/${encodeURIComponent(ref)}/disable`); // the stream key stops working
    },
    // Mux-Signature: t=<unix>,v1=<hex hmac-sha256 of "t.body">
    verifyWebhook(raw, headers, toleranceSec = 300) {
      const secret = env.MUX_WEBHOOK_SECRET;
      if (!secret) throw Object.assign(new Error('Webhook secret is not set.'), { code: 'webhook_not_configured', status: 503 });
      const kv = Object.fromEntries(String(headers['mux-signature'] || '').split(',').map((x) => x.trim().split('=')).filter((x) => x.length === 2));
      const t = Number(kv.t);
      const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest('hex');
      if (!t || !kv.v1 || Math.abs(Date.now() / 1000 - t) > toleranceSec || kv.v1.length !== expected.length
        || !crypto.timingSafeEqual(Buffer.from(kv.v1), Buffer.from(expected))) throw Object.assign(new Error('invalid signature'), { code: 'invalid_signature', status: 400 });
      const ev = JSON.parse(raw.toString('utf8'));
      if (ev.type === 'video.live_stream.active') return { type: 'live', providerRef: ev.data?.id };
      if (ev.type === 'video.live_stream.idle' || ev.type === 'video.live_stream.disabled') return { type: 'ended', providerRef: ev.data?.id };
      return null;
    },
  };
}

const factories = { mux: createMux };
let cached = null;
export function setLiveProvider(p) { cached = p; } // tests

export function getLiveProvider() {
  if (cached) return cached;
  if (!config.liveProvider) return unconfigured;
  const f = factories[config.liveProvider];
  const a = f && (cached = f());
  if (!a) {
    return { name: config.liveProvider, create() { throw Object.assign(new Error(`No adapter for live provider "${config.liveProvider}" yet.`), { code: 'live_adapter_missing', status: 501 }); }, async end() {} };
  }
  return a;
}
