/**
 * Mobile 的 EditorKit：**按场景**一个（docs/editor-refactor ER-016），
 * 每个只注册该场景需要的扩展（ER-017）。命名与 desktop 对齐，实现可以是 mobile 自己的。
 *
 * 用函数延迟创建，避免与扩展模块的初始化顺序耦合（同 desktop，见 04 踩坑）。
 */
import { createEditorKit, type EditorKit } from "@tau/editor";
import { createImageExtensions } from "@tau/editor-media";
import { standardExtensions } from "../../../../editor-extensions/standard";
import { createMarkdownPasteImportExtension, type AnyExtension } from "@tau/editor";
import webviewExtension from "@tau/editor-webview";
import { diagramExtensions } from "@tau/editor-diagram";
import { htmlExtensions } from "@tau/editor-html";
import { previewMenuExtension } from "@tau/editor-source-view/menu";
import codeBlockExtension from "@tau/editor-code-block";
import { mathExtensions } from "@tau/editor-math";
import emojiExtension from "@tau/editor-emoji";
import { flashcardBlankExtension } from "../features/flashcard/blank/FlashcardBlankExtension";
import { mobileCardPreviewExtensions } from "../features/cards/editorExtensions";
import {
  mobileEditorServices,
  mobileImageAppearance,
  mobileImportFromMarkdown,
} from "./editorRegistry";

const byExtras = new Map<string, EditorKit>();

/** 底座：内置扩展 + mobile 静态扩展（markdown 粘贴导入、webview、图片覆盖）+ mobile 服务 */
function createMobileKit(extras: readonly AnyExtension[] = []): EditorKit {
  const key = extras
    .map(extension => ("type" in extension ? extension.type : extension.id))
    .join(",");
  let kit = byExtras.get(key);
  if (!kit) {
    kit = createEditorKit({
      extensions: [
        ...standardExtensions,
        ...diagramExtensions,
        ...htmlExtensions,
        previewMenuExtension,
        codeBlockExtension,
        ...mathExtensions,
        emojiExtension,
        createMarkdownPasteImportExtension(mobileImportFromMarkdown),
        webviewExtension,
        ...createImageExtensions({ appearance: mobileImageAppearance }),
        ...extras,
      ],
      services: [mobileEditorServices],
      // createImageExtensions 按 type 替换内置 image / image-gallery
      override: true,
    });
    byExtras.set(key, kit);
  }
  return kit;
}

/**
 * `contents` 表里的内容：卡片、文章、日记、项目文档，以及日程备注（`detailContentId`）
 * 与待办描述（`descriptionContentId`）——后两者虽然像「描述」，但存的是 content 且 desktop
 * 也读写同一条，所以必须覆盖跨端清单（`CONTENT_ELEMENT_TYPES`，见 P10）。
 */
export function getMobileContentKit(): EditorKit {
  return createMobileKit(mobileCardPreviewExtensions);
}

let flashcardBlank: AnyExtension | null = null;

/** 闪卡题干与背面补充：只多一个填空元素；背面与非挖空题不需要 */
export function getMobileFlashcardKit({ blanks = true }: { blanks?: boolean } = {}): EditorKit {
  if (!blanks) return createMobileKit();
  flashcardBlank ??= flashcardBlankExtension;
  return createMobileKit([flashcardBlank!]);
}
