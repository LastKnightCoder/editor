import { CellPlugin } from "../../types";
import { MdAttachFile } from "react-icons/md";
import { Renderer } from "./components/index";
import { AttachmentPluginValue, AttachmentPluginConfig } from "./types";

const AttachmentPlugin: CellPlugin<AttachmentPluginConfig> = {
  type: "attachment",
  name: "附件",
  editable: false, // 无编辑器模式，通过渲染器直接操作
  Renderer,
  Icon: ({ className }) => <MdAttachFile className={className} />,

  beforeSave: (value: AttachmentPluginValue) => {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && item.filePath);
  },

  afterLoad: (value: AttachmentPluginValue) => {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && item.filePath);
  },
};

export default AttachmentPlugin;
