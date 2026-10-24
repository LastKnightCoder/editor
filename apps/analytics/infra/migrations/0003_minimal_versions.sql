CREATE TABLE installation_versions (
  product TEXT NOT NULL,
  environment TEXT NOT NULL,
  day TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  app_version TEXT NOT NULL,
  reported_at INTEGER NOT NULL,
  PRIMARY KEY(product, environment, day, installation_id)
);
CREATE INDEX installation_versions_cleanup ON installation_versions(day);

-- 只保留已有版本观测，行为明细不进入新的统计模型。
INSERT INTO installation_versions(product,environment,day,installation_id,app_version,reported_at)
SELECT product,environment,day,installation_id,app_version,last_seen FROM daily_activity;
DROP TRIGGER project_event;
