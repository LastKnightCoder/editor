/**
 * PDF 阅读 page：一个文件一个实例（按 pdfId 去重）。
 * 目前只承载阅读器（标注 / 书签 / 页内搜索），AI 对话随详情页迁移补上，故为 migrating。
 */

import { createPageSchema, paramNumber } from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { PdfDetailView } from "../views/PdfDetailView";

const schema = createPageSchema({
  pdfId: paramNumber(),
});

export default definePage({
  key: "pdf-detail",
  match: "params",
  getId: params => `pdf-detail-${params.pdfId}`,
  label: "PDF",
  status: "migrating",
  params: schema.schema,
  component: PdfDetailView,
});
