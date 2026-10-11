import { defineFieldModel } from "@tau/database/model";
import type { CellValue } from "@tau/database/model";
import type { RichTextPluginValue } from "./types";

const itemsOf = (value: CellValue): RichTextPluginValue =>
  Array.isArray(value) ? (value as RichTextPluginValue) : [];

/** 富文本字段的纯数据部分：标题文本与正文引用（与 D-136 shared 收集口径一致） */
export const richTextFieldModel = defineFieldModel({
  type: "rich-text",
  toText: value =>
    itemsOf(value)
      .map(item => item?.title ?? "")
      .filter(Boolean)
      .join("、"),
  contentRefs: value =>
    itemsOf(value)
      .map(item =>
        typeof item?.contentId === "number" &&
        Number.isInteger(item.contentId) &&
        item.contentId > 0
          ? item.contentId
          : null
      )
      .filter((id): id is number => id !== null),
});
