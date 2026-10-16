/**
 * Markdown 导出弹窗的壳层承载：app/transferStore 有请求时挂载，关闭即卸载。
 */

import { useTransferStore } from "@/app/transferStore";
import { MarkdownExportDialog } from "./MarkdownExportDialog";

export function MarkdownExportHost() {
  const request = useTransferStore(s => s.markdownExport);
  const close = useTransferStore(s => s.closeMarkdownExport);
  if (!request) return null;
  return <MarkdownExportDialog request={request} onClose={close} />;
}
