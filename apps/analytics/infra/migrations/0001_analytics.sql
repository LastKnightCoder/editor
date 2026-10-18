CREATE TABLE events (
  product TEXT NOT NULL,
  environment TEXT NOT NULL,
  event_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  event_version INTEGER NOT NULL,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  day TEXT NOT NULL,
  app_version TEXT NOT NULL,
  os TEXT NOT NULL,
  arch TEXT NOT NULL,
  locale TEXT NOT NULL,
  country TEXT NOT NULL,
  region_code TEXT NOT NULL,
  dimension TEXT NOT NULL,
  properties_json TEXT NOT NULL CHECK(json_valid(properties_json)),
  PRIMARY KEY(product, environment, event_id)
);
CREATE INDEX events_received ON events(received_at);
CREATE INDEX events_window ON events(product, environment, day, occurred_at DESC);

CREATE TABLE installations (
  product TEXT NOT NULL,
  environment TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  installed_at INTEGER,
  PRIMARY KEY(product, environment, installation_id)
);
CREATE INDEX installations_cohort ON installations(product, environment, installed_at);

CREATE TABLE sessions (
  product TEXT NOT NULL,
  environment TEXT NOT NULL,
  session_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  foreground_ms INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  PRIMARY KEY(product, environment, session_id, installation_id)
);
CREATE INDEX sessions_window ON sessions(product, environment, started_at);
CREATE INDEX sessions_cleanup ON sessions(last_seen);

CREATE TABLE daily_activity (
  product TEXT NOT NULL,
  environment TEXT NOT NULL,
  day TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  app_version TEXT NOT NULL,
  os TEXT NOT NULL,
  arch TEXT NOT NULL,
  country TEXT NOT NULL,
  region_code TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  PRIMARY KEY(product, environment, day, installation_id)
);

CREATE TABLE daily_events (
  product TEXT NOT NULL,
  environment TEXT NOT NULL,
  day TEXT NOT NULL,
  name TEXT NOT NULL,
  event_version INTEGER NOT NULL,
  dimension TEXT NOT NULL,
  app_version TEXT NOT NULL,
  os TEXT NOT NULL,
  arch TEXT NOT NULL,
  country TEXT NOT NULL,
  region_code TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY(product, environment, day, name, event_version, dimension, app_version, os, arch, country, region_code)
);
CREATE INDEX daily_activity_cleanup ON daily_activity(day);
CREATE INDEX daily_events_cleanup ON daily_events(day);

CREATE TRIGGER project_event AFTER INSERT ON events
BEGIN
  INSERT INTO installations VALUES(
    NEW.product, NEW.environment, NEW.installation_id, NEW.occurred_at, NEW.occurred_at,
    CASE WHEN NEW.name='session_start' AND json_extract(NEW.properties_json,'$.first_run')=1 THEN NEW.occurred_at END
  ) ON CONFLICT(product,environment,installation_id) DO UPDATE SET
    first_seen=MIN(first_seen,excluded.first_seen), last_seen=MAX(last_seen,excluded.last_seen),
    installed_at=CASE WHEN excluded.installed_at IS NULL THEN installed_at
      WHEN installed_at IS NULL THEN excluded.installed_at ELSE MIN(installed_at,excluded.installed_at) END;

  INSERT INTO sessions VALUES(
    NEW.product, NEW.environment, NEW.session_id, NEW.installation_id,
    NEW.occurred_at-CAST(COALESCE(json_extract(NEW.properties_json,'$.uptime_ms'),json_extract(NEW.properties_json,'$.duration_ms'),0) AS INTEGER),
    NEW.occurred_at, CAST(COALESCE(json_extract(NEW.properties_json,'$.active_ms'),0) AS INTEGER),
    CAST(COALESCE(json_extract(NEW.properties_json,'$.uptime_ms'),json_extract(NEW.properties_json,'$.duration_ms'),0) AS INTEGER)
  ) ON CONFLICT(product,environment,session_id,installation_id) DO UPDATE SET
    started_at=MIN(started_at,excluded.started_at), last_seen=MAX(last_seen,excluded.last_seen),
    foreground_ms=MAX(foreground_ms,excluded.foreground_ms), duration_ms=MAX(duration_ms,excluded.duration_ms);

  INSERT INTO daily_activity VALUES(
    NEW.product,NEW.environment,NEW.day,NEW.installation_id,NEW.occurred_at,
    NEW.app_version,NEW.os,NEW.arch,NEW.country,NEW.region_code,1
  ) ON CONFLICT(product,environment,day,installation_id) DO UPDATE SET
    app_version=CASE WHEN excluded.last_seen>=last_seen THEN excluded.app_version ELSE app_version END,
    os=CASE WHEN excluded.last_seen>=last_seen THEN excluded.os ELSE os END,
    arch=CASE WHEN excluded.last_seen>=last_seen THEN excluded.arch ELSE arch END,
    country=CASE WHEN excluded.last_seen>=last_seen THEN excluded.country ELSE country END,
    region_code=CASE WHEN excluded.last_seen>=last_seen THEN excluded.region_code ELSE region_code END,
    last_seen=MAX(last_seen,excluded.last_seen), event_count=event_count+1;

  INSERT INTO daily_events VALUES(
    NEW.product,NEW.environment,NEW.day,NEW.name,NEW.event_version,NEW.dimension,
    NEW.app_version,NEW.os,NEW.arch,NEW.country,NEW.region_code,1
  ) ON CONFLICT(product,environment,day,name,event_version,dimension,app_version,os,arch,country,region_code)
    DO UPDATE SET count=count+1;
END;

CREATE TABLE download_receipts (
  day TEXT NOT NULL,
  artifact TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  product TEXT NOT NULL,
  environment TEXT NOT NULL,
  version TEXT NOT NULL,
  os TEXT NOT NULL,
  arch TEXT NOT NULL,
  channel TEXT NOT NULL,
  country TEXT NOT NULL,
  region_code TEXT NOT NULL,
  PRIMARY KEY(day,artifact,visitor_hash)
);
CREATE TABLE daily_downloads (
  product TEXT NOT NULL,
  environment TEXT NOT NULL,
  day TEXT NOT NULL,
  artifact TEXT NOT NULL,
  version TEXT NOT NULL,
  os TEXT NOT NULL,
  arch TEXT NOT NULL,
  channel TEXT NOT NULL,
  country TEXT NOT NULL,
  region_code TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY(product,environment,day,artifact,version,os,arch,channel,country,region_code)
);
CREATE INDEX daily_downloads_cleanup ON daily_downloads(day);
CREATE TRIGGER project_download AFTER INSERT ON download_receipts
BEGIN
  INSERT INTO daily_downloads VALUES(
    NEW.product,NEW.environment,NEW.day,NEW.artifact,NEW.version,NEW.os,NEW.arch,NEW.channel,NEW.country,NEW.region_code,1
  ) ON CONFLICT(product,environment,day,artifact,version,os,arch,channel,country,region_code)
    DO UPDATE SET count=count+1;
END;
