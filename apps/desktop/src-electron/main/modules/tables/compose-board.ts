/**
 * 创作模式素材板（主库 compose_boards）：一份正文一页白板画布。
 *
 * 只建 white_board_contents 一页、不建 white_boards 行，所以不出现在任何白板列表（同项目白板条目）。
 * 按 contents.id 绑定：共用正文的身份（文章、项目文档…）共享同一块。正文真正删除时由
 * ContentTable.deleteContent 同事务释放；旧端删除正文漏释放的，连库对账清孤儿。
 */

import type Database from "better-sqlite3";
import type { ComposeBoard } from "@/types/compose";
import WhiteBoardContentTable from "./white-board-content";

interface RawRow {
  content_id: number;
  page_id: number;
  intent: string;
  dismissed: string;
  create_time: number;
  update_time: number;
}

const PAGE_NAME = "创作白板";
const EMPTY_PAGE = {
  children: [],
  viewPort: { zoom: 1, minX: 0, minY: 0, width: 0, height: 0 },
  selection: { selectArea: null, selectedElements: [] },
  presentationSequences: [],
};

function parseDismissed(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(item => typeof item === "string") : [];
  } catch {
    return [];
  }
}

const toBoard = (row: RawRow): ComposeBoard => ({
  contentId: row.content_id,
  pageId: row.page_id,
  intent: row.intent,
  dismissed: parseDismissed(row.dismissed),
  createTime: row.create_time,
  updateTime: row.update_time,
});

const contentIdOf = (raw: unknown) => {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("正文 id 无效");
  return id;
};

export default class ComposeBoardTable {
  static getListenEvents() {
    return {
      "compose-board:get": this.get.bind(this),
      "compose-board:ensure": this.ensure.bind(this),
      "compose-board:set-intent": this.setIntent.bind(this),
      "compose-board:dismiss": this.dismiss.bind(this),
    } as const;
  }

  static get(db: Database.Database, contentId: number): ComposeBoard | null {
    const row = db
      .prepare(`SELECT * FROM compose_boards WHERE content_id = ?`)
      .get(contentIdOf(contentId)) as RawRow | undefined;
    return row ? toBoard(row) : null;
  }

  /** 第一次进入创作模式时建板；已有则原样返回（意图不覆盖） */
  static ensure(db: Database.Database, contentId: number, intent = ""): ComposeBoard {
    const id = contentIdOf(contentId);
    const existing = this.get(db, id);
    if (existing) return existing;
    if (!db.prepare(`SELECT 1 FROM contents WHERE id = ?`).get(id)) throw new Error("正文不存在");
    const page = WhiteBoardContentTable.createWhiteboardContent(db, {
      name: PAGE_NAME,
      imgUrl: "",
      data: EMPTY_PAGE as never,
    });
    const now = Date.now();
    db.prepare(
      `INSERT INTO compose_boards (content_id, page_id, intent, dismissed, create_time, update_time)
       VALUES (?, ?, ?, '[]', ?, ?)`
    ).run(id, page.id, String(intent ?? "").trim(), now, now);
    return this.get(db, id)!;
  }

  static setIntent(db: Database.Database, contentId: number, intent: string): ComposeBoard | null {
    db.prepare(`UPDATE compose_boards SET intent = ?, update_time = ? WHERE content_id = ?`).run(
      String(intent ?? "").trim(),
      Date.now(),
      contentIdOf(contentId)
    );
    return this.get(db, contentId);
  }

  /** 记下用户移走的召集资料；重复的只记一次 */
  static dismiss(db: Database.Database, contentId: number, keys: string[]): ComposeBoard | null {
    const board = this.get(db, contentId);
    if (!board) return null;
    const next = [...new Set([...board.dismissed, ...keys.filter(key => typeof key === "string")])];
    db.prepare(`UPDATE compose_boards SET dismissed = ?, update_time = ? WHERE content_id = ?`).run(
      JSON.stringify(next),
      Date.now(),
      board.contentId
    );
    return this.get(db, contentId);
  }

  /** 正文删除（引用归零）时释放素材板：删绑定并对页减计数（启动时清理，撤销可恢复） */
  static releaseContent(db: Database.Database, contentId: number): void {
    const row = db
      .prepare(`SELECT page_id FROM compose_boards WHERE content_id = ?`)
      .get(contentId) as { page_id: number } | undefined;
    if (!row) return;
    db.prepare(`DELETE FROM compose_boards WHERE content_id = ?`).run(contentId);
    WhiteBoardContentTable.deleteWhiteboard(db, row.page_id);
  }

  /** 页 id → 绑定的正文；脉络「被使用」归属素材板用 */
  static contentIdsOfPages(db: Database.Database, pageIds: number[]): Map<number, number> {
    if (pageIds.length === 0) return new Map();
    const rows = db
      .prepare(
        `SELECT content_id, page_id FROM compose_boards WHERE page_id IN (${pageIds.map(() => "?").join(",")})`
      )
      .all(...pageIds) as Array<{ content_id: number; page_id: number }>;
    return new Map(rows.map(row => [row.page_id, row.content_id]));
  }

  /** 正文已不存在的绑定（旧端删除正文时没有释放）：一并释放 */
  static removeOrphans(db: Database.Database): number {
    const orphans = db
      .prepare(
        `SELECT content_id FROM compose_boards WHERE content_id NOT IN (SELECT id FROM contents)`
      )
      .all() as Array<{ content_id: number }>;
    if (orphans.length === 0) return 0;
    db.transaction(() => {
      for (const { content_id } of orphans) this.releaseContent(db, content_id);
    })();
    return orphans.length;
  }
}
