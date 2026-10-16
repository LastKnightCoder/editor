import { expect, it } from "vitest";
import { initializeContentPlugins, contentPlugins } from "../contentPlugins";
import { getMobileContentKit } from "../editorKit";
import { mobileMarkdown } from "../editorMarkdown";

it("从分发包启动插件，将同一份扩展与 codec 装配到正式编辑器", async () => {
  const before = getMobileContentKit();
  expect(before.elementTypes).not.toContain("custom-block");
  await initializeContentPlugins();
  const kit = getMobileContentKit();
  expect(kit.elementTypes).toContain("custom-block");
  expect(getMobileContentKit()).toBe(kit);
  expect(contentPlugins.list().map(plugin => plugin.id)).toContain("tau.custom-block");
  const source = "\x60\x60\x60custom-block\nconst Component = () => <b>内容</b>;\n\x60\x60\x60";
  const value = mobileMarkdown.importFromMarkdown(source);
  expect(value[0]).toMatchObject({
    type: "custom-block",
    content: "const Component = () => <b>内容</b>;",
  });
  expect(mobileMarkdown.getMarkdown(value).trim()).toBe(source);
  expect(
    document.head.querySelector('style[data-tau-editor-plugin="tau.custom-block"]')
  ).not.toBeNull();
});
