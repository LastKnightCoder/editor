import { expect, it } from "vitest";
import { getMobileContentKit } from "../editorKit";
import { mobileMarkdown } from "../editorMarkdown";

it("编辑器不装配插件节点或插件样式", () => {
  const kit = getMobileContentKit();
  expect(kit.elementTypes).not.toContain("custom-block");
  expect(getMobileContentKit()).toBe(kit);
  expect(document.head.querySelector("style[data-tau-editor-plugin]")).toBeNull();
});
it("未支持的围栏作为普通代码保留，不调用插件codec", () => {
  const source = "\x60\x60\x60custom-block\nconst Component = () => <b>内容</b>;\n\x60\x60\x60";
  const value = mobileMarkdown.importFromMarkdown(source);
  expect(value[0]).not.toHaveProperty("type", "custom-block");
  expect(mobileMarkdown.getMarkdown(value)).toContain("const Component");
});
