import {
  useExportI18n,
  exportTranslator,
  type ExportMessageKey,
} from "@/features/transfer/i18n-export";
import { FileX2 } from "lucide-react";
import { CheckTree } from "@/components/CheckTree";
import { EProjectItemType } from "@/types";
import type { BatchExportTreeNode } from "@/utils/batch-export";

const ITEM_TYPE_MESSAGES: Record<EProjectItemType, ExportMessageKey> = {
  [EProjectItemType.Document]: "item.document",
  [EProjectItemType.Whiteboard]: "item.whiteboard",
  [EProjectItemType.VideoNote]: "item.video",
  [EProjectItemType.WebView]: "item.webview",
  [EProjectItemType.TableView]: "item.table",
  [EProjectItemType.Pdf]: "item.pdf",
};

const t = exportTranslator.t;

const getNodeTag = (node: BatchExportTreeNode) => {
  if (!node.exportable)
    return {
      label: t(ITEM_TYPE_MESSAGES[node.itemType] ?? "item.unsupported"),
      hint: t("item.unsupportedHint"),
    };
  if (node.empty) return { label: t("selection.empty"), hint: t("selection.emptyHint") };
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
const ExportCheckTree = (props: ExportCheckTreeProps) => {
  useExportI18n();
  return <CheckTree {...props} isSelectable={node => node.exportable} getTag={getNodeTag} />;
};

/** 整棵树都没有文档时的空态：说明原因，而不只是显示 0 / 0 */
export const ExportTreeEmpty = () => {
  useExportI18n();
  return (
    <div className="flex flex-col items-center gap-1.5 px-5 py-9 text-center">
      <span className="bg-hover text-ink-3 rounded-tau-md mb-1 grid size-10 place-items-center">
        <FileX2 className="size-5" />
      </span>
      <b className="text-ink-1 text-tau-body-lg font-semibold">{t("batch.noDocuments")}</b>
      <p className="text-ink-3 text-tau-meta max-w-[30ch]">{t("batch.unsupported")}</p>
    </div>
  );
};

export default ExportCheckTree;
