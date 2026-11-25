// Bridges picked media to the resumable uploader, and remembers an unfinished
// upload so it can be resumed after the app is closed or the network drops.
import { Platform } from 'react-native';
import { File, FileMode } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';
import { api } from './client';
import * as store from './storage';
import { uploadResumable, waitForMedia, type ChunkReader, type UploadKind, type UploadState } from '../core/uploader';

export type PendingUpload = { uri: string; size: number; kind: UploadKind; state: UploadState | null; form: Record<string, unknown>; name?: string };

export function readerFor(asset: Pick<ImagePickerAsset, 'uri'> & { file?: Blob }): { size: number; read: ChunkReader; close: () => void } {
  if (Platform.OS === 'web' && asset.file) {
    const blob = asset.file;
    return { size: blob.size, read: async (o, l) => new Uint8Array(await blob.slice(o, o + l).arrayBuffer()), close: () => {} };
  }
  const file = new File(asset.uri);
  if (!file.exists) throw new Error('The selected file is no longer available on this device.');
  const handle = file.open(FileMode.ReadOnly);
  return {
    size: file.size ?? 0,
    read: async (offset, length) => { handle.offset = offset; return await handle.readBytes(length); },
    close: () => { try { handle.close(); } catch { /* already closed */ } },
  };
}

export const getPending = (): PendingUpload | null => { try { return JSON.parse(store.get(store.KEYS.pendingUpload) || 'null'); } catch { return null; } };
export const setPending = (p: PendingUpload | null) => store.set(store.KEYS.pendingUpload, p ? JSON.stringify(p) : null);

/** Upload (or resume) a file; returns the media id once the server has accepted every byte. */
export async function uploadAsset(asset: { uri: string; file?: Blob }, kind: UploadKind, form: Record<string, unknown>, onProgress: (f: number) => void): Promise<string> {
  const r = readerFor(asset);
  const prev = getPending();
  const resume = prev && prev.uri === asset.uri && prev.size === r.size && prev.kind === kind ? prev.state : null;
  const pending: PendingUpload = { uri: asset.uri, size: r.size, kind, state: resume, form };
  if (Platform.OS !== 'web') setPending(pending);
  try {
    const id = await uploadResumable({
      api, size: r.size, kind, read: r.read, resume, onProgress,
      onState: (s) => { if (Platform.OS !== 'web') setPending({ ...pending, state: s }); },
    });
    return id;
  } finally { r.close(); }
}

export { waitForMedia };
