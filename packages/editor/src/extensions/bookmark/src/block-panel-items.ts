import { editorT, editorAliases } from "../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { Bookmark } from "lucide-react";
import { Transforms, type Editor } from "slate";
import { captureInsertionSubmission, notifierOf, type IBlockPanelListItem } from "@tau/editor/api";

import { insertBookmark } from "./operations";
import { isBookmarkUrl, normalizeBookmarkUrl } from "./url";

/** 输入网址后在原光标处插入；输入框由提示服务承接（桌面 Dialog，移动底部面板） */
export const openBookmarkUrlInput = async (editor: Editor) => {
  const anchor = captureInsertionSubmission(editor);
  const notifier = notifierOf(editor);
  try {
    if (anchor.check()) return;
    const value = await notifier.prompt({
      signal: anchor.signal,
      get title() {
        return editorT(editor, "image.bookmark.add");
      },
      get placeholder() {
        return editorT(editor, "image.bookmark.url");
      },
      get confirmText() {
        return editorT(editor, "image.bookmark.addConfirm");
      },
      inputMode: "url",
      validate: value =>
        isBookmarkUrl(normalizeBookmarkUrl(value))
          ? undefined
          : editorT(editor, "image.bookmark.urlRequired"),
    });
    if (!value) return;
    anchor.commit(({ range }) => {
      Transforms.select(editor, range);
      insertBookmark(editor, normalizeBookmarkUrl(value));
    });
  } finally {
    anchor.dispose();
  }
};

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const blockPanelItems: IBlockPanelListItem[] = [
    {
      icon: Bookmark,
      get title() {
        return editorT(editor, "block.bookmark");
      },
      keywords: [
        ...[
          editorT(editor, "image.paste.bookmark"),
          "书签",
          "bookmark",
          "链接卡片",
          "shuqian",
          "wangye",
        ],
        ...editorAliases("block.bookmark"),
      ],
      get description() {
        return editorT(editor, "block.bookmarkDescription");
      },
      onClick: editor => void openBookmarkUrlInput(editor),
    },
  ];

  return blockPanelItems;
};
export default getItems;
