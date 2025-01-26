import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { Message, ChatMessage } from '@/types';

export default class ChatMessageTable {
  db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;

    this.initTable();

    console.log('init chat message table');

    ipcMain.handle('create-chat-message', async (_event, params) => {
      return await this.createChatMessage(params.messages, params.title);
    });

    ipcMain.handle('get-chat-message-by-id', async (_event, id) => {
      return await this.getChatMessageById(id);
    });

    ipcMain.handle('update-chat-message', async (_event, params) => {
      return await this.updateChatMessage(params);
    });

    ipcMain.handle('delete-chat-message', async (_event, id) => {
      return await this.deleteChatMessage(id);
    });

    ipcMain.handle('get-all-chat-messages', async () => {
      return await this.getAllChatMessages();
    });
  }

  initTable() {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS chat_message (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        messages TEXT,
        title TEXT
      )
    `;
    this.db.exec(createTableSql);
  }

  parseChatMessage(chatMessage: any): ChatMessage {
    return {
      id: Number(chatMessage.id),
      createTime: chatMessage.create_time,
      updateTime: chatMessage.update_time,
      title: chatMessage.title,
      messages: JSON.parse(chatMessage.messages)
    };
  }

  async createChatMessage(messages: Message[], title: string): Promise<ChatMessage> {
    const stmt = this.db.prepare(
      'INSERT INTO chat_message (create_time, update_time, title, messages) VALUES (?, ?, ?, ?)'
    );
    const now = Date.now();
    const res = stmt.run(now, now, title, JSON.stringify(messages));
    const createdId = res.lastInsertRowid;
    return await this.getChatMessageById(createdId);
  }

  async getChatMessageById(id: number | bigint): Promise<ChatMessage> {
    const stmt = this.db.prepare('SELECT * FROM chat_message WHERE id = ?');
    return this.parseChatMessage(stmt.get(id));
  }

  async updateChatMessage(chatMessage: Omit<ChatMessage, 'updateTime'>): Promise<ChatMessage> {
    const { id, title, messages } = chatMessage;
    const stmt = this.db.prepare(
      'UPDATE chat_message SET update_time = ?, title = ?, messages = ? WHERE id = ?'
    );
    const now = Date.now();
    stmt.run(now, title, JSON.stringify(messages), id);
    return await this.getChatMessageById(id);
  }

  async deleteChatMessage(id: number): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM chat_message WHERE id = ?');
    return stmt.run(id).changes;
  }

  async getAllChatMessages(): Promise<ChatMessage[]> {
    const stmt = this.db.prepare('SELECT * FROM chat_message');
    const chatMessages = stmt.all();
    return chatMessages.map(chatMessage => this.parseChatMessage(chatMessage));
  }
}