/**
 * PDF 阅读 page：一个文件一个实例（按 pdfId 去重）。
 * 左面板（目录 / 页面 / 标注 / 书签）+ 阅读区 + 纸内右栏的 AI 对话（D-070）。
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
  status: "new",
  params: schema.schema,
  component: PdfDetailView,
});
