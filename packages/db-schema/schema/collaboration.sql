-- 本机协作文档、视图、草稿与恢复日志，不进入主库同步。
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, metadata TEXT NOT NULL, state BLOB NOT NULL, state_hash TEXT);
      CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY, document_id TEXT NOT NULL, state BLOB NOT NULL, hash TEXT);
      CREATE INDEX IF NOT EXISTS updates_document ON updates(document_id);
      CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, path TEXT NOT NULL, uploaded INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS node_views (
        workspace_id TEXT NOT NULL, document_id TEXT NOT NULL, node_id TEXT NOT NULL, owner TEXT NOT NULL,
        value TEXT NOT NULL, revision TEXT NOT NULL, PRIMARY KEY(workspace_id,document_id,node_id,owner)
      );
      CREATE TABLE IF NOT EXISTS entity_holds (
        workspace_id TEXT NOT NULL, holder TEXT NOT NULL, reason TEXT NOT NULL,
        source_id TEXT NOT NULL, entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL,
        PRIMARY KEY(workspace_id,holder,source_id,entity_kind,entity_id)
      );
      CREATE INDEX IF NOT EXISTS entity_holds_target ON entity_holds(workspace_id,source_id,entity_kind,entity_id);
      CREATE TABLE IF NOT EXISTS recoveries (id TEXT PRIMARY KEY, manifest_hash TEXT NOT NULL, manifest_path TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS migrations (operation_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, document_id TEXT NOT NULL, record TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS migrations_document ON migrations(document_id);
      CREATE INDEX IF NOT EXISTS migrations_pending ON migrations(workspace_id,document_id) WHERE json_extract(record,'$.phase') NOT IN ('PREPARING','COMPLETE','ABORTED','EXPIRED');
      CREATE TABLE IF NOT EXISTS input_drafts (
        workspace_id TEXT NOT NULL, document_id TEXT NOT NULL, baseline_id TEXT NOT NULL, epoch INTEGER NOT NULL,
        view_id TEXT NOT NULL, node_id TEXT NOT NULL, field TEXT NOT NULL, value TEXT NOT NULL, revision TEXT NOT NULL,
        sequence INTEGER NOT NULL, applied INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
        PRIMARY KEY(view_id,node_id,field)
      );
      CREATE INDEX IF NOT EXISTS input_drafts_document ON input_drafts(document_id,baseline_id,epoch,applied);
      CREATE TABLE IF NOT EXISTS document_drafts (
        view_id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,document_id TEXT NOT NULL,baseline_id TEXT NOT NULL,epoch INTEGER NOT NULL,
        state BLOB NOT NULL,digest TEXT NOT NULL,sequence INTEGER NOT NULL,applied INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS document_drafts_document ON document_drafts(document_id,baseline_id,epoch,applied);
CREATE UNIQUE INDEX IF NOT EXISTS updates_hash ON updates(document_id,hash) WHERE hash IS NOT NULL;
