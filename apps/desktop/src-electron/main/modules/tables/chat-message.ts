import Database from "better-sqlite3";
import { ChatSessionMessage, ChatMessage } from "@/types";

export default class ChatMessageTable {
  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS chat_message (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        messages TEXT,
        title TEXT,
        group_id INTEGER,
        prompt_id INTEGER,
        archived INTEGER DEFAULT 0
      )
    `;
    db.exec(createTableSql);
  }

  static upgradeTable(db: Database.Database) {
    // 检查是否需要添加字段
    const tableInfo = db
      .prepare("PRAGMA table_info(chat_message)")
      .all() as Array<{ name: string }>;
    const hasGroupId = tableInfo.some((col) => col.name === "group_id");
    const hasArchived = tableInfo.some((col) => col.name === "archived");
    const hasPromptId = tableInfo.some((col) => col.name === "prompt_id");
    const hasParentChatId = tableInfo.some(
      (col) => col.name === "parent_chat_id",
    );
    const hasBranchIndex = tableInfo.some((col) => col.name === "branch_index");

    if (!hasGroupId) {
      db.exec("ALTER TABLE chat_message ADD COLUMN group_id INTEGER");
    }

    if (!hasArchived) {
      db.exec("ALTER TABLE chat_message ADD COLUMN archived INTEGER DEFAULT 0");
    }

    if (!hasPromptId) {
      db.exec("ALTER TABLE chat_message ADD COLUMN prompt_id INTEGER");
    }

    if (!hasParentChatId) {
      db.exec("ALTER TABLE chat_message ADD COLUMN parent_chat_id INTEGER");
    }

    if (!hasBranchIndex) {
      db.exec(
        "ALTER TABLE chat_message ADD COLUMN branch_index INTEGER DEFAULT 0",
      );
    }

    // 添加索引
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_chat_message_group_id ON chat_message(group_id)",
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_chat_message_archived ON chat_message(archived)",
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_chat_message_prompt_id ON chat_message(prompt_id)",
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_chat_message_parent_chat_id ON chat_message(parent_chat_id)",
      );
    } catch (e) {
      // 索引可能已存在
    }
  }

  static getListenEvents() {
    return {
      "create-chat-message": this.createChatMessage.bind(this),
      "update-chat-message": this.updateChatMessage.bind(this),
      "delete-chat-message": this.deleteChatMessage.bind(this),
      "get-chat-message-by-id": this.getChatMessageById.bind(this),
      "get-all-chat-messages": this.getAllChatMessages.bind(this),
      "get-chat-branches": this.getBranchesByParentId.bind(this),
      "get-next-branch-index": this.getNextBranchIndex.bind(this),
    };
  }

  static parseChatMessage(chatMessage: {
    id: number;
    create_time: number;
    update_time: number;
    title: string;
    messages: string;
    group_id: number | null;
    archived: number;
    prompt_id: number | null;
    parent_chat_id: number | null;
    branch_index: number | null;
  }): ChatMessage {
    return {
      id: Number(chatMessage.id),
      createTime: chatMessage.create_time,
      updateTime: chatMessage.update_time,
      title: chatMessage.title,
      messages: JSON.parse(chatMessage.messages),
      groupId: chatMessage.group_id,
      archived: Boolean(chatMessage.archived),
      promptId:
        chatMessage.prompt_id !== null ? Number(chatMessage.prompt_id) : null,
      parentChatId:
        chatMessage.parent_chat_id !== null
          ? Number(chatMessage.parent_chat_id)
          : null,
      branchIndex: chatMessage.branch_index ?? 0,
    };
  }

  static createChatMessage(
    db: Database.Database,
    messages: ChatSessionMessage[],
    title: string,
    groupId: number | null | undefined,
    promptId: number | null | undefined,
    parentChatId?: number | null,
    branchIndex?: number,
  ): ChatMessage {
    const stmt = db.prepare(
      "INSERT INTO chat_message (create_time, update_time, title, messages, group_id, prompt_id, archived, parent_chat_id, branch_index) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
    );
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      title,
      JSON.stringify(messages),
      groupId ?? null,
      promptId ?? null,
      parentChatId ?? null,
      branchIndex ?? 0,
    );
    const createdId = res.lastInsertRowid;
    return this.getChatMessageById(db, createdId);
  }

  static getChatMessageById(
    db: Database.Database,
    id: number | bigint,
  ): ChatMessage {
    const stmt = db.prepare("SELECT * FROM chat_message WHERE id = ?");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.parseChatMessage(stmt.get(id) as any);
  }

  static updateChatMessage(
    db: Database.Database,
    chatMessage: Omit<ChatMessage, "updateTime">,
  ): ChatMessage {
    const {
      id,
      title,
      messages,
      groupId,
      archived,
      promptId,
      parentChatId,
      branchIndex,
    } = chatMessage;
    const stmt = db.prepare(
      "UPDATE chat_message SET update_time = ?, title = ?, messages = ?, group_id = ?, prompt_id = ?, archived = ?, parent_chat_id = ?, branch_index = ? WHERE id = ?",
    );
    const now = Date.now();
    stmt.run(
      now,
      title,
      JSON.stringify(messages),
      groupId ?? null,
      promptId ?? null,
      archived ? 1 : 0,
      parentChatId ?? null,
      branchIndex ?? 0,
      id,
    );
    return this.getChatMessageById(db, id);
  }

  static deleteChatMessage(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM chat_message WHERE id = ?");
    return stmt.run(id).changes;
  }

  static getAllChatMessages(db: Database.Database): ChatMessage[] {
    const stmt = db.prepare("SELECT * FROM chat_message");
    const chatMessages = stmt.all();
    return chatMessages.map((chatMessage) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.parseChatMessage(chatMessage as any),
    );
  }

  static getBranchesByParentId(
    db: Database.Database,
    parentChatId: number,
  ): ChatMessage[] {
    const stmt = db.prepare(
      "SELECT * FROM chat_message WHERE parent_chat_id = ? ORDER BY branch_index ASC",
    );
    const chatMessages = stmt.all(parentChatId);
    return chatMessages.map((chatMessage) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.parseChatMessage(chatMessage as any),
    );
  }

  static getNextBranchIndex(
    db: Database.Database,
    parentChatId: number,
  ): number {
    const stmt = db.prepare(
      "SELECT MAX(branch_index) as max_index FROM chat_message WHERE parent_chat_id = ?",
    );
    const result = stmt.get(parentChatId) as { max_index: number | null };
    return (result?.max_index ?? -1) + 1;
  }
}
