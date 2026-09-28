import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const mockPaths = vi.hoisted(() => ({ dir: "" }));
vi.mock("../pi-session-paths", async importOriginal => {
  const actual = await importOriginal<typeof import("../pi-session-paths")>();
  return { ...actual, chatSessionDirOfDb: () => mockPaths.dir || undefined };
});

vi.mock("../tables/operation", () => ({
  default: {
    insertOperation: vi.fn(),
  },
}));

const mockFns = vi.hoisted(() => ({
  deleteDatabase: vi.fn(),
}));

vi.mock("../pdf-index-db", () => ({
  default: {
    deleteDatabase: mockFns.deleteDatabase,
  },
}));

import PdfTable from "../tables/pdf";

describe("PdfTable.removePdf", () => {
  it("删除 PDF 时应清理关联数据并删除 sidecar 索引库", () => {
    mockFns.deleteDatabase.mockClear();
    const runCalls: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      name: ":memory:",
      memory: true,
      prepare: vi.fn((sql: string) => ({
        run: (...args: unknown[]) => {
          runCalls.push({ sql, args });
          if (sql === "DELETE FROM pdfs WHERE id = ?") {
            return { changes: 1 };
          }
          return { changes: 0 };
        },
        // 本 PDF 名下的会话目录行（M4 起 PDF 对话在 chat_session）：这里没有
        all: () => [],
      })),
      transaction: vi.fn((fn: () => number) => fn),
    } as any;

    const changes = PdfTable.removePdf(db, 42);

    expect(changes).toBe(1);
    expect(runCalls).toEqual([
      { sql: "DELETE FROM pdf_annotations WHERE pdf_id = ?", args: [42] },
      { sql: "DELETE FROM pdf_bookmarks WHERE pdf_id = ?", args: [42] },
      { sql: "DELETE FROM pdfs WHERE id = ?", args: [42] },
    ]);
    expect(mockFns.deleteDatabase).toHaveBeenCalledWith(":memory:", 42);
  });

  it("PDF 的对话（会话目录行与会话文件）随 PDF 一起删", () => {
    const workDir = mkdtempSync(join(tmpdir(), "pdf-chat-"));
    const sessionDir = join(workDir, "sessions", "main");
    mkdirSync(sessionDir, { recursive: true });
    const sessionFile = join(sessionDir, "1_abc.jsonl");
    writeFileSync(sessionFile, "{}\n");
    mockPaths.dir = sessionDir;

    const deleted: unknown[][] = [];
    const db = {
      name: "/tmp/main.db",
      prepare: vi.fn((sql: string) => ({
        run: (...args: unknown[]) => {
          if (sql.startsWith("DELETE FROM chat_session")) deleted.push(args);
          return { changes: 1 };
        },
        all: () =>
          sql.includes("FROM chat_session")
            ? [{ id: "abc", session_file: "1_abc.jsonl", scope: "pdf-chat", domain_ref: "42" }]
            : [],
        get: () => undefined,
      })),
      transaction: vi.fn((fn: () => number) => fn),
    } as any;

    PdfTable.removePdf(db, 42);

    expect(deleted).toEqual([["abc"]]);
    expect(existsSync(sessionFile)).toBe(false);
    rmSync(workDir, { recursive: true, force: true });
  });
});
