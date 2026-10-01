import { createEditor, type Descendant, type Element } from "slate";
import { describe, expect, it } from "vitest";
import { registerElementEmpty, isDeclaredElementEmpty, isNodeEmpty } from "../elementEmpty";
import type { ElementSpec } from "../../api/extension";

const node = {
  type: "source-block",
  content: "",
  children: [{ type: "formatted", text: "" }],
} as unknown as Element;
const spec: ElementSpec = {
  type: "source-block",
  kind: "block",
  isVoid: true,
  render: () => null,
  isEmpty: element => (element as unknown as { content: string }).content === "",
};

describe("扩展空态声明", () => {
  it("基础文本和段落不需要服务或产品扩展，未知子节点不会被当空", () => {
    expect(isNodeEmpty({ type: "formatted", text: "" })).toBe(true);
    expect(isNodeEmpty({ type: "formatted", text: " " })).toBe(false);
    expect(isNodeEmpty({ type: "paragraph", children: [{ type: "formatted", text: "" }] })).toBe(
      true
    );
    expect(isNodeEmpty({ type: "paragraph", children: [node] } as unknown as Descendant)).toBe(
      false
    );
  });

  it("容器通过当前编辑器的声明判断子节点，缺失贡献保留内容", () => {
    const editor = createEditor();
    const container = { type: "custom-container", children: [node] } as unknown as Element;
    const containerSpec: ElementSpec = {
      type: "custom-container",
      kind: "block",
      render: () => null,
      isEmpty: (element, context) => element.children.every(context.isEmpty),
    };
    registerElementEmpty(editor, [containerSpec]);
    expect(isNodeEmpty(container, editor)).toBe(false);
    registerElementEmpty(editor, [spec]);
    expect(isNodeEmpty(container, editor)).toBe(true);
    registerElementEmpty(editor, [{ ...spec, isEmpty: undefined }]);
    expect(isNodeEmpty(container, editor)).toBe(false);
  });

  it("拒绝真值替代、异步及循环递归判断，不能触发空态删除", async () => {
    const editor = createEditor();
    for (const value of [
      "true",
      {},
      Promise.resolve(true),
      Promise.reject(new Error("异步失败")),
    ]) {
      registerElementEmpty(editor, [{ ...spec, isEmpty: () => value as boolean }]);
      expect(isNodeEmpty(node, editor)).toBe(false);
    }
    registerElementEmpty(editor, [
      {
        ...spec,
        isEmpty: (element, context) => context.isEmpty(element),
      },
    ]);
    expect(isNodeEmpty(node, editor)).toBe(false);
    await Promise.resolve();
  });

  it("每个编辑器独立登记，不凭空推断未知节点的空态", () => {
    const first = createEditor();
    const second = createEditor();
    registerElementEmpty(first, [spec]);
    expect(isDeclaredElementEmpty(first, node)).toBe(true);
    expect(isDeclaredElementEmpty(second, node)).toBe(false);
    expect(isDeclaredElementEmpty(undefined, node)).toBe(false);
  });

  it("扩展覆盖时移除先前的空态定义", () => {
    const editor = createEditor();
    registerElementEmpty(editor, [spec]);
    registerElementEmpty(editor, [{ ...spec, isEmpty: undefined }]);
    expect(isDeclaredElementEmpty(editor, node)).toBe(false);
  });

  it("谓词失败保留节点，不能触发空态删除", () => {
    const editor = createEditor();
    registerElementEmpty(editor, [
      {
        ...spec,
        isEmpty: () => {
          throw new Error("判定失败");
        },
      },
    ]);
    expect(isDeclaredElementEmpty(editor, node)).toBe(false);
  });
});
