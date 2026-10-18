DROP TRIGGER project_event;

CREATE TRIGGER project_event AFTER INSERT ON events
BEGIN
  INSERT INTO installations VALUES(
    NEW.product, NEW.environment, NEW.installation_id, NEW.occurred_at, NEW.occurred_at,
    CASE WHEN NEW.event_version=1 AND NEW.name='session_start' AND json_extract(NEW.properties_json,'$.first_run')=1 THEN NEW.occurred_at END
  ) ON CONFLICT(product,environment,installation_id) DO UPDATE SET
    first_seen=MIN(first_seen,excluded.first_seen), last_seen=MAX(last_seen,excluded.last_seen),
    installed_at=CASE WHEN excluded.installed_at IS NULL THEN installed_at
      WHEN installed_at IS NULL THEN excluded.installed_at ELSE MIN(installed_at,excluded.installed_at) END;

  INSERT INTO sessions VALUES(
    NEW.product, NEW.environment, NEW.session_id, NEW.installation_id,
    NEW.occurred_at-CASE
      WHEN NEW.event_version=1 AND NEW.name='heartbeat' THEN CAST(COALESCE(json_extract(NEW.properties_json,'$.uptime_ms'),0) AS INTEGER)
      WHEN NEW.event_version=1 AND NEW.name='session_end' THEN CAST(COALESCE(json_extract(NEW.properties_json,'$.duration_ms'),0) AS INTEGER)
      ELSE 0 END,
    NEW.occurred_at,
    CASE WHEN NEW.event_version=1 AND NEW.name IN ('heartbeat','session_end') THEN CAST(COALESCE(json_extract(NEW.properties_json,'$.active_ms'),0) AS INTEGER) ELSE 0 END,
    CASE
      WHEN NEW.event_version=1 AND NEW.name='heartbeat' THEN CAST(COALESCE(json_extract(NEW.properties_json,'$.uptime_ms'),0) AS INTEGER)
      WHEN NEW.event_version=1 AND NEW.name='session_end' THEN CAST(COALESCE(json_extract(NEW.properties_json,'$.duration_ms'),0) AS INTEGER)
      ELSE 0 END
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
