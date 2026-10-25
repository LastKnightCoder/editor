import { describe, expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { codeBlockCodec, codeBlockV2Codec } from "../extensions/code-block/markdown";
import type { CodeBlockV2Element } from "../types";

const processor = createMarkdownProcessor({ codecs: [codeBlockV2Codec] });

describe("代码步骤 Markdown", () => {
  it("普通围栏导入一个步骤，不伪造根源码字段映射", () => {
    const nodes = processor.importFromMarkdown("```ts\nconst n = 1;\n```");
    expect(nodes[0]).toMatchObject({
      type: "code-block",
      children: [{ type: "code-step", code: "const n = 1;" }],
    });
    expect(nodes[0]).not.toHaveProperty("code");
    const exported = processor.getMarkdownWithPositions(nodes);
    expect(exported.markdown).toContain("const n = 1;");
    expect(
      exported.positionMap.getMappings().filter(mapping => mapping.type === "element")
    ).toHaveLength(1);
  });

  it("多步源码、标题、高亮和代码内围栏完整往返，导出不含当前查看步骤", () => {
    const block: CodeBlockV2Element = {
      type: "code-block",
      language: "typescript",
      uuid: "block",
      filename: "demo.ts",
      children: [
        {
          type: "code-step",
          code: "first\n```nested\nend",
          title: "起点",
          highlightLines: "1",
          children: [{ type: "formatted", text: "" }],
        },
        {
          type: "code-step",
          code: "second\n中文",
          title: "终点",
          highlightLines: "2",
          children: [{ type: "formatted", text: "" }],
        },
      ],
    };
    const markdown = processor.getMarkdown([block]);
    expect(markdown.startsWith("````typescript")).toBe(true);
    const restored = processor.importFromMarkdown(markdown)[0] as CodeBlockV2Element;
    expect(restored.children).toEqual(block.children);
    expect(restored.filename).toBe("demo.ts");
    expect(restored).not.toHaveProperty("magicMove");
    expect(restored).not.toHaveProperty("activeStep");
  });

  it("旧格式围栏与载荷冲突时保留两份，旧版导出也不覆盖根源码", () => {
    const oldProcessor = createMarkdownProcessor({ codecs: [codeBlockCodec] });
    const source = {
      type: "code-block",
      language: "text",
      uuid: "old",
      code: "根源码",
      magicMove: {
        v: 1,
        activeStep: 0,
        steps: [{ id: "first", code: "步骤源码" }],
      },
      children: [{ type: "formatted", text: "" }],
    } as const;
    const markdown = oldProcessor.getMarkdown([source] as never);
    const old = oldProcessor.importFromMarkdown(markdown)[0];
    expect(old).toMatchObject({ code: "根源码", magicMove: { steps: [{ code: "步骤源码" }] } });
    const current = processor.importFromMarkdown(markdown)[0] as CodeBlockV2Element;
    expect(current.children.map(step => step.code)).toEqual(["步骤源码", "根源码"]);
    expect(current.children[1].title).toBe("恢复的围栏源码");
  });

  it("不能识别的步骤版本和损坏载荷拒绝导入，不丢弃为普通源码", () => {
    const encode = (value: unknown) => btoa(JSON.stringify(value));
    for (const payload of [
      { v: 3, steps: [] },
      { v: 2, steps: [] },
      { v: 1, activeStep: 0, steps: [{ code: 7 }] },
    ]) {
      expect(() =>
        processor.importFromMarkdown(`\`\`\`ts smm=${encode(payload)}\nsource\n\`\`\``)
      ).toThrow();
    }
  });
});
