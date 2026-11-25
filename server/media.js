// Resumable uploads, validation and transcoding with ffprobe/ffmpeg,
// and short-lived signed media URLs.
//
// Upload chunks are stored as parts in object storage (media/<id>/parts/<offset>)
// and the accepted byte count lives in Postgres, so an upload can resume on any
// server instance. Processing assembles the parts in a temporary directory,
// transcodes, uploads the results (media/<id>/video.mp4, poster.jpg, image.jpg)
// and deletes the parts and the temp files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';

const run = promisify(execFile);

export const mediaKey = (id, file) => `media/${id}/${file}`;
const partsPrefix = (id) => `media/${id}/parts`;
const partKey = (id, offset) => `${partsPrefix(id)}/${String(offset).padStart(12, '0')}`;

export function signMediaUrl(mediaId, file, ttlSec = 6 * 3600) {
  // Round expiry to the hour so URLs are cacheable by clients/CDN.
  const exp = Math.ceil((Date.now() / 1000 + ttlSec) / 3600) * 3600;
  const sig = crypto.createHmac('sha256', config.secret).update(`${mediaId}/${file}/${exp}`).digest('base64url').slice(0, 32);
  return `/media/${mediaId}/${file}?e=${exp}&s=${sig}`;
}

export function verifyMediaSig(mediaId, file, exp, sig) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const want = crypto.createHmac('sha256', config.secret).update(`${mediaId}/${file}/${exp}`).digest('base64url').slice(0, 32);
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}

function readLimited(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { req.destroy(); reject(Object.assign(new Error('too_large'), { code: 'chunk_exceeds_declared_size' })); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Accept one chunk at `offset`. Returns { ok, received }. A wrong offset is
 * refused with the server's offset so the client can resume from there.
 */
export async function appendChunk(storage, q, media, offset, req) {
  if (offset !== media.received) return { ok: false, received: media.received };
  const remaining = media.total_size - media.received;
  const buf = await readLimited(req, Math.min(remaining, config.uploads.maxChunkBytes));
  if (!buf.length) return { ok: true, received: media.received };
  const key = partKey(media.id, offset);
  await storage.put(key, buf);
  // Compare-and-set so two racing requests can never both advance the offset.
  const r = await q.run('UPDATE media SET received=received+? WHERE id=? AND received=? AND status=\'uploading\' RETURNING received', buf.length, media.id, offset);
  if (!r.changes) {
    await storage.remove([key]).catch(() => {});
    const cur = await q.get('SELECT received FROM media WHERE id=?', media.id);
    return { ok: false, received: cur?.received ?? 0 };
  }
  return { ok: true, received: r.rows[0].received };
}

/** Concatenate the uploaded parts into one local file. */
async function assemble(storage, media, dest) {
  const keys = await storage.list(partsPrefix(media.id));
  const out = await fs.promises.open(dest, 'w');
  const tmp = dest + '.part';
  try {
    for (const k of keys) {
      await storage.download(k, tmp);
      await out.write(await fs.promises.readFile(tmp)); // parts are ≤ maxChunkBytes
    }
  } finally {
    await out.close();
    await fs.promises.rm(tmp, { force: true });
  }
  return keys;
}

async function probe(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { timeout: 30000 });
  return JSON.parse(stdout);
}

/**
 * Validate and transcode a local source file in `dir`. Returns fields to store
 * on the media row; produced files are left in `dir`.
 * Malware scanning and automated visual moderation are integration points
 * (config.mediaScanner) — not faked here.
 */
export async function transcode(media, src, dir) {
  let info;
  try { info = await probe(src); } catch { return { status: 'rejected', error: 'File could not be read as media.' }; }
  const v = (info.streams || []).find((s) => s.codec_type === 'video');
  if (!v) return { status: 'rejected', error: 'No picture/video stream found.' };
  const fmt = info.format?.format_name || '';
  const isStillImage = /image2|png_pipe|jpeg_pipe|webp_pipe|gif|bmp_pipe/.test(fmt) || ['mjpeg', 'png', 'webp', 'bmp'].includes(v.codec_name) && !(Number(info.format?.duration) > 0.5);

  try {
    if (media.kind === 'image') {
      if (!isStillImage) return { status: 'rejected', error: 'Expected a photo.' };
      // Re-encoding drops the original's EXIF/location metadata.
      await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-frames:v', '1', '-vf',
        "scale='min(1440,iw)':'min(1440,ih)':force_original_aspect_ratio=decrease", '-q:v', '3', path.join(dir, 'image.jpg')], { timeout: 60000 });
      return { status: 'ready', file: 'image.jpg', poster: 'image.jpg', width: v.width, height: v.height, duration: null };
    }
    if (isStillImage) return { status: 'rejected', error: 'Expected a video.' };
    const duration = Number(info.format?.duration || v.duration || 0);
    if (!duration || duration > config.uploads.maxVideoSeconds) return { status: 'rejected', error: `Videos must be under ${config.uploads.maxVideoSeconds / 60} minutes.` };
    await run('ffmpeg', ['-y', '-v', 'error', '-i', src,
      '-vf', "scale='min(720,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-map_metadata', '-1', '-movflags', '+faststart', path.join(dir, 'video.mp4')], { timeout: 15 * 60000 });
    await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(Math.min(0.5, duration / 2)), '-i', path.join(dir, 'video.mp4'),
      '-frames:v', '1', '-q:v', '4', path.join(dir, 'poster.jpg')], { timeout: 60000 });
    const out = await probe(path.join(dir, 'video.mp4'));
    const ov = out.streams.find((s) => s.codec_type === 'video');
    return { status: 'ready', file: 'video.mp4', poster: 'poster.jpg', width: ov.width, height: ov.height, duration };
  } catch (e) {
    return { status: 'rejected', error: 'Processing failed: ' + String(e.stderr || e.message).slice(0, 200) };
  }
}

/** Transcode a local file and store the outputs. Used by uploads and sample seeding. */
export async function processFile(storage, media, src) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'maka-media-'));
  try {
    const out = await transcode(media, src, dir);
    if (out.status === 'ready') {
      for (const f of new Set([out.file, out.poster])) await storage.put(mediaKey(media.id, f), { path: path.join(dir, f) });
    }
    return out;
  } finally { await fs.promises.rm(dir, { recursive: true, force: true }); }
}

/** Assemble an uploaded file from storage parts, process it, then delete the parts. */
export async function processUpload(storage, media) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'maka-upload-'));
  const src = path.join(dir, 'upload.bin');
  let keys = [];
  try {
    try { keys = await assemble(storage, media, src); } catch (e) { return { status: 'rejected', error: 'Upload could not be read back from storage.' }; }
    if ((await fs.promises.stat(src)).size !== media.total_size) return { status: 'rejected', error: 'Upload is incomplete.' };
    return await processFile(storage, media, src);
  } finally {
    await storage.remove(keys).catch(() => {});
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}
