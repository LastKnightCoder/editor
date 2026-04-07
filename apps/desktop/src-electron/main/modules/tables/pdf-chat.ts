import Database from "better-sqlite3";
import type { CreatePdfChat, UpdatePdfChat, PdfChatMessage } from "@/types";
import Operation from "./operation";

interface PdfChatRecord {
  id: number;
  pdf_id: number;
  create_time: number;
  update_time: number;
  messages: string;
  title: string;
  archived: number;
  parent_chat_id: number | null;
  branch_index: number;
}

export default class PdfChatTable {
  static upgradeTable(_db: Database.Database) {
    // 预留升级逻辑
  }

  static getListenEvents() {
    return {
      "pdf-chat:create": this.createChat.bind(this),
      "pdf-chat:update": this.updateChat.bind(this),
      "pdf-chat:delete": this.deleteChat.bind(this),
      "pdf-chat:get": this.getChatById.bind(this),
      "pdf-chat:list-by-pdf-id": this.getChatsByPdfId.bind(this),
      "pdf-chat:get-branches": this.getBranchesByParentId.bind(this),
      "pdf-chat:get-next-branch-index": this.getNextBranchIndex.bind(this),
      "pdf-chat:get-child-branches-count":
        this.getChildBranchesCount.bind(this),
    };
  }

  static parseChat(record: PdfChatRecord): PdfChatMessage {
    return {
      id: record.id,
      pdfId: record.pdf_id,
      createTime: record.create_time,
      updateTime: record.update_time,
      messages: JSON.parse(record.messages || "[]"),
      title: record.title || "新对话",
      archived: Boolean(record.archived),
      parentChatId: record.parent_chat_id,
      branchIndex: record.branch_index ?? 0,
    };
  }

  static createChat(
    db: Database.Database,
    params: CreatePdfChat,
  ): PdfChatMessage {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO pdf_chats
      (pdf_id, create_time, update_time, messages, title, archived, parent_chat_id, branch_index)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `);
    const getNextBranchIndexStmt = db.prepare(`
      SELECT COALESCE(MAX(branch_index), -1) + 1 AS next_index
      FROM pdf_chats
      WHERE parent_chat_id = ?
    `);

    const tx = db.transaction(() => {
      const branchIndex =
        params.parentChatId != null && params.branchIndex == null
          ? Number(
              (
                getNextBranchIndexStmt.get(params.parentChatId) as {
                  next_index?: number | null;
                }
              )?.next_index ?? 0,
            )
          : (params.branchIndex ?? 0);

      const res = stmt.run(
        params.pdfId,
        now,
        now,
        JSON.stringify(params.messages),
        params.title || "新对话",
        params.parentChatId ?? null,
        branchIndex,
      );

      const chatId = Number(res.lastInsertRowid);
      Operation.insertOperation(db, "pdf-chat", "insert", chatId, now);
      return chatId;
    });

    const chatId = tx();

    const chat = this.getChatById(db, chatId);
    if (!chat) {
      throw new Error(`Failed to retrieve created pdf chat: ${chatId}`);
    }
    return chat;
  }

  static updateChat(
    db: Database.Database,
    params: UpdatePdfChat,
  ): PdfChatMessage | null {
    const existing = this.getChatById(db, params.id);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE pdf_chats SET
        update_time = ?,
        messages = ?,
        title = ?,
        archived = ?,
        parent_chat_id = ?,
        branch_index = ?
      WHERE id = ?
    `);

    stmt.run(
      now,
      JSON.stringify(params.messages ?? existing.messages),
      params.title ?? existing.title,
      params.archived !== undefined
        ? params.archived
          ? 1
          : 0
        : existing.archived
          ? 1
          : 0,
      params.parentChatId !== undefined
        ? params.parentChatId
        : existing.parentChatId,
      params.branchIndex ?? existing.branchIndex ?? 0,
      params.id,
    );

    Operation.insertOperation(db, "pdf-chat", "update", params.id, now);
    return this.getChatById(db, params.id);
  }

  static getAllChildBranches(
    db: Database.Database,
    parentChatId: number,
  ): number[] {
    const stmt = db.prepare(`
      WITH RECURSIVE child_branches(id) AS (
        SELECT id FROM pdf_chats WHERE parent_chat_id = ?
        UNION ALL
        SELECT c.id FROM pdf_chats c
        JOIN child_branches cb ON c.parent_chat_id = cb.id
      )
      SELECT id FROM child_branches
    `);
    const result = stmt.all(parentChatId) as Array<{ id: number }>;
    return result.map((row) => row.id);
  }

  static getChildBranchesCount(
    db: Database.Database,
    parentChatId: number,
  ): number {
    return this.getAllChildBranches(db, parentChatId).length;
  }

  static deleteChat(db: Database.Database, id: number): boolean {
    const childIds = this.getAllChildBranches(db, id);
    if (childIds.length > 0) {
      const placeholders = childIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM pdf_chats WHERE id IN (${placeholders})`).run(
        ...childIds,
      );
      const now = Date.now();
      for (const childId of childIds) {
        Operation.insertOperation(db, "pdf-chat", "delete", childId, now);
      }
    }

    const res = db.prepare("DELETE FROM pdf_chats WHERE id = ?").run(id);
    if (res.changes > 0) {
      Operation.insertOperation(db, "pdf-chat", "delete", id, Date.now());
      return true;
    }
    return false;
  }

  static getChatById(db: Database.Database, id: number): PdfChatMessage | null {
    const record = db
      .prepare("SELECT * FROM pdf_chats WHERE id = ?")
      .get(id) as PdfChatRecord | undefined;
    if (!record) {
      return null;
    }
    return this.parseChat(record);
  }

  static getChatsByPdfId(
    db: Database.Database,
    pdfId: number,
  ): PdfChatMessage[] {
    const records = db
      .prepare(
        "SELECT * FROM pdf_chats WHERE pdf_id = ? ORDER BY update_time DESC",
      )
      .all(pdfId) as PdfChatRecord[];
    return records.map((record) => this.parseChat(record));
  }

  static getBranchesByParentId(
    db: Database.Database,
    parentChatId: number,
  ): PdfChatMessage[] {
    const records = db
      .prepare(
        "SELECT * FROM pdf_chats WHERE parent_chat_id = ? ORDER BY branch_index ASC",
      )
      .all(parentChatId) as PdfChatRecord[];
    return records.map((record) => this.parseChat(record));
  }

  static getNextBranchIndex(
    db: Database.Database,
    parentChatId: number,
  ): number {
    const result = db
      .prepare(
        "SELECT MAX(branch_index) as max_index FROM pdf_chats WHERE parent_chat_id = ?",
      )
      .get(parentChatId) as { max_index: number | null };
    return (result?.max_index ?? -1) + 1;
  }
}
