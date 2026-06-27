import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("../utils/sqlite-vec-loader", () => ({
  loadSqliteVecExtension: vi.fn(),
}));

vi.mock("../utils/PathUtil", () => ({
  default: {
    getAppDir: () => "/tmp",
  },
}));

import vibeLearningDBManager from "../vibe-learning-db";

describe("VibeLearningDBManager chunk metadata", () => {
  const runMock = vi.fn();
  const getMock = vi.fn();
  const allMock = vi.fn();
  const execMock = vi.fn();
  const prepareMock = vi.fn((sql: string) => {
    if (sql.includes("INSERT INTO vl_chunk_metadata")) {
      return { run: runMock };
    }
    if (sql.includes("SELECT search_content, display_content")) {
      return { get: getMock };
    }
    if (sql.includes("PRAGMA table_info(vl_chunk_metadata)")) {
      return {
        all: allMock,
      };
    }
    if (sql.includes("SELECT vec_version()")) {
      return {
        get: () => ({ vec_version: "mock-vec" }),
      };
    }
    return {
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(() => []),
    };
  });

  const dbMock = {
    exec: execMock,
    prepare: prepareMock,
    transaction: (fn: () => void) => fn,
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    execMock.mockReset();
    (vibeLearningDBManager as any).chunkMetadataLegacySchemaMode.clear();
    (vibeLearningDBManager as any).chunkMetadataLegacyFallback.clear();
    (vibeLearningDBManager as any).chunkMetadataLegacyRangeFallback.clear();
    allMock.mockReturnValue([
      { name: "resource_id" },
      { name: "chunk_index" },
      { name: "search_content" },
      { name: "display_content" },
      { name: "chapter_start_line" },
      { name: "chapter_end_line" },
    ]);
    (vibeLearningDBManager as any).databases.set("test-project-1", dbMock);
  });

  it("initTables 应把旧列名迁移为新的 chunk 行号列名", () => {
    allMock.mockReturnValueOnce([
      { name: "resource_id" },
      { name: "chunk_index" },
      { name: "search_content" },
      { name: "display_content" },
      { name: "chapter_start_line" },
      { name: "chapter_end_line" },
    ]);

    (vibeLearningDBManager as any).initTables(dbMock);

    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "ALTER TABLE vl_chunk_metadata RENAME TO vl_chunk_metadata_legacy",
      ),
    );
    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("chunk_start_line INTEGER"),
    );
    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("chapter_start_line AS chunk_start_line"),
    );
    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("DROP TABLE vl_chunk_metadata_legacy"),
    );
  });

  it("getChunkMetadata 在迁移失败时应兼容读取旧列，避免崩溃", () => {
    getMock
      .mockImplementationOnce(() => {
        throw new Error("no such column: chunk_start_line");
      })
      .mockReturnValueOnce({
        search_content: "chunk one",
        display_content: "Chunk One",
        chapter_start_line: 12,
        chapter_end_line: 28,
        start_offset: null,
        end_offset: null,
        char_count: null,
      });

    const metadata = vibeLearningDBManager.getChunkMetadata(
      "test.db",
      1,
      42,
      0,
    );

    expect(metadata).toMatchObject({
      searchContent: "chunk one",
      displayContent: "Chunk One",
      chunkStartLine: 12,
      chunkEndLine: 28,
    });
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("getChunkMetadata 在真实旧表缺少字符范围列时仍应兼容读取旧列", () => {
    getMock
      .mockImplementationOnce(() => {
        throw new Error("no such column: chunk_start_line");
      })
      .mockImplementationOnce(() => {
        throw new Error("no such column: start_offset");
      })
      .mockReturnValueOnce({
        search_content: "chunk one",
        display_content: "Chunk One",
        chapter_start_line: 12,
        chapter_end_line: 28,
      });

    const metadata = vibeLearningDBManager.getChunkMetadata(
      "test.db",
      1,
      42,
      0,
    );

    expect(metadata).toMatchObject({
      searchContent: "chunk one",
      displayContent: "Chunk One",
      chunkStartLine: 12,
      chunkEndLine: 28,
    });
    expect(metadata?.startOffset).toBeUndefined();
    expect(metadata?.endOffset).toBeUndefined();
    expect(metadata?.charCount).toBeUndefined();
    expect(getMock).toHaveBeenCalledTimes(3);
  });

  it("迁移失败时 initTables 不应继续执行 chunk 行号列 DDL", () => {
    allMock
      .mockReturnValueOnce([
        { name: "resource_id" },
        { name: "chunk_index" },
        { name: "search_content" },
        { name: "display_content" },
        { name: "chapter_start_line" },
        { name: "chapter_end_line" },
      ])
      .mockReturnValueOnce([
        { name: "resource_id" },
        { name: "chunk_index" },
        { name: "search_content" },
        { name: "display_content" },
        { name: "chapter_start_line" },
        { name: "chapter_end_line" },
      ]);

    execMock.mockImplementation((sql: string) => {
      if (
        sql.includes(
          "ALTER TABLE vl_chunk_metadata RENAME TO vl_chunk_metadata_legacy",
        )
      ) {
        throw new Error("rename failed");
      }
    });

    (vibeLearningDBManager as any).initTables(dbMock);

    expect(execMock).not.toHaveBeenCalledWith(
      expect.stringContaining(
        "ALTER TABLE vl_chunk_metadata ADD COLUMN chunk_start_line INTEGER",
      ),
    );
    expect(execMock).not.toHaveBeenCalledWith(
      expect.stringContaining(
        "ALTER TABLE vl_chunk_metadata ADD COLUMN chunk_end_line INTEGER",
      ),
    );
  });

  it("createIndex 应把命中 chunk 的精确行号和字符范围写入 vl_chunk_metadata", () => {
    vibeLearningDBManager.createIndex("test.db", 1, 42, "原始内容", [
      {
        text: "chunk one",
        searchText: "chunk one",
        displayText: "Chunk One",
        chunkStartLine: 12,
        chunkEndLine: 28,
        startOffset: 100,
        endOffset: 124,
        charCount: 24,
      },
    ]);

    expect(runMock).toHaveBeenCalledWith(
      42,
      0,
      "chunk one",
      "Chunk One",
      12,
      28,
      100,
      124,
      24,
    );
  });

  it("legacy schema mode 下 createIndex 应写入旧列名路径", () => {
    (vibeLearningDBManager as any).chunkMetadataLegacySchemaMode.add(
      "test-project-1",
    );

    vibeLearningDBManager.createIndex("test.db", 1, 42, "原始内容", [
      {
        text: "chunk one",
        searchText: "chunk one",
        displayText: "Chunk One",
        chunkStartLine: 12,
        chunkEndLine: 28,
        startOffset: 100,
        endOffset: 124,
        charCount: 24,
      },
    ]);

    expect(prepareMock).toHaveBeenCalledWith(
      expect.stringContaining("chapter_start_line"),
    );
    expect(prepareMock).toHaveBeenCalledWith(
      expect.stringContaining("chapter_end_line"),
    );
    expect(runMock).toHaveBeenCalledWith(
      42,
      0,
      "chunk one",
      "Chunk One",
      12,
      28,
      100,
      124,
      24,
    );
  });

  it("legacy schema mode 下 createIndex 不应写入旧表不存在的字符范围列", () => {
    (vibeLearningDBManager as any).chunkMetadataLegacySchemaMode.add(
      "test-project-1",
    );
    (vibeLearningDBManager as any).chunkMetadataLegacyRangeFallback.add(
      "test-project-1",
    );

    vibeLearningDBManager.createIndex("test.db", 1, 42, "原始内容", [
      {
        text: "chunk one",
        searchText: "chunk one",
        displayText: "Chunk One",
        chunkStartLine: 12,
        chunkEndLine: 28,
        startOffset: 100,
        endOffset: 124,
        charCount: 24,
      },
    ]);

    const legacyInsertSql = prepareMock.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO vl_chunk_metadata"),
    )?.[0] as string;

    expect(legacyInsertSql).toContain("chapter_start_line");
    expect(legacyInsertSql).toContain("chapter_end_line");
    expect(legacyInsertSql).not.toContain("start_offset");
    expect(legacyInsertSql).not.toContain("end_offset");
    expect(legacyInsertSql).not.toContain("char_count");
    expect(runMock).toHaveBeenCalledWith(
      42,
      0,
      "chunk one",
      "Chunk One",
      12,
      28,
    );
  });

  it("getChunkMetadata 应读回命中 chunk 的精确行号和字符范围", () => {
    getMock.mockReturnValue({
      search_content: "chunk one",
      display_content: "Chunk One",
      chunk_start_line: 12,
      chunk_end_line: 28,
      start_offset: 100,
      end_offset: 124,
      char_count: 24,
    });

    const metadata = vibeLearningDBManager.getChunkMetadata(
      "test.db",
      1,
      42,
      0,
    );

    expect(metadata).toMatchObject({
      searchContent: "chunk one",
      displayContent: "Chunk One",
      chunkStartLine: 12,
      chunkEndLine: 28,
      startOffset: 100,
      endOffset: 124,
      charCount: 24,
    });
  });

  it("closeDatabase 应清理 legacy schema 与 fallback 状态", () => {
    const closeMock = vi.fn();
    (vibeLearningDBManager as any).databases.set("test-project-1", {
      close: closeMock,
    });
    (vibeLearningDBManager as any).chunkMetadataLegacySchemaMode.add(
      "test-project-1",
    );
    (vibeLearningDBManager as any).chunkMetadataLegacyFallback.add(
      "test-project-1",
    );

    vibeLearningDBManager.closeDatabase("test.db", 1);

    expect(closeMock).toHaveBeenCalled();
    expect(
      (vibeLearningDBManager as any).chunkMetadataLegacySchemaMode.has(
        "test-project-1",
      ),
    ).toBe(false);
    expect(
      (vibeLearningDBManager as any).chunkMetadataLegacyFallback.has(
        "test-project-1",
      ),
    ).toBe(false);
  });

  it("closeAllForMainDB 应清理该主库下所有 legacy 状态", () => {
    const closeMock1 = vi.fn();
    const closeMock2 = vi.fn();
    const closeMockOther = vi.fn();
    (vibeLearningDBManager as any).databases.set("test-project-1", {
      close: closeMock1,
    });
    (vibeLearningDBManager as any).databases.set("test-project-2", {
      close: closeMock2,
    });
    (vibeLearningDBManager as any).databases.set("other-project-1", {
      close: closeMockOther,
    });
    (vibeLearningDBManager as any).chunkMetadataLegacySchemaMode.add(
      "test-project-1",
    );
    (vibeLearningDBManager as any).chunkMetadataLegacySchemaMode.add(
      "test-project-2",
    );
    (vibeLearningDBManager as any).chunkMetadataLegacySchemaMode.add(
      "other-project-1",
    );
    (vibeLearningDBManager as any).chunkMetadataLegacyFallback.add(
      "test-project-1",
    );
    (vibeLearningDBManager as any).chunkMetadataLegacyFallback.add(
      "test-project-2",
    );
    (vibeLearningDBManager as any).chunkMetadataLegacyFallback.add(
      "other-project-1",
    );

    vibeLearningDBManager.closeAllForMainDB("test.db");

    expect(closeMock1).toHaveBeenCalled();
    expect(closeMock2).toHaveBeenCalled();
    expect(closeMockOther).not.toHaveBeenCalled();
    expect(
      (vibeLearningDBManager as any).chunkMetadataLegacySchemaMode.has(
        "test-project-1",
      ),
    ).toBe(false);
    expect(
      (vibeLearningDBManager as any).chunkMetadataLegacySchemaMode.has(
        "test-project-2",
      ),
    ).toBe(false);
    expect(
      (vibeLearningDBManager as any).chunkMetadataLegacySchemaMode.has(
        "other-project-1",
      ),
    ).toBe(true);
    expect(
      (vibeLearningDBManager as any).chunkMetadataLegacyFallback.has(
        "test-project-1",
      ),
    ).toBe(false);
    expect(
      (vibeLearningDBManager as any).chunkMetadataLegacyFallback.has(
        "test-project-2",
      ),
    ).toBe(false);
    expect(
      (vibeLearningDBManager as any).chunkMetadataLegacyFallback.has(
        "other-project-1",
      ),
    ).toBe(true);
  });
});
