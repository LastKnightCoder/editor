import { FileX2 } from "lucide-react";
import { CheckTree } from "@/components/CheckTree";
import { EProjectItemType } from "@/types";
import type { BatchExportTreeNode } from "@/utils/batch-export";

const ITEM_TYPE_LABEL: Record<EProjectItemType, string> = {
  [EProjectItemType.Document]: "文档",
  [EProjectItemType.WhiteBoard]: "白板",
  [EProjectItemType.VideoNote]: "视频笔记",
  [EProjectItemType.WebView]: "网页",
  [EProjectItemType.TableView]: "数据表",
  [EProjectItemType.Pdf]: "PDF",
};

const UNSUPPORTED_HINT = "该类型暂不支持整体导出";

const getNodeTag = (node: BatchExportTreeNode) => {
  if (!node.exportable) return { label: ITEM_TYPE_LABEL[node.itemType], hint: UNSUPPORTED_HINT };
  if (node.empty) return { label: "空白", hint: "没有正文，导出时只保留标题" };
  return null;
};

interface ExportCheckTreeProps {
  nodes: BatchExportTreeNode[];
  checkedKeys: number[];
  onCheckedKeysChange: (keys: number[]) => void;
}

/**
 * 导出内容勾选树：只有文档可导出，空白文档与非文档条目以短标签标识，
 * 非文档条目子树内没有文档时禁勾。
 */
const ExportCheckTree = (props: ExportCheckTreeProps) => (
  <CheckTree {...props} isSelectable={node => node.exportable} getTag={getNodeTag} />
);

/** 整棵树都没有文档时的空态：说明原因，而不只是显示 0 / 0 */
export const ExportTreeEmpty = () => (
  <div className="flex flex-col items-center gap-1.5 px-5 py-9 text-center">
    <span className="bg-hover text-ink-3 rounded-tau-md mb-1 grid size-10 place-items-center">
      <FileX2 className="size-5" />
    </span>
    <b className="text-ink-1 text-tau-body-lg font-semibold">这个项目里没有文档</b>
    <p className="text-ink-3 text-tau-meta max-w-[30ch]">
      PDF、白板、视频笔记、网页和数据表暂不支持整体导出。
    </p>
  </div>
);

export default ExportCheckTree;
