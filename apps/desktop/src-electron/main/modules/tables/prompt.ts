import Database from "better-sqlite3";
import { Prompt, CreatePromptPayload, UpdatePromptPayload } from "@/types";

export default class PromptTable {
  static upgradeTable(db: Database.Database) {
    const tableInfo = db.prepare("PRAGMA table_info(prompt)").all() as Array<{
      name: string;
    }>;
    const columns = tableInfo.map((col) => col.name);

    if (!columns.includes("tags")) {
      db.exec("ALTER TABLE prompt ADD COLUMN tags TEXT");
    }

    if (!columns.includes("content")) {
      db.exec("ALTER TABLE prompt ADD COLUMN content TEXT NOT NULL DEFAULT ''");
    }
  }

  static getListenEvents() {
    return {
      "prompt:list": this.listPrompts.bind(this),
      "prompt:create": this.createPrompt.bind(this),
      "prompt:update": this.updatePrompt.bind(this),
      "prompt:delete": this.deletePrompt.bind(this),
      "prompt:get": this.getPromptById.bind(this),
    };
  }

  static parsePrompt(row: any): Prompt {
    return {
      id: Number(row.id),
      name: row.name,
      tags: row.tags ? JSON.parse(row.tags) : [],
      content: row.content,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static listPrompts(db: Database.Database): Prompt[] {
    const stmt = db.prepare(
      "SELECT * FROM prompt ORDER BY update_time DESC, id DESC",
    );
    const rows = stmt.all();
    return rows.map((row) => this.parsePrompt(row));
  }

  static getPromptById(
    db: Database.Database,
    id: number | bigint,
  ): Prompt | null {
    const stmt = db.prepare("SELECT * FROM prompt WHERE id = ?");
    const row = stmt.get(id);
    return row ? this.parsePrompt(row) : null;
  }

  static createPrompt(
    db: Database.Database,
    payload: CreatePromptPayload,
  ): Prompt {
    const now = Date.now();
    const stmt = db.prepare(
      "INSERT INTO prompt (name, tags, content, create_time, update_time) VALUES (?, ?, ?, ?, ?)",
    );
    const res = stmt.run(
      payload.name,
      JSON.stringify(payload.tags ?? []),
      payload.content,
      now,
      now,
    );
    const createdId = res.lastInsertRowid;
    const createdRow = db
      .prepare("SELECT * FROM prompt WHERE id = ?")
      .get(createdId);
    return this.parsePrompt(createdRow);
  }

  static updatePrompt(
    db: Database.Database,
    payload: UpdatePromptPayload,
  ): Prompt {
    const current = db
      .prepare("SELECT * FROM prompt WHERE id = ?")
      .get(payload.id) as
      | {
          name: string;
          tags: string | null;
          content: string;
        }
      | undefined;
    if (!current) {
      throw new Error("Prompt not found");
    }

    const now = Date.now();
    const stmt = db.prepare(
      "UPDATE prompt SET name = ?, tags = ?, content = ?, update_time = ? WHERE id = ?",
    );
    stmt.run(
      payload.name ?? current.name,
      JSON.stringify(payload.tags ?? JSON.parse(current.tags || "[]")),
      payload.content ?? current.content,
      now,
      payload.id,
    );

    const updatedRow = db
      .prepare("SELECT * FROM prompt WHERE id = ?")
      .get(payload.id);
    return this.parsePrompt(updatedRow);
  }

  static deletePrompt(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM prompt WHERE id = ?");
    return stmt.run(id).changes;
  }
}
