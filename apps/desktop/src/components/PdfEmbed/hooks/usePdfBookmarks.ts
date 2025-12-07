import { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type { PdfBookmarkObject } from "@embedpdf/models";
import {
  addPdfBookmark,
  getPdfBookmarks,
  removePdfBookmark,
  updatePdfBookmark,
} from "@/commands/pdf";
import type { CreatePdfBookmark, PdfBookmark } from "@/types";

interface UsePdfBookmarksOptions {
  pdfId?: number;
}

export const usePdfBookmarks = ({ pdfId }: UsePdfBookmarksOptions) => {
  const [bookmarks, setBookmarks] = useState<PdfBookmark[]>([]);
  const [loading, setLoading] = useState(false);

  const loadBookmarks = useMemoizedFn(async (targetPdfId?: number) => {
    if (!targetPdfId) return;
    setLoading(true);
    try {
      const data = await getPdfBookmarks(targetPdfId);
      setBookmarks(data);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (pdfId) {
      loadBookmarks(pdfId);
    } else {
      setBookmarks([]);
    }
  }, [pdfId, loadBookmarks]);

  const createBookmark = useMemoizedFn(
    async (bookmarkObject: PdfBookmarkObject) => {
      if (!pdfId) return null;
      const payload: CreatePdfBookmark = {
        pdfId,
        bookmark: bookmarkObject,
      };
      const created = await addPdfBookmark(payload);
      setBookmarks((prev) => [...prev, created]);
      return created;
    },
  );

  const updateBookmarkPayload = useMemoizedFn(
    async (id: number, bookmarkObject: PdfBookmarkObject) => {
      const target = bookmarks.find((item) => item.id === id);
      if (!target) return null;
      const updated = await updatePdfBookmark({
        ...target,
        bookmark: bookmarkObject,
      });
      setBookmarks((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      return updated;
    },
  );

  const removeBookmarkById = useMemoizedFn(async (id: number) => {
    await removePdfBookmark(id);
    setBookmarks((prev) => prev.filter((item) => item.id !== id));
  });

  return {
    bookmarks,
    loading,
    reload: () => loadBookmarks(pdfId),
    createBookmark,
    updateBookmark: updateBookmarkPayload,
    removeBookmark: removeBookmarkById,
  };
};

export type UsePdfBookmarksReturn = ReturnType<typeof usePdfBookmarks>;
