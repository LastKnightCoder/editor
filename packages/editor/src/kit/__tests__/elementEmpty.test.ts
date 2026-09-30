import { createEditor, type Element } from "slate";
import { describe, expect, it } from "vitest";
import { registerElementEmpty, isDeclaredElementEmpty } from "../elementEmpty";
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
