import {
  createEmptyWhiteboardDocument,
  isEmptyWhiteboardPage,
  hasWhiteboardLibraryBaseline,
} from "../whiteboard-documents/create";
import { assertLegacyWhiteboard, assertLegacyWhiteboardPage } from "../whiteboard-document-guard";
import Database from "better-sqlite3";
import type { ContentEntityTarget } from "@tau/db-schema/content-identities";
import { Whiteboard, WhiteboardContent } from "@/types";
import Operation from "./operation";
import Project from "./project";
import WhiteboardContentTable from "./white-board-content";
import { asynchronousDatabaseCommand } from "../database-command";
import type { SqliteRow } from "../../types/table";

/** 列表投影剔除的元素字段：媒体地址可能内嵌 dataURL，而缩略示意图只画几何与样式 */
const LIST_STRIPPED_ELEMENT_FIELDS = new Set(["src", "url"]);

/**
 * 列表数据投影：全库列表会随窗口焦点反复拉取，页数据只保留列表消费的字段——
 * 元素结构（缩略示意图）、演示序列、页名与时间；选区置空、剔除媒体地址。
 * 打开画布走单页全量通道（getWhiteboardById / white-board-content:get-by-id），不依赖列表数据。
 */
function toListContent(content: WhiteboardContent): WhiteboardContent {
  return {
    ...content,
    data: {
      ...content.data,
      selection: { selectArea: null, selectedElements: [] },
      children: content.data.children?.map(toListElement),
    },
  };
}

function toListElement<T>(element: T): T {
  if (!element || typeof element !== "object") return element;
  if (Array.isArray(element)) return element.map(toListElement) as T;
  const record = element as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (LIST_STRIPPED_ELEMENT_FIELDS.has(key)) continue;
    const value = record[key];
    out[key] = value && typeof value === "object" ? toListElement(value) : value;
  }
  return out as T;
}

export default class WhiteboardTable {
  static getListenEvents() {
    return {
      "create-white-board": this.createWhiteboard.bind(this),
      "delete-white-board": asynchronousDatabaseCommand(async (db: Database.Database, id: number) =>
        (await import("../whiteboard-documents")).default.deleteBoard(db, id)
      ),
      "get-white-board-by-id": this.getWhiteboard.bind(this),
      "get-all-white-boards": this.getAllWhiteboards.bind(this),
      "update-white-board": this.updateWhiteboard.bind(this),
      "update-white-board-meta": this.updateWhiteboardMeta.bind(this),
      "get-whiteboard-by-ids": this.getWhiteboardByIds.bind(this),
      "get-white-board-by-content-id": this.getWhiteboardByContentId.bind(this),
      "add-sub-white-board": this.addSubWhiteboard.bind(this),
      "delete-sub-white-board": this.deleteSubWhiteboard.bind(this),
      "update-sub-white-board": this.updateSubWhiteboard.bind(this),
      "set-active-sub-white-board": this.setActiveSubWhiteboard.bind(this),
      "reorder-sub-white-board": this.reorderSubWhiteboard.bind(this),
      "rename-sub-white-board": this.renameSubWhiteboard.bind(this),
      "duplicate-sub-white-board": this.duplicateSubWhiteboard.bind(this),
    };
  }

  static parseWhiteboard(whiteboard: SqliteRow): Whiteboard {
    const whiteBoardContentIds = JSON.parse((whiteboard.white_board_content_ids as string) || "[]");

    return {
      id: whiteboard.id as number,
      tags: JSON.parse((whiteboard.tags as string) || "[]"),
      whiteBoardContentIds,
      whiteBoardContentList: whiteboard.white_board_content_list as WhiteboardContent[],
      activeWhiteboardContentId:
        (whiteboard.active_white_board_content_id as number | null) ?? null,
      createTime: whiteboard.create_time as number,
      updateTime: whiteboard.update_time as number,
      title: whiteboard.title as string,
      description: whiteboard.description as string,
      snapshot: whiteboard.snapshot as string,
    };
  }

  static buildOrderedContentList(db: Database.Database, contentIds: number[]): WhiteboardContent[] {
    if (!contentIds.length) return [];
    const contents = WhiteboardContentTable.getWhiteboardByIds(db, contentIds);
    const contentMap = new Map(contents.map(content => [content.id, content]));

    return contentIds
      .map(id => contentMap.get(id))
      .filter((content): content is WhiteboardContent => Boolean(content));
  }

  static createWhiteboard(
    db: Database.Database,
    whiteboard: {
      title: string;
      description: string;
      tags?: string[];
      snapshot?: string;
      whiteBoardContentList?: Pick<WhiteboardContent, "data" | "name">[];
    }
  ): Whiteboard {
    const pages = whiteboard.whiteBoardContentList?.length
      ? whiteboard.whiteBoardContentList
      : [{ name: whiteboard.title || "未命名", data: { children: [] } }];
    if (hasWhiteboardLibraryBaseline(db) && pages.every(isEmptyWhiteboardPage))
      return db.transaction(() => {
        const created = createEmptyWhiteboardDocument(db, whiteboard.title, pages, "board");
        db.prepare("UPDATE white_boards SET description=?,tags=?,snapshot=? WHERE id=?").run(
          whiteboard.description,
          JSON.stringify(whiteboard.tags ?? []),
          whiteboard.snapshot ?? "",
          created.boardId
        );
        Operation.insertOperation(db, "whiteboard", "insert", created.boardId!, Date.now());
        return this.getWhiteboard(db, created.boardId!);
      })();
    const contentIds: number[] = [];

    // 如果有内容，创建 white-board-content 记录
    if (whiteboard.whiteBoardContentList && whiteboard.whiteBoardContentList.length > 0) {
      for (const content of whiteboard.whiteBoardContentList) {
        const contentId = WhiteboardContentTable.createWhiteboardContent(db, {
          data: content.data,
          name: content.name,
          imgUrl: whiteboard.snapshot || "",
        }).id;
        contentIds.push(contentId);
      }
    }

    const stmt = db.prepare(`
      INSERT INTO white_boards
      (
        title,
        description,
        white_board_content_ids,
        active_white_board_content_id,
        create_time,
        update_time,
        snapshot,
        tags
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    const activeWhiteboardContentId = contentIds[0] ?? null;
    const res = stmt.run(
      whiteboard.title,
      whiteboard.description,
      JSON.stringify(contentIds),
      activeWhiteboardContentId,
      now,
      now,
      whiteboard.snapshot || "",
      JSON.stringify(whiteboard.tags ?? [])
    );

    Operation.insertOperation(db, "whiteboard", "insert", res.lastInsertRowid, now);

    return this.getWhiteboard(db, Number(res.lastInsertRowid));
  }

  static addSubWhiteboard(
    db: Database.Database,
    whiteboardId: number,
    name: string,
    whiteboardData: WhiteboardContent["data"]
  ): WhiteboardContent {
    assertLegacyWhiteboard(db, whiteboardId);
    const whiteboard = this.getWhiteboard(db, whiteboardId);

    const whiteboardContent = WhiteboardContentTable.createWhiteboardContent(db, {
      data: whiteboardData,
      name,
      imgUrl: whiteboard.snapshot || "",
    });

    const stmt = db.prepare(`
      UPDATE white_boards SET update_time = ?, white_board_content_ids = ? WHERE id = ?
    `);
    stmt.run(
      Date.now(),
      JSON.stringify([...whiteboard.whiteBoardContentIds, whiteboardContent.id]),
      whiteboardId
    );

    return whiteboardContent;
  }

  static deleteSubWhiteboard(
    db: Database.Database,
    whiteboardId: number,
    whiteboardContentId: number
  ): boolean {
    assertLegacyWhiteboard(db, whiteboardId);
    const whiteboard = this.getWhiteboard(db, whiteboardId);
    const stmt = db.prepare(`
      UPDATE white_boards
      SET update_time = ?, white_board_content_ids = ?, active_white_board_content_id = ?
      WHERE id = ?
    `);
    const currentIndex = whiteboard.whiteBoardContentIds.findIndex(
      id => id === whiteboardContentId
    );
    if (currentIndex === -1) return false;

    const newContentIds = whiteboard.whiteBoardContentIds.filter(id => id !== whiteboardContentId);
    let nextActiveContentId = whiteboard.activeWhiteboardContentId;
    if (whiteboard.activeWhiteboardContentId === whiteboardContentId) {
      nextActiveContentId = newContentIds[currentIndex] ?? newContentIds[currentIndex - 1] ?? null;
    }
    stmt.run(Date.now(), JSON.stringify(newContentIds), nextActiveContentId, whiteboardId);

    WhiteboardContentTable.deleteWhiteboard(db, whiteboardContentId);

    return true;
  }

  static updateSubWhiteboard(
    db: Database.Database,
    whiteboardContentId: ContentEntityTarget,
    name: string,
    whiteboardData: WhiteboardContent["data"]
  ): WhiteboardContent {
    return db.transaction(() => {
      // 获取现有的白板内容以保留 imgUrl
      const existingContent = WhiteboardContentTable.getWhiteboardContent(db, whiteboardContentId);

      const whiteboardContent = WhiteboardContentTable.updateWhiteboard(db, {
        id: whiteboardContentId,
        data: whiteboardData,
        name,
        imgUrl: existingContent.imgUrl,
      });

      return whiteboardContent;
    })();
  }

  static updateWhiteboard(
    db: Database.Database,
    whiteboard: {
      id: number;
      title?: string;
      description?: string;
      tags?: string[];
      snapshot?: string;
      whiteBoardContentList?: WhiteboardContent[];
      activeWhiteboardContentId?: number | null;
    }
  ): Whiteboard {
    assertLegacyWhiteboard(db, whiteboard.id);
    // 获取当前白板数据
    const currentWhiteboard = this.getWhiteboard(db, whiteboard.id);
    const currentContentIds = currentWhiteboard.whiteBoardContentIds || [];
    const snapshotUrl = whiteboard.snapshot || currentWhiteboard.snapshot;

    // 处理内容列表变更
    const newContentIds: number[] = [];
    if (whiteboard.whiteBoardContentList && whiteboard.whiteBoardContentList.length > 0) {
      for (let i = 0; i < whiteboard.whiteBoardContentList.length; i++) {
        const content = whiteboard.whiteBoardContentList[i];
        let contentId: number;

        // 如果有对应的 id，更新
        if (currentContentIds[i]) {
          contentId = currentContentIds[i];
          WhiteboardContentTable.updateWhiteboard(db, {
            id: contentId,
            data: content.data,
            name: content.name,
            imgUrl: content.imgUrl || snapshotUrl || "",
          });
        } else {
          // 否则创建新记录
          contentId = WhiteboardContentTable.createWhiteboardContent(db, {
            data: content.data,
            name: content.name,
            imgUrl: content.imgUrl || snapshotUrl || "",
          }).id;
        }

        newContentIds.push(contentId);
      }
    }

    // 处理被删除的内容
    for (const oldContentId of currentContentIds) {
      if (!newContentIds.includes(oldContentId)) {
        WhiteboardContentTable.deleteWhiteboard(db, oldContentId);
      }
    }

    let activeWhiteboardContentId =
      whiteboard.activeWhiteboardContentId ?? currentWhiteboard.activeWhiteboardContentId;
    if (activeWhiteboardContentId !== null && !newContentIds.includes(activeWhiteboardContentId)) {
      activeWhiteboardContentId = newContentIds[0] ?? null;
    }

    const stmt = db.prepare(`
      UPDATE white_boards SET
        title = ?,
        description = ?,
        tags = ?,
        white_board_content_ids = ?,
        active_white_board_content_id = ?,
        update_time = ?,
        snapshot = ?
      WHERE id = ?
    `);

    const now = Date.now();
    stmt.run(
      whiteboard.title || currentWhiteboard.title,
      whiteboard.description || currentWhiteboard.description,
      JSON.stringify(whiteboard.tags || currentWhiteboard.tags || []),
      JSON.stringify(newContentIds),
      activeWhiteboardContentId,
      now,
      whiteboard.snapshot || currentWhiteboard.snapshot,
      whiteboard.id
    );

    Operation.insertOperation(db, "whiteboard", "update", whiteboard.id, now);

    return this.getWhiteboard(db, whiteboard.id);
  }

  /**
   * 只改白板行自身的元信息（标题 / 描述 / 标签 / 封面），不碰子白板。
   * 与 updateWhiteboard 的区别：不需要也不会重写子白板数据（列表页手里的画布数据可能已过期，
   * 整份回写会覆盖正在别处编辑的内容）；字段缺省 = 不改，空字符串 / 空数组 = 清空。
   */
  static updateWhiteboardMeta(
    db: Database.Database,
    id: number,
    patch: {
      title?: string;
      description?: string;
      tags?: string[];
      snapshot?: string;
    }
  ): Whiteboard {
    const current = this.getWhiteboard(db, id);
    if (patch.title !== undefined && patch.title !== current.title) assertLegacyWhiteboard(db, id);
    const now = Date.now();
    db.prepare(
      `UPDATE white_boards SET title = ?, description = ?, tags = ?, snapshot = ?, update_time = ? WHERE id = ?`
    ).run(
      patch.title ?? current.title,
      patch.description ?? current.description,
      JSON.stringify(patch.tags ?? current.tags ?? []),
      patch.snapshot ?? current.snapshot,
      now,
      id
    );
    Operation.insertOperation(db, "whiteboard", "update", id, now);
    return this.getWhiteboard(db, id);
  }

  /** 只改页名，不碰页数据（避免用调用方手里的旧画布数据覆盖正在编辑的页） */
  static renameSubWhiteboard(
    db: Database.Database,
    whiteboardContentId: number,
    name: string
  ): WhiteboardContent {
    assertLegacyWhiteboardPage(db, whiteboardContentId);
    const now = Date.now();
    db.prepare(`UPDATE white_board_contents SET name = ?, update_time = ? WHERE id = ?`).run(
      name,
      now,
      whiteboardContentId
    );
    Operation.insertOperation(db, "whiteboard-content", "update", whiteboardContentId, now);
    return WhiteboardContentTable.getWhiteboardContent(db, whiteboardContentId);
  }

  /**
   * 复制一页，副本插在原页之后并设为当前页。
   * 先建空页再写入数据：让 updateWhiteboard 按差量为嵌入的正文（contentId）补引用计数，
   * 否则删除副本时会把原页仍在用的正文一并释放。
   */
  static duplicateSubWhiteboard(
    db: Database.Database,
    whiteboardId: number,
    whiteboardContentId: number
  ): Whiteboard {
    assertLegacyWhiteboard(db, whiteboardId);
    const whiteboard = this.getWhiteboard(db, whiteboardId);
    const index = whiteboard.whiteBoardContentIds.indexOf(whiteboardContentId);
    if (index === -1) {
      throw new Error(
        `Whiteboard content ${whiteboardContentId} not found in whiteboard ${whiteboardId}`
      );
    }
    const source = WhiteboardContentTable.getWhiteboardContent(db, whiteboardContentId);
    const copy = WhiteboardContentTable.createWhiteboardContent(db, {
      name: `${source.name} 副本`,
      imgUrl: source.imgUrl,
      data: { ...source.data, children: [] },
    });
    WhiteboardContentTable.updateWhiteboard(db, {
      id: copy.id,
      name: copy.name,
      imgUrl: copy.imgUrl,
      data: source.data,
    });
    const ids = whiteboard.whiteBoardContentIds.slice();
    ids.splice(index + 1, 0, copy.id);
    db.prepare(
      `UPDATE white_boards SET update_time = ?, white_board_content_ids = ?, active_white_board_content_id = ? WHERE id = ?`
    ).run(Date.now(), JSON.stringify(ids), copy.id, whiteboardId);
    return this.getWhiteboard(db, whiteboardId);
  }

  static setActiveSubWhiteboard(
    db: Database.Database,
    whiteboardId: number,
    whiteBoardContentId: number | null
  ): Whiteboard {
    const whiteboard = this.getWhiteboard(db, whiteboardId);
    if (
      whiteBoardContentId !== null &&
      !whiteboard.whiteBoardContentIds.includes(whiteBoardContentId)
    ) {
      throw new Error(
        `Whiteboard content ${whiteBoardContentId} not found in whiteboard ${whiteboardId}`
      );
    }

    // 停留在哪一页是查看状态，不算修改：不刷新 update_time（否则只是翻看也会排到「最近更新」最前）
    const stmt = db.prepare(`
      UPDATE white_boards
      SET active_white_board_content_id = ?
      WHERE id = ?
    `);
    stmt.run(whiteBoardContentId, whiteboardId);

    return this.getWhiteboard(db, whiteboardId);
  }

  static reorderSubWhiteboard(
    db: Database.Database,
    whiteboardId: number,
    orderedIds: number[]
  ): Whiteboard {
    assertLegacyWhiteboard(db, whiteboardId);
    const whiteboard = this.getWhiteboard(db, whiteboardId);
    const currentIds = whiteboard.whiteBoardContentIds;
    if (orderedIds.length !== currentIds.length) {
      throw new Error("Invalid orderedIds length");
    }
    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new Error("Duplicate ids found in orderedIds");
    }
    if (orderedIds.some(id => !currentIds.includes(id))) {
      throw new Error("orderedIds contains unknown content ids");
    }

    const stmt = db.prepare(`
      UPDATE white_boards
      SET update_time = ?, white_board_content_ids = ?
      WHERE id = ?
    `);
    stmt.run(Date.now(), JSON.stringify(orderedIds), whiteboardId);

    return this.getWhiteboard(db, whiteboardId);
  }

  static deleteWhiteboard(db: Database.Database, id: number): number {
    return db.transaction(() => {
      assertLegacyWhiteboard(db, id);
      // 获取白板内容 ID 并删除相关内容
      const whiteboard = this.getWhiteboard(db, id);
      const pages = whiteboard.whiteBoardContentIds;
      if (pages?.length) {
        for (const contentId of pages) {
          WhiteboardContentTable.deleteWhiteboard(db, contentId);
        }
      }

      const stmt = db.prepare("DELETE FROM white_boards WHERE id = ?");

      Operation.insertOperation(db, "whiteboard", "delete", id, Date.now());

      Project.resetProjectItemRef(db, "white-board", id);

      return stmt.run(id).changes;
    })();
  }

  static getWhiteboard(db: Database.Database, id: number): Whiteboard {
    // 获取白板基础数据
    const stmt = db.prepare(`
      SELECT * FROM white_boards WHERE id = ?
    `);

    const whiteboard = stmt.get(id) as SqliteRow;
    if (!whiteboard) {
      throw new Error(`Whiteboard with id ${id} not found`);
    }

    // 加载内容列表
    const contentIds = JSON.parse((whiteboard.white_board_content_ids as string) || "[]");
    const contentList = this.buildOrderedContentList(db, contentIds);

    whiteboard.white_board_content_list = contentList;

    return this.parseWhiteboard(whiteboard);
  }

  static getAllWhiteboards(db: Database.Database): Whiteboard[] {
    // 获取所有白板
    const stmt = db.prepare(`
      SELECT * FROM white_boards
    `);

    const whiteboards = stmt.all() as SqliteRow[];

    // 为每个白板加载内容列表；列表只喂元信息与缩略示意图，页数据转投影减载
    return whiteboards.map(whiteboard => {
      // 使用类型断言确保类型安全
      const wb = whiteboard;
      const contentIds = JSON.parse((wb.white_board_content_ids as string) || "[]");
      const contentList = this.buildOrderedContentList(db, contentIds).map(toListContent);

      wb.white_board_content_list = contentList;

      return this.parseWhiteboard(wb);
    });
  }

  static getWhiteboardByIds(db: Database.Database, ids: number[]): Whiteboard[] {
    if (!ids.length) return [];

    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(`SELECT * FROM white_boards WHERE id IN (${placeholders})`);

    const whiteboards = stmt.all(...ids) as SqliteRow[];

    // 为每个白板加载内容列表
    return whiteboards.map(whiteboard => {
      // 使用类型断言确保类型安全
      const wb = whiteboard;
      const contentIds = JSON.parse((wb.white_board_content_ids as string) || "[]");
      const contentList = this.buildOrderedContentList(db, contentIds);

      wb.white_board_content_list = contentList;

      return this.parseWhiteboard(wb);
    });
  }

  /** 按页 id 反查所属白板；不属于任何白板的独立页返回 null */
  static getWhiteboardByContentId(db: Database.Database, contentId: number): Whiteboard | null {
    const row = db
      .prepare(
        `SELECT id FROM white_boards
         WHERE EXISTS (SELECT 1 FROM json_each(white_board_content_ids) WHERE value = ?)
         LIMIT 1`
      )
      .get(contentId) as { id: number } | undefined;
    return row ? this.getWhiteboard(db, row.id) : null;
  }
}
