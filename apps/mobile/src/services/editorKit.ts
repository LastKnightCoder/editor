/**
 * Mobile 的 EditorKit：整个应用共用一份（docs/editor-refactor ER-004）。
 * 用函数延迟创建，避免与扩展模块的初始化顺序耦合（同 desktop，见 04 踩坑）。
 */
import { createEditorKit, createImageExtensions, type EditorKit } from "@tau/editor/src";
import { createMarkdownPasteImportExtension } from "@tau/editor/src";
import WebviewExtension from "@tau/editor-webview";
import {
  mobileEditorServices,
  mobileImageAppearance,
  mobileImportFromMarkdown,
} from "./editorRegistry";

let cached: EditorKit | null = null;

export function getMobileKit(): EditorKit {
  if (!cached) {
    cached = createEditorKit({
      extensions: [
        createMarkdownPasteImportExtension(mobileImportFromMarkdown),
        new WebviewExtension(),
        ...createImageExtensions({ appearance: mobileImageAppearance }),
      ],
      services: [mobileEditorServices],
      // createImageExtensions 按 type 替换内置 image / image-gallery
      override: true,
    });
  }
  return cached;
}
