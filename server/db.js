// PostgreSQL data layer. Connection comes from DATABASE_URL.
// Route code uses a tiny helper (get / all / run / tx) with `?` placeholders,
// which are rewritten to Postgres `$n` parameters. Transactions follow the
// async call chain (AsyncLocalStorage), so code inside q.tx() needs no client
// plumbing.
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

export const id = (p = '') => p + crypto.randomBytes(9).toString('base64url');
export const now = () => Date.now();

// COUNT(*) and BIGINT timestamps (milliseconds) come back as JS numbers.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_norm TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  handle TEXT NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','restricted','suspended','banned','ineligible','deleted')),
  age_status TEXT NOT NULL DEFAULT 'unverified' CHECK (age_status IN ('unverified','pending','verified','failed','review')),
  dm_policy TEXT NOT NULL DEFAULT 'everyone' CHECK (dm_policy IN ('everyone','following','nobody')),
  default_remix TEXT NOT NULL DEFAULT 'followers' CHECK (default_remix IN ('everyone','followers','nobody')),
  comment_filter TEXT NOT NULL DEFAULT '[]',
  suspended_until BIGINT,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
-- Handles are unique regardless of letter case.
CREATE UNIQUE INDEX IF NOT EXISTS users_handle_ci ON users (lower(handle));

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_hash TEXT,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_device ON sessions(device_hash);

-- Only the outcome of an age check is kept: no ID images, selfies or DOB.
CREATE TABLE IF NOT EXISTS age_checks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started','verified','under_age','failed','review')),
  over_threshold INTEGER,
  person_ref_hash TEXT,     -- keyed hash of provider's stable person reference (ban-evasion)
  created_at BIGINT NOT NULL,
  completed_at BIGINT
);

CREATE TABLE IF NOT EXISTS banned_identities (
  person_ref_hash TEXT PRIMARY KEY,
  user_id TEXT,
  created_at BIGINT NOT NULL
);

-- Media bytes live in object storage (see server/storage.js); this row tracks state.
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('video','image')),
  status TEXT NOT NULL CHECK (status IN ('uploading','processing','ready','rejected')),
  total_size BIGINT NOT NULL,
  received BIGINT NOT NULL DEFAULT 0,
  file TEXT, poster TEXT,
  duration REAL, width INTEGER, height INTEGER,
  error TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id TEXT REFERENCES media(id),
  kind TEXT NOT NULL CHECK (kind IN ('video','image','carousel','text')),
  caption TEXT NOT NULL DEFAULT '',
  captions_vtt TEXT,
  alt_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft','processing','published','held','removed')),
  allow_comments INTEGER NOT NULL DEFAULT 1,
  remix_policy TEXT NOT NULL DEFAULT 'followers' CHECK (remix_policy IN ('everyone','followers','nobody')),
  is_paid_partnership INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  published_at BIGINT
);
CREATE INDEX IF NOT EXISTS posts_author ON posts(author_id, created_at);
CREATE INDEX IF NOT EXISTS posts_status ON posts(status, published_at);
-- Text and carousel posts (added after launch: keep existing databases in step).
ALTER TABLE posts ADD COLUMN IF NOT EXISTS text_style TEXT;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_kind_check;
ALTER TABLE posts ADD CONSTRAINT posts_kind_check CHECK (kind IN ('video','image','carousel','text'));
-- Photos of a carousel post, in order (posts.media_id holds the first one).
CREATE TABLE IF NOT EXISTS post_media (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id),
  position INTEGER NOT NULL,
  PRIMARY KEY (post_id, position)
);
CREATE INDEX IF NOT EXISTS post_media_media ON post_media(media_id);

-- Live streams (video runs through the streaming provider; see server/live.js).
CREATE TABLE IF NOT EXISTS live_streams (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('created','live','ended','removed')),
  provider TEXT,
  provider_ref TEXT,
  playback_url TEXT,
  created_at BIGINT NOT NULL,
  started_at BIGINT,
  ended_at BIGINT
);
CREATE INDEX IF NOT EXISTS live_status ON live_streams(status, started_at);

CREATE TABLE IF NOT EXISTS likes (user_id TEXT, post_id TEXT, created_at BIGINT, PRIMARY KEY (user_id, post_id));
CREATE TABLE IF NOT EXISTS saves (user_id TEXT, post_id TEXT, created_at BIGINT, PRIMARY KEY (user_id, post_id));
CREATE TABLE IF NOT EXISTS views (user_id TEXT, post_id TEXT, created_at BIGINT, PRIMARY KEY (user_id, post_id));
CREATE TABLE IF NOT EXISTS not_interested (user_id TEXT, post_id TEXT, created_at BIGINT, PRIMARY KEY (user_id, post_id));
CREATE TABLE IF NOT EXISTS follows (follower_id TEXT, followee_id TEXT, created_at BIGINT, PRIMARY KEY (follower_id, followee_id));
CREATE TABLE IF NOT EXISTS blocks (blocker_id TEXT, blocked_id TEXT, created_at BIGINT, PRIMARY KEY (blocker_id, blocked_id));
CREATE TABLE IF NOT EXISTS mutes (muter_id TEXT, muted_id TEXT, created_at BIGINT, PRIMARY KEY (muter_id, muted_id));
CREATE INDEX IF NOT EXISTS likes_post ON likes(post_id);
CREATE INDEX IF NOT EXISTS saves_post ON saves(post_id);
CREATE INDEX IF NOT EXISTS follows_followee ON follows(followee_id);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('visible','held','removed')),
  held_reason TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','comment','user','message')),
  target_id TEXT NOT NULL,
  target_user_id TEXT,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  evidence TEXT,            -- snapshot retained for review/appeal per retention policy
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed','escalated')),
  priority INTEGER NOT NULL DEFAULT 1,
  resolved_by TEXT, resolution TEXT, resolved_at BIGINT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_target ON reports(target_type, target_id, status);

CREATE TABLE IF NOT EXISTS sanctions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('warning','restrict','suspend','ban')),
  reason TEXT NOT NULL,
  report_id TEXT,
  expires_at BIGINT,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS appeals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sanction_id TEXT,
  report_id TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','upheld','overturned')),
  decided_by TEXT, decision_note TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT, target_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  is_group INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  created_by TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  last_message_at BIGINT
);
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  last_read_at BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','held','removed')),
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_conv ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  actor_id TEXT,
  ref_type TEXT, ref_id TEXT,
  text TEXT NOT NULL DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, created_at);

-- Cinema: nothing plays unless a current rights window covers the viewer's territory
CREATE TABLE IF NOT EXISTS titles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('movie','series','documentary')),
  genres TEXT NOT NULL,
  language TEXT NOT NULL,
  synopsis TEXT NOT NULL,
  maturity TEXT NOT NULL DEFAULT '19+',
  poster TEXT,
  is_placeholder INTEGER NOT NULL DEFAULT 0,
  stream_url TEXT,            -- licensed HLS/DASH manifest from CDN; NULL until licensed
  captions_url TEXT,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS title_rights (
  id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  licensor TEXT NOT NULL,
  territories TEXT NOT NULL,      -- comma-separated ISO codes
  starts_at BIGINT NOT NULL,
  ends_at BIGINT NOT NULL,
  ad_supported INTEGER NOT NULL DEFAULT 1,
  rights_holder_share_pct REAL NOT NULL DEFAULT 50,
  contract_ref TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS watchlist (user_id TEXT, title_id TEXT, created_at BIGINT, PRIMARY KEY (user_id, title_id));
CREATE TABLE IF NOT EXISTS watch_progress (user_id TEXT, title_id TEXT, position_s REAL, updated_at BIGINT, PRIMARY KEY (user_id, title_id));

-- Businesses, collaborations and marketplace
CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  website TEXT,
  registration_ref TEXT,
  verification TEXT NOT NULL DEFAULT 'pending' CHECK (verification IN ('pending','verified','rejected')),
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
-- NOTE: campaigns deliberately have NO follower-count / tier column.
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  brief TEXT NOT NULL,
  deliverables TEXT NOT NULL,
  compensation_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CAD',
  disclosure TEXT NOT NULL DEFAULT '#PaidPartnership',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  deadline BIGINT,
  is_sample INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  creator_id TEXT NOT NULL REFERENCES users(id),
  pitch TEXT NOT NULL,
  portfolio_post_id TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','shortlisted','accepted','declined','withdrawn')),
  conversation_id TEXT,
  created_at BIGINT NOT NULL,
  UNIQUE (campaign_id, creator_id)
);
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  terms TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','signed','delivered','approved','payout_pending','paid','disputed','cancelled')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'CAD',
  image TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES users(id),
  business_id TEXT NOT NULL REFERENCES businesses(id),
  status TEXT NOT NULL CHECK (status IN ('awaiting_payment','paid','fulfilled','refund_requested','refunded','cancelled','disputed')),
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  payment_ref TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items (order_id TEXT, product_id TEXT, qty INTEGER, unit_cents INTEGER, PRIMARY KEY (order_id, product_id));

-- Creator earnings ledger: rows only ever come from real compliant revenue events.
CREATE TABLE IF NOT EXISTS earnings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('collab','ad_share','tip','adjustment')),
  ref_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','available','paid_out','reversed')),
  created_at BIGINT NOT NULL
);

-- Live streams can be reported (added after launch).
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check CHECK (target_type IN ('post','comment','user','message','live'));
`;

/** Rewrite `?` placeholders (outside string literals) to `$1..$n`. */
export function toPg(sql) {
  let n = 0, out = '', inStr = false;
  for (const ch of sql) {
    if (ch === "'") inStr = !inStr;
    out += ch === '?' && !inStr ? '$' + ++n : ch;
  }
  return out;
}

const SCHEMA_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Open the database. `schema` (optional) isolates a run in its own Postgres
 * schema — used by tests so each run starts empty and can be dropped.
 */
export async function openDb({ url = process.env.DATABASE_URL, schema = process.env.DATABASE_SCHEMA } = {}) {
  if (!url) throw new Error('DATABASE_URL is not set. Mäka needs PostgreSQL (see README → Run it).');
  if (schema && !SCHEMA_NAME.test(schema)) throw new Error('DATABASE_SCHEMA must be a simple lowercase identifier.');
  const ssl = /sslmode=(require|verify)/.test(url) || process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== '1' } : undefined;
  const pool = new pg.Pool({
    connectionString: url, ssl, max: Number(process.env.DATABASE_POOL_MAX || 10),
    ...(schema ? { options: `-c search_path=${schema}` } : {}),
  });
  pool.on('error', (e) => console.error('Postgres pool error:', e.message));
  if (schema) await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  // Serialise schema creation across instances starting at once.
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(7461234)');
    await c.query(SCHEMA);
  } finally {
    await c.query('SELECT pg_advisory_unlock(7461234)').catch(() => {});
    c.release();
  }
  pool.schema = schema || null;
  return pool;
}

// Small helpers so route code stays readable.
export function helpers(pool) {
  const als = new AsyncLocalStorage();
  const exec = (sql, args) => (als.getStore() || pool).query(toPg(sql), args);
  return {
    async get(sql, ...a) { return (await exec(sql, a)).rows[0]; },
    async all(sql, ...a) { return (await exec(sql, a)).rows; },
    async run(sql, ...a) { const r = await exec(sql, a); return { changes: r.rowCount, rows: r.rows }; },
    /** Run fn inside one transaction. Nested calls join the outer transaction. */
    async tx(fn) {
      if (als.getStore()) return fn();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const r = await als.run(client, fn);
        await client.query('COMMIT');
        return r;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally { client.release(); }
    },
  };
}
