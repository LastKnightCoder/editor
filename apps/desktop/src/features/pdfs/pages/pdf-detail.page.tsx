/**
 * PDF 阅读 page：一个文件一个实例（按 pdfId 去重）。
 * 左面板（目录 / 页面 / 标注 / 书签）+ 阅读区 + 纸内右栏的 AI 对话。
 * annotation = 打开后定位到某条标注（pdf_annotations.id，材料打开到原处用）。
 * chatId = 打开已选中的专属对话，显示对话栏后消费。
 */

import {
  createPageSchema,
  paramNumber,
  paramOptional,
  paramString,
} from "@/page/core/paramsSchema";
import { definePage } from "@/page/definePage";
import { PdfDetailView } from "../views/PdfDetailView";

const schema = createPageSchema({
  pdfId: paramNumber(),
  annotation: paramOptional(paramNumber()),
  chatId: paramOptional(paramString()),
});

export default definePage({
  key: "pdf-detail",
  match: "params",
  getId: params => `pdf-detail-${params.pdfId}`,
  label: "PDF",
  params: schema.schema,
  component: PdfDetailView,
});
