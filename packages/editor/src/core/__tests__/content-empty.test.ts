import { expect, it } from "vitest";
import { createContentMetrics, isContentEmpty } from "@tau/db-schema/content-metrics";

it("零字数的媒体、未知节点与标点内容都不是空文档", () => {
  const count = createContentMetrics().count;
  for (const node of [
    { type: "image", url: "image.png", children: [{ text: "" }] },
    { type: "unknown", payload: { text: "私有内容" }, children: [{ text: "" }] },
    { type: "paragraph", children: [{ text: "！！！" }] },
  ]) {
    expect(count([node])).toBe(0);
    expect(isContentEmpty([node])).toBe(false);
  }
});

it("空段落可清理，损坏数据与循环引用保守保留", () => {
  expect(isContentEmpty([])).toBe(true);
  expect(isContentEmpty([{ type: "paragraph", children: [{ text: " \n" }] }])).toBe(true);
  expect(isContentEmpty(null)).toBe(false);
  expect(isContentEmpty([{}])).toBe(false);
  const node = { type: "paragraph", children: [] as unknown[] };
  node.children.push(node);
  expect(isContentEmpty([node])).toBe(false);
});
