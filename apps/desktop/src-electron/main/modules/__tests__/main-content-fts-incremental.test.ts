import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mainDb: {},
  indexDb: {},
  rebuildState: "ready" as string,
  indexContent: vi.fn((_db: unknown, _task: unknown) => true),
  removeIndexByIdAndType: vi.fn(),
  locateAll: vi.fn(),
  getCardById: vi.fn(),
  getArticleByIds: vi.fn(() => []),
}));

vi.mock("electron-log", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../database", () => ({
  default: {
    onDatabaseConnected: vi.fn(),
    getIndexRebuildState: () => mocks.rebuildState,
    getDatabase: () => mocks.mainDb,
    getIndexDatabase: () => mocks.indexDb,
  },
}));
vi.mock("../tables/fts", () => ({
  default: {
    indexContent: mocks.indexContent,
    removeIndexByIdAndType: mocks.removeIndexByIdAndType,
  },
}));
vi.mock("../tables/entity-search", () => ({ default: { locateAll: mocks.locateAll } }));
vi.mock("../tables/card", () => ({ default: { getCardById: mocks.getCardById } }));
vi.mock("../tables/article", () => ({ default: { getArticleByIds: mocks.getArticleByIds } }));
vi.mock("../tables/project", () => ({ default: { getProjectItem: vi.fn(() => null) } }));
vi.mock("../tables/diary", () => ({ default: { getDiaryMoment: vi.fn(() => null) } }));
vi.mock("../material-index", () => ({ listMaterialIndexDocs: () => [] }));
vi.mock("../main-content-vec-index-queue", () => ({ MAIN_CONTENT_INDEX_TYPES: [] }));
vi.mock("@/utils/markdown.ts", () => ({
  getMarkdown: (nodes: unknown[]) => (nodes.length ? "正文" : ""),
}));

import { emitContentWritten } from "../content-events";
import queue from "../main-content-fts-index-queue";

const db = { name: "/data/alpha.db", memory: false };
const card = (id: number, content: unknown[]) => ({
  id,
  content,
  update_time: 10,
});

describe("正文写入后的全文增量索引", () => {
  beforeAll(() => queue.init());
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.rebuildState = "ready";
    mocks.indexContent.mockClear();
    mocks.removeIndexByIdAndType.mockClear();
    mocks.locateAll.mockReset();
    mocks.getCardById.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("合并窗口内的多次写入只索引一次引用该正文的实体", async () => {
    mocks.locateAll.mockReturnValue(new Map([[7, [{ kind: "card", id: 3 }]]]));
    mocks.getCardById.mockReturnValue(card(3, [{ type: "paragraph" }]));
    emitContentWritten(db, 7, "update");
    emitContentWritten(db, 7, "update");
    await vi.advanceTimersByTimeAsync(1100);
    expect(mocks.locateAll).toHaveBeenCalledWith({}, [7]);
    expect(mocks.indexContent).toHaveBeenCalledTimes(1);
    expect(mocks.indexContent.mock.calls[0][1]).toMatchObject({ id: 3, type: "card" });
  });

  it("持续写入时最长 5 秒也会落一次索引", async () => {
    mocks.locateAll.mockReturnValue(new Map([[7, [{ kind: "card", id: 3 }]]]));
    mocks.getCardById.mockReturnValue(card(3, [{ type: "paragraph" }]));
    for (let elapsed = 0; elapsed < 5000; elapsed += 800) {
      emitContentWritten(db, 7, "update");
      await vi.advanceTimersByTimeAsync(800);
    }
    expect(mocks.indexContent).toHaveBeenCalled();
  });

  it("正文清空后移除该实体的索引", async () => {
    mocks.locateAll.mockReturnValue(new Map([[7, [{ kind: "card", id: 3 }]]]));
    mocks.getCardById.mockReturnValue(card(3, []));
    emitContentWritten(db, 7, "update");
    await vi.advanceTimersByTimeAsync(1100);
    expect(mocks.removeIndexByIdAndType).toHaveBeenCalledWith({}, 3, "card");
    expect(mocks.indexContent).not.toHaveBeenCalled();
  });

  it("索引未就绪时交给连库对账，不做增量", async () => {
    mocks.rebuildState = "building";
    emitContentWritten(db, 7, "update");
    await vi.advanceTimersByTimeAsync(1100);
    expect(mocks.locateAll).not.toHaveBeenCalled();
  });
});
