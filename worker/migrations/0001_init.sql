CREATE TABLE stickers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  search TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('static','animated')),
  has_sound INTEGER NOT NULL DEFAULT 0,
  webp_size INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  token_hash TEXT NOT NULL
);
CREATE INDEX stickers_new ON stickers (hidden, created_at DESC);
CREATE INDEX stickers_top ON stickers (hidden, downloads DESC);

CREATE TABLE packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  sticker_ids TEXT NOT NULL,
  cover_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  token_hash TEXT NOT NULL
);
CREATE INDEX packs_new ON packs (hidden, created_at DESC);
