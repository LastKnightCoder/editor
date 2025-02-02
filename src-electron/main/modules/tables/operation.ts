import Database from 'better-sqlite3';
import { Operation } from '@/types';
import dayjs from 'dayjs';

export default class OperationTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS operation (
        id INTEGER PRIMARY KEY,
        operation_time INTEGER NOT NULL,
        operation_id INTEGER,
        operation_content_type TEXT,
        operation_action TEXT
      )
    `);
  }

  static upgradeTable(db: Database.Database) {
    // 暂无升级
  }

  static getListenEvents() {
    return {
      'create-operation': this.createOperation.bind(this),
      'get-operation-records-by-year': this.getOperationRecordsByYear.bind(this),
    }
  }

  static parseOperation(operation: any) {
    return {
      ...operation,
      operationTime: operation.operation_time,
      operationId: operation.operation_id,
      operationContentType: operation.operation_content_type,
      operationAction: operation.operation_action,
    };
  }

  static async createOperation(db: Database.Database, operation: Omit<Operation, 'id'>): Promise<Operation> {
    const { operation_time, operation_id, operation_content_type, operation_action } = operation;
    const stmt = db.prepare(`
      INSERT INTO operation (operation_time, operation_id, operation_content_type, operation_action)
      VALUES (?, ?, ?, ?)
    `);
    const res = stmt.run(
      operation_time,
      operation_id,
      operation_content_type,
      operation_action
    );
    return this.getOperationById(db, Number(res.lastInsertRowid));
  }

  static async getOperationById(db: Database.Database, id: number): Promise<Operation> {
    const stmt = db.prepare('SELECT * FROM operation WHERE id = ?');
    const operation = stmt.get(id);
    return this.parseOperation(operation);
  }

  static async getOperationRecordsByYear(db: Database.Database, year: number): Promise<Array<{
    time: string;
    operation_list: Operation[];
  }>> {
    const stmt = db.prepare(`
      SELECT * FROM operation
      WHERE operation_time >= ? AND operation_time < ?
      ORDER BY operation_time DESC 
    `);
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);
    const res = stmt.all(startOfYear.getTime(), endOfYear.getTime()).map(this.parseOperation);

    const returnValue = [];
    for (const item of res) {
      const date = dayjs(item.operation_time).format('YYYY-MM-DD');
      const index = returnValue.findIndex(item => item.time === date);
      if (index === -1) {
        returnValue.push({
          time: date,
          operation_list: [item]
        });
      } else {
        returnValue[index].operation_list.push(item);
      }
    }

    return returnValue;
  }

  static insertOperation(db: Database.Database, operationContentType: string, operationAction: string, operationId: number | bigint, operationTime: number) {
    const stmt = db.prepare(`INSERT INTO operation (operation_content_type, operation_action, operation_id, operation_time) VALUES (?, ?, ?, ?)`);
    stmt.run(operationContentType, operationAction, operationId, operationTime);
  }
}