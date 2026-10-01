import { createEditor, Editor, Transforms } from "slate";
import { expect, it } from "vitest";
import { createEditorKit } from "@tau/editor";
import { createParagraph } from "@tau/editor/api";
import { createMarkdownProcessor } from "@tau/markdown";
import webview, { insertWebview, WebLinkSourceType } from "../index";
import { webviewCodec } from "../../markdown";

it("公开声明登记 void 节点，公开插入保留默认来源和持久字段", () => {
  const kit = createEditorKit({ extensions: [webview] });
  let editor = createEditor();
  for (const plugin of kit.assembly.plugins) editor = plugin(editor);
  editor.children = [createParagraph()];
  Transforms.select(editor, Editor.start(editor, [0]));
  insertWebview(editor, { url: "https://example.com" });
  expect(editor.children).toEqual([
    {
      type: "webview",
      url: "https://example.com",
      height: 400,
      sourceType: WebLinkSourceType.REMOTE,
      children: [{ type: "formatted", text: "" }],
    },
  ]);
  const node = editor.children[0];
  if (!("children" in node)) throw new Error("没有插入元素");
  expect(editor.isVoid(node)).toBe(true);
  const processor = createMarkdownProcessor({ codecs: [webviewCodec] });
  expect(processor.getMarkdown(editor.children)).toContain(
    '<iframe src="https://example.com" width="100%" height="400"'
  );
});
