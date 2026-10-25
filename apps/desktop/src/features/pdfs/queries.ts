/**
 * PDF 数据层：列表（Pdf 行 + 标注数 + 缩略图，主进程一次聚合）与 AI 索引状态分两个 query，
 * 按工作区数据库分 key；有文件在建索引时轮询状态。写操作之后失效整个 ["pdfs"] 域。
 */

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { v4 as uuid } from "uuid";
import { toast } from "@tau/ui";
import {
  convertFileSrc,
  createDir,
  createPdf,
  ensurePdfIndex,
  getEditorDir,
  getPdfById,
  getPdfIndexStatuses,
  getPdfLibrary,
  getSep,
  pathExists,
  readBinaryFile,
  removePdf,
  selectFile,
  updatePdf,
  writeBinaryFile,
} from "@/commands";
import useUploadResource from "@/hooks/useUploadResource";
import useGlobalStateStore from "@/stores/useGlobalStateStore";
import useSettingStore from "@/stores/useSettingStore";
import { remoteResourceToLocal } from "@/utils";
import type { Pdf, PdfLibraryItem } from "@/types";
import { toEntry, type PdfEntry } from "./model";
import { saveThumbnailFromBytes } from "./thumbnails";

const hasBridge = typeof window !== "undefined" && Boolean(window.electron);

const libraryKey = (database: string) => ["pdfs", "library", database] as const;
const indexKey = (database: string, ids: number[]) => ["pdfs", "index", database, ids] as const;
export const detailKey = (database: string, id: number) =>
  ["pdfs", "detail", database, id] as const;

/** 当前工作区数据库名与是否已连接；PDF 域的查询都按库分 key、连上才发 */
export function useDatabaseReady() {
  const database = useSettingStore(s => s.setting.database.active);
  const ready = useGlobalStateStore(s => s.databaseStatus[database] === "ready");
  return { database, ready: hasBridge && Boolean(database) && ready };
}

/* ───────── 查询 ───────── */

interface LibraryRow {
  item: PdfLibraryItem;
  thumbnailUrl: string | null;
}

async function fetchLibrary(): Promise<LibraryRow[]> {
  const items = await getPdfLibrary();
  return Promise.all(
    items.map(async item => ({
      item,
      // 版本号 = 缩略图修改时间：重新生成后地址变化，<img> 不吃旧缓存
      thumbnailUrl: item.thumbnailPath
        ? `${await convertFileSrc(item.thumbnailPath)}?v=${item.thumbnailVersion}`
        : null,
    }))
  );
}

export function usePdfLibrary() {
  const { database, ready } = useDatabaseReady();
  const library = useQuery({
    queryKey: libraryKey(database),
    queryFn: fetchLibrary,
    enabled: ready,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const ids = useMemo(() => (library.data ?? []).map(row => row.item.id), [library.data]);
  const index = useQuery({
    queryKey: indexKey(database, ids),
    queryFn: () => getPdfIndexStatuses({ pdfIds: ids, mainDbName: database }),
    enabled: ready && ids.length > 0,
    staleTime: 30_000,
    // 有文件在建索引（其它页面发起的也算）就轮询，直到全部落定
    refetchInterval: query =>
      query.state.data?.some(s => s.state === "building" || s.state === "pending") ? 3000 : false,
  });
  const entries = useMemo<PdfEntry[] | null>(() => {
    if (!library.data) return null;
    const statuses = new Map((index.data ?? []).map(s => [s.pdfId, s]));
    return library.data.map(({ item, thumbnailUrl }) =>
      toEntry(item, statuses.get(item.id), thumbnailUrl)
    );
  }, [library.data, index.data]);
  return { entries, loading: library.isPending, error: library.error };
}

export function usePdfDetail(id: number) {
  const { database, ready } = useDatabaseReady();
  const query = useQuery({
    queryKey: detailKey(database, id),
    queryFn: () => getPdfById(id),
    enabled: ready && id > 0,
    // 阅读器以 updateTime 作为重载键，不在阅读时自动刷新
    staleTime: Infinity,
  });
  return { pdf: query.data ?? null, loading: query.isPending, error: query.error };
}

/* ───────── 写入 ───────── */

/** 复制到 <编辑器目录>/resources，文件名加 uuid 防撞 */
async function storeLocalCopy(bytes: Uint8Array, fileName: string): Promise<string> {
  const sep = await getSep();
  const dir = (await getEditorDir()) + sep + "resources";
  if (!(await pathExists(dir))) await createDir(dir);
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : ".pdf";
  const target = `${dir}${sep}${stem}_${uuid()}${ext}`;
  await writeBinaryFile(target, bytes);
  return target;
}

/** 文件实际所在的本地路径：远程文件会下载到缓存 */
export async function resolvePdfPath(pdf: Pdf): Promise<string> {
  if (pdf.isLocal) return pdf.filePath;
  if (!pdf.remoteUrl) throw new Error("无法定位 PDF 文件");
  return remoteResourceToLocal(pdf.remoteUrl);
}

export function usePdfActions() {
  const client = useQueryClient();
  const uploadResource = useUploadResource();
  const mainDbName = useSettingStore(s => s.setting.database.active);
  const invalidate = () => client.invalidateQueries({ queryKey: ["pdfs"] });

  const importOne = async (file: File, upload: boolean) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let remoteUrl = "";
    if (upload) {
      try {
        remoteUrl =
          (await uploadResource(new File([bytes], file.name, { type: "application/pdf" }))) ?? "";
      } catch (error) {
        console.error("[pdfs] 上传失败", error);
      }
      if (!remoteUrl) toast.warning(`「${file.name}」上传失败，已保存为本地文件`);
    }
    const pdf = await createPdf({
      fileName: file.name,
      filePath: remoteUrl ? "" : await storeLocalCopy(bytes, file.name),
      isLocal: !remoteUrl,
      remoteUrl,
      tags: [],
      category: "",
    });
    await saveThumbnailFromBytes(pdf.id, bytes);
  };

  return {
    /** 导入本地文件（非 PDF 跳过）；upload = 同时上传到云端 */
    async importFiles(files: File[], upload: boolean) {
      const pdfs = files.filter(
        f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      );
      if (pdfs.length === 0) {
        toast.warning("只能添加 PDF 文件");
        return;
      }
      const id = toast.loading(
        pdfs.length > 1 ? `正在添加 ${pdfs.length} 个 PDF…` : `正在添加「${pdfs[0].name}」…`
      );
      let added = 0;
      for (const file of pdfs) {
        try {
          await importOne(file, upload);
          added += 1;
        } catch (error) {
          console.error("[pdfs] 添加失败", error);
          toast.error(`「${file.name}」添加失败`);
        }
      }
      if (added > 0) toast.resolve(id, `已添加 ${added} 个 PDF`);
      else toast.dismiss(id);
      await invalidate();
    },

    async addRemote(url: string, fileName: string) {
      await createPdf({
        fileName,
        filePath: "",
        isLocal: false,
        remoteUrl: url,
        tags: [],
        category: "",
      });
      await invalidate();
    },

    async rename(entry: PdfEntry, title: string) {
      const name = title.trim();
      if (!name) return;
      const fileName = /\.pdf$/i.test(name) ? name : `${name}.pdf`;
      await updatePdf({ ...entry.raw, fileName });
      await invalidate();
    },

    async uploadToCloud(entry: PdfEntry) {
      const id = toast.loading(`正在上传「${entry.title}」…`);
      try {
        const bytes = await readBinaryFile(entry.raw.filePath);
        const url = await uploadResource(
          new File([new Uint8Array(bytes)], entry.raw.fileName, { type: "application/pdf" })
        );
        if (!url) throw new Error("上传未返回地址");
        await updatePdf({ ...entry.raw, isLocal: false, remoteUrl: url, filePath: "" });
        toast.resolve(id, "已上传到云端");
      } catch (error) {
        console.error("[pdfs] 上传失败", error);
        toast.dismiss(id);
        toast.error("上传失败，请检查设置里的上传目标");
      }
      await invalidate();
    },

    /** 文件丢失时重新选择位置 */
    async relocate(entry: PdfEntry) {
      const picked = await selectFile({
        properties: ["openFile"],
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      const filePath = picked?.[0];
      if (!filePath) return;
      await updatePdf({ ...entry.raw, filePath });
      await invalidate();
    },

    async buildIndex(entry: PdfEntry) {
      try {
        const resolvedPath = await resolvePdfPath(entry.raw);
        // 建索引耗时长：发起后立即刷新状态，之后由状态查询轮询到落定
        const task = ensurePdfIndex({
          pdfId: entry.id,
          resolvedPath,
          fileName: entry.raw.fileName,
          mainDbName,
        });
        await invalidate();
        await task;
      } catch (error) {
        console.error("[pdfs] 建立索引失败", error);
        toast.error(`「${entry.title}」建立索引失败`);
      }
      await invalidate();
    },

    async remove(entry: PdfEntry) {
      // 先释放这个 PDF 下对话的宿主会话：主进程删 PDF 时连对话文件一起删
      const { default: useChatSessionStore } = await import("@/stores/useChatSessionStore");
      await useChatSessionStore
        .getState()
        .releaseBucket({ scope: "pdf-chat", domainRef: String(entry.id) });
      await removePdf(entry.id);
      await invalidate();
    },
  };
}

/**
 * 给其他域用的建 PDF 记录（项目里导入本地 / 远程 PDF）：建完失效 PDF 域缓存；
 * 本地文件顺带生成缩略图（失败不影响建记录，列表页会补）。
 */
export function useCreatePdfRecord() {
  const client = useQueryClient();
  return async (input: Omit<Pdf, "id" | "createTime" | "updateTime">): Promise<Pdf> => {
    const pdf = await createPdf(input);
    if (input.isLocal && input.filePath) {
      try {
        await saveThumbnailFromBytes(pdf.id, await readBinaryFile(input.filePath));
      } catch (error) {
        console.warn("[pdfs] 生成缩略图失败", error);
      }
    }
    await client.invalidateQueries({ queryKey: ["pdfs"] });
    return pdf;
  };
}
