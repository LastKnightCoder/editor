import Database from "better-sqlite3";
import {
  IArticle,
  ICard,
  IDocumentItem,
  Operation,
  ProjectItem,
} from "@/types";
import dayjs from "dayjs";
import CardTable from "./card.ts";
import ArticleTable from "./article.ts";
import ProjectTable from "./project.ts";
import DocumentTable from "./document.ts";

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
    this.deleteInValidOperations(db);
  }

  static upgradeTable(_db: Database.Database) {
    // 暂无升级
  }

  static getListenEvents() {
    return {
      "create-operation": this.createOperation.bind(this),
      "get-operation-records-by-year":
        this.getOperationRecordsByYear.bind(this),
      "delete-invalid-operations": this.deleteInValidOperations.bind(this),
      "get-latest-operations": this.getLatestOperations.bind(this),
    };
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

  static createOperation(
    db: Database.Database,
    operation: Omit<Operation, "id">,
  ): Operation {
    const {
      operation_time,
      operation_id,
      operation_content_type,
      operation_action,
    } = operation;
    const stmt = db.prepare(`
      INSERT INTO operation (operation_time, operation_id, operation_content_type, operation_action)
      VALUES (?, ?, ?, ?)
    `);
    const res = stmt.run(
      operation_time,
      operation_id,
      operation_content_type,
      operation_action,
    );
    return this.getOperationById(db, Number(res.lastInsertRowid));
  }

  static getOperationById(db: Database.Database, id: number): Operation {
    const stmt = db.prepare("SELECT * FROM operation WHERE id = ?");
    const operation = stmt.get(id);
    return this.parseOperation(operation);
  }

  static getOperationRecordsByYear(
    db: Database.Database,
    year: number,
  ): Array<{
    time: string;
    operation_list: Operation[];
  }> {
    const stmt = db.prepare(`
      SELECT * FROM operation
      WHERE operation_time >= ? AND operation_time < ?
      ORDER BY operation_time DESC 
    `);
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);
    const res = stmt
      .all(startOfYear.getTime(), endOfYear.getTime())
      .map(this.parseOperation);

    const returnValue = [];
    for (const item of res) {
      const date = dayjs(item.operation_time).format("YYYY-MM-DD");
      const index = returnValue.findIndex((item) => item.time === date);
      if (index === -1) {
        returnValue.push({
          time: date,
          operation_list: [item],
        });
      } else {
        if (
          returnValue[index].operation_list.every(
            (op) => op.operation_id !== item.operation_id,
          )
        ) {
          returnValue[index].operation_list.push(item);
        }
      }
    }

    return returnValue;
  }

  static insertOperation(
    db: Database.Database,
    operationContentType: string,
    operationAction: string,
    operationId: number | bigint,
    operationTime: number,
  ) {
    const stmt = db.prepare(
      `INSERT INTO operation (operation_content_type, operation_action, operation_id, operation_time) VALUES (?, ?, ?, ?)`,
    );
    stmt.run(operationContentType, operationAction, operationId, operationTime);
  }

  static deleteOperation(db: Database.Database, operationId: number) {
    const stmt = db.prepare(`DELETE FROM operation WHERE id = ?`);
    stmt.run(operationId);
  }

  static deleteInValidOperations(db: Database.Database) {
    const operations = db
      .prepare(`SELECT * FROM operation`)
      .all() as Operation[];
    const operationMap = new Map<string, Operation[]>();
    // 按照时间分组，在一天的为一组
    for (const operation of operations) {
      const date = dayjs(operation.operation_time).format("YYYY-MM-DD");
      if (operationMap.has(date)) {
        operationMap.get(date)?.push(operation);
      } else {
        operationMap.set(date, [operation]);
      }
    }

    for (const operations of operationMap.values()) {
      const deleteIds = this.uniqueContinuousOperations(operations);
      for (const id of deleteIds) {
        this.deleteOperation(db, id);
      }
    }
  }

  // unique operation
  static uniqueContinuousOperations(operations: Operation[]): number[] {
    // 如果连续的两个 operation_type, operation_action, operation_id 操作时间间隔小于三分钟，则合并
    const operationsGroup: Array<Operation[]> = [];
    // 首先将连续 operation_type, operation_action, operation_id 操作时间间隔小于三分钟的操作分到一个组中
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      if (i === 0) {
        operationsGroup.push([operation]);
      } else {
        const lastOperation = operations[i - 1];
        if (
          lastOperation.operation_content_type ===
            operation.operation_content_type &&
          lastOperation.operation_action === operation.operation_action &&
          lastOperation.operation_id === operation.operation_id &&
          // 三分钟以内认为是连续编辑
          operation.operation_time - lastOperation.operation_time <
            3 * 60 * 1000
        ) {
          operationsGroup[operationsGroup.length - 1].push(operation);
        } else {
          operationsGroup.push([operation]);
        }
      }
    }

    const deleteIds: number[] = [];
    for (const ops of operationsGroup) {
      // 只保留第一个和最后一个 op，其他的合并
      deleteIds.push(...ops.slice(1, -1).map((op) => op.id));
    }

    return deleteIds;
  }

  static getLatestOperationByContentType(
    db: Database.Database,
    contentType: string,
    number: number,
  ): number[] {
    const deleteOperationIds = db
      .prepare(
        `
      SELECT DISTINCT operation_id FROM operation
      WHERE operation_action = 'delete' AND operation_content_type = ?
    `,
      )
      .all(contentType)
      .map((item: any) => item.operation_id) as number[];

    const placeholders = deleteOperationIds.map(() => "?").join(",");

    const stmt = db.prepare(`
      SELECT DISTINCT operation_id FROM operation
      WHERE operation_content_type = ? AND operation_id NOT IN (${placeholders})
      ORDER BY operation_time DESC
      LIMIT ?
    `);
    return stmt
      .all(contentType, deleteOperationIds, number)
      .map((item: any) => item.operation_id);
  }

  static getLatestOperations(
    db: Database.Database,
    number: number,
  ): {
    cards: ICard[];
    articles: IArticle[];
    projectItems: ProjectItem[];
    documentItems: IDocumentItem[];
  } {
    const cardIds = this.getLatestOperationByContentType(db, "card", number);
    const cards = CardTable.getCardByIds(db, cardIds);

    const articleIds = this.getLatestOperationByContentType(
      db,
      "article",
      number,
    );
    const articles = ArticleTable.getArticleByIds(db, articleIds);

    const projectItemIds = this.getLatestOperationByContentType(
      db,
      "project_item",
      number,
    );
    const projectItems = ProjectTable.getProjectItemsByIds(db, projectItemIds);

    const documentItemIds = this.getLatestOperationByContentType(
      db,
      "document-item",
      number,
    );
    const documentItems = DocumentTable.getDocumentItemsByIds(
      db,
      documentItemIds,
    );

    return {
      cards: cards.sort((a, b) => b.update_time - a.update_time),
      articles: articles.sort((a, b) => b.update_time - a.update_time),
      projectItems: projectItems.sort((a, b) => b.updateTime - a.updateTime),
      documentItems: documentItems.sort((a, b) => b.updateTime - a.updateTime),
    };
  }
}
