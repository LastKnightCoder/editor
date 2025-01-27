import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { ITimeRecord, TimeRecordGroup } from '@/types';
import Operation from './operation';

export default class TimeRecordTable {
  db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initTables();
    this.initHandlers();
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS time_records (
        id INTEGER PRIMARY KEY NOT NULL,
        date TEXT NOT NULL,
        cost REAL NOT NULL,
        content TEXT NOT NULL,
        event_type TEXT NOT NULL,
        time_type TEXT NOT NULL
      )
    `);
  }

  initHandlers() {
    ipcMain.handle('create-time-record', async (_event, params: Omit<ITimeRecord, 'id'>) => {
      return await this.createTimeRecord(params);
    });

    ipcMain.handle('update-time-record', async (_event, params: ITimeRecord) => {
      return await this.updateTimeRecord(params);
    });

    ipcMain.handle('delete-time-record', async (_event, id: number) => {
      return await this.deleteTimeRecord(id);
    });

    ipcMain.handle('get-all-time-records', async () => {
      return await this.getAllTimeRecords();
    });

    ipcMain.handle('get-time-record-by-id', async (_event, id: number) => {
      return await this.getTimeRecordById(id);
    });

    ipcMain.handle('get-time-records-by-date', async (_event, date: string) => {
      return await this.getTimeRecordsByDate(date);
    });

    ipcMain.handle('get-time-records-by-date-range', async (_event, startDate: string, endDate: string) => {
      return await this.getTimeRecordsByDateRange(startDate, endDate);
    });

    ipcMain.handle('get-all-event-types', async () => {
      return await this.getAllEventTypes();
    });

    ipcMain.handle('get-all-time-types', async () => {
      return await this.getAllTimeTypes();
    });
  }

  parseTimeRecord(record: any): ITimeRecord {
    return {
      ...record,
      content: JSON.parse(record.content),
      eventType: record.event_type,
      timeType: record.time_type
    };
  }

  async createTimeRecord(record: Omit<ITimeRecord, 'id'>): Promise<ITimeRecord> {
    const stmt = this.db.prepare(`
      INSERT INTO time_records (date, cost, content, event_type, time_type)
      VALUES (?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      record.date,
      record.cost,
      JSON.stringify(record.content),
      record.eventType,
      record.timeType
    );

    Operation.insertOperation(this.db, 'time-record', 'insert', res.lastInsertRowid, Date.now());

    return this.getTimeRecordById(Number(res.lastInsertRowid));
  }

  async updateTimeRecord(record: ITimeRecord): Promise<ITimeRecord> {
    const stmt = this.db.prepare(`
      UPDATE time_records SET
        date = ?,
        cost = ?,
        content = ?,
        event_type = ?,
        time_type = ?
      WHERE id = ?
    `);
    stmt.run(
      record.date,
      record.cost,
      JSON.stringify(record.content),
      record.eventType,
      record.timeType,
      record.id
    );

    Operation.insertOperation(this.db, 'time_record', 'update', record.id, Date.now())

    return this.getTimeRecordById(record.id);
  }

  async deleteTimeRecord(id: number): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM time_records WHERE id = ?');
    Operation.insertOperation(this.db, 'time_record', 'delete', id, Date.now());
    return stmt.run(id).changes;
  }

  async getTimeRecordById(id: number): Promise<ITimeRecord> {
    const stmt = this.db.prepare('SELECT * FROM time_records WHERE id = ?');
    const record = stmt.get(id);
    return this.parseTimeRecord(record);
  }

  async getTimeRecordsByDate(date: string): Promise<ITimeRecord[]> {
    const stmt = this.db.prepare('SELECT * FROM time_records WHERE date = ?');
    const records = stmt.all(date);
    return records.map(this.parseTimeRecord);
  }

  async getTimeRecordsByDateRange(startDate: string, endDate: string): Promise<TimeRecordGroup> {
    const stmt = this.db.prepare(`
      SELECT * FROM time_records 
      WHERE date BETWEEN ? AND ?
      ORDER BY date
    `);
    const records = stmt.all(startDate, endDate);

    const grouped: { [date: string]: ITimeRecord[] } = {};
    records.forEach(record => {
      const parsed = this.parseTimeRecord(record);
      if (!grouped[parsed.date]) {
        grouped[parsed.date] = [];
      }
      grouped[parsed.date].push(parsed);
    });

    return Object.entries(grouped).map(([date, timeRecords]) => ({
      date,
      timeRecords
    }));
  }

  async getAllTimeRecords(): Promise<TimeRecordGroup> {
    const stmt = this.db.prepare('SELECT * FROM time_records ORDER BY date');
    const records = stmt.all();

    const grouped: { [date: string]: ITimeRecord[] } = {};
    records.forEach(record => {
      const parsed = this.parseTimeRecord(record);
      if (!grouped[parsed.date]) {
        grouped[parsed.date] = [];
      }
      grouped[parsed.date].push(parsed);
    });

    return Object.entries(grouped).map(([date, timeRecords]) => ({
      date,
      timeRecords
    }));
  }

  async getAllEventTypes(): Promise<string[]> {
    const stmt = this.db.prepare('SELECT DISTINCT event_type FROM time_records');
    const types = stmt.all() as { event_type: string }[];
    return types.map(t => t.event_type);
  }

  async getAllTimeTypes(): Promise<string[]> {
    const stmt = this.db.prepare('SELECT DISTINCT time_type FROM time_records');
    const types = stmt.all() as { time_type: string }[];
    return types.map(t => t.time_type);
  }
}