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
        archived INTEGER DEFAULT 0
      )
    `;
    db.exec(createTableSql);
  }

  static upgradeTable(db: Database.Database) {
    // 检查是否需要添加 group_id 字段
    const tableInfo = db
      .prepare("PRAGMA table_info(chat_message)")
      .all() as Array<{ name: string }>;
    const hasGroupId = tableInfo.some((col) => col.name === "group_id");
    const hasArchived = tableInfo.some((col) => col.name === "archived");

    if (!hasGroupId) {
      db.exec("ALTER TABLE chat_message ADD COLUMN group_id INTEGER");
    }

    if (!hasArchived) {
      db.exec("ALTER TABLE chat_message ADD COLUMN archived INTEGER DEFAULT 0");
    }

    // 添加索引
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_chat_message_group_id ON chat_message(group_id)",
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_chat_message_archived ON chat_message(archived)",
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
  }): ChatMessage {
    return {
      id: Number(chatMessage.id),
      createTime: chatMessage.create_time,
      updateTime: chatMessage.update_time,
      title: chatMessage.title,
      messages: JSON.parse(chatMessage.messages),
      groupId: chatMessage.group_id,
      archived: Boolean(chatMessage.archived),
    };
  }

  static createChatMessage(
    db: Database.Database,
    messages: ChatSessionMessage[],
    title: string,
    groupId: number | null | undefined,
  ): ChatMessage {
    const stmt = db.prepare(
      "INSERT INTO chat_message (create_time, update_time, title, messages, group_id, archived) VALUES (?, ?, ?, ?, ?, 0)",
    );
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      title,
      JSON.stringify(messages),
      groupId ?? null,
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
    const { id, title, messages, groupId, archived } = chatMessage;
    const stmt = db.prepare(
      "UPDATE chat_message SET update_time = ?, title = ?, messages = ?, group_id = ?, archived = ? WHERE id = ?",
    );
    const now = Date.now();
    stmt.run(
      now,
      title,
      JSON.stringify(messages),
      groupId ?? null,
      archived ? 1 : 0,
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
}
