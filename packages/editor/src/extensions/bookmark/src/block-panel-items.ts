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
      title: "添加网页书签",
      placeholder: "粘贴或输入网址",
      confirmText: "添加书签",
      inputMode: "url",
      validate: value =>
        isBookmarkUrl(normalizeBookmarkUrl(value)) ? undefined : "请输入 http(s) 网址",
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

const blockPanelItems: IBlockPanelListItem[] = [
  {
    icon: Bookmark,
    title: "网页书签",
    keywords: ["网页书签", "书签", "bookmark", "链接卡片", "shuqian", "wangye"],
    description: "以卡片展示网页标题、描述与封面",
    onClick: editor => void openBookmarkUrlInput(editor),
  },
];

export default blockPanelItems;
