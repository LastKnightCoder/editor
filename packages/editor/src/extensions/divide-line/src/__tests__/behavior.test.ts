import { createEditor, Transforms } from "slate";
import { expect, it } from "vitest";
import { createEditorKit } from "@tau/editor";
import { createParagraph } from "@tau/editor/api";
import extension, { insertDivideLine } from "../index";

it("分隔线显式安装后可插入，并贡献段落快捷语法", () => {
  const kit = createEditorKit({ extensions: [extension] });
  const editor = kit.assembly.plugins.reduce((value, plugin) => plugin(value), createEditor());
  editor.children = [createParagraph()];
  Transforms.select(editor, { path: [0, 0], offset: 0 });
  insertDivideLine(editor);
  expect(editor.children[0].type).toBe("divide-line");
  expect(
    kit.assembly.behaviors.get("paragraph")?.some(entry => entry.extension === "tau.divide-line")
  ).toBe(true);
});
