import Database from "better-sqlite3";
import {
  VLChatMessage,
  CreateVLChat,
  UpdateVLChat,
} from "@/types/vibe-learning";
import {
  CHAT_MESSAGE_SCHEMA_VERSION,
  migrateChatSessionMessages,
} from "@/services/chatMessageSchema";
import Operation from "./operation";
import log from "electron-log";

interface VLChatRecord {
  id: number;
  project_id: number;
  create_time: number;
  update_time: number;
  messages: string;
  title: string;
  archived: number;
  parent_chat_id: number | null;
  branch_index: number;
  message_schema_version?: number | null;
}

/**
 * Vibe Learning 对话表
 * 存储项目关联的对话记录
 */
export default class VibeLearningChatTable {
  static upgradeTable(db: Database.Database) {
    const tableInfo = db
      .prepare("PRAGMA table_info(vibe_learning_chats)")
      .all() as Array<{ name: string }>;
    const hasMessageSchemaVersion = tableInfo.some(
      (col) => col.name === "message_schema_version",
    );
    if (!hasMessageSchemaVersion) {
      db.exec(
        "ALTER TABLE vibe_learning_chats ADD COLUMN message_schema_version INTEGER DEFAULT 1",
      );
    }
    db.exec(
      "UPDATE vibe_learning_chats SET message_schema_version = 1 WHERE message_schema_version IS NULL",
    );
  }

  static getListenEvents() {
    return {
      "vl-create-chat": this.createChat.bind(this),
      "vl-update-chat": this.updateChat.bind(this),
      "vl-delete-chat": this.deleteChat.bind(this),
      "vl-get-chat": this.getChatById.bind(this),
      "vl-get-chats-by-project": this.getChatsByProjectId.bind(this),
      "vl-get-chat-branches": this.getBranchesByParentId.bind(this),
      "vl-get-next-branch-index": this.getNextBranchIndex.bind(this),
      "vl-get-child-branches-count": this.getChildBranchesCount.bind(this),
    };
  }

  /**
   * 解析数据库记录为 VLChatMessage 对象
   */
  static parseChat(record: VLChatRecord): {
    chat: VLChatMessage;
    migrated: boolean;
  } {
    const storedSchemaVersion =
      typeof record.message_schema_version === "number"
        ? record.message_schema_version
        : CHAT_MESSAGE_SCHEMA_VERSION;
    const migration = migrateChatSessionMessages(
      JSON.parse(record.messages || "[]"),
    );
    return {
      chat: {
        id: record.id,
        projectId: record.project_id,
        createTime: record.create_time,
        updateTime: record.update_time,
        messages: migration.messages,
        messageSchemaVersion: CHAT_MESSAGE_SCHEMA_VERSION,
        title: record.title || "新对话",
        archived: Boolean(record.archived),
        parentChatId: record.parent_chat_id,
        branchIndex: record.branch_index ?? 0,
      },
      migrated:
        migration.changed ||
        storedSchemaVersion !== CHAT_MESSAGE_SCHEMA_VERSION,
    };
  }

  static persistMigratedMessages(
    db: Database.Database,
    id: number,
    messages: CreateVLChat["messages"],
  ) {
    db.prepare(
      "UPDATE vibe_learning_chats SET messages = ?, message_schema_version = ? WHERE id = ?",
    ).run(JSON.stringify(messages), CHAT_MESSAGE_SCHEMA_VERSION, id);
  }

  /**
   * 创建对话
   */
  static createChat(
    db: Database.Database,
    params: CreateVLChat,
  ): VLChatMessage {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO vibe_learning_chats
      (project_id, create_time, update_time, messages, title, archived, parent_chat_id, branch_index, message_schema_version)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
    `);

    const migration = migrateChatSessionMessages(params.messages);
    const res = stmt.run(
      params.projectId,
      now,
      now,
      JSON.stringify(migration.messages),
      params.title || "新对话",
      params.parentChatId ?? null,
      params.branchIndex ?? 0,
      CHAT_MESSAGE_SCHEMA_VERSION,
    );

    const chatId = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "vibe-learning-chat", "insert", chatId, now);

    log.info(
      `[VibeLearningChat] Created chat: ${chatId} for project ${params.projectId}`,
    );

    const chat = this.getChatById(db, chatId);
    if (!chat) {
      throw new Error(`Failed to retrieve created chat: ${chatId}`);
    }
    return chat;
  }

  /**
   * 更新对话
   */
  static updateChat(
    db: Database.Database,
    params: UpdateVLChat,
  ): VLChatMessage | null {
    const existing = this.getChatById(db, params.id);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE vibe_learning_chats SET
        update_time = ?,
        messages = ?,
        title = ?,
        archived = ?,
        parent_chat_id = ?,
        branch_index = ?,
        message_schema_version = ?
      WHERE id = ?
    `);

    const migration = migrateChatSessionMessages(
      params.messages ?? existing.messages,
    );
    stmt.run(
      now,
      JSON.stringify(migration.messages),
      params.title ?? existing.title,
      params.archived !== undefined
        ? params.archived
          ? 1
          : 0
        : existing.archived
          ? 1
          : 0,
      params.parentChatId !== undefined
        ? params.parentChatId
        : existing.parentChatId,
      params.branchIndex ?? existing.branchIndex ?? 0,
      CHAT_MESSAGE_SCHEMA_VERSION,
      params.id,
    );

    Operation.insertOperation(
      db,
      "vibe-learning-chat",
      "update",
      params.id,
      now,
    );

    return this.getChatById(db, params.id);
  }

  /**
   * 获取所有子分支的 ID（递归）
   */
  static getAllChildBranches(
    db: Database.Database,
    parentChatId: number,
  ): number[] {
    const stmt = db.prepare(`
      WITH RECURSIVE child_branches(id) AS (
        SELECT id FROM vibe_learning_chats WHERE parent_chat_id = ?
        UNION ALL
        SELECT vlc.id FROM vibe_learning_chats vlc
        JOIN child_branches cb ON vlc.parent_chat_id = cb.id
      )
      SELECT id FROM child_branches
    `);
    const result = stmt.all(parentChatId) as Array<{ id: number }>;
    return result.map((row) => row.id);
  }

  /**
   * 获取子分支数量（包括所有层级的子分支）
   */
  static getChildBranchesCount(
    db: Database.Database,
    parentChatId: number,
  ): number {
    const childIds = this.getAllChildBranches(db, parentChatId);
    return childIds.length;
  }

  /**
   * 删除对话（级联删除所有子分支）
   */
  static deleteChat(db: Database.Database, id: number): boolean {
    // 先获取所有子分支的 ID
    const childIds = this.getAllChildBranches(db, id);

    // 删除所有子分支
    if (childIds.length > 0) {
      const placeholders = childIds.map(() => "?").join(",");
      const deleteChildrenStmt = db.prepare(
        `DELETE FROM vibe_learning_chats WHERE id IN (${placeholders})`,
      );
      deleteChildrenStmt.run(...childIds);

      // 记录子分支的删除操作
      const now = Date.now();
      for (const childId of childIds) {
        Operation.insertOperation(
          db,
          "vibe-learning-chat",
          "delete",
          childId,
          now,
        );
      }
      log.info(
        `[VibeLearningChat] Deleted ${childIds.length} child branches of chat: ${id}`,
      );
    }

    // 删除父对话本身
    const stmt = db.prepare("DELETE FROM vibe_learning_chats WHERE id = ?");
    const res = stmt.run(id);

    if (res.changes > 0) {
      Operation.insertOperation(
        db,
        "vibe-learning-chat",
        "delete",
        id,
        Date.now(),
      );
      log.info(`[VibeLearningChat] Deleted chat: ${id}`);
      return true;
    }

    return false;
  }

  /**
   * 删除项目下的所有对话
   */
  static deleteChatsByProjectId(
    db: Database.Database,
    projectId: number,
  ): number {
    const chats = this.getChatsByProjectId(db, projectId);
    let deletedCount = 0;

    for (const chat of chats) {
      if (this.deleteChat(db, chat.id)) {
        deletedCount++;
      }
    }

    log.info(
      `[VibeLearningChat] Deleted ${deletedCount} chats for project ${projectId}`,
    );
    return deletedCount;
  }

  /**
   * 根据 ID 获取对话
   */
  static getChatById(db: Database.Database, id: number): VLChatMessage | null {
    const stmt = db.prepare("SELECT * FROM vibe_learning_chats WHERE id = ?");
    const record = stmt.get(id) as VLChatRecord | undefined;

    if (!record) {
      return null;
    }

    const parsed = this.parseChat(record);
    if (parsed.migrated) {
      this.persistMigratedMessages(db, parsed.chat.id, parsed.chat.messages);
    }
    return parsed.chat;
  }

  /**
   * 根据项目 ID 获取所有对话
   */
  static getChatsByProjectId(
    db: Database.Database,
    projectId: number,
  ): VLChatMessage[] {
    const stmt = db.prepare(
      "SELECT * FROM vibe_learning_chats WHERE project_id = ? ORDER BY update_time DESC",
    );
    const records = stmt.all(projectId) as VLChatRecord[];

    return records.map((record) => {
      const parsed = this.parseChat(record);
      if (parsed.migrated) {
        this.persistMigratedMessages(db, parsed.chat.id, parsed.chat.messages);
      }
      return parsed.chat;
    });
  }

  /**
   * 根据父对话 ID 获取分支
   */
  static getBranchesByParentId(
    db: Database.Database,
    parentChatId: number,
  ): VLChatMessage[] {
    const stmt = db.prepare(
      "SELECT * FROM vibe_learning_chats WHERE parent_chat_id = ? ORDER BY branch_index ASC",
    );
    const records = stmt.all(parentChatId) as VLChatRecord[];

    return records.map((record) => {
      const parsed = this.parseChat(record);
      if (parsed.migrated) {
        this.persistMigratedMessages(db, parsed.chat.id, parsed.chat.messages);
      }
      return parsed.chat;
    });
  }

  /**
   * 获取下一个分支索引
   */
  static getNextBranchIndex(
    db: Database.Database,
    parentChatId: number,
  ): number {
    const stmt = db.prepare(
      "SELECT MAX(branch_index) as max_index FROM vibe_learning_chats WHERE parent_chat_id = ?",
    );
    const result = stmt.get(parentChatId) as { max_index: number | null };
    return (result?.max_index ?? -1) + 1;
  }
}
