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
