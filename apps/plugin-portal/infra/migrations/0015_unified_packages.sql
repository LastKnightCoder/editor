-- 统一协议按显式 targets 投影；已发布包及其历史投影保持原样。
DROP TRIGGER release_target_projection;
CREATE TRIGGER release_target_projection AFTER INSERT ON releases BEGIN
  UPDATE releases SET
    format_version = COALESCE(json_extract(NEW.content_json,'$.manifest.formatVersion'),1),
    profile = json_extract(NEW.content_json,'$.manifest.profile'),
    targets_json = CASE WHEN json_extract(NEW.content_json,'$.manifest.formatVersion') IN (3,4) OR (
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
