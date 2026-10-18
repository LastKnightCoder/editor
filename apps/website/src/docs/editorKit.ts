/** 文档页的 EditorKit：产品标准扩展 + 代码块、公式、表情，元素覆盖与 editorMarkdown 的 codec 对应 */
import { createEditorKit, type EditorKit } from "@tau/editor";
import codeBlockExtension from "@tau/editor-code-block";
import emojiExtension from "@tau/editor-emoji";
import { mathExtensions } from "@tau/editor-math";
import { standardExtensions } from "../../../../editor-extensions/standard";
import { createDocsEditorServices } from "./editorServices.tsx";
import { navigate } from "./router.ts";

let kit: EditorKit | null = null;

/** 延迟到首次渲染再建，避免与扩展模块的初始化顺序耦合 */
export function getDocsKit(): EditorKit {
  kit ??= createEditorKit({
    extensions: [...standardExtensions, codeBlockExtension, ...mathExtensions, emojiExtension],
    services: [createDocsEditorServices(navigate)],
  });
  return kit;
}
