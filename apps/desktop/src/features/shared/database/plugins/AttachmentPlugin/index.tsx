import { CellPlugin } from "@tau/database";
import { Paperclip } from "lucide-react";
import { Renderer } from "./components/index";
import { AttachmentPluginValue, AttachmentPluginConfig } from "./types";

const AttachmentPlugin: CellPlugin<AttachmentPluginConfig> = {
  type: "attachment",
  name: "附件",
  editable: false, // 无编辑器模式，通过渲染器直接操作
  Renderer,
  Icon: ({ className }) => <Paperclip className={className} />,

  beforeSave: (value: AttachmentPluginValue) => {
    if (!Array.isArray(value)) return [];
    return value.filter(item => item && item.filePath);
  },

  afterLoad: (value: AttachmentPluginValue) => {
    if (!Array.isArray(value)) return [];
    return value.filter(item => item && item.filePath);
  },

  search: (searchValue, cellValue) => {
    if (!Array.isArray(cellValue) || !searchValue) return false;
    const searchLower = searchValue.toLowerCase();
    return (cellValue as AttachmentPluginValue).some(item =>
      item.fileName?.toLowerCase().includes(searchLower)
    );
  },
};

export default AttachmentPlugin;
