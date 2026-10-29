-- 独立 Skill 保持格式 1，仅显式 portable 数据包使用多平台目标。
DROP TRIGGER release_target_projection;
CREATE TRIGGER release_target_projection AFTER INSERT ON releases BEGIN
  UPDATE releases SET
    format_version = COALESCE(json_extract(NEW.content_json,'$.manifest.formatVersion'),1),
    profile = json_extract(NEW.content_json,'$.manifest.profile'),
    targets_json = CASE WHEN json_extract(NEW.content_json,'$.manifest.formatVersion') = 3 OR (
      json_extract(NEW.content_json,'$.manifest.formatVersion') = 1
      AND json_extract(NEW.content_json,'$.manifest.apiVersion') = 1
      AND json_extract(NEW.content_json,'$.manifest.platform') = 'portable'
      AND json_type(NEW.content_json,'$.manifest.skills') = 'array'
      AND json_array_length(NEW.content_json,'$.manifest.skills') > 0
      AND json_type(NEW.content_json,'$.manifest.targets') = 'object'
      AND json_type(NEW.content_json,'$.manifest.main') IS NULL
      AND json_type(NEW.content_json,'$.manifest.template') IS NULL
      AND json_type(NEW.content_json,'$.manifest.backend') IS NULL
      AND json_type(NEW.content_json,'$.manifest.format') IS NULL
      AND json_type(NEW.content_json,'$.manifest.profile') IS NULL
      AND json_type(NEW.content_json,'$.manifest.styles') IS NULL
    ) THEN json_extract(NEW.content_json,'$.manifest.targets')
      ELSE json_object('desktop',json_object('minAppVersion',NEW.min_app_version)) END
    WHERE id=NEW.id;
  INSERT INTO release_targets SELECT r.id,t.key,t.value FROM releases r,json_each(r.targets_json) t
    WHERE r.id=NEW.id AND t.key IN ('desktop','android','ios');
END;

-- 只校正新声明形态的投影，不改写原始 content_json 或旧桌面包声明。
UPDATE releases SET targets_json=json_extract(content_json,'$.manifest.targets')
WHERE json_extract(content_json,'$.manifest.formatVersion')=1
  AND json_extract(content_json,'$.manifest.apiVersion')=1
  AND json_extract(content_json,'$.manifest.platform')='portable'
  AND json_type(content_json,'$.manifest.skills')='array'
  AND json_array_length(content_json,'$.manifest.skills')>0
  AND json_type(content_json,'$.manifest.targets')='object'
  AND json_type(content_json,'$.manifest.main') IS NULL
  AND json_type(content_json,'$.manifest.template') IS NULL
  AND json_type(content_json,'$.manifest.backend') IS NULL
  AND json_type(content_json,'$.manifest.format') IS NULL
  AND json_type(content_json,'$.manifest.profile') IS NULL
  AND json_type(content_json,'$.manifest.styles') IS NULL;
DELETE FROM release_targets WHERE release_id IN (
  SELECT id FROM releases
  WHERE json_extract(content_json,'$.manifest.formatVersion')=1
    AND json_extract(content_json,'$.manifest.apiVersion')=1
    AND json_extract(content_json,'$.manifest.platform')='portable'
    AND json_type(content_json,'$.manifest.skills')='array'
    AND json_array_length(content_json,'$.manifest.skills')>0
    AND json_type(content_json,'$.manifest.targets')='object'
    AND json_type(content_json,'$.manifest.main') IS NULL
    AND json_type(content_json,'$.manifest.template') IS NULL
    AND json_type(content_json,'$.manifest.backend') IS NULL
    AND json_type(content_json,'$.manifest.format') IS NULL
    AND json_type(content_json,'$.manifest.profile') IS NULL
    AND json_type(content_json,'$.manifest.styles') IS NULL
);
INSERT INTO release_targets SELECT r.id,t.key,t.value FROM releases r,json_each(r.targets_json) t
WHERE json_extract(r.content_json,'$.manifest.formatVersion')=1
  AND json_extract(r.content_json,'$.manifest.apiVersion')=1
  AND json_extract(r.content_json,'$.manifest.platform')='portable'
  AND json_type(r.content_json,'$.manifest.skills')='array'
  AND json_array_length(r.content_json,'$.manifest.skills')>0
  AND json_type(r.content_json,'$.manifest.targets')='object'
  AND json_type(r.content_json,'$.manifest.main') IS NULL
  AND json_type(r.content_json,'$.manifest.template') IS NULL
  AND json_type(r.content_json,'$.manifest.backend') IS NULL
  AND json_type(r.content_json,'$.manifest.format') IS NULL
  AND json_type(r.content_json,'$.manifest.profile') IS NULL
  AND json_type(r.content_json,'$.manifest.styles') IS NULL
  AND t.key IN ('desktop','android','ios');
