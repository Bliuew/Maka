// Development-only sample data. Every row is flagged is_sample / is_placeholder
// and labelled as a sample in the app. Refused when NODE_ENV=production.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { id, now } from './db.js';
import { config } from './config.js';
import { mediaDir, processMedia } from './media.js';

const run = promisify(execFile);
const scryptHash = (pw) => {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64')}`;
};

async function sampleVideo(q, ownerId, image, seconds = 6) {
  const mid = id('m_');
  const dir = mediaDir(mid);
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(config.root, 'web/assets', image);
  await run('ffmpeg', ['-y', '-v', 'error', '-loop', '1', '-i', src, '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100',
    '-vf', `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0009,1.18)':d=${seconds * 25}:s=720x1280:fps=25`,
    '-af', 'volume=0.04', '-t', String(seconds), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-f', 'mp4', path.join(dir, 'upload.part')]);
  const size = fs.statSync(path.join(dir, 'upload.part')).size;
  q.run('INSERT INTO media (id,owner_id,kind,status,total_size,received,created_at) VALUES (?,?,?,?,?,?,?)', mid, ownerId, 'video', 'processing', size, size, now());
  const out = await processMedia({ id: mid, kind: 'video' });
  q.run('UPDATE media SET status=?, file=?, poster=?, width=?, height=?, duration=?, error=? WHERE id=?', out.status, out.file, out.poster, out.width, out.height, out.duration, out.error || null, mid);
  return mid;
}

export async function seed({ q }, { adminPassword } = {}) {
  if (config.env === 'production') throw new Error('Refusing to seed sample data in production.');
  if (q.get('SELECT 1 FROM users WHERE is_sample=1')) return { skipped: true };
  const t = now();
  const mkUser = (handle, name, bio, avatar, role = 'user', pw = crypto.randomBytes(12).toString('hex')) => {
    const uid = id('u_');
    q.run(`INSERT INTO users (id,email,email_norm,pass_hash,handle,display_name,bio,avatar,role,age_status,is_sample,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`,
      uid, `${handle}@sample.maka.test`, `${handle}@sample.maka.test`, scryptHash(pw), handle, name, bio, avatar, role, 'verified', t);
    return uid;
  };
  const admin = mkUser('trust.safety', 'Mäka Trust & Safety (dev)', 'Development moderator account.', null, 'admin', adminPassword || 'dev-admin-password');
  const amara = mkUser('amara.creates', 'Amara (sample)', 'Small joys, big moments ✨ Sample creator account.', 'asset:feed-amara.jpg');
  const olivia = mkUser('olivia.studio', 'Olivia (sample)', 'Fashion & everyday style. Sample creator account.', 'asset:feed-olivia.jpg');
  const cinema = mkUser('maka.cinema.sample', 'Mäka Cinema (sample)', 'Fictional film promos for the Cinema demo.', 'asset:film-romance.jpg');
  const brand = mkUser('glow.brand.sample', 'Everyday Glow (sample brand)', 'Sample business owner account.', 'asset:shop-beauty.jpg');

  // A few follows so counts differ — ranking and eligibility ignore them.
  q.run('INSERT INTO follows VALUES (?,?,?)', olivia, amara, t);
  q.run('INSERT INTO follows VALUES (?,?,?)', cinema, amara, t);

  const posts = [
    [amara, 'feed-amara.jpg', 'Small joys, big moments ✨ Creating because I love it, not because of follower counts. #EveryCreator'],
    [olivia, 'feed-olivia.jpg', 'Your next creative chapter can begin today 🐝 #CreateWithMäka'],
    [cinema, 'feed-film.jpg', 'What would you do for a second chance? 🎬 Fictional film promo for the Mäka Cinema demo. #MäkaCinema'],
    [amara, 'creator-profile.jpg', 'Golden hour, honey tones, slow mornings. 🍯'],
  ];
  let i = 0;
  for (const [author, img, caption] of posts) {
    const mid = await sampleVideo(q, author, img);
    q.run(`INSERT INTO posts (id,author_id,media_id,kind,caption,status,allow_comments,remix_policy,created_at,published_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      id('p_'), author, mid, 'video', caption, 'published', 1, 'followers', t - i * 3600e3, t - i * 3600e3);
    i++;
  }

  // Businesses (verified samples) with campaigns and products
  const mkBiz = (owner, name, category, description) => {
    const bid = id('b_');
    q.run('INSERT INTO businesses (id,owner_id,name,category,description,registration_ref,verification,is_sample,created_at) VALUES (?,?,?,?,?,?,?,1,?)', bid, owner, name, category, description, 'SAMPLE', 'verified', t);
    return bid;
  };
  const glow = mkBiz(brand, 'Everyday Glow (sample)', 'Beauty', 'Fictional skincare and wellness shop used to demonstrate the marketplace.');
  const sound = mkBiz(admin, 'Sound & Style (sample)', 'Fashion', 'Fictional independent fashion and accessories label.');
  const indie = mkBiz(admin, 'Indie Film Voices (sample)', 'Entertainment', 'Fictional independent film collective.');
  const home = mkBiz(admin, 'Honey & Home (sample)', 'Home & Living', 'Fictional home fragrance and everyday finds.');
  const camp = (biz, title, cat, brief, img, cents) => q.run(`INSERT INTO campaigns (id,business_id,title,category,brief,deliverables,compensation_cents,currency,image,is_sample,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,1,?)`, id('cp_'), biz, title, cat, brief, 'One original 30–60s vertical video, disclosed as a paid partnership.', cents, 'CAD', 'asset:' + img, t);
  camp(glow, 'The Everyday Glow', 'Beauty', 'Make a 30-second original skincare storytelling video. Sample campaign — no brand is paying through this demo.', 'shop-beauty.jpg', 25000);
  camp(sound, 'Sound & Style', 'Fashion', 'Pitch a fresh product video concept. Selection is based on fit and creativity. Sample campaign.', 'shop-fashion.jpg', 30000);
  camp(indie, 'Indie Film Voices', 'Entertainment', 'Original reviews and cultural conversation for independent films. Sample campaign.', 'film-romance.jpg', 20000);
  const prod = (biz, name, desc, cents, img, stock = 25) => q.run(`INSERT INTO products (id,business_id,name,description,price_cents,currency,image,stock,is_sample,created_at) VALUES (?,?,?,?,?,?,?,?,1,?)`,
    id('pr_'), biz, name, desc, cents, 'CAD', 'asset:' + img, stock, t);
  prod(glow, 'Honey Glow Serum (sample)', 'Lightweight daily serum. Sample product.', 3400, 'shop-beauty.jpg');
  prod(glow, 'Calm Night Balm (sample)', 'Overnight balm. Sample product.', 2800, 'shop-fragrance.jpg');
  prod(sound, 'Gold Thread Tote (sample)', 'Hand-finished tote. Sample product.', 6500, 'shop-fashion.jpg');
  prod(home, 'Amber Room Spray (sample)', 'Warm amber scent. Sample product.', 2200, 'shop-fragrance.jpg', 0);
  prod(indie, 'Festival Pass (sample)', 'Digital festival pass. Sample product.', 1500, 'film-city.jpg');

  // Cinema: clearly fictional placeholder titles — no rights, no streams.
  const film = (name, kind, genres, synopsis, poster, lang = 'en') => q.run(`INSERT INTO titles (id,name,kind,genres,language,synopsis,poster,is_placeholder,created_at) VALUES (?,?,?,?,?,?,?,1,?)`,
    id('t_'), name, kind, genres, lang, synopsis, 'asset:' + poster, t);
  film('A Second Chance', 'movie', 'Romance,Drama', 'A sweeping story about finding connection again.', 'film-romance.jpg');
  film('Beyond the Horizon', 'movie', 'Adventure,Drama', 'A journey that changes everything.', 'film-horizon.jpg');
  film('Roommates Again', 'series', 'Comedy,Friendship', 'Three friends, one unexpected reunion.', 'film-friends.jpg');
  film('The Golden City', 'movie', 'Mystery,Thriller', 'Every city holds a secret.', 'film-city.jpg', 'fr');
  return { admin: 'trust.safety@sample.maka.test' };
}
