/**
 * 阅读器数据：标注、书签、AI 索引状态。查询按库分 key；写入后直接改缓存（不整域重拉），
 * 标注数变化时顺带失效列表。同一条标注（按引擎 id）的写入串行执行：引擎的「创建」事件还没落库时
 * 就来了「更新」，并行会写出两条记录。
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PdfZoomMode, type PdfAnnotationObject, type PdfBookmarkObject } from "@embedpdf/models";
import {
  addPdfAnnotation,
  addPdfBookmark,
  ensurePdfIndex,
  getPdfAnnotations,
  getPdfBookmarks,
  getPdfIndexStatuses,
  rebuildPdfIndex,
  removePdfAnnotation,
  removePdfBookmark,
  updatePdfAnnotation,
} from "@/commands";
import type {
  AreaAnnotationData,
  EHighlightColor,
  Note,
  Pdf,
  PdfAnnotation,
  PdfBookmark,
  PdfIndexStatus,
} from "@/types";
import { useDatabaseReady } from "../queries";
import { targetPage } from "./outline";

const annotationsKey = (database: string, pdfId: number) =>
  ["pdfs", "annotations", database, pdfId] as const;
const bookmarksKey = (database: string, pdfId: number) =>
  ["pdfs", "bookmarks", database, pdfId] as const;
const indexKey = (database: string, pdfId: number) =>
  ["pdfs", "index-one", database, pdfId] as const;

/** 主进程按 JSON 存取，日期回来是字符串；引擎要 Date */
function reviveDates(annotation: PdfAnnotationObject): PdfAnnotationObject {
  const toDate = (value: unknown) => {
    if (value instanceof Date) return value;
    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? undefined : date;
    }
    return undefined;
  };
  return {
    ...annotation,
    created: toDate(annotation.created) ?? annotation.created,
    modified: toDate(annotation.modified) ?? annotation.modified,
  };
}

const revive = (record: PdfAnnotation): PdfAnnotation => ({
  ...record,
  annotation: reviveDates(record.annotation),
});

/* ───────── 标注 ───────── */

export function useReaderAnnotations(pdfId: number) {
  const client = useQueryClient();
  const { database, ready } = useDatabaseReady();
  const key = annotationsKey(database, pdfId);
  const query = useQuery({
    queryKey: key,
    queryFn: async () => (await getPdfAnnotations(pdfId)).map(revive),
    enabled: ready,
    staleTime: Infinity,
  });

  const keyRef = useRef(key);
  keyRef.current = key;
  const queues = useRef(new Map<string, Promise<unknown>>());

  const read = useCallback(
    () => client.getQueryData<PdfAnnotation[]>(keyRef.current) ?? [],
    [client]
  );
  const write = useCallback(
    (update: (records: PdfAnnotation[]) => PdfAnnotation[]) =>
      client.setQueryData<PdfAnnotation[]>(keyRef.current, prev => update(prev ?? [])),
    [client]
  );
  const touchLibrary = useCallback(
    () => client.invalidateQueries({ queryKey: ["pdfs", "library"] }),
    [client]
  );
  const serial = useCallback(<T>(uid: string, task: () => Promise<T>): Promise<T> => {
    const previous = queues.current.get(uid) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    queues.current.set(uid, next);
    return next;
  }, []);

  const replace = useCallback(
    (record: PdfAnnotation) => write(list => list.map(r => (r.id === record.id ? record : r))),
    [write]
  );

  const actions = useMemo(
    () => ({
      /** 引擎里的标注落库：没有就建，有且内容变了就更新 */
      upsertObject: (object: PdfAnnotationObject, color?: EHighlightColor) =>
        serial(object.id, async () => {
          const existing = read().find(r => r.annotation.id === object.id);
          if (!existing) {
            const created = revive(
              await addPdfAnnotation({ pdfId, annotation: object, color, notes: [] })
            );
            write(list => [...list, created]);
            void touchLibrary();
            return created;
          }
          const nextColor = color ?? existing.color;
          if (
            JSON.stringify(object) === JSON.stringify(existing.annotation) &&
            nextColor === existing.color
          ) {
            return existing;
          }
          const updated = revive(
            await updatePdfAnnotation({ ...existing, annotation: object, color: nextColor })
          );
          replace(updated);
          return updated;
        }),

      /** 引擎删除了某条标注：按引擎 id 删记录 */
      removeByObjectId: (objectId: string) =>
        serial(objectId, async () => {
          const existing = read().find(r => r.annotation.id === objectId);
          if (!existing) return null;
          await removePdfAnnotation(existing.id);
          write(list => list.filter(r => r.id !== existing.id));
          void touchLibrary();
          return existing;
        }),

      remove: async (record: PdfAnnotation) => {
        await removePdfAnnotation(record.id);
        write(list => list.filter(r => r.id !== record.id));
        void touchLibrary();
      },

      updateNotes: async (recordId: number, notes: Note[]) => {
        const target = read().find(r => r.id === recordId);
        if (!target) return null;
        return serial(target.annotation.id, async () => {
          const latest = read().find(r => r.id === recordId) ?? target;
          const updated = revive(await updatePdfAnnotation({ ...latest, notes }));
          replace(updated);
          return updated;
        });
      },

      createArea: async (areaData: AreaAnnotationData, color?: EHighlightColor) => {
        // 区域标注不进引擎，annotation 字段只是占位（定位与排序用）
        const placeholder: PdfAnnotationObject = {
          id: `area-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          type: 0,
          pageIndex: areaData.pageIndex,
          rect: {
            origin: { x: areaData.rect.x, y: areaData.rect.y },
            size: { width: areaData.rect.width, height: areaData.rect.height },
          },
          contents: "",
          created: new Date(),
          modified: new Date(),
        } as PdfAnnotationObject;
        const created = revive(
          await addPdfAnnotation({
            pdfId,
            annotation: placeholder,
            color,
            notes: [],
            type: "area",
            areaData,
          })
        );
        write(list => [...list, created]);
        void touchLibrary();
        return created;
      },

      setAreaColor: async (record: PdfAnnotation, color: EHighlightColor) => {
        const updated = revive(await updatePdfAnnotation({ ...record, color }));
        replace(updated);
        return updated;
      },

      /** 撤销删除：按原样（含笔记与颜色）重新落一条记录 */
      restore: async (record: PdfAnnotation) => {
        const created = revive(
          await addPdfAnnotation({
            pdfId,
            annotation: record.annotation,
            color: record.color,
            notes: record.notes,
            type: record.type,
            areaData: record.areaData,
          })
        );
        write(list => [...list, created]);
        void touchLibrary();
        return created;
      },
    }),
    [pdfId, read, write, replace, serial, touchLibrary]
  );

  return { records: query.data ?? null, ...actions };
}

export type ReaderAnnotations = ReturnType<typeof useReaderAnnotations>;

/* ───────── 书签 ───────── */

export const bookmarkPage = (bookmark: PdfBookmark): number | null => targetPage(bookmark.bookmark);

export function useReaderBookmarks(pdfId: number) {
  const client = useQueryClient();
  const { database, ready } = useDatabaseReady();
  const key = bookmarksKey(database, pdfId);
  const query = useQuery({
    queryKey: key,
    queryFn: () => getPdfBookmarks(pdfId),
    enabled: ready,
    staleTime: Infinity,
  });
  const keyRef = useRef(key);
  keyRef.current = key;

  const actions = useMemo(
    () => ({
      add: async (pageNumber: number, title: string) => {
        const object: PdfBookmarkObject = {
          title,
          target: {
            type: "destination",
            destination: {
              pageIndex: pageNumber - 1,
              zoom: { mode: PdfZoomMode.Unknown },
              view: [],
            },
          },
          children: [],
        };
        const created = await addPdfBookmark({ pdfId, bookmark: object });
        client.setQueryData<PdfBookmark[]>(keyRef.current, prev => [...(prev ?? []), created]);
      },
      remove: async (bookmark: PdfBookmark) => {
        await removePdfBookmark(bookmark.id);
        client.setQueryData<PdfBookmark[]>(keyRef.current, prev =>
          (prev ?? []).filter(b => b.id !== bookmark.id)
        );
      },
    }),
    [client, pdfId]
  );

  return { bookmarks: query.data ?? null, ...actions };
}

/* ───────── AI 索引 ───────── */

const failedStatus = (pdfId: number, error: unknown): PdfIndexStatus => ({
  pdfId,
  state: "failed",
  pageCount: 0,
  updatedAt: Date.now(),
  error: error instanceof Error ? error.message : String(error),
});

/**
 * 这份 PDF 的索引状态。文件就位后自动准备一次索引（沿用旧阅读器：对话与「按意思找」都依赖它）；
 * 状态只经批量接口读——单查接口会为没建过索引的文件新建库。建索引期间轮询进度。
 */
export function usePdfIndex(pdf: Pdf, resolvedPath: string | null) {
  const client = useQueryClient();
  const { database, ready } = useDatabaseReady();
  const key = indexKey(database, pdf.id);

  const status = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await getPdfIndexStatuses({ pdfIds: [pdf.id], mainDbName: database }))[0] ?? null,
    enabled: ready,
    staleTime: 30_000,
    refetchInterval: query =>
      query.state.data?.state === "building" || query.state.data?.state === "pending"
        ? 1500
        : false,
  });

  const keyRef = useRef(key);
  keyRef.current = key;
  const settle = useCallback(
    (next: PdfIndexStatus) => {
      client.setQueryData(keyRef.current, next);
      // 列表页的索引列跟着刷新
      void client.invalidateQueries({ queryKey: ["pdfs", "index"] });
    },
    [client]
  );

  const prepare = useMutation({
    mutationFn: async (force: boolean) => {
      if (!resolvedPath) throw new Error("PDF 文件尚未就位");
      const params = { pdfId: pdf.id, resolvedPath, fileName: pdf.fileName, mainDbName: database };
      // 发起后立即刷一次状态，建库过程由状态查询轮询进度
      const task = force ? rebuildPdfIndex(params) : ensurePdfIndex(params);
      window.setTimeout(() => void client.invalidateQueries({ queryKey: keyRef.current }), 300);
      return task;
    },
    onSuccess: settle,
    onError: error => settle(failedStatus(pdf.id, error)),
  });
  const { mutate, mutateAsync } = prepare;

  // 每个阅读器实例只自动准备一次
  const autoPrepared = useRef(false);
  useEffect(() => {
    if (!ready || !resolvedPath || autoPrepared.current) return;
    autoPrepared.current = true;
    mutate(false);
  }, [ready, resolvedPath, mutate]);

  return {
    status: status.data ?? null,
    preparing: prepare.isPending,
    /** 确保索引就绪（已就绪直接返回），返回最终状态 */
    ensure: () => mutateAsync(false),
    rebuild: () => mutate(true),
  };
}
