import { useEffect, useMemo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import {
  addEpubAnnotation,
  getEpubAnnotations,
  removeEpubAnnotation,
  updateEpubAnnotation,
} from "@/commands/epub";
import type {
  EpubAnnotation,
  CreateEpubAnnotation,
  EHighlightColor,
  EpubAnnotationType,
  EpubHighlightStyle,
  Note,
} from "@/types";

interface UseEpubAnnotationsOptions {
  epubId?: number;
}

export const useEpubAnnotations = ({ epubId }: UseEpubAnnotationsOptions) => {
  const [annotations, setAnnotations] = useState<EpubAnnotation[]>([]);
  const [loading, setLoading] = useState(false);

  const annotationByCfi = useMemo(() => {
    const map = new Map<string, EpubAnnotation>();
    annotations.forEach((entry) => {
      if (entry.cfi) {
        map.set(entry.cfi, entry);
      }
    });
    return map;
  }, [annotations]);

  const loadAnnotations = useMemoizedFn(async (targetEpubId?: number) => {
    if (!targetEpubId) return;
    setLoading(true);
    try {
      const data = await getEpubAnnotations(targetEpubId);
      setAnnotations(data);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (epubId) {
      loadAnnotations(epubId);
    } else {
      setAnnotations([]);
    }
  }, [epubId, loadAnnotations]);

  const createAnnotation = useMemoizedFn(
    async (payload: {
      cfi: string;
      text?: string;
      type?: EpubAnnotationType;
      color?: EHighlightColor;
      style?: EpubHighlightStyle;
      chapterTitle?: string;
      chapterHref?: string;
    }) => {
      if (!epubId) return null;
      const next: CreateEpubAnnotation = {
        epubId,
        cfi: payload.cfi,
        text: payload.text,
        type: payload.type || "highlight",
        color: payload.color,
        style: payload.style || "highlight",
        notes: [],
        chapterTitle: payload.chapterTitle,
        chapterHref: payload.chapterHref,
      };
      const created = await addEpubAnnotation(next);
      setAnnotations((prev) => [...prev, created]);
      return created;
    },
  );

  const upsertAnnotation = useMemoizedFn(
    async (payload: {
      cfi: string;
      text?: string;
      type?: EpubAnnotationType;
      color?: EHighlightColor;
      style?: EpubHighlightStyle;
      chapterTitle?: string;
      chapterHref?: string;
    }) => {
      if (!epubId) return null;
      const existing = annotationByCfi.get(payload.cfi);
      if (!existing) {
        return await createAnnotation(payload);
      }
      // Update existing
      const updated = await updateEpubAnnotation({
        ...existing,
        text: payload.text ?? existing.text,
        type: payload.type ?? existing.type,
        color: payload.color ?? existing.color,
        style: payload.style ?? existing.style,
        chapterTitle: payload.chapterTitle ?? existing.chapterTitle,
        chapterHref: payload.chapterHref ?? existing.chapterHref,
      });
      setAnnotations((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      return updated;
    },
  );

  const updateAnnotationNotes = useMemoizedFn(
    async (id: number, notes: Note[], color?: EHighlightColor) => {
      const target = annotations.find((anno) => anno.id === id);
      if (!target) return null;
      const updated = await updateEpubAnnotation({
        ...target,
        notes,
        color: color ?? target.color,
      });
      setAnnotations((prev) =>
        prev.map((anno) => (anno.id === updated.id ? updated : anno)),
      );
      return updated;
    },
  );

  const updateAnnotationColor = useMemoizedFn(
    async (id: number, color: EHighlightColor) => {
      const target = annotations.find((anno) => anno.id === id);
      if (!target) return null;
      const updated = await updateEpubAnnotation({
        ...target,
        color,
      });
      setAnnotations((prev) =>
        prev.map((anno) => (anno.id === updated.id ? updated : anno)),
      );
      return updated;
    },
  );

  const updateAnnotationStyle = useMemoizedFn(
    async (id: number, style: EpubHighlightStyle) => {
      const target = annotations.find((anno) => anno.id === id);
      if (!target) return null;
      const updated = await updateEpubAnnotation({
        ...target,
        style,
        type: style as EpubAnnotationType,
      });
      setAnnotations((prev) =>
        prev.map((anno) => (anno.id === updated.id ? updated : anno)),
      );
      return updated;
    },
  );

  const removeAnnotationById = useMemoizedFn(async (id: number) => {
    await removeEpubAnnotation(id);
    setAnnotations((prev) => prev.filter((anno) => anno.id !== id));
  });

  const removeAnnotationByCfi = useMemoizedFn(async (cfi: string) => {
    const target = annotationByCfi.get(cfi);
    if (!target) return;
    await removeEpubAnnotation(target.id);
    setAnnotations((prev) => prev.filter((anno) => anno.cfi !== cfi));
  });

  return {
    annotations,
    loading,
    annotationByCfi,
    reload: () => loadAnnotations(epubId),
    createAnnotation,
    upsertAnnotation,
    updateAnnotationNotes,
    updateAnnotationColor,
    updateAnnotationStyle,
    removeAnnotation: removeAnnotationById,
    removeAnnotationByCfi,
  };
};

export type UseEpubAnnotationsReturn = ReturnType<typeof useEpubAnnotations>;
