import { expect, it } from "vitest";
import { getExtensionKit } from "../editorKit";
import { extensionMarkdown } from "../editorMarkdown";

it("编辑器不装配插件节点或插件样式", () => {
  const kit = getExtensionKit();
  expect(kit.elementTypes).not.toContain("custom-block");
  expect(getExtensionKit()).toBe(kit);
  expect(document.head.querySelector("style[data-tau-editor-plugin]")).toBeNull();
});
it("未支持的围栏作为普通代码保留，不调用插件codec", () => {
  const source = "\x60\x60\x60custom-block\nconst Component = () => <b>内容</b>;\n\x60\x60\x60";
  const value = extensionMarkdown.importFromMarkdown(source);
  expect(value[0]).not.toHaveProperty("type", "custom-block");
  expect(extensionMarkdown.getMarkdown(value)).toContain("const Component");
});
