/**
 * PDF「上次读到的页」的全局记忆：pdfs.last_page 一份，PDF 阅读页、白板阅读纸、白板卡面翻页共用。
 * 白板上同一份 PDF 的卡面都订阅同一个查询键，任何一处写入后一起换页。
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getPdfById, recordPdfPage } from "@/commands";
import type { Pdf } from "@/types";
import { detailKey, useDatabaseReady } from "./queries";

const lastPageKey = (database: string, id: number) => ["pdfs", "last-page", database, id] as const;

/** 写入页码后同步各处缓存：卡面、PDF 详情、列表（阅读进度） */
export function syncLastPage(client: QueryClient, database: string, id: number, page: number) {
  client.setQueryData<number>(lastPageKey(database, id), page);
  client.setQueryData<Pdf | null>(detailKey(database, id), prev =>
    prev ? { ...prev, lastPage: page } : prev
  );
  void client.invalidateQueries({ queryKey: ["pdfs", "library", database] });
}

/** 某份 PDF 上次读到的页（从 1 开始），以及写回入口 */
export function usePdfLastPage(pdf: Pick<Pdf, "id" | "lastPage" | "pageCount"> | null) {
  const { database } = useDatabaseReady();
  const client = useQueryClient();
  const id = pdf?.id ?? 0;
  const query = useQuery({
    queryKey: lastPageKey(database, id),
    queryFn: async () => (await getPdfById(id))?.lastPage ?? 1,
    enabled: id > 0,
    initialData: pdf?.lastPage ?? undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const mutation = useMutation({
    mutationFn: (page: number) => recordPdfPage(id, page),
    onMutate: page => syncLastPage(client, database, id, page),
  });
  const pageCount = pdf?.pageCount ?? null;
  const clamp = (page: number) => Math.max(1, pageCount ? Math.min(pageCount, page) : page);
  return {
    page: clamp(query.data ?? 1),
    pageCount,
    setPage: (page: number) => {
      const next = clamp(page);
      if (next !== query.data) mutation.mutate(next);
    },
  };
}
