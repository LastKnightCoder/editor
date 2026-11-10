import type Database from "better-sqlite3";
import { basename } from "node:path";
import {
  CONTENT_AGENT_PERMISSIONS_CHANGED,
  type AgentPermissionLevel,
  type ContentAgentPermission,
} from "@/types/content-suggestion";
import { ContentIdentityTable } from "../tables/content-identity";
import { broadcastDatabaseChange } from "../database-notifications";

const LEVELS: readonly AgentPermissionLevel[] = ["readonly", "suggest", "direct"];
const workspaceOf = (db: Database.Database) => basename(db.name, ".db");
function documentKey(db: Database.Database, contentId: number) {
  const library = ContentIdentityTable.library(db);
  const row = db
    .prepare("SELECT document_id FROM content_documents WHERE content_id=?")
    .get(contentId) as { document_id: string } | undefined;
  return library && row ? JSON.stringify([library.sourceId, row.document_id]) : undefined;
}

/**
 * 每个 Agent（按职责名）在每篇正文上的权限，与真人协作者的「可查看 / 可评论 / 可编辑」同一心智。
 * 没有记录即「建议」；改回「建议」时删除记录。存在本机协作缓存，不随资料库同步。
 */
export class AgentPermissionStore {
  constructor(private readonly db: Database.Database) {}

  list(db: Database.Database, contentId: number): ContentAgentPermission[] {
    const key = documentKey(db, contentId);
    if (!key) return [];
    return (
      this.db
        .prepare(
          "SELECT agent,level,updated_at AS updatedAt FROM content_agent_permissions WHERE workspace_id=? AND content_id=? ORDER BY updated_at"
        )
        .all(key, contentId) as ContentAgentPermission[]
    ).filter(row => LEVELS.includes(row.level));
  }

  level(db: Database.Database, contentId: number, agent: string): AgentPermissionLevel {
    const key = documentKey(db, contentId);
    if (!key) return "suggest";
    const row = this.db
      .prepare(
        "SELECT level FROM content_agent_permissions WHERE workspace_id=? AND content_id=? AND agent=?"
      )
      .get(key, contentId, agent) as { level: AgentPermissionLevel } | undefined;
    return row && LEVELS.includes(row.level) ? row.level : "suggest";
  }

  set(db: Database.Database, contentId: number, agent: string, level: AgentPermissionLevel) {
    if (!LEVELS.includes(level)) throw new Error("权限档位无效");
    if (!agent.trim()) throw new Error("Agent 名称不能为空");
    const key = documentKey(db, contentId);
    if (!key) throw new Error("正文身份尚未就绪，请重新打开正文");
    if (level === "suggest")
      this.db
        .prepare(
          "DELETE FROM content_agent_permissions WHERE workspace_id=? AND content_id=? AND agent=?"
        )
        .run(key, contentId, agent);
    else
      this.db
        .prepare(
          `INSERT INTO content_agent_permissions (workspace_id,content_id,agent,level,updated_at) VALUES (?,?,?,?,?)
           ON CONFLICT(workspace_id,content_id,agent) DO UPDATE SET level=excluded.level,updated_at=excluded.updated_at`
        )
        .run(key, contentId, agent, level, Date.now());
    broadcastDatabaseChange(CONTENT_AGENT_PERMISSIONS_CHANGED, workspaceOf(db), { contentId });
  }
}
