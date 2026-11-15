import { expect, it } from "vitest";
import { initialBlockCount, needsMarkdownViewport } from "../markdownViewport";
import type { Descendant } from "slate";

const paragraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

it("短正文直接编辑，大量块或巨大单块启用视口", () => {
  expect(needsMarkdownViewport([paragraph("短文")])).toBe(false);
  expect(needsMarkdownViewport(Array.from({ length: 200 }, () => paragraph("正文")))).toBe(true);
  expect(needsMarkdownViewport([paragraph("文".repeat(60000))])).toBe(true);
});

it("首屏只挑选挂载数量，完整块和未知字段仍保留", () => {
  const nodes = Array.from({ length: 200 }, (_, index) => ({
    ...paragraph(`正文${index}`),
    vendor: { keep: true },
  }));
  const original = structuredClone(nodes);
  const count = initialBlockCount(nodes, 800);
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(nodes.length);
  expect(nodes).toEqual(original);
});

it("巨大首块完整挂载，不挤占后续块的初始预算", () => {
  const raw = "正文".repeat(30000),
    node = paragraph(raw);
  expect(initialBlockCount([node, paragraph("后文")], 800)).toBe(1);
  expect(node).toEqual(paragraph(raw));
  const code = {
    type: "code-block",
    code: raw,
    language: "text",
    uuid: "code",
    children: [{ type: "formatted", text: "" }],
  } as unknown as Descendant;
  expect(needsMarkdownViewport([code])).toBe(true);
});

it("预览代码块运行时身份隔离，不改未知节点和持久化数据", async () => {
  const { isolatePreviewContent } = await import("../imagePreviewContent");
  const code = {
    type: "code-block",
    uuid: "original",
    language: "text",
    code: "内容",
    vendor: { keep: true },
    children: [{ type: "formatted", text: "" }],
  } as unknown as Descendant;
  const unknown = {
    type: "vendor.block",
    children: [code],
    payload: { keep: true },
  } as unknown as Descendant;
  const result = isolatePreviewContent([code, unknown], "preview", type => type === "code-block");
  expect(result[0]).toMatchObject({
    uuid: "preview-original",
    code: "内容",
    vendor: { keep: true },
  });
  expect(result[1]).toBe(unknown);
  expect(code).toMatchObject({ uuid: "original" });
});
