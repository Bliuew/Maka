// Live streaming. The video itself runs through a streaming service; Mäka keeps
// the stream records, the 19+ gate, title screening, reporting and moderation.
//
// Provider interface (one adapter per service, added once an account exists):
//   create({ id, title, hostId }) -> { providerRef, ingestUrl, streamKey, playbackUrl }
//   end(providerRef)              -> void
// Suitable services: LiveKit (open source; LiveKit Cloud or self-hosted), Mux, Cloudflare Stream.
// Nothing here pretends to stream: without a provider every create call is refused.
import { config } from './config.js';

const unconfigured = {
  name: null,
  create() {
    throw Object.assign(new Error('Live streaming isn’t connected yet. It needs a streaming service (for example LiveKit, Mux or Cloudflare Stream).'), { code: 'live_not_configured', status: 503 });
  },
  async end() {},
};

const adapters = {}; // e.g. adapters.livekit = createLiveKitAdapter(config) once keys exist

export function getLiveProvider() {
  if (!config.liveProvider) return unconfigured;
  const a = adapters[config.liveProvider];
  if (!a) {
    return { name: config.liveProvider, create() { throw Object.assign(new Error(`No adapter for live provider "${config.liveProvider}" yet.`), { code: 'live_adapter_missing', status: 501 }); }, async end() {} };
  }
  return a;
}
