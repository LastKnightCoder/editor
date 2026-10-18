CREATE TABLE visitors (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1))
);
CREATE TABLE visitor_issue_limits (
  bucket TEXT PRIMARY KEY,
  hour TEXT NOT NULL,
  count INTEGER NOT NULL
);
CREATE INDEX visitor_issue_limits_hour ON visitor_issue_limits(hour);
CREATE TABLE plugin_download_totals (
  plugin_id TEXT PRIMARY KEY,
  downloads INTEGER NOT NULL DEFAULT 0 CHECK(downloads >= 0)
);
CREATE TABLE plugin_download_daily (
  plugin_id TEXT NOT NULL,
  day TEXT NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0 CHECK(downloads >= 0),
  PRIMARY KEY(plugin_id,day)
);
CREATE INDEX plugin_download_daily_day ON plugin_download_daily(day,plugin_id);
CREATE TABLE download_receipts (
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  release_id TEXT NOT NULL REFERENCES releases(id),
  plugin_id TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY(visitor_id,release_id,day)
);
CREATE INDEX download_receipts_day ON download_receipts(day);
CREATE INDEX releases_catalog_plugins ON releases(state,plugin_id,published_at);
-- 去重插入和两级计数属于同一 SQLite 语句事务；重复插入不触发计数。
CREATE TRIGGER count_plugin_download AFTER INSERT ON download_receipts
BEGIN
  INSERT INTO plugin_download_totals(plugin_id,downloads) VALUES(NEW.plugin_id,1)
    ON CONFLICT(plugin_id) DO UPDATE SET downloads=downloads+1;
  INSERT INTO plugin_download_daily(plugin_id,day,downloads) VALUES(NEW.plugin_id,NEW.day,1)
    ON CONFLICT(plugin_id,day) DO UPDATE SET downloads=downloads+1;
END;
