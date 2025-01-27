import Database from 'better-sqlite3';
import { WhiteBoard } from '@/types';
import Operation from './operation';

export default class WhiteboardTable {

  static initTable(db: Database.Database) {
    db.exec(`
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

  static getListenEvents() {
    return {
      'create-white-board': this.createWhiteboard.bind(this),
      'delete-white-board': this.deleteWhiteboard.bind(this),
      'get-white-board-by-id': this.getWhiteboard.bind(this),
      'get-all-white-boards': this.getAllWhiteboards.bind(this),
      'update-white-board': this.updateWhiteboard.bind(this),
    }
  }

  static parseWhiteboard(whiteboard: any): WhiteBoard {
    return {
      ...whiteboard,
      data: JSON.parse(whiteboard.data),
      tags: JSON.parse(whiteboard.tags),
      createTime: whiteboard.create_time,
      updateTime: whiteboard.update_time
    };
  }

  static async createWhiteboard(db: Database.Database, whiteboard: Omit<WhiteBoard, 'id' | 'createTime' | 'updateTime'>): Promise<WhiteBoard> {
    const stmt = db.prepare(`
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

    Operation.insertOperation(db, 'whiteboard', 'insert', res.lastInsertRowid, now);

    return this.getWhiteboard(db, Number(res.lastInsertRowid));
  }

  static async updateWhiteboard(db: Database.Database, whiteboard: Omit<WhiteBoard, 'createTime' | 'updateTime'>): Promise<WhiteBoard> {
    const stmt = db.prepare(`
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

    Operation.insertOperation(db, 'whiteboard', 'update', whiteboard.id, now);

    return this.getWhiteboard(db, whiteboard.id);
  }

  static async deleteWhiteboard(db: Database.Database, id: number): Promise<number> {
    const stmt = db.prepare('DELETE FROM white_boards WHERE id = ?');

    Operation.insertOperation(db, 'whiteboard', 'delete', id, Date.now());

    return stmt.run(id).changes;
  }

  static async getWhiteboard(db: Database.Database, id: number): Promise<WhiteBoard> {
    const stmt = db.prepare('SELECT * FROM white_boards WHERE id = ?');
    const whiteboard = stmt.get(id);
    return this.parseWhiteboard(whiteboard);
  }

  static async getAllWhiteboards(db: Database.Database,): Promise<WhiteBoard[]> {
    const stmt = db.prepare('SELECT * FROM white_boards');
    const whiteboards = stmt.all();
    return whiteboards.map(wb => this.parseWhiteboard(wb));
  }
}