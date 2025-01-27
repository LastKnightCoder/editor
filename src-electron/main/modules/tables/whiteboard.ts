import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { WhiteBoard } from '@/types';
import Operation from './operation';

export default class WhiteboardTable {
  db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initTables();
    this.initHandlers();
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS white_boards (
        id INTEGER PRIMARY KEY NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        tags TEXT,
        data TEXT,
        title TEXT,
        description TEXT,
        snapshot TEXT
      )
    `);
  }

  initHandlers() {
    ipcMain.handle('create-white-board', async (_event, whiteBoard: Omit<WhiteBoard, 'id' | 'createTime' | 'updateTime'>) => {
      return await this.createWhiteboard(whiteBoard);
    });

    ipcMain.handle('update-white-board', async (_event, whiteBoard: Omit<WhiteBoard, 'createTime' | 'updateTime'>) => {
      return await this.updateWhiteboard(whiteBoard);
    });

    ipcMain.handle('delete-white-board', async (_event, id: number) => {
      return await this.deleteWhiteboard(id);
    });

    ipcMain.handle('get-white-board-by-id', async (_event, id: number) => {
      return await this.getWhiteboard(id);
    });

    ipcMain.handle('get-all-white-boards', async () => {
      return await this.getAllWhiteboards();
    });
  }

  parseWhiteboard(whiteboard: any): WhiteBoard {
    return {
      ...whiteboard,
      data: JSON.parse(whiteboard.data),
      tags: JSON.parse(whiteboard.tags),
      createTime: whiteboard.create_time,
      updateTime: whiteboard.update_time
    };
  }

  async createWhiteboard(whiteboard: Omit<WhiteBoard, 'id' | 'createTime' | 'updateTime'>): Promise<WhiteBoard> {
    const stmt = this.db.prepare(`
      INSERT INTO white_boards
      (title, description, data, create_time, update_time, snapshot)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      whiteboard.title,
      whiteboard.description,
      JSON.stringify(whiteboard.data),
      now,
      now,
      Number(whiteboard.snapshot)
    );

    Operation.insertOperation(this.db, 'whiteboard', 'insert', res.lastInsertRowid, now);

    return this.getWhiteboard(Number(res.lastInsertRowid));
  }

  async updateWhiteboard(whiteboard: Omit<WhiteBoard, 'createTime' | 'updateTime'>): Promise<WhiteBoard> {
    const stmt = this.db.prepare(`
      UPDATE white_boards SET
        title = ?,
        description = ?,
        tags = ?,
        data = ?,
        update_time = ?,
        snapshot = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      whiteboard.title,
      whiteboard.description,
      JSON.stringify(whiteboard.tags),
      JSON.stringify(whiteboard.data),
      now,
      Number(whiteboard.snapshot),
      whiteboard.id
    );

    Operation.insertOperation(this.db, 'whiteboard', 'update', whiteboard.id, now);

    return this.getWhiteboard(whiteboard.id);
  }

  async deleteWhiteboard(id: number): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM white_boards WHERE id = ?');

    Operation.insertOperation(this.db, 'whiteboard', 'delete', id, Date.now());

    return stmt.run(id).changes;
  }

  async getWhiteboard(id: number): Promise<WhiteBoard> {
    const stmt = this.db.prepare('SELECT * FROM white_boards WHERE id = ?');
    const whiteboard = stmt.get(id);
    return this.parseWhiteboard(whiteboard);
  }

  async getAllWhiteboards(): Promise<WhiteBoard[]> {
    const stmt = this.db.prepare('SELECT * FROM white_boards');
    const whiteboards = stmt.all();
    return whiteboards.map(wb => this.parseWhiteboard(wb));
  }
}