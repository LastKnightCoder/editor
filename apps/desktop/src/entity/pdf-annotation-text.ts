/**
 * PDF 标注的文字：原文在 annotation_payload.custom.text（旧数据在 contents），批注在 notes 的第一条（Slate）。
 * 纯函数，主进程（索引、材料解析）与渲染端共用；与阅读器 annotationModel 的取法一致。
 */

import { slatePlainText } from "./inline-refs";

export function pdfAnnotationQuote(payloadJson: string): string {
  try {
    const payload = JSON.parse(payloadJson) as { custom?: { text?: unknown }; contents?: unknown };
    const text = payload?.custom?.text;
    if (typeof text === "string") return text.trim();
    return typeof payload?.contents === "string" ? payload.contents.trim() : "";
  } catch {
    return "";
  }
}

export function pdfAnnotationNote(notesJson: string | null): string {
  if (!notesJson) return "";
  try {
    const notes = JSON.parse(notesJson) as Array<{ note?: unknown }>;
    const first = Array.isArray(notes) ? notes[0]?.note : null;
    return Array.isArray(first) ? slatePlainText(first).trim() : "";
  } catch {
    return "";
  }
}
