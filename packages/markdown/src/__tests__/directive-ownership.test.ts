import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import { createMarkdownProcessor } from "../index.ts";

describe("directive 类型归属", () => {
  it("允许扩展认领任意业务类型名，两种导入入口一致", () => {
    const node = {
      type: "question",
      children: [{ type: "formatted", text: "外部扩展内容" }],
    } as unknown as Descendant;
    const processor = createMarkdownProcessor({
      codecs: [{ type: "question", directives: { question: () => node } }],
    });
    expect(processor.importFromMarkdown("::question")).toEqual([node]);
    expect(processor.importFromMarkdownWithPositions("::question").content).toEqual([node]);
  });
});
