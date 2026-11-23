// Resumable uploads, validation and transcoding with ffprobe/ffmpeg,
// and short-lived signed media URLs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';

const run = promisify(execFile);

export function mediaDir(id) {
  return path.join(config.dataDir, 'media', id.slice(0, 2), id);
}

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

export async function appendChunk(media, offset, req) {
  const dir = mediaDir(media.id);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, 'upload.part');
  const have = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
  if (offset !== have) return { ok: false, received: have };
  const limit = media.total_size - have;
  let written = 0;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp, { flags: 'a' });
    req.on('data', (c) => {
      written += c.length;
      if (written > limit) { req.destroy(); out.destroy(); reject(Object.assign(new Error('too_large'), { code: 'chunk_exceeds_declared_size' })); return; }
      if (!out.write(c)) { req.pause(); out.once('drain', () => req.resume()); }
    });
    req.on('end', () => out.end(resolve));
    req.on('error', reject);
    out.on('error', reject);
  });
  return { ok: true, received: have + written };
}

async function probe(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { timeout: 30000 });
  return JSON.parse(stdout);
}

/**
 * Validate and transcode. Returns fields to store on the media row.
 * Malware scanning and automated visual moderation are integration points
 * (config.mediaScanner) — not faked here.
 */
export async function processMedia(media) {
  const dir = mediaDir(media.id);
  const src = path.join(dir, 'upload.part');
  let info;
  try { info = await probe(src); } catch { return { status: 'rejected', error: 'File could not be read as media.' }; }
  const v = (info.streams || []).find((s) => s.codec_type === 'video');
  if (!v) return { status: 'rejected', error: 'No picture/video stream found.' };
  const fmt = info.format?.format_name || '';
  const isStillImage = /image2|png_pipe|jpeg_pipe|webp_pipe|gif|bmp_pipe/.test(fmt) || ['mjpeg', 'png', 'webp', 'bmp'].includes(v.codec_name) && !(Number(info.format?.duration) > 0.5);

  try {
    if (media.kind === 'image') {
      if (!isStillImage) return { status: 'rejected', error: 'Expected a photo.' };
      await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-frames:v', '1', '-vf',
        "scale='min(1440,iw)':'min(1440,ih)':force_original_aspect_ratio=decrease", '-q:v', '3', path.join(dir, 'image.jpg')], { timeout: 60000 });
      fs.rmSync(src, { force: true }); // strip original (removes EXIF/location metadata)
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
    fs.rmSync(src, { force: true });
    return { status: 'ready', file: 'video.mp4', poster: 'poster.jpg', width: ov.width, height: ov.height, duration };
  } catch (e) {
    return { status: 'rejected', error: 'Processing failed: ' + String(e.stderr || e.message).slice(0, 200) };
  }
}
