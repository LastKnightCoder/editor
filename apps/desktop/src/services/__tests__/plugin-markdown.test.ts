import { beforeAll, expect, it } from "vitest";
import { pluginMarkdown } from "../plugin-markdown";
import { getMarkdown, importFromMarkdown } from "@/utils/markdown";
import type { Descendant } from "@tau/plugins";
import useDynamicExtensionsStore from "../../stores/useDynamicExtensionsStore";

beforeAll(() => useDynamicExtensionsStore.getState().initExtensions(), 30_000);

it("复用桌面语法，任务列表、表格和代码转换不修改传入节点", async () => {
  const source =
    "# 标题\n\n* [x] 完成\n* [ ] 待办\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst x = 1\n```";
  const result = await pluginMarkdown.deserialize(source);
  const stable = (value: unknown) =>
    JSON.parse(JSON.stringify(value), (key, value) => (key === "uuid" ? "<uuid>" : value));
  expect(stable(result.nodes)).toEqual(stable(importFromMarkdown(source)));
  const before = structuredClone(result.nodes);
  const serialized = await pluginMarkdown.serialize(result.nodes);
  expect(serialized.markdown).toBe(getMarkdown(before));
  expect(serialized.markdown).toContain("[x]");
  expect(result.nodes).toEqual(before);
});

it("未知节点报告位置，自定义 codec 只参与当前调用", async () => {
  const nodes = [
    { type: "example", children: [{ type: "formatted", text: "hello" }] },
  ] as unknown as Descendant[];
  expect((await pluginMarkdown.serialize(nodes)).warnings[0]).toMatchObject({
    code: "UNSUPPORTED_NODE",
    path: [0],
  });
  const custom = await pluginMarkdown.serialize(nodes, {
    codecs: [{ type: "example", serializer: { toMarkdown: (_node, text) => `**${text}**` } }],
  });
  expect(custom.markdown).toBe("**hello**");
  expect(custom.warnings).toEqual([]);
  expect((await pluginMarkdown.serialize(nodes)).warnings).toHaveLength(1);
});

it("渲染 HTML 使用同一解析结果；取消不继续转换", async () => {
  const result = await pluginMarkdown.render("# Hello\n\n**world**");
  expect(result.html).toContain("Hello");
  expect(result.html).toContain("<strong>world</strong>");
  await expect(
    pluginMarkdown.deserialize("x", { signal: AbortSignal.abort() })
  ).rejects.toMatchObject({ name: "AbortError" });
});
