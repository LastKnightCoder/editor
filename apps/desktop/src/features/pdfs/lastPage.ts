/**
 * PDF「上次读到的页」的全局记忆：pdfs.last_page 一份，PDF 阅读页、白板阅读纸、白板卡面翻页共用。
 * 白板上同一份 PDF 的卡面都订阅同一个查询键，任何一处写入后一起换页。
 */

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { getPdfById } from "@/commands";
import type { Pdf } from "@/types";
import { detailKey, useDatabaseReady } from "./queries";

export const lastPageKey = (database: string, id: number) =>
  ["pdfs", "last-page", database, id] as const;

/** 写入页码后同步各处缓存：卡面、PDF 详情、列表（阅读进度） */
export function syncLastPage(client: QueryClient, database: string, id: number, page: number) {
  client.setQueryData<number>(lastPageKey(database, id), page);
  client.setQueryData<Pdf | null>(detailKey(database, id), prev =>
    prev ? { ...prev, lastPage: page } : prev
  );
  void client.invalidateQueries({ queryKey: ["pdfs", "library", database] });
}

/** 卡面与阅读纸共同使用的起始页（从 1 开始）。 */
export function usePdfLastPage(pdf: Pick<Pdf, "id" | "lastPage" | "pageCount"> | null) {
  const { database } = useDatabaseReady();
  const id = pdf?.id ?? 0;
  const query = useQuery({
    queryKey: lastPageKey(database, id),
    queryFn: async () => (await getPdfById(id))?.lastPage ?? 1,
    enabled: id > 0,
    initialData: pdf?.lastPage ?? undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const pageCount = pdf?.pageCount ?? null;
  const clamp = (page: number) => Math.max(1, pageCount ? Math.min(pageCount, page) : page);
  return {
    page: clamp(query.data ?? 1),
    pageCount,
  };
}
