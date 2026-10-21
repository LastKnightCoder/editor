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
CREATE INDEX IF NOT EXISTS idx_plugin_entities_created ON plugin_entities(plugin_id, kind, create_time, id);

-- 插件声明的内容类型外观（类型名与图标 SVG）：随库保存，插件停用、卸载宽限期内与其他设备上照样显示
CREATE TABLE IF NOT EXISTS plugin_entity_kinds (
  plugin_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  update_time INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, kind)
);

-- 插件私有存储（context.storage）：按插件与键保存 JSON，随主库云同步
CREATE TABLE IF NOT EXISTS plugin_kv (
  plugin_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  update_time INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, key)
);

-- 用户在插件选择窗口中亲手选过的内容：插件此后读取这些引用的标题不需要读取权限；
-- target_created_at 是选择时目标的创建时间，编号被新内容复用时授权不会落到新内容上
CREATE TABLE IF NOT EXISTS plugin_ref_grants (
  plugin_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  target_created_at INTEGER NOT NULL,
  create_time INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, kind, ref_id)
);
