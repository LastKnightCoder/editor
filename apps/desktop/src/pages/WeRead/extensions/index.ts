import type { EditorKit } from "@tau/editor/src";
import { createDesktopKit } from "@/services/editorKit";
import WeReadMetadataExtension from "./weread-metadata";
import WeReadChapterExtension from "./weread-chapter";
import WeReadBookmarkExtension from "./weread-bookmark";

export { WeReadMetadataExtension, WeReadChapterExtension, WeReadBookmarkExtension };

/**
 * 微信读书笔记的 kit（ER-016）：底座加元数据、章节、书签三个元素，不含库内块。
 * 只服务 legacy 的 `pages/WeRead`——新架构 `features/weread` 不用编辑器，自己渲染划线。
 */
let cached: EditorKit | null = null;
export function getWeReadKit(): EditorKit {
  return (cached ??= createDesktopKit([
    new WeReadMetadataExtension(),
    new WeReadChapterExtension(),
    new WeReadBookmarkExtension(),
  ]));
}
