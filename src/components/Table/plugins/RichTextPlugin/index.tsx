import { CellPlugin, CellValue } from "../../types";
import { MdDescription } from "react-icons/md";
import { Renderer } from "./components/index";
import { RichTextPluginValue, RichTextPluginConfig } from "./types";
import { deleteContent } from "@/commands/content";

const RichTextPlugin: CellPlugin<RichTextPluginConfig> = {
  type: "rich-text",
  name: "富文本",
  editable: false, // 无编辑器模式，通过渲染器直接操作
  Renderer,
  Icon: ({ className }) => <MdDescription className={className} />,

  beforeSave: (value: RichTextPluginValue) => {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && item.contentId);
  },

  afterLoad: (value: RichTextPluginValue) => {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && item.contentId);
  },

  // 当插件被卸载时清理资源
  onUnmount: async () => {
    // 这个钩子在插件被卸载时调用，但目前Table系统不会调用
    // 我们需要通过其他方式处理列删除时的清理
  },

  // 清理列数据的钩子
  onColumnCleanup: async (columnData: CellValue[]) => {
    // 收集所有需要删除的 contentId（每个引用都要单独处理）
    const contentIdsToDelete: number[] = [];

    columnData.forEach((cellValue) => {
      if (Array.isArray(cellValue)) {
        const richTextList = cellValue as RichTextPluginValue;
        richTextList.forEach((item) => {
          if (item && item.contentId) {
            contentIdsToDelete.push(item.contentId);
          }
        });
      }
    });

    // 删除所有 content 记录（每个引用都调用一次deleteContent）
    const deletePromises = contentIdsToDelete.map(async (contentId) => {
      try {
        await deleteContent(contentId);
        console.log(`已清理 content 记录: ${contentId}`);
      } catch (error) {
        console.error(`清理 content 记录 ${contentId} 失败:`, error);
      }
    });

    await Promise.allSettled(deletePromises);
    console.log(
      `RichTextPlugin: 清理了 ${contentIdsToDelete.length} 个 content 引用`,
    );
  },
};

export default RichTextPlugin;
