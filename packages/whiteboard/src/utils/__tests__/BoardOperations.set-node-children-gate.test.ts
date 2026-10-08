import { describe, it, expect, vi, afterEach } from "vitest";
import BoardOperations from "../BoardOperations";
import type { BoardElement, Operation } from "../../types";

const createRect = (id: string): BoardElement => ({
  id,
  type: "rect",
  x: 0,
  y: 0,
  width: 100,
  height: 80,
});

afterEach(() => {
  // 清理强制标记，避免影响其他测试文件。
  delete (globalThis as unknown as { __TAU_WHITEBOARD_FORCE_DEV__?: boolean })
    .__TAU_WHITEBOARD_FORCE_DEV__;
  vi.restoreAllMocks();
});

describe("BoardOperations - set_node(children) 门禁", () => {
  it("DEV：set_node 携带 children 会抛异常（避免结构变化偷渡到 set_node）", () => {
    (
      globalThis as unknown as { __TAU_WHITEBOARD_FORCE_DEV__?: boolean }
    ).__TAU_WHITEBOARD_FORCE_DEV__ = true;

    const base: BoardElement[] = [
      {
        ...createRect("parent"),
        type: "test-gate",
        children: [createRect("c1")],
      },
    ];

    // 故意绕过类型门禁：验证运行时门禁在 “any/JS 调用” 下仍能拦截。
    const op = {
      type: "set_node",
      path: [0],
      properties: { children: base[0].children },
      newProperties: { children: [createRect("c1"), createRect("c2")] },
    } as unknown as Operation;

    expect(() =>
      BoardOperations.applyOperations({ children: JSON.parse(JSON.stringify(base)) }, [op], {
        skipSelectionOperations: true,
        skipViewPortOperations: true,
      })
    ).toThrow(/禁止 set_node\(children\)/);
  });

  it("PROD：set_node(children) 只 warning 且去重，同时 metadata.changedElements 会按子树记录（兼容老逻辑）", () => {
    (
      globalThis as unknown as { __TAU_WHITEBOARD_FORCE_DEV__?: boolean }
    ).__TAU_WHITEBOARD_FORCE_DEV__ = false;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const base: BoardElement[] = [
      {
        ...createRect("parent"),
        type: "test-gate",
        children: [createRect("c1")],
      },
    ];

    const op = {
      type: "set_node",
      path: [0],
      properties: { children: base[0].children },
      newProperties: { children: [createRect("c1"), createRect("c2")] },
    } as unknown as Operation;

    const applyOnce = () =>
      BoardOperations.applyOperations({ children: JSON.parse(JSON.stringify(base)) }, [op], {
        skipSelectionOperations: true,
        skipViewPortOperations: true,
      });

    const result = applyOnce();
    expect(result.data.children[0].children?.map(c => c.id)).toEqual(["c1", "c2"]);
    expect(result.metadata.changedElements.map(el => el.id)).toEqual(["parent", "c1", "c2"]);

    // 相同 “元素类型 + 字段形状” 的调用点仅提示一次
    applyOnce();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
