import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp",
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("../video-note-index-queue", () => ({
  default: {
    enqueueTask: vi.fn(),
    cleanupVideoNoteArtifacts: vi.fn(),
  },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import WhiteboardTable from "../tables/whiteboard";
import WhiteBoardContentTable from "../tables/white-board-content";
import ContentTable from "../tables/content";

const pageData = (id: string) =>
  ({
    children: [{ id, type: "geometry" }],
    viewPort: { zoom: 1, minX: 0, minY: 0, width: 0, height: 0 },
    selection: { selectArea: null, selectedElements: [] },
  }) as any;

function createTestDatabase() {
  const db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  return db;
}

describe("WhiteboardTable 元信息", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("按页 id 反查所属白板，独立页返回 null", () => {
    WhiteboardTable.createWhiteboard(db, {
      title: "其他",
      description: "",
      whiteBoardContentList: [{ name: "p", data: pageData("x") }],
    });
    const board = WhiteboardTable.createWhiteboard(db, {
      title: "语法地图",
      description: "",
      whiteBoardContentList: [
        { name: "助词", data: pageData("a") },
        { name: "动词", data: pageData("b") },
      ],
    });
    const orphan = WhiteBoardContentTable.createWhiteboardContent(db, {
      name: "独立页",
      imgUrl: "",
      data: pageData("c"),
    });

    expect(WhiteboardTable.getWhiteboardByContentId(db, board.whiteBoardContentIds[1])?.id).toBe(
      board.id
    );
    expect(WhiteboardTable.getWhiteboardByContentId(db, orphan.id)).toBeNull();
  });

  it("创建时写入标签", () => {
    const board = WhiteboardTable.createWhiteboard(db, {
      title: "语法地图",
      description: "",
      tags: ["学习"],
      whiteBoardContentList: [{ name: "助词", data: pageData("a") }],
    });
    expect(WhiteboardTable.getWhiteboard(db, board.id).tags).toEqual(["学习"]);
  });

  it("只改白板行，子白板数据与更新时间不动", () => {
    const board = WhiteboardTable.createWhiteboard(db, {
      title: "规划",
      description: "季度目标",
      tags: ["工作"],
      snapshot: "/cover.png",
      whiteBoardContentList: [
        { name: "第一页", data: pageData("a") },
        { name: "第二页", data: pageData("b") },
      ],
    });
    const before = WhiteboardTable.getWhiteboard(db, board.id).whiteBoardContentList;

    const updated = WhiteboardTable.updateWhiteboardMeta(db, board.id, { title: "Q4 规划" });

    expect(updated.title).toBe("Q4 规划");
    expect(updated.description).toBe("季度目标");
    expect(updated.tags).toEqual(["工作"]);
    expect(updated.whiteBoardContentIds).toEqual(board.whiteBoardContentIds);
    expect(updated.whiteBoardContentList).toEqual(before);
  });

  it("空值表示清空：描述、封面、标签都可以清掉", () => {
    const board = WhiteboardTable.createWhiteboard(db, {
      title: "灵感",
      description: "京都",
      tags: ["生活", "旅行"],
      snapshot: "/cover.png",
      whiteBoardContentList: [{ name: "灵感板", data: pageData("a") }],
    });

    const updated = WhiteboardTable.updateWhiteboardMeta(db, board.id, {
      description: "",
      snapshot: "",
      tags: [],
    });

    expect(updated.title).toBe("灵感");
    expect(updated.description).toBe("");
    expect(updated.snapshot).toBe("");
    expect(updated.tags).toEqual([]);
    expect(updated.whiteBoardContentList).toHaveLength(1);
  });
});

describe("WhiteboardTable 页操作", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  const twoPages = () =>
    WhiteboardTable.createWhiteboard(db, {
      title: "拆解",
      description: "",
      whiteBoardContentList: [
        { name: "总览", data: pageData("a") },
        { name: "细节", data: pageData("b") },
      ],
    });

  it("改名只改名字，不动页数据", () => {
    const board = twoPages();
    const [first] = board.whiteBoardContentIds;
    const renamed = WhiteboardTable.renameSubWhiteboard(db, first, "全局");
    expect(renamed.name).toBe("全局");
    expect(renamed.data.children).toEqual([{ id: "a", type: "geometry" }]);
  });

  it("切换当前页不刷新白板更新时间", () => {
    const board = twoPages();
    db.prepare("UPDATE white_boards SET update_time = 1 WHERE id = ?").run(board.id);
    const next = WhiteboardTable.setActiveSubWhiteboard(
      db,
      board.id,
      board.whiteBoardContentIds[1]
    );
    expect(next.activeWhiteBoardContentId).toBe(board.whiteBoardContentIds[1]);
    expect(next.updateTime).toBe(1);
  });

  it("复制一页：副本插在原页之后、设为当前页，并为嵌入正文补引用", () => {
    const contentId = ContentTable.createContent(db, {
      content: [{ type: "paragraph", children: [{ text: "笔记" }] }] as any,
      count: 1,
    });
    const board = WhiteboardTable.createWhiteboard(db, {
      title: "拆解",
      description: "",
      whiteBoardContentList: [
        {
          name: "总览",
          data: { ...pageData("a"), children: [{ id: "r", type: "richtext", contentId }] },
        },
        { name: "细节", data: pageData("b") },
      ],
    });
    const [first, second] = board.whiteBoardContentIds;

    const next = WhiteboardTable.duplicateSubWhiteboard(db, board.id, first);

    expect(next.whiteBoardContentIds).toHaveLength(3);
    expect(next.whiteBoardContentIds[0]).toBe(first);
    expect(next.whiteBoardContentIds[2]).toBe(second);
    const copyId = next.whiteBoardContentIds[1];
    expect(next.activeWhiteBoardContentId).toBe(copyId);
    const copy = next.whiteBoardContentList[1];
    expect(copy.name).toBe("总览 副本");
    expect(copy.data.children).toEqual([{ id: "r", type: "richtext", contentId }]);
    expect(ContentTable.getContentById(db, contentId)?.refCount).toBe(2);

    // 删掉副本后原页引用的正文仍在
    WhiteboardTable.deleteSubWhiteboard(db, board.id, copyId);
    WhiteBoardContentTable.deleteWhiteBoardContentWhenRefCountIsZero(db);
    expect(ContentTable.getContentById(db, contentId)?.refCount).toBe(1);
  });
});
