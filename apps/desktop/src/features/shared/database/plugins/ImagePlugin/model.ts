import { defineFieldModel } from "@tau/database/model";
import type { CellValue } from "@tau/database/model";
import type { ImagePluginValue } from "./types";

const itemsOf = (value: CellValue): ImagePluginValue =>
  Array.isArray(value) ? (value as ImagePluginValue) : [];

/** 单张图片的名称：alt 文本，无 alt 时用路径末段 */
const imageItemName = (item: ImagePluginValue[number]): string => {
  if (item?.alt) return item.alt;
  const lastSegment = (item?.url ?? "").split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
};

/** 图片字段的纯数据部分：文件名文本（「、」连接） */
export const imageFieldModel = defineFieldModel({
  type: "image",
  toText: value => itemsOf(value).map(imageItemName).filter(Boolean).join("、"),
});
