-- 本机协作文档、视图、草稿与白板提交记录，不进入主库同步。
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
-- Agent 对正文的逐条建议：对话卡片与正文痕迹共读，状态只经主进程条件更新。
-- kind=edit 为改动（mode=direct 是有直接改权限时实时落地的记录），kind=question 为锚在原文上的提问。
CREATE TABLE IF NOT EXISTS content_suggestions (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, content_id INTEGER NOT NULL,
        document_id TEXT NOT NULL, baseline_id TEXT NOT NULL, epoch INTEGER NOT NULL,
        proposal_id TEXT NOT NULL, conversation_key TEXT NOT NULL, agent_id TEXT, agent_label TEXT,
        sequence INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'edit', mode TEXT NOT NULL DEFAULT 'suggest',
        edit TEXT NOT NULL, contracts TEXT, before_text TEXT NOT NULL, after_text TEXT NOT NULL,
        reason TEXT, options TEXT,
        status TEXT NOT NULL, inverse TEXT, feedback TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
CREATE INDEX IF NOT EXISTS content_suggestions_content ON content_suggestions(workspace_id,content_id,status);
CREATE INDEX IF NOT EXISTS content_suggestions_proposal ON content_suggestions(proposal_id);
-- 每个 Agent（按职责名）在每篇正文上的权限：readonly / suggest / direct；没有记录即 suggest。
CREATE TABLE IF NOT EXISTS content_agent_permissions (
        workspace_id TEXT NOT NULL, content_id INTEGER NOT NULL, agent TEXT NOT NULL,
        level TEXT NOT NULL, updated_at INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, content_id, agent)
      );
