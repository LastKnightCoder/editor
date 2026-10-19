import { createEditor, Editor, type Descendant } from "slate";
import { createEditorKit } from "@tau/editor";
import { createParagraph } from "@tau/editor/api";
import extension from "../index";

export const createLinkEditor = (...blocks: Descendant[][]) => {
  const editor = createEditorKit({ extensions: [extension] }).assembly.plugins.reduce(
    (value, plugin) => plugin(value),
    createEditor()
  );
  editor.children = blocks.map(children => {
    const paragraph = createParagraph();
    paragraph.children = children as typeof paragraph.children;
    return paragraph;
  });
  Editor.normalize(editor, { force: true });
  return editor;
};

export const text = (value: string, marks: Record<string, unknown> = {}) =>
  ({ type: "formatted", text: value, ...marks }) as Descendant;
export const link = (url: string, ...children: Descendant[]) =>
  ({ type: "link", url, children }) as unknown as Descendant;
