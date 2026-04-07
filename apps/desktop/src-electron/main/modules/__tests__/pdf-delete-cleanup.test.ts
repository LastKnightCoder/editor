import { describe, expect, it, vi } from "vitest";

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
      name: "/tmp/main.db",
      prepare: vi.fn((sql: string) => ({
        run: (...args: unknown[]) => {
          runCalls.push({ sql, args });
          if (sql === "DELETE FROM pdfs WHERE id = ?") {
            return { changes: 1 };
          }
          return { changes: 0 };
        },
      })),
      transaction: vi.fn((fn: () => number) => fn),
    } as any;

    const changes = PdfTable.removePdf(db, 42);

    expect(changes).toBe(1);
    expect(runCalls).toEqual([
      { sql: "DELETE FROM pdf_annotations WHERE pdf_id = ?", args: [42] },
      { sql: "DELETE FROM pdf_bookmarks WHERE pdf_id = ?", args: [42] },
      { sql: "DELETE FROM pdf_chats WHERE pdf_id = ?", args: [42] },
      { sql: "DELETE FROM pdfs WHERE id = ?", args: [42] },
    ]);
    expect(mockFns.deleteDatabase).toHaveBeenCalledWith("main.db", 42);
  });
});
