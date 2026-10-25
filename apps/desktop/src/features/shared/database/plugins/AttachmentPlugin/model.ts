import { defineFieldModel } from "@tau/database/model";
import type { CellValue } from "@tau/database/model";
import type { AttachmentPluginValue } from "./types";

const itemsOf = (value: CellValue): AttachmentPluginValue =>
  Array.isArray(value) ? (value as AttachmentPluginValue) : [];

/** 单个附件的名称：fileName，缺失时用路径末段 */
const attachmentItemName = (item: AttachmentPluginValue[number]): string => {
  if (item?.fileName) return item.fileName;
  return (item?.filePath ?? "").split(/[\\/]/).filter(Boolean).pop() ?? "";
};

/** 附件字段的纯数据部分：文件名文本（「、」连接） */
export const attachmentFieldModel = defineFieldModel({
  type: "attachment",
  resources: [{ path: "value[].filePath", kind: "file" }],
  toText: value => itemsOf(value).map(attachmentItemName).filter(Boolean).join("、"),
});
