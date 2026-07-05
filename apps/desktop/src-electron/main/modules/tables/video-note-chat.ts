import Database from "better-sqlite3";
import log from "electron-log";
import type {
  CreateVideoNoteChat,
  UpdateVideoNoteChat,
  VideoNoteChatMessage,
} from "@/types";
import {
  CHAT_MESSAGE_SCHEMA_VERSION,
  migrateChatSessionMessages,
} from "@/services/chatMessageSchema";
import Operation from "./operation";

interface VideoNoteChatRecord {
  id: number;
  video_note_id: number;
  create_time: number;
  update_time: number;
  messages: string;
  title: string;
  archived: number;
  parent_chat_id: number | null;
  branch_index: number;
  message_schema_version?: number | null;
  agent_type?: string | null;
  agent_session_id?: string | null;
}

export default class VideoNoteChatTable {
  static upgradeTable(db: Database.Database) {
    const tableInfo = db
      .prepare("PRAGMA table_info(video_note_chats)")
      .all() as Array<{ name: string }>;
    const hasMessageSchemaVersion = tableInfo.some(
      (col) => col.name === "message_schema_version",
    );
    const hasAgentType = tableInfo.some((col) => col.name === "agent_type");
    const hasAgentSessionId = tableInfo.some(
      (col) => col.name === "agent_session_id",
    );
    if (!hasMessageSchemaVersion) {
      db.exec(
        "ALTER TABLE video_note_chats ADD COLUMN message_schema_version INTEGER DEFAULT 1",
      );
    }
    if (!hasAgentType) {
      db.exec(
        "ALTER TABLE video_note_chats ADD COLUMN agent_type TEXT DEFAULT 'local'",
      );
      db.exec(
        "UPDATE video_note_chats SET agent_type = 'local' WHERE agent_type IS NULL",
      );
    }
    if (!hasAgentSessionId) {
      db.exec("ALTER TABLE video_note_chats ADD COLUMN agent_session_id TEXT");
    }
    db.exec(
      "UPDATE video_note_chats SET message_schema_version = 1 WHERE message_schema_version IS NULL",
    );
  }

  static getListenEvents() {
    return {
      "video-note-chat:create": this.createChat.bind(this),
      "video-note-chat:update": this.updateChat.bind(this),
      "video-note-chat:delete": this.deleteChat.bind(this),
      "video-note-chat:get": this.getChatById.bind(this),
      "video-note-chat:list-by-video-note-id":
        this.getChatsByVideoNoteId.bind(this),
      "video-note-chat:get-branches": this.getBranchesByParentId.bind(this),
      "video-note-chat:get-next-branch-index":
        this.getNextBranchIndex.bind(this),
      "video-note-chat:get-child-branches-count":
        this.getChildBranchesCount.bind(this),
    };
  }

  static parseChat(record: VideoNoteChatRecord): {
    chat: VideoNoteChatMessage;
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
        videoNoteId: record.video_note_id,
        createTime: record.create_time,
        updateTime: record.update_time,
        messages: migration.messages,
        messageSchemaVersion: CHAT_MESSAGE_SCHEMA_VERSION,
        title: record.title || "新对话",
        archived: Boolean(record.archived),
        parentChatId: record.parent_chat_id,
        branchIndex: record.branch_index ?? 0,
        agentType: record.agent_type === "codex" ? "codex" : "local",
        agentSessionId: record.agent_session_id ?? null,
      },
      migrated:
        migration.changed ||
        storedSchemaVersion !== CHAT_MESSAGE_SCHEMA_VERSION,
    };
  }

  static persistMigratedMessages(
    db: Database.Database,
    id: number,
    messages: CreateVideoNoteChat["messages"],
  ) {
    db.prepare(
      "UPDATE video_note_chats SET messages = ?, message_schema_version = ? WHERE id = ?",
    ).run(JSON.stringify(messages), CHAT_MESSAGE_SCHEMA_VERSION, id);
  }

  static createChat(
    db: Database.Database,
    params: CreateVideoNoteChat,
  ): VideoNoteChatMessage {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO video_note_chats
      (video_note_id, create_time, update_time, messages, title, archived, parent_chat_id, branch_index, message_schema_version, agent_type, agent_session_id)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `);

    const migration = migrateChatSessionMessages(params.messages);
    const res = stmt.run(
      params.videoNoteId,
      now,
      now,
      JSON.stringify(migration.messages),
      params.title || "新对话",
      params.parentChatId ?? null,
      params.branchIndex ?? 0,
      CHAT_MESSAGE_SCHEMA_VERSION,
      params.agentType ?? "local",
      params.agentSessionId ?? null,
    );

    const chatId = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "video-note-chat", "insert", chatId, now);

    const chat = this.getChatById(db, chatId);
    if (!chat) {
      throw new Error(`Failed to retrieve created chat: ${chatId}`);
    }
    return chat;
  }

  static updateChat(
    db: Database.Database,
    params: UpdateVideoNoteChat,
  ): VideoNoteChatMessage | null {
    const existing = this.getChatById(db, params.id);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE video_note_chats SET
        update_time = ?,
        messages = ?,
        title = ?,
        archived = ?,
        parent_chat_id = ?,
        branch_index = ?,
        message_schema_version = ?,
        agent_type = ?,
        agent_session_id = ?
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
      params.agentType ?? existing.agentType ?? "local",
      params.agentSessionId !== undefined
        ? params.agentSessionId
        : (existing.agentSessionId ?? null),
      params.id,
    );

    Operation.insertOperation(db, "video-note-chat", "update", params.id, now);
    return this.getChatById(db, params.id);
  }

  static getAllChildBranches(
    db: Database.Database,
    parentChatId: number,
  ): number[] {
    const stmt = db.prepare(`
      WITH RECURSIVE child_branches(id) AS (
        SELECT id FROM video_note_chats WHERE parent_chat_id = ?
        UNION ALL
        SELECT c.id FROM video_note_chats c
        JOIN child_branches cb ON c.parent_chat_id = cb.id
      )
      SELECT id FROM child_branches
    `);
    const result = stmt.all(parentChatId) as Array<{ id: number }>;
    return result.map((row) => row.id);
  }

  static getChildBranchesCount(
    db: Database.Database,
    parentChatId: number,
  ): number {
    return this.getAllChildBranches(db, parentChatId).length;
  }

  static deleteChat(db: Database.Database, id: number): boolean {
    const childIds = this.getAllChildBranches(db, id);

    if (childIds.length > 0) {
      const placeholders = childIds.map(() => "?").join(",");
      db.prepare(
        `DELETE FROM video_note_chats WHERE id IN (${placeholders})`,
      ).run(...childIds);
      const now = Date.now();
      for (const childId of childIds) {
        Operation.insertOperation(
          db,
          "video-note-chat",
          "delete",
          childId,
          now,
        );
      }
    }

    const stmt = db.prepare("DELETE FROM video_note_chats WHERE id = ?");
    const res = stmt.run(id);
    if (res.changes > 0) {
      Operation.insertOperation(
        db,
        "video-note-chat",
        "delete",
        id,
        Date.now(),
      );
      return true;
    }
    return false;
  }

  static deleteChatsByVideoNoteId(
    db: Database.Database,
    videoNoteId: number,
  ): number {
    const chats = this.getChatsByVideoNoteId(db, videoNoteId);
    let deletedCount = 0;
    for (const chat of chats) {
      if (this.deleteChat(db, chat.id)) {
        deletedCount += 1;
      }
    }
    log.info(
      `[VideoNoteChat] Deleted ${deletedCount} chats for video note ${videoNoteId}`,
    );
    return deletedCount;
  }

  static getChatById(
    db: Database.Database,
    id: number,
  ): VideoNoteChatMessage | null {
    const stmt = db.prepare("SELECT * FROM video_note_chats WHERE id = ?");
    const record = stmt.get(id) as VideoNoteChatRecord | undefined;
    if (!record) {
      return null;
    }
    const parsed = this.parseChat(record);
    if (parsed.migrated) {
      this.persistMigratedMessages(db, parsed.chat.id, parsed.chat.messages);
    }
    return parsed.chat;
  }

  static getChatsByVideoNoteId(
    db: Database.Database,
    videoNoteId: number,
  ): VideoNoteChatMessage[] {
    const stmt = db.prepare(
      "SELECT * FROM video_note_chats WHERE video_note_id = ? ORDER BY update_time DESC",
    );
    const records = stmt.all(videoNoteId) as VideoNoteChatRecord[];
    return records.map((record) => {
      const parsed = this.parseChat(record);
      if (parsed.migrated) {
        this.persistMigratedMessages(db, parsed.chat.id, parsed.chat.messages);
      }
      return parsed.chat;
    });
  }

  static getBranchesByParentId(
    db: Database.Database,
    parentChatId: number,
  ): VideoNoteChatMessage[] {
    const stmt = db.prepare(
      "SELECT * FROM video_note_chats WHERE parent_chat_id = ? ORDER BY branch_index ASC",
    );
    const records = stmt.all(parentChatId) as VideoNoteChatRecord[];
    return records.map((record) => {
      const parsed = this.parseChat(record);
      if (parsed.migrated) {
        this.persistMigratedMessages(db, parsed.chat.id, parsed.chat.messages);
      }
      return parsed.chat;
    });
  }

  static getNextBranchIndex(
    db: Database.Database,
    parentChatId: number,
  ): number {
    const stmt = db.prepare(
      "SELECT MAX(branch_index) as max_index FROM video_note_chats WHERE parent_chat_id = ?",
    );
    const result = stmt.get(parentChatId) as { max_index: number | null };
    return (result?.max_index ?? -1) + 1;
  }
}
