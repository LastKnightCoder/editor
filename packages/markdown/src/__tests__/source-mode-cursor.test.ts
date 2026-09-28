import { describe, expect, it } from "vitest";

import { getMarkdownWithPositions, importFromMarkdownWithPositions } from "../index.ts";

/**
 * Markdown 窗口源码 ↔ 富文本切换时的光标对应（消费方：
 * apps/desktop/src/features/markdown-window/markdown/useSourceMode.ts）。
 * 覆盖普通文本、加粗、代码块内部、表格四种位置；Electron 侧手测前先由这里兜住。
 */
const SOURCE = [
  "普通一行文字",
  "",
  "带 **加粗** 的一行",
  "",
  "```ts",
  "const a = 1;",
  "const b = 2;",
  "```",
  "",
  "| 头 A | 头 B |",
  "| --- | --- |",
  "| 甲 | 乙 |",
  "",
].join("\n");

describe("源码 ↔ 富文本光标映射", () => {
  const { content, positionMap } = importFromMarkdownWithPositions(SOURCE);

  const slateAt = (line: number, ch: number) => positionMap.markdownToSlate({ line, ch });

  it("普通文本：源码光标落到对应文本节点", () => {
    const point = slateAt(0, 3);
    expect(point).not.toBeNull();
    expect(point!.offset).toBe(3);
  });

  it("加粗文本：光标落在加粗节点内，偏移扣掉 ** 前缀", () => {
    // "带 **加粗** 的一行"：第 4 列是「加」（前面是「带」、空格、两个星号），第 5 列是「粗」
    expect(slateAt(2, 4)!.offset).toBe(0);
    expect(slateAt(2, 5)!.offset).toBe(1);
  });

  it("代码块：源码光标能查到 code 属性映射与块内相对位置", () => {
    const hint = positionMap.getElementPropertyByMarkdown({ line: 5, ch: 6 });
    expect(hint?.mapping.elementType).toBe("code-block");
    expect(hint?.propertyName).toBe("code");
    expect(hint?.relativePos).toEqual({ line: 0, ch: 6 });
  });

  it("表格：光标落到单元格内的文本节点", () => {
    const point = slateAt(11, 3);
    expect(point).not.toBeNull();
    const cellPath = point!.path.slice(0, -1);
    expect(cellPath.length).toBeGreaterThanOrEqual(3);
  });

  it("反向：富文本光标能映射回源码行列", () => {
    const back = positionMap.slateToMarkdown({ path: slateAt(0, 3)!.path, offset: 3 });
    expect(back).toEqual({ line: 0, ch: 3 });
  });

  it("导出方向：代码块的 code 属性映射覆盖块内每一行", () => {
    const exported = getMarkdownWithPositions(content);
    const codeBlockPath = content.findIndex(
      node => (node as { type?: string }).type === "code-block"
    );
    const mapping = exported.positionMap.getElementMappingBySlatePath([codeBlockPath]);
    const range = mapping?.propertyMappings?.code;
    expect(range).toBeTruthy();
    expect(range!.mdEndLine - range!.mdStartLine).toBe(1);
  });
});
