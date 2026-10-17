import { expect, it } from "vitest";
import { initializeContentPlugins, contentPlugins } from "../contentPlugins";
import { getExtensionKit } from "../editorKit";
import { extensionMarkdown } from "../editorMarkdown";

it("从分发包启动插件，将同一份扩展与 codec 装配到正式编辑器", async () => {
  const before = getExtensionKit();
  expect(before.elementTypes).not.toContain("custom-block");
  await initializeContentPlugins();
  const kit = getExtensionKit();
  expect(kit.elementTypes).toContain("custom-block");
  expect(getExtensionKit()).toBe(kit);
  expect(contentPlugins.list().map(plugin => plugin.id)).toContain("tau.custom-block");
  const source = "\x60\x60\x60custom-block\nconst Component = () => <b>内容</b>;\n\x60\x60\x60";
  const value = extensionMarkdown.importFromMarkdown(source);
  expect(value[0]).toMatchObject({
    type: "custom-block",
    content: "const Component = () => <b>内容</b>;",
  });
  expect(extensionMarkdown.getMarkdown(value).trim()).toBe(source);
  expect(
    document.head.querySelector('style[data-tau-editor-plugin="tau.custom-block"]')
  ).not.toBeNull();
});
