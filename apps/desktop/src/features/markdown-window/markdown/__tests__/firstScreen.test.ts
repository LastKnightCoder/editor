import { expect, it } from "vitest";
import { firstScreenContent, needsFirstScreen } from "../firstScreen";
import type { Descendant } from "slate";

const paragraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

it("短正文沿用直接编辑，大量块或巨大单块启用首屏", () => {
  expect(needsFirstScreen([paragraph("短文")])).toBe(false);
  expect(needsFirstScreen(Array.from({ length: 200 }, () => paragraph("正文")))).toBe(true);
  expect(needsFirstScreen([paragraph("文".repeat(60000))])).toBe(true);
});

it("首屏保留完整块和未知字段，预览截取不改完整正文", () => {
  const nodes = Array.from({ length: 200 }, (_, index) => ({
    ...paragraph(`正文${index}`),
    vendor: { keep: true },
  }));
  const original = structuredClone(nodes);
  const head = firstScreenContent(nodes);
  expect(head.length).toBeGreaterThan(0);
  expect(head.length).toBeLessThan(nodes.length);
  expect(head[0]).toBe(nodes[0]);
  expect(nodes).toEqual(original);
});

it("巨大首块不截断其结构，回退完整编辑路径且不修改数据", () => {
  const raw = "正文".repeat(30000),
    node = paragraph(raw);
  expect(firstScreenContent([node])).toEqual([]);
  expect(node).toEqual(paragraph(raw));
  const code = {
    type: "code-block",
    code: raw,
    language: "text",
    uuid: "code",
    children: [{ type: "formatted", text: "" }],
  } as unknown as Descendant;
  expect(firstScreenContent([code])).toEqual([]);
});

it("预览代码块运行时身份隔离，不改未知节点和持久化数据", async () => {
  const { isolatePreviewContent } = await import("../firstScreen");
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
