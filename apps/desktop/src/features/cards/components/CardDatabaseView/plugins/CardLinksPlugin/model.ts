import { defineFieldModel } from "@tau/database/model";
import type { CardLinksCellValue } from "./types";

/** 卡片连接字段的纯数据部分：各项标题文本（「、」连接） */
export const cardLinksFieldModel = defineFieldModel({
  type: "card-links",
  toText: value => {
    const items = (value as CardLinksCellValue | null | undefined)?.items;
    if (!Array.isArray(items)) return "";
    return items
      .map(item => item?.title ?? "")
      .filter(Boolean)
      .join("、");
  },
});
