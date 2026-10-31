import { BUILTIN_CONTENT_RESOURCES } from "@tau/db-schema/content-resources";
import { defineElement, defineExtension } from "@tau/editor/api";
import "./augmentations";

import type { BookmarkElement } from "./types";
import BookmarkCard from "./components/BookmarkCard";
import PasteMenuLayer from "./components/PasteMenuLayer";
import blockPanelItems from "./block-panel-items";
import { bookmarkCommands, bookmarkMenuItems } from "./menu";
import { claimsBookmarkPaste, runBookmarkPaste } from "./paste";

/** 书签声明需排在链接扩展之前：空段落的网址粘贴先由这里认领。 */
const bookmarkExtension = defineExtension({
  id: "tau.bookmark",
  elements: [
    defineElement<BookmarkElement>({
      type: "bookmark",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      resources: BUILTIN_CONTENT_RESOURCES.bookmark,
      render: BookmarkCard,
      frame: true,
      drag: true,
      ingest: {
        text: {
          when: claimsBookmarkPaste,
          run: ({ editor, data }) => runBookmarkPaste(editor, data),
        },
      },
    }),
  ],
  layers: [PasteMenuLayer],
  blockPanel: blockPanelItems,
  commands: bookmarkCommands,
  menu: bookmarkMenuItems,
});

export default bookmarkExtension;
export type { BookmarkElement, BookmarkMeta, BookmarkAppearance } from "./types";
export { insertBookmark, fetchBookmarkMeta } from "./operations";
export { openBookmarkUrlInput } from "./block-panel-items";
export { bookmarkDisplay } from "./display";
