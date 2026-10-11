import { richTextFieldModel } from "./plugins/RichTextPlugin/model";
import { imageFieldModel } from "./plugins/ImagePlugin/model";
import { attachmentFieldModel } from "./plugins/AttachmentPlugin/model";

/** 桌面私有字段的 model 集合（D-137）：主进程与 MCP 等非 UI 消费方使用，与插件共享同一份纯数据逻辑 */
export const desktopFieldModels = [richTextFieldModel, imageFieldModel, attachmentFieldModel];
