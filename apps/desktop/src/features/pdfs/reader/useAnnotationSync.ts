/**
 * 引擎标注 ↔ 数据库记录的双向同步（须在 EmbedPDF 上下文内调用）：
 * - 记录到达后把文本标注导入引擎（区域标注不进引擎，由 AreaLayer 自己画）；
 * - 引擎里的创建 / 修改 / 删除落库；导入引起的事件跳过，避免回写。
 */

import { useCallback, useEffect, useRef } from "react";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import type { AnnotationEvent } from "@embedpdf/plugin-annotation";
import type { PdfAnnotation } from "@/types";
import { colorFromHex } from "./annotationModel";
import type { ReaderAnnotations } from "./data";

export function useAnnotationSync(pluginsReady: boolean, store: ReaderAnnotations) {
  const { provides: capability } = useAnnotationCapability();
  const imported = useRef(new Set<string>());
  const importing = useRef(new Set<string>());
  const { records, upsertObject, removeByObjectId } = store;

  const importRecords = useCallback(
    (items: PdfAnnotation[]) => {
      if (!capability) return;
      const fresh = items.filter(
        r => r.type !== "area" && r.annotation?.id && !imported.current.has(r.annotation.id)
      );
      if (fresh.length === 0) return;
      for (const record of fresh) {
        importing.current.add(record.annotation.id);
        imported.current.add(record.annotation.id);
      }
      capability.importAnnotations(fresh.map(record => ({ annotation: record.annotation })));
    },
    [capability]
  );

  useEffect(() => {
    if (pluginsReady && records) importRecords(records);
  }, [pluginsReady, records, importRecords]);

  useEffect(() => {
    if (!capability || !pluginsReady) return;
    const onEvent = (event: AnnotationEvent) => {
      if (event.type === "loaded" || !event.annotation) return;
      const object = event.annotation;
      if (importing.current.has(object.id)) {
        importing.current.delete(object.id);
        return;
      }
      if (event.type === "delete") {
        imported.current.delete(object.id);
        void removeByObjectId(object.id);
        return;
      }
      if (!event.committed) return;
      imported.current.add(object.id);
      void upsertObject(object, colorFromHex((object as { color?: unknown }).color) ?? undefined);
    };
    return capability.onAnnotationEvent(onEvent);
  }, [capability, pluginsReady, upsertObject, removeByObjectId]);

  return {
    /** 撤销删除后把恢复的记录放回引擎（不再触发落库） */
    reimport: (record: PdfAnnotation) => {
      imported.current.delete(record.annotation.id);
      importRecords([record]);
    },
  };
}
