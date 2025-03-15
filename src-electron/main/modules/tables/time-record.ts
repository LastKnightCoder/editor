import Database from "better-sqlite3";
import { ITimeRecord, TimeRecordGroup } from "@/types";
import Operation from "./operation";

export default class TimeRecordTable {
  static initTable(db: Database.Database) {
    db.exec(`
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

  static upgradeTable(_db: Database.Database) {
    // 暂无升级
  }

  static getListenEvents() {
    return {
      "create-time-record": this.createTimeRecord.bind(this),
      "update-time-record": this.updateTimeRecord.bind(this),
      "delete-time-record": this.deleteTimeRecord.bind(this),
      "get-time-record-by-id": this.getTimeRecordById.bind(this),
      "get-all-time-records": this.getAllTimeRecords.bind(this),
      "get-time-records-by-date": this.getTimeRecordsByDate.bind(this),
      "get-time-records-by-date-range":
        this.getTimeRecordsByDateRange.bind(this),
      "get-all-event-types": this.getAllEventTypes.bind(this),
      "get-all-time-types": this.getAllTimeTypes.bind(this),
    };
  }

  static parseTimeRecord(record: any): ITimeRecord {
    return {
      ...record,
      content: JSON.parse(record.content),
      eventType: record.event_type,
      timeType: record.time_type,
    };
  }

  static createTimeRecord(
    db: Database.Database,
    record: Omit<ITimeRecord, "id">,
  ): ITimeRecord {
    const stmt = db.prepare(`
      INSERT INTO time_records (date, cost, content, event_type, time_type)
      VALUES (?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      record.date,
      record.cost,
      JSON.stringify(record.content),
      record.eventType,
      record.timeType,
    );

    Operation.insertOperation(
      db,
      "time-record",
      "insert",
      res.lastInsertRowid,
      Date.now(),
    );

    return this.getTimeRecordById(db, Number(res.lastInsertRowid));
  }

  static updateTimeRecord(
    db: Database.Database,
    record: ITimeRecord,
  ): ITimeRecord {
    const stmt = db.prepare(`
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
      record.id,
    );

    Operation.insertOperation(
      db,
      "time_record",
      "update",
      record.id,
      Date.now(),
    );

    return this.getTimeRecordById(db, record.id);
  }

  static deleteTimeRecord(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM time_records WHERE id = ?");
    Operation.insertOperation(db, "time_record", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  static getTimeRecordById(db: Database.Database, id: number): ITimeRecord {
    const stmt = db.prepare("SELECT * FROM time_records WHERE id = ?");
    const record = stmt.get(id);
    return this.parseTimeRecord(record);
  }

  static getTimeRecordsByDate(
    db: Database.Database,
    date: string,
  ): ITimeRecord[] {
    const stmt = db.prepare("SELECT * FROM time_records WHERE date = ?");
    const records = stmt.all(date);
    return records.map(this.parseTimeRecord);
  }

  static getTimeRecordsByDateRange(
    db: Database.Database,
    startDate: string,
    endDate: string,
  ): TimeRecordGroup {
    const stmt = db.prepare(`
      SELECT * FROM time_records 
      WHERE date BETWEEN ? AND ?
      ORDER BY date
    `);
    const records = stmt.all(startDate, endDate);

    const grouped: { [date: string]: ITimeRecord[] } = {};
    records.forEach((record) => {
      const parsed = this.parseTimeRecord(record);
      if (!grouped[parsed.date]) {
        grouped[parsed.date] = [];
      }
      grouped[parsed.date].push(parsed);
    });

    return Object.entries(grouped).map(([date, timeRecords]) => ({
      date,
      timeRecords,
    }));
  }

  static getAllTimeRecords(db: Database.Database): TimeRecordGroup {
    const stmt = db.prepare("SELECT * FROM time_records ORDER BY date");
    const records = stmt.all();

    const grouped: { [date: string]: ITimeRecord[] } = {};
    records.forEach((record) => {
      const parsed = this.parseTimeRecord(record);
      if (!grouped[parsed.date]) {
        grouped[parsed.date] = [];
      }
      grouped[parsed.date].push(parsed);
    });

    return Object.entries(grouped).map(([date, timeRecords]) => ({
      date,
      timeRecords,
    }));
  }

  static getAllEventTypes(db: Database.Database): string[] {
    const stmt = db.prepare("SELECT DISTINCT event_type FROM time_records");
    const types = stmt.all() as { event_type: string }[];
    return types.map((t) => t.event_type);
  }

  static getAllTimeTypes(db: Database.Database): string[] {
    const stmt = db.prepare("SELECT DISTINCT time_type FROM time_records");
    const types = stmt.all() as { time_type: string }[];
    return types.map((t) => t.time_type);
  }

  static getTimeRecordsByEventType(
    db: Database.Database,
    eventType: string,
  ): ITimeRecord[] {
    const stmt = db.prepare(`
      SELECT * FROM time_records 
      WHERE event_type = ?
      ORDER BY date
    `);
    const records = stmt.all(eventType);

    return records.map(this.parseTimeRecord);
  }

  static getTimeRecordsByTimeType(
    db: Database.Database,
    timeType: string,
  ): ITimeRecord[] {
    const stmt = db.prepare(`
      SELECT * FROM time_records 
      WHERE time_type = ?
      ORDER BY date
    `);
    const records = stmt.all(timeType);

    return records.map(this.parseTimeRecord);
  }

  static getTimeRecordsByEventTypeAndTimeType(
    db: Database.Database,
    eventType: string,
    timeType: string,
  ): ITimeRecord[] {
    const stmt = db.prepare(`
      SELECT * FROM time_records 
      WHERE event_type = ? AND time_type = ?
      ORDER BY date
    `);
    const records = stmt.all(eventType, timeType);

    return records.map(this.parseTimeRecord);
  }
}
