import { CellPlugin } from "@tau/database";
import { FileText } from "lucide-react";
import { Renderer } from "./components/index";
import { RichTextPluginValue, RichTextPluginConfig } from "./types";
import { richTextFieldModel } from "./model";

const RichTextPlugin: CellPlugin<RichTextPluginConfig> = {
  type: "rich-text",
  name: "富文本",
  editable: false, // 无编辑器模式，通过渲染器直接操作
  model: richTextFieldModel,
  Renderer,
  Icon: ({ className }) => <FileText className={className} />,

  beforeSave: (value: RichTextPluginValue) => {
    if (!Array.isArray(value)) return [];
    return value.filter(item => item && item.contentId);
  },

  afterLoad: (value: RichTextPluginValue) => {
    if (!Array.isArray(value)) return [];
    return value.filter(item => item && item.contentId);
  },

  search: (searchValue, cellValue) => {
    if (!Array.isArray(cellValue) || !searchValue) return false;
    const searchLower = searchValue.toLowerCase();
    return (cellValue as RichTextPluginValue).some(
      item =>
        item.title?.toLowerCase().includes(searchLower) ||
        item.preview?.toLowerCase().includes(searchLower)
    );
  },
};

export default RichTextPlugin;
