// Resumable, chunked upload against /api/uploads. The server keeps the accepted
// byte offset, so after a dropped connection (or an app restart) the client asks
// for the offset and continues from there.
import { ApiError, type Api } from './api.ts';

export type UploadKind = 'video' | 'image';

/** Read `length` bytes starting at `offset` from the local file. */
export type ChunkReader = (offset: number, length: number) => Promise<Uint8Array>;

export type UploadState = { uploadId: string; size: number; kind: UploadKind; received: number; chunkSize?: number };

export type UploadOptions = {
  api: Api;
  size: number;
  kind: UploadKind;
  read: ChunkReader;
  /** Pass a saved state to resume an earlier upload of the same file. */
  resume?: UploadState | null;
  onProgress?: (fraction: number) => void;
  /** Called after every accepted chunk so callers can persist progress. */
  onState?: (s: UploadState) => void;
  maxFailures?: number;
  /** Upper bound for one chunk (the server suggests a size; slow links may want smaller). */
  maxChunkBytes?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function startOrResume(o: UploadOptions): Promise<UploadState> {
  if (o.resume && o.resume.size === o.size && o.resume.kind === o.kind) {
    try {
      const s = await o.api.get(`/api/uploads/${o.resume.uploadId}`);
      if (s.status === 'uploading') return { ...o.resume, received: s.received };
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
    }
  }
  const r = await o.api.post('/api/uploads', { kind: o.kind, size: o.size });
  return { uploadId: r.uploadId, size: o.size, kind: o.kind, received: 0, chunkSize: r.chunkSize };
}

/** Upload every byte, then ask the server to process the file. Returns the upload (media) id. */
export async function uploadResumable(o: UploadOptions): Promise<string> {
  const sleep = o.sleep || defaultSleep;
  const maxFailures = o.maxFailures ?? 8;
  const state = await startOrResume(o);
  const chunkSize = Math.min(state.chunkSize || 4 * 1024 * 1024, o.maxChunkBytes || Infinity);
  let failures = 0;
  o.onState?.(state);
  o.onProgress?.(state.received / o.size);
  while (state.received < o.size) {
    const len = Math.min(chunkSize, o.size - state.received);
    try {
      const bytes = await o.read(state.received, len);
      const r = await o.api.putBytes(`/api/uploads/${state.uploadId}?offset=${state.received}`, bytes);
      state.received = r.received;
      failures = 0;
      o.onState?.({ ...state });
      o.onProgress?.(state.received / o.size);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'offset_mismatch') { state.received = e.body.received; continue; }
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) throw e;
      if (++failures > maxFailures) throw e;
      await sleep(Math.min(30000, 500 * 2 ** failures));
      try { state.received = (await o.api.get(`/api/uploads/${state.uploadId}`)).received; } catch { /* still offline */ }
    }
  }
  await o.api.post(`/api/uploads/${state.uploadId}/complete`);
  return state.uploadId;
}

/** Poll until the server has validated and transcoded the media. */
export async function waitForMedia(api: Api, uploadId: string, { timeoutMs = 10 * 60000, sleep = defaultSleep } = {}) {
  const t0 = Date.now();
  for (;;) {
    const s = await api.get(`/api/uploads/${uploadId}`);
    if (s.status === 'ready' || s.status === 'rejected') return s;
    if (Date.now() - t0 > timeoutMs) return s;
    await sleep(800);
  }
}
