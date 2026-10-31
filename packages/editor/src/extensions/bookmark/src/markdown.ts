import type { MarkdownCodec } from "@tau/markdown";
import type { BookmarkElement } from "./types";

const escapeText = (value: string) => value.replace(/([\\[\]])/g, "\\$1");

/** 导出为独占一段的 `[标题](网址)`；导入不反向识别，普通链接保持为链接。 */
export const bookmarkCodec: MarkdownCodec = {
  type: "bookmark",
  isVoid: true,
  serializer: {
    isBlock: true,
    toMarkdown: element => {
      const bookmark = element as unknown as BookmarkElement;
      const title = bookmark.overrides?.title?.trim() || bookmark.meta?.title?.trim();
      return `[${escapeText(title || bookmark.url)}](${bookmark.url})`;
    },
  },
};
