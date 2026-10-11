import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import type { WhiteboardSnapshot } from "@tau/whiteboard";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import WhiteboardTable from "../whiteboard";

const pageData = (children: WhiteboardSnapshot["children"]): WhiteboardSnapshot => ({
  children,
  viewPort: { zoom: 1, minX: 0, minY: 0, width: 0, height: 0 },
  selection: {
    selectArea: null,
    selectedElements: [{ id: "el-1", type: "geometry", x: 0, y: 0, width: 10, height: 10 }],
  },
  presentationSequences: [{ id: "seq-1", name: "序列", frames: [], createTime: 0, updateTime: 0 }],
  version: 2,
});

describe("白板列表数据投影", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
  });
  afterEach(() => db.close());

  it("列表剔除媒体地址与选区，保留示意图所需结构；单块查询保持全量", () => {
    const board = WhiteboardTable.createWhiteboard(db, {
      title: "投影",
      description: "",
      whiteBoardContentList: [
        {
          name: "页一",
          data: pageData([
            {
              id: "img-1",
              type: "image",
              x: 10,
              y: 20,
              width: 100,
              height: 80,
              src: "data:image/png;base64,AAAA",
            },
            {
              id: "frame-1",
              type: "frame",
              x: 0,
              y: 0,
              width: 300,
              height: 200,
              children: [
                {
                  id: "web-1",
                  type: "webview",
                  x: 5,
                  y: 5,
                  width: 50,
                  height: 40,
                  url: "https://a",
                },
              ],
            },
          ]),
        },
      ],
    });

    const [listed] = WhiteboardTable.getAllWhiteboards(db);
    const listedChildren = listed.whiteBoardContentList[0]!.data.children!;
    const listedFrame = listedChildren[1]!;
    expect(listedChildren[0]).not.toHaveProperty("src");
    // 嵌套容器内的媒体地址同样剔除，几何与结构保留
    expect(listedFrame.children![0]).not.toHaveProperty("url");
    expect(listedFrame.children![0]).toMatchObject({ x: 5, width: 50, type: "webview" });
    // 选区置空；演示序列计数保留
    expect(listed.whiteBoardContentList[0]!.data.selection).toEqual({
      selectArea: null,
      selectedElements: [],
    });
    expect(listed.whiteBoardContentList[0]!.data.presentationSequences).toHaveLength(1);

    // 打开画布的单块/单页通道不走投影，数据原样
    const full = WhiteboardTable.getWhiteboard(db, board.id);
    expect(full.whiteBoardContentList[0].data.children[0]).toHaveProperty("src");
    expect(full.whiteBoardContentList[0].data.selection.selectedElements).toHaveLength(1);
  });
});
