-- 平台投影来自不可变包清单，不改写旧包与旧最低版本列。
ALTER TABLE releases ADD COLUMN format_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE releases ADD COLUMN profile TEXT;
ALTER TABLE releases ADD COLUMN targets_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE releases ADD COLUMN platform_evidence_json TEXT;
ALTER TABLE submission_reviews ADD COLUMN platform_evidence_json TEXT;
UPDATE releases SET
  format_version = COALESCE(json_extract(content_json, '$.manifest.formatVersion'),1),
  profile = json_extract(content_json, '$.manifest.profile'),
  targets_json = CASE WHEN json_extract(content_json, '$.manifest.formatVersion') = 3
    THEN json_extract(content_json, '$.manifest.targets')
    ELSE json_object('desktop', json_object('minAppVersion', min_app_version, 'required', json('[]'), 'optional', json('[]'))) END;
CREATE TABLE release_targets (
  release_id TEXT NOT NULL REFERENCES releases(id),
  platform TEXT NOT NULL CHECK(platform IN ('desktop','android','ios')),
  target_json TEXT NOT NULL,
  PRIMARY KEY(release_id,platform)
);
INSERT INTO release_targets SELECT r.id,t.key,t.value FROM releases r,json_each(r.targets_json) t;
CREATE INDEX release_targets_platform ON release_targets(platform,release_id);
CREATE TRIGGER release_target_projection AFTER INSERT ON releases BEGIN
  UPDATE releases SET
    format_version = COALESCE(json_extract(NEW.content_json,'$.manifest.formatVersion'),1),
    profile = json_extract(NEW.content_json,'$.manifest.profile'),
    targets_json = CASE WHEN json_extract(NEW.content_json,'$.manifest.formatVersion') = 3
      THEN json_extract(NEW.content_json,'$.manifest.targets')
      ELSE json_object('desktop',json_object('minAppVersion',NEW.min_app_version,'required',json('[]'),'optional',json('[]'))) END
    WHERE id=NEW.id;
  INSERT INTO release_targets SELECT r.id,t.key,t.value FROM releases r,json_each(r.targets_json) t WHERE r.id=NEW.id;
END;
