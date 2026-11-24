-- 公开资料与失效标记同事务更新；下载与喜欢统计按缓存有效期刷新。
CREATE TABLE catalog_revision (
  id INTEGER PRIMARY KEY CHECK(id=1),
  revision INTEGER NOT NULL
);
INSERT INTO catalog_revision VALUES(1,1);
CREATE INDEX releases_catalog_scan ON releases(state,id);

CREATE TRIGGER catalog_release_insert AFTER INSERT ON releases
WHEN NEW.state='published' BEGIN
  UPDATE catalog_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER catalog_release_update AFTER UPDATE ON releases
WHEN OLD.state='published' OR NEW.state='published' BEGIN
  UPDATE catalog_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER catalog_release_delete AFTER DELETE ON releases
WHEN OLD.state='published' BEGIN
  UPDATE catalog_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER catalog_plugin_insert AFTER INSERT ON plugins BEGIN
  UPDATE catalog_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER catalog_plugin_update AFTER UPDATE ON plugins BEGIN
  UPDATE catalog_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER catalog_plugin_delete AFTER DELETE ON plugins BEGIN
  UPDATE catalog_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER catalog_publisher_update AFTER UPDATE OF login,avatar_url ON publishers
WHEN OLD.login IS NOT NEW.login OR OLD.avatar_url IS NOT NEW.avatar_url BEGIN
  UPDATE catalog_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER catalog_target_insert AFTER INSERT ON release_targets BEGIN
  UPDATE catalog_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER catalog_target_update AFTER UPDATE ON release_targets BEGIN
  UPDATE catalog_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER catalog_target_delete AFTER DELETE ON release_targets BEGIN
  UPDATE catalog_revision SET revision=revision+1 WHERE id=1;
END;
