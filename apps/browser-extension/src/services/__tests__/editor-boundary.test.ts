import { expect, it } from "vitest";
import { getExtensionKit } from "../editorKit";
import { extensionMarkdown } from "../editorMarkdown";
import type { Descendant } from "slate";

it("编辑器不装配插件节点或插件样式", () => {
  const kit = getExtensionKit();
  expect(kit.elementTypes).not.toContain("custom-block");
  expect(getExtensionKit()).toBe(kit);
  expect(document.head.querySelector("style[data-tau-editor-plugin]")).toBeNull();
});

it("ABC 缺插件时保留原节点及源码围栏", () => {
  const node = {
    type: "abc",
    content: "X:1\nK:C\nC D E F |",
    children: [{ type: "formatted", text: "" }],
  };
  const markdown = extensionMarkdown.getMarkdown([node] as unknown as Descendant[]);
  expect(markdown).toContain("tau-node");
  expect(extensionMarkdown.importFromMarkdown(markdown)).toEqual([node]);
  const source = "```abc\n" + node.content + "\n```";
  const value = extensionMarkdown.importFromMarkdown(source);
  expect(value[0].type).not.toBe("abc");
  expect(extensionMarkdown.getMarkdown(value)).toContain(node.content);
});
it("未支持的围栏作为普通代码保留，不调用插件codec", () => {
  const source = "\x60\x60\x60custom-block\nconst Component = () => <b>内容</b>;\n\x60\x60\x60";
  const value = extensionMarkdown.importFromMarkdown(source);
  expect(value[0]).not.toHaveProperty("type", "custom-block");
  expect(extensionMarkdown.getMarkdown(value)).toContain("const Component");
});
