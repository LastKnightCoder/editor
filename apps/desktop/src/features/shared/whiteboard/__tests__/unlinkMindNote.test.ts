import { afterEach, describe, expect, it, vi } from "vitest";
import { createWhiteboardSession, WHITEBOARD_DOCUMENT_VERSION, type Board } from "@tau/whiteboard";
import { bindDatabaseCommands, currentCommandScope } from "@/services/command-context";
import { unlinkMindNote } from "../unlinkMindNote";

const sessions: ReturnType<typeof createWhiteboardSession>[] = [];
const createBoard = () => {
  const session = createWhiteboardSession({
    children: [{ id: "mind", type: "mind-node", contentId: 7, contentTitle: "笔记", children: [] }],
    viewPort: { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    selection: { selectedElements: [], selectArea: null },
    version: WHITEBOARD_DOCUMENT_VERSION,
  });
  sessions.push(session);
  return session.api;
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
afterEach(() => {
  sessions.splice(0).forEach(session => session.dispose());
});

describe("脑图取消关联的引用一致性", () => {
  it.each(["隐藏后恢复", "只读切换"])("等待期间%s则补偿引用并保留关联", async mode => {
    const board = createBoard();
    const gate = deferred();
    let refCount = 2;
    const commands = {
      decrementContentRefCount: vi.fn(async () => {
        refCount--;
        await gate.promise;
      }),
      incrementContentRefCount: vi.fn(async () => {
        refCount++;
      }),
    };
    const pending = unlinkMindNote(board, "mind", commands);
    if (mode === "隐藏后恢复") {
      sessions.at(-1)!.setActive(false);
      sessions.at(-1)!.setActive(true);
    } else {
      sessions.at(-1)!.setReadonly(true);
      sessions.at(-1)!.setReadonly(false);
    }
    gate.resolve();
    expect(await pending).toBeNull();
    expect(refCount).toBe(2);
    expect(board.children[0].contentId).toBe(7);
    expect(commands.incrementContentRefCount).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("成功取消只减少一次引用并清除关联", async () => {
    const board = createBoard();
    const commands = {
      decrementContentRefCount: vi.fn(async () => {}),
      incrementContentRefCount: vi.fn(async () => {}),
    };
    expect(await unlinkMindNote(board, "mind", commands)).toBe(7);
    expect(board.children[0].contentId).toBeUndefined();
    expect(board.children[0].contentTitle).toBeUndefined();
    expect(commands.decrementContentRefCount).toHaveBeenCalledExactlyOnceWith(7);
    expect(commands.incrementContentRefCount).not.toHaveBeenCalled();
  });

  it("画布写入未成功时补偿引用并向调用方报告失败", async () => {
    const board = createBoard();
    const failingBoard: Board = { ...board, apply: () => {} };
    const commands = {
      decrementContentRefCount: vi.fn(async () => {}),
      incrementContentRefCount: vi.fn(async () => {}),
    };
    await expect(unlinkMindNote(failingBoard, "mind", commands)).rejects.toThrow(
      "取消关联笔记失败"
    );
    expect(commands.incrementContentRefCount).toHaveBeenCalledExactlyOnceWith(7);
    expect(board.children[0].contentId).toBe(7);
  });

  it("引用减少失败时不修改关联，也不增加引用", async () => {
    const board = createBoard();
    const commands = {
      decrementContentRefCount: vi.fn(async () => {
        throw new Error("数据库失败");
      }),
      incrementContentRefCount: vi.fn(async () => {}),
    };
    await expect(unlinkMindNote(board, "mind", commands)).rejects.toThrow("数据库失败");
    expect(board.children[0].contentId).toBe(7);
    expect(commands.incrementContentRefCount).not.toHaveBeenCalled();
  });

  it("等待期间关联被更换，不覆盖新关联且补回原引用", async () => {
    const board = createBoard();
    const gate = deferred();
    const commands = {
      decrementContentRefCount: vi.fn(async () => {
        await gate.promise;
      }),
      incrementContentRefCount: vi.fn(async () => {}),
    };
    const pending = unlinkMindNote(board, "mind", commands);
    board.apply({
      type: "set_node",
      path: [0],
      properties: { contentId: 7 },
      newProperties: { contentId: 8 },
    });
    gate.resolve();
    expect(await pending).toBeNull();
    expect(board.children[0].contentId).toBe(8);
    expect(commands.incrementContentRefCount).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("切库后的补偿仍使用发起操作的原数据库", async () => {
    const board = createBoard();
    const gate = deferred();
    let active = "a";
    const counts: Record<string, number> = { a: 2, b: 9 };
    const commands = bindDatabaseCommands(
      {
        decrementContentRefCount: async () => {
          counts[currentCommandScope()?.databaseName ?? active]--;
          await gate.promise;
        },
        incrementContentRefCount: async () => {
          counts[currentCommandScope()?.databaseName ?? active]++;
        },
      },
      { databaseName: "a" }
    );
    const pending = unlinkMindNote(board, "mind", commands);
    active = "b";
    sessions.at(-1)!.setActive(false);
    gate.resolve();
    expect(await pending).toBeNull();
    expect(counts).toEqual({ a: 2, b: 9 });
  });
});
