import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
// 仅用于主进程与核心包的文档版本常量对账（主进程生产代码不依赖该包）
import { WHITEBOARD_DOCUMENT_VERSION as CORE_DOCUMENT_VERSION } from "@tau/whiteboard";
import type { WhiteboardSnapshot } from "@tau/whiteboard";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import WhiteBoardContentTable, {
  WHITEBOARD_DOCUMENT_VERSION as MAIN_DOCUMENT_VERSION,
} from "../white-board-content";
import WhiteboardTable from "../whiteboard";

const rawData = (db: Database.Database, id: number) =>
  (db.prepare(`SELECT data FROM white_board_contents WHERE id = ?`).get(id) as { data: string })
    .data;

const pageData = (version: number): WhiteboardSnapshot => ({
  children: [],
  viewPort: { zoom: 1, minX: 0, minY: 0, width: 0, height: 0 },
  selection: { selectArea: null, selectedElements: [] },
  version,
});

/** 历史数据：持久化时还没有 version 字段（getDocumentVersion 归一为 1） */
const legacyData = {
  children: [],
  viewPort: { zoom: 1, minX: 0, minY: 0, width: 0, height: 0 },
  selection: { selectArea: null, selectedElements: [] },
} as unknown as WhiteboardSnapshot;

describe("白板页文档版本写回保护", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
  });
  afterEach(() => db.close());

  it("主进程对账的常量与核心包一致", () => {
    expect(CORE_DOCUMENT_VERSION).toBe(MAIN_DOCUMENT_VERSION);
  });

  it("库内版本更高时拒绝覆盖，数据保持不变", () => {
    const created = WhiteBoardContentTable.createWhiteboardContent(db, {
      data: pageData(3),
      name: "页",
      imgUrl: "",
    });
    const before = rawData(db, created.id);
    expect(() =>
      WhiteBoardContentTable.updateWhiteboard(db, {
        id: created.id,
        data: pageData(2),
        name: "改",
        imgUrl: "",
      })
    ).toThrow("当前版本不能覆盖");
    expect(rawData(db, created.id)).toBe(before);
  });

  it("旧数据无版本（视为 1）允许升到 2；同版本允许覆盖，无版本数据不能覆盖已升级的页", () => {
    const legacy = WhiteBoardContentTable.createWhiteboardContent(db, {
      data: legacyData,
      name: "页",
      imgUrl: "",
    });

    expect(() =>
      WhiteBoardContentTable.updateWhiteboard(db, {
        id: legacy.id,
        data: pageData(2),
        name: "页",
        imgUrl: "",
      })
    ).not.toThrow();
    expect(JSON.parse(rawData(db, legacy.id)).version).toBe(2);

    expect(() =>
      WhiteBoardContentTable.updateWhiteboard(db, {
        id: legacy.id,
        data: pageData(2),
        name: "改",
        imgUrl: "",
      })
    ).not.toThrow();

    expect(() =>
      WhiteBoardContentTable.updateWhiteboard(db, {
        id: legacy.id,
        data: legacyData,
        name: "页",
        imgUrl: "",
      })
    ).toThrow("当前版本不能覆盖");
    expect(JSON.parse(rawData(db, legacy.id)).version).toBe(2);
  });

  it("白板整体回写子页同样按行拒绝降版本", () => {
    const board = WhiteboardTable.createWhiteboard(db, {
      title: "板",
      description: "",
      whiteBoardContentList: [{ name: "页", data: pageData(3) }],
    });
    const contentId = board.whiteBoardContentIds[0];
    expect(() =>
      WhiteboardTable.updateWhiteboard(db, {
        id: board.id,
        whiteBoardContentList: [
          {
            id: contentId,
            name: "页",
            imgUrl: "",
            createTime: 0,
            updateTime: 0,
            data: pageData(2),
          },
        ],
      })
    ).toThrow("当前版本不能覆盖");
    expect(JSON.parse(rawData(db, contentId)).version).toBe(3);
  });
});
