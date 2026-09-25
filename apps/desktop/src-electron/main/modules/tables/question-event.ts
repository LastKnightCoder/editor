import Database from "better-sqlite3";
import type { QuestionEvent, QuestionEventPayload, QuestionEventType } from "@/types";

/**
 * 问题的探究轨迹：状态变化、关联 / 解除关联、提出问题由写操作自动记录；
 * note 为用户手动「记一笔」。
 */
export default class QuestionEventTable {
  static upgradeTable(_db: Database.Database) {
    // 表由 main.sql 创建，无增量迁移
  }

  static getListenEvents() {
    return {
      "question:list-events": this.list.bind(this),
      "question:add-note": this.addNote.bind(this),
      "question:delete-event": this.deleteEvent.bind(this),
    } as const;
  }

  static parse(row: any): QuestionEvent {
    let payload: QuestionEventPayload = {};
    try {
      payload = JSON.parse(row.payload || "{}");
    } catch {
      // 损坏的 payload 按空对象展示
    }
    return {
      id: row.id,
      questionId: row.question_id,
      type: row.type,
      payload,
      createTime: row.create_time,
    };
  }

  static log(
    db: Database.Database,
    questionId: number,
    type: QuestionEventType,
    payload: QuestionEventPayload = {},
    createTime = Date.now()
  ): QuestionEvent {
    const res = db
      .prepare(
        `INSERT INTO question_event (question_id, type, payload, create_time) VALUES (?, ?, ?, ?)`
      )
      .run(questionId, type, JSON.stringify(payload), createTime);
    return {
      id: Number(res.lastInsertRowid),
      questionId,
      type,
      payload,
      createTime,
    };
  }

  static list(db: Database.Database, questionId: number): QuestionEvent[] {
    return (
      db
        .prepare(
          `SELECT * FROM question_event WHERE question_id = ? ORDER BY create_time ASC, id ASC`
        )
        .all(questionId) as any[]
    ).map(row => this.parse(row));
  }

  /** 每个问题最近一条事件 */
  static latestByQuestionIds(
    db: Database.Database,
    questionIds: number[]
  ): Map<number, QuestionEvent> {
    const map = new Map<number, QuestionEvent>();
    if (!questionIds.length) return map;
    const placeholders = questionIds.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT e.* FROM question_event e
         WHERE e.question_id IN (${placeholders})
           AND e.id = (SELECT e2.id FROM question_event e2 WHERE e2.question_id = e.question_id
                       ORDER BY e2.create_time DESC, e2.id DESC LIMIT 1)`
      )
      .all(...questionIds) as any[];
    rows.forEach(row => map.set(row.question_id, this.parse(row)));
    return map;
  }

  static addNote(db: Database.Database, questionId: number, text: string): QuestionEvent {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("记录内容不能为空");
    const now = Date.now();
    db.prepare(`UPDATE questions SET update_time = ? WHERE id = ?`).run(now, questionId);
    return this.log(db, questionId, "note", { text: trimmed }, now);
  }

  static deleteEvent(db: Database.Database, eventId: number): number {
    return db.prepare(`DELETE FROM question_event WHERE id = ?`).run(eventId).changes;
  }

  static deleteByQuestion(db: Database.Database, questionId: number) {
    db.prepare(`DELETE FROM question_event WHERE question_id = ?`).run(questionId);
  }
}
