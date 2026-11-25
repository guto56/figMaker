-- Uma denúncia e um download contado por pessoa (IP com hash + sal secreto).
CREATE TABLE reports_seen (
  target TEXT NOT NULL,
  who TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (target, who)
);
CREATE TABLE downloads_seen (
  target TEXT NOT NULL,
  who TEXT NOT NULL,
  day INTEGER NOT NULL,
  PRIMARY KEY (target, who, day)
);
