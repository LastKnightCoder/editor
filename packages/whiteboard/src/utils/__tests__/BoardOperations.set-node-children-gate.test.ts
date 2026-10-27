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

afterEach(() => vi.unstubAllEnvs());

describe.each([true, false])("set_node(children) 门禁：DEV=%s", dev => {
  it.each(["properties", "newProperties"] as const)(
    "拒绝 %s 的 children，整批不污染原数据",
    key => {
      vi.stubEnv("DEV", dev);
      const child = createRect("child");
      const parent: BoardElement = { ...createRect("parent"), children: [child] };
      const base = [parent, createRect("sibling")];
      const before = structuredClone(base);
      // 绕过静态类型以验证 JavaScript 调用仍受运行时门禁约束。
      const invalid = {
        type: "set_node",
        path: [0],
        properties: {},
        newProperties: {},
        [key]: { children: undefined },
      } as unknown as Operation;
      expect(() =>
        BoardOperations.applyOperations({ children: base }, [
          { type: "set_node", path: [1], properties: { x: 0 }, newProperties: { x: 100 } },
          invalid,
        ])
      ).toThrow(/禁止 set_node\(children\)/);
      expect(base).toEqual(before);
      expect(base[0]).toBe(parent);
      expect(base[0].children![0]).toBe(child);
    }
  );

  it("普通父节点属性补丁只记录自身，不遍历或替换子节点", () => {
    vi.stubEnv("DEV", dev);
    const child = createRect("child");
    const parent: BoardElement = { ...createRect("parent"), children: [child] };
    const result = BoardOperations.applyOperations({ children: [parent] }, [
      {
        type: "set_node",
        path: [0],
        properties: { x: 0 },
        newProperties: { x: 10 },
      },
    ]);
    expect(result.metadata.changedElements.map(node => node.id)).toEqual(["parent"]);
    expect(result.data.children[0].children![0]).toBe(child);
    expect(parent.x).toBe(0);
    expect(result.data.children[0].x).toBe(10);
  });
});
