// Object storage for uploaded media. Any S3-compatible service works (AWS S3,
// Cloudflare R2, Backblaze B2, Wasabi, MinIO, …), configured with:
//   S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
//   S3_FORCE_PATH_STYLE=1 (MinIO and most self-hosted servers)
// Without S3_BUCKET a local-disk driver is used — development only; the
// server refuses to start in production without object storage.
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { config } from './config.js';
import { sendFile, send } from './http.js';

const MIME = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.vtt': 'text/vtt' };
const typeOf = (key) => MIME[path.extname(key).toLowerCase()] || 'application/octet-stream';
const safeKey = (key) => { if (!/^[\w./-]+$/.test(key) || key.includes('..')) throw new Error('bad storage key'); return key; };

function localDriver(root) {
  const file = (key) => path.join(root, safeKey(key));
  return {
    name: 'local',
    async put(key, body) {
      const f = file(key);
      await fs.promises.mkdir(path.dirname(f), { recursive: true });
      if (Buffer.isBuffer(body)) await fs.promises.writeFile(f, body);
      else await fs.promises.copyFile(body.path, f);
    },
    async download(key, dest) { await fs.promises.copyFile(file(key), dest); },
    async list(prefix) {
      const dir = file(prefix);
      try { return (await fs.promises.readdir(dir)).map((n) => prefix.replace(/\/?$/, '/') + n).sort(); } catch { return []; }
    },
    async remove(keys) { for (const k of keys) await fs.promises.rm(file(k), { force: true }); },
    serve(req, res, key, opts) { return sendFile(req, res, file(key), opts); },
  };
}

async function s3Driver(env) {
  const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const Bucket = env.S3_BUCKET;
  const client = new S3Client({
    region: env.S3_REGION || 'us-east-1',
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === '1',
    credentials: env.S3_ACCESS_KEY_ID ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } : undefined,
  });
  // Development / CI convenience: create the bucket if it does not exist yet.
  if (env.S3_CREATE_BUCKET === '1') {
    const { CreateBucketCommand, HeadBucketCommand } = await import('@aws-sdk/client-s3');
    try { await client.send(new HeadBucketCommand({ Bucket })); }
    catch { await client.send(new CreateBucketCommand({ Bucket })).catch((e) => { if (e.name !== 'BucketAlreadyOwnedByYou') throw e; }); }
  }
  return {
    name: 's3',
    client, bucket: Bucket,
    async put(key, body) {
      const Body = Buffer.isBuffer(body) ? body : fs.createReadStream(body.path);
      const ContentLength = Buffer.isBuffer(body) ? body.length : (await fs.promises.stat(body.path)).size;
      await client.send(new PutObjectCommand({ Bucket, Key: safeKey(key), Body, ContentLength, ContentType: typeOf(key) }));
    },
    async download(key, dest) {
      const r = await client.send(new GetObjectCommand({ Bucket, Key: safeKey(key) }));
      await pipeline(r.Body, fs.createWriteStream(dest));
    },
    async list(prefix) {
      const keys = []; let ContinuationToken;
      do {
        const r = await client.send(new ListObjectsV2Command({ Bucket, Prefix: safeKey(prefix.replace(/\/?$/, '/')), ContinuationToken }));
        for (const o of r.Contents || []) keys.push(o.Key);
        ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (ContinuationToken);
      return keys.sort();
    },
    async remove(keys) {
      for (let i = 0; i < keys.length; i += 1000) {
        const Objects = keys.slice(i, i + 1000).map((Key) => ({ Key }));
        if (Objects.length) await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects, Quiet: true } }));
      }
    },
    /** Stream an object to the client, passing Range requests through to storage. */
    async serve(req, res, key, { cache = 'no-cache' } = {}) {
      let r;
      try {
        r = await client.send(new GetObjectCommand({ Bucket, Key: safeKey(key), Range: req.headers.range || undefined }));
      } catch (e) {
        const status = e.$metadata?.httpStatusCode;
        if (status === 416 || e.name === 'InvalidRange') { res.writeHead(416); return res.end(); }
        if (status === 404 || e.name === 'NoSuchKey') return send(res, 404, { error: 'not_found' });
        throw e;
      }
      const headers = { 'content-type': r.ContentType || typeOf(key), 'accept-ranges': 'bytes', 'cache-control': cache };
      if (r.ContentLength != null) headers['content-length'] = r.ContentLength;
      if (r.ContentRange) headers['content-range'] = r.ContentRange;
      res.writeHead(r.ContentRange ? 206 : 200, headers);
      if (req.method === 'HEAD') { r.Body.destroy?.(); return res.end(); }
      await pipeline(r.Body, res).catch(() => {}); // client hung up mid-stream
    },
  };
}

export async function createStorage(env = process.env) {
  if (env.S3_BUCKET) return s3Driver(env);
  if (config.env === 'production') throw new Error('Object storage (S3_BUCKET) is required in production.');
  return localDriver(path.join(config.dataDir, 'storage'));
}
