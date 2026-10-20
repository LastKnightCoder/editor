-- 插件对业务数据的可恢复操作：删除前的快照或待办撤销凭据，宽限期内可由用户在插件详情页恢复
CREATE TABLE IF NOT EXISTS plugin_operations (
  id INTEGER PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL,
  create_time INTEGER NOT NULL,
  restored_time INTEGER
);
CREATE INDEX IF NOT EXISTS idx_plugin_operations_plugin ON plugin_operations(plugin_id, create_time);

-- 插件自建的业务对象：持有一份正文引用，作为搜索、@ 与反链的实体单位；
-- 插件目录不在时记 orphaned_time，超过宽限期才删除，期间重新安装即恢复
CREATE TABLE IF NOT EXISTS plugin_entities (
  id INTEGER PRIMARY KEY,
  plugin_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content_id INTEGER NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  create_time INTEGER NOT NULL,
  update_time INTEGER NOT NULL,
  orphaned_time INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_entities_key ON plugin_entities(plugin_id, kind, key);
CREATE INDEX IF NOT EXISTS idx_plugin_entities_content ON plugin_entities(content_id);
