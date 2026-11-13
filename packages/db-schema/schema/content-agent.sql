-- 本机正文 Agent 的审阅记录与权限，不进入资料库同步。
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
