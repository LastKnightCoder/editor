import { createEditor, Editor, Node, Transforms } from "slate";
import { expect, it } from "vitest";
import { createEditorKit } from "@tau/editor";
import { createParagraph } from "@tau/editor/api";
import extension, { insertAnnotation, isAnnotationActive } from "../index";

it("注释插入折叠到选区末尾，保留正文和注释内容", () => {
  const editor = createEditorKit({ extensions: [extension] }).assembly.plugins.reduce(
    (value, plugin) => plugin(value),
    createEditor()
  );
  const paragraph = createParagraph();
  paragraph.children = [{ type: "formatted", text: "abcd" }];
  editor.children = [paragraph];
  expect(isAnnotationActive(editor)).toBe(false);
  insertAnnotation(editor, "未插入");
  Transforms.select(editor, {
    anchor: { path: [0, 0], offset: 1 },
    focus: { path: [0, 0], offset: 3 },
  });
  insertAnnotation(editor, "解释");
  expect(Node.string(editor)).toBe("abcd");
  const entries = [...Editor.nodes(editor, { at: [], match: node => node.type === "annotation" })];
  expect(entries).toHaveLength(1);
  expect(entries[0][0]).toMatchObject({ content: "解释" });
});
