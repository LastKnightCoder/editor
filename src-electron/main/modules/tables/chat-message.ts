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
        title TEXT
      )
    `;
    db.exec(createTableSql);
  }

  static upgradeTable(_db: Database.Database) {
    // TODO 升级表结构
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

  static parseChatMessage(chatMessage: any): ChatMessage {
    return {
      id: Number(chatMessage.id),
      createTime: chatMessage.create_time,
      updateTime: chatMessage.update_time,
      title: chatMessage.title,
      messages: JSON.parse(chatMessage.messages),
    };
  }

  static createChatMessage(
    db: Database.Database,
    messages: ChatSessionMessage[],
    title: string,
  ): ChatMessage {
    const stmt = db.prepare(
      "INSERT INTO chat_message (create_time, update_time, title, messages) VALUES (?, ?, ?, ?)",
    );
    const now = Date.now();
    const res = stmt.run(now, now, title, JSON.stringify(messages));
    const createdId = res.lastInsertRowid;
    return this.getChatMessageById(db, createdId);
  }

  static getChatMessageById(
    db: Database.Database,
    id: number | bigint,
  ): ChatMessage {
    const stmt = db.prepare("SELECT * FROM chat_message WHERE id = ?");
    return this.parseChatMessage(stmt.get(id));
  }

  static updateChatMessage(
    db: Database.Database,
    chatMessage: Omit<ChatMessage, "updateTime">,
  ): ChatMessage {
    const { id, title, messages } = chatMessage;
    const stmt = db.prepare(
      "UPDATE chat_message SET update_time = ?, title = ?, messages = ? WHERE id = ?",
    );
    const now = Date.now();
    stmt.run(now, title, JSON.stringify(messages), id);
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
      this.parseChatMessage(chatMessage),
    );
  }
}
