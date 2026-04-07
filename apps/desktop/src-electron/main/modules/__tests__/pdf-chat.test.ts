import { describe, expect, it, vi } from "vitest";

vi.mock("../tables/operation", () => ({
  default: {
    insertOperation: vi.fn(),
  },
}));

import PdfChatTable from "../tables/pdf-chat";

describe("PdfChatTable.createChat", () => {
  it("父会话未显式提供 branchIndex 时在事务内分配下一个分支编号", () => {
    const insertRuns: unknown[][] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        if (
          sql.includes(
            "SELECT COALESCE(MAX(branch_index), -1) + 1 AS next_index",
          )
        ) {
          return {
            get: (parentChatId: number) => {
              expect(parentChatId).toBe(7);
              return { next_index: 2 };
            },
          };
        }

        if (sql.includes("INSERT INTO pdf_chats")) {
          return {
            run: (...args: unknown[]) => {
              insertRuns.push(args);
              return { lastInsertRowid: 11 };
            },
          };
        }

        if (sql === "SELECT * FROM pdf_chats WHERE id = ?") {
          return {
            get: (id: number) => ({
              id,
              pdf_id: 3,
              create_time: 1000,
              update_time: 1000,
              messages: "[]",
              title: "分支会话",
              archived: 0,
              parent_chat_id: 7,
              branch_index: 2,
            }),
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
      transaction: vi.fn((fn: () => number) => fn),
    } as any;

    const chat = PdfChatTable.createChat(db, {
      pdfId: 3,
      messages: [],
      title: "分支会话",
      parentChatId: 7,
    });

    expect(insertRuns).toHaveLength(1);
    expect(insertRuns[0]?.[6]).toBe(2);
    expect(chat.branchIndex).toBe(2);
    expect(chat.parentChatId).toBe(7);
  });
});
