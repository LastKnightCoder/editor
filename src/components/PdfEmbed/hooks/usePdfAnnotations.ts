import { useEffect, useMemo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type { PdfAnnotationObject } from "@embedpdf/models";
import {
  addPdfAnnotation,
  getPdfAnnotations,
  removePdfAnnotation,
  updatePdfAnnotation,
} from "@/commands/pdf";
import type {
  PdfAnnotation,
  CreatePdfAnnotation,
  EHighlightColor,
  AreaAnnotationData,
} from "@/types";

const reviveAnnotationDates = (
  annotation?: PdfAnnotationObject | null,
): PdfAnnotationObject | undefined => {
  if (!annotation) return undefined;
  const normalizeDate = (value: unknown) => {
    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? undefined : date;
    }
    return value instanceof Date ? value : undefined;
  };
  return {
    ...annotation,
    created: normalizeDate(annotation.created) ?? annotation.created,
    modified: normalizeDate(annotation.modified) ?? annotation.modified,
  };
};

const revivePdfAnnotation = (entry: PdfAnnotation): PdfAnnotation => {
  const revivedAnnotation = reviveAnnotationDates(entry.annotation);
  if (!revivedAnnotation) {
    throw new Error("Invalid annotation object");
  }
  return {
    ...entry,
    annotation: revivedAnnotation,
  };
};

interface UsePdfAnnotationsOptions {
  pdfId?: number;
}

export const usePdfAnnotations = ({ pdfId }: UsePdfAnnotationsOptions) => {
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [loading, setLoading] = useState(false);

  const annotationIdMap = useMemo(() => {
    const map = new Map<string, PdfAnnotation>();
    annotations.forEach((entry) => {
      if (entry.annotation?.id) {
        map.set(entry.annotation.id, entry);
      }
    });
    return map;
  }, [annotations]);

  const loadAnnotations = useMemoizedFn(async (targetPdfId?: number) => {
    if (!targetPdfId) return;
    setLoading(true);
    try {
      const data = await getPdfAnnotations(targetPdfId);
      setAnnotations(data.map(revivePdfAnnotation));
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (pdfId) {
      loadAnnotations(pdfId);
    } else {
      setAnnotations([]);
    }
  }, [pdfId, loadAnnotations]);

  const createAnnotation = useMemoizedFn(
    async (payload: {
      annotation: PdfAnnotationObject;
      color?: EHighlightColor;
    }) => {
      if (!pdfId) return null;
      const next: CreatePdfAnnotation = {
        pdfId,
        annotation: payload.annotation,
        color: payload.color,
        notes: [],
      };
      const created = await addPdfAnnotation(next);
      const normalized = revivePdfAnnotation(created);
      setAnnotations((prev) => [...prev, normalized]);
      return normalized;
    },
  );

  const upsertAnnotationObject = useMemoizedFn(
    async (annotationObject: PdfAnnotationObject, color?: EHighlightColor) => {
      if (!pdfId || !annotationObject.id) return null;
      const existing = annotationIdMap.get(annotationObject.id);
      if (!existing) {
        return await createAnnotation({ annotation: annotationObject, color });
      }
      const payloadJson = JSON.stringify(annotationObject);
      const existingJson = JSON.stringify(existing.annotation);
      const samePayload = payloadJson === existingJson;
      const sameColor = (color ?? existing.color) === existing.color;
      if (samePayload && sameColor) {
        return existing;
      }
      const updated = await updatePdfAnnotation({
        ...existing,
        annotation: annotationObject,
        color: color ?? existing.color,
      });
      const normalized = revivePdfAnnotation(updated);
      setAnnotations((prev) =>
        prev.map((item) => (item.id === normalized.id ? normalized : item)),
      );
      return normalized;
    },
  );

  const updateAnnotationNotes = useMemoizedFn(
    async (
      id: number,
      notes: PdfAnnotation["notes"],
      color?: EHighlightColor,
    ) => {
      const target = annotations.find((anno) => anno.id === id);
      if (!target) return null;
      const updated = await updatePdfAnnotation({
        ...target,
        notes,
        color: color ?? target.color,
      });
      const normalized = revivePdfAnnotation(updated);
      setAnnotations((prev) =>
        prev.map((anno) => (anno.id === normalized.id ? normalized : anno)),
      );
      return normalized;
    },
  );

  const removeAnnotationById = useMemoizedFn(async (id: number) => {
    await removePdfAnnotation(id);
    setAnnotations((prev) => prev.filter((anno) => anno.id !== id));
  });

  // 创建区域标注
  const createAreaAnnotation = useMemoizedFn(
    async (payload: {
      areaData: AreaAnnotationData;
      color?: EHighlightColor;
    }) => {
      if (!pdfId) return null;
      // 创建一个虚拟的 PdfAnnotationObject 用于存储
      const dummyAnnotation: PdfAnnotationObject = {
        id: `area-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: 0, // 使用 0 作为区域标注类型标识
        pageIndex: payload.areaData.pageIndex,
        rect: {
          origin: {
            x: payload.areaData.rect.x,
            y: payload.areaData.rect.y,
          },
          size: {
            width: payload.areaData.rect.width,
            height: payload.areaData.rect.height,
          },
        },
        contents: "",
        created: new Date(),
        modified: new Date(),
      };
      const next: CreatePdfAnnotation = {
        pdfId,
        annotation: dummyAnnotation,
        color: payload.color,
        notes: [],
        type: "area",
        areaData: payload.areaData,
      };
      const created = await addPdfAnnotation(next);
      const normalized = revivePdfAnnotation(created);
      setAnnotations((prev) => [...prev, normalized]);
      return normalized;
    },
  );

  // 更新区域标注
  const updateAreaAnnotation = useMemoizedFn(
    async (id: number, updates: Partial<{ color: EHighlightColor }>) => {
      const target = annotations.find((anno) => anno.id === id);
      if (!target || target.type !== "area") return null;
      const updated = await updatePdfAnnotation({
        ...target,
        color: updates.color ?? target.color,
      });
      const normalized = revivePdfAnnotation(updated);
      setAnnotations((prev) =>
        prev.map((anno) => (anno.id === normalized.id ? normalized : anno)),
      );
      return normalized;
    },
  );

  return {
    annotations,
    loading,
    reload: () => loadAnnotations(pdfId),
    createAnnotation,
    createAreaAnnotation,
    upsertAnnotationObject,
    updateAnnotationNotes,
    updateAreaAnnotation,
    removeAnnotation: removeAnnotationById,
  };
};

export type UsePdfAnnotationsReturn = ReturnType<typeof usePdfAnnotations>;
