/**
 * PDF 单页位图：白板文档卡的卡面与速览用。pdfjs 按需加载，文档对象按资料库和文件身份复用，
 * 渲染结果是 Blob，按「文件 + 页 + 宽度」缓存；最近用过的保留 MAX_PAGES 张，超出的释放。
 * 卡面只在画面里时才请求（调用方负责），离开画面的页随缓存淘汰释放。
 */

import { useEffect, useState } from "react";
import { readBinaryFile } from "@/commands";
import type { Pdf } from "@/types";
import { resolvePdfPath, useDatabaseReady } from "./queries";

type PdfjsDocument = import("pdfjs-dist").PDFDocumentProxy;

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function loadPdfjs() {
  pdfjsPromise ??= Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsPromise;
}

/** 正在渲染的文档保留到最后一个使用者结束，再按最近访问顺序回收。 */
const MAX_DOCUMENTS = 4;
const MAX_PAGES = 48;

interface OpenDocument {
  loading: Promise<PdfjsDocument>;
  users: number;
}

interface RenderedPage {
  blob: Blob;
  page: number;
  pageCount: number;
}

const documents = new Map<string, OpenDocument>();
const pages = new Map<string, Promise<RenderedPage>>();
const documentKey = (database: string, pdf: Pdf) =>
  JSON.stringify([database, pdf.id, pdf.updateTime, pdf.isLocal ? pdf.filePath : pdf.remoteUrl]);

async function openDocument(pdf: Pdf): Promise<PdfjsDocument> {
  const [pdfjs, bytes] = await Promise.all([loadPdfjs(), resolvePdfPath(pdf).then(readBinaryFile)]);
  return pdfjs.getDocument({ data: bytes.slice() }).promise;
}

async function withDocument<T>(
  database: string,
  pdf: Pdf,
  read: (doc: PdfjsDocument) => T | Promise<T>
): Promise<T> {
  const key = documentKey(database, pdf);
  let entry = documents.get(key);
  if (entry) documents.delete(key);
  else {
    const loading = openDocument(pdf);
    entry = { loading, users: 0 };
    void loading.catch(() => {
      if (documents.get(key)?.loading === loading) documents.delete(key);
    });
  }
  documents.set(key, entry);
  entry.users++;
  try {
    return await read(await entry.loading);
  } finally {
    entry.users--;
    for (const [oldKey, old] of documents) {
      if (documents.size <= MAX_DOCUMENTS) break;
      if (old.users) continue;
      documents.delete(oldKey);
      void old.loading.then(doc => doc.destroy()).catch(() => undefined);
    }
  }
}

export function getPdfPageCount(database: string, pdf: Pdf) {
  return withDocument(database, pdf, doc => doc.numPages);
}

async function renderPage(
  doc: PdfjsDocument,
  pageNumber: number,
  width: number
): Promise<RenderedPage> {
  const actualPage = Math.min(Math.max(1, pageNumber), doc.numPages);
  const page = await doc.getPage(actualPage);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建画布");
  await page.render({ canvasContext: context, viewport }).promise;
  page.cleanup();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob) throw new Error("页面编码失败");
  return { blob, page: actualPage, pageCount: doc.numPages };
}

const bucket = (width: number) => Math.max(160, Math.ceil(width / 160) * 160);

export function loadPdfPage(database: string, pdf: Pdf, pageNumber: number, width: number) {
  const key = `${documentKey(database, pdf)}:${pageNumber}:${bucket(width)}`;
  const cached = pages.get(key);
  if (cached) {
    pages.delete(key);
    pages.set(key, cached);
    return cached;
  }
  const rendering = withDocument(database, pdf, doc => renderPage(doc, pageNumber, bucket(width)));
  pages.set(key, rendering);
  if (pages.size > MAX_PAGES) {
    const oldest = pages.keys().next();
    if (!oldest.done) pages.delete(oldest.value);
  }
  void rendering.catch(() => {
    if (pages.get(key) === rendering) pages.delete(key);
  });
  return rendering;
}

type PageImage = {
  key: string;
  url: string | null;
  error: boolean;
  page?: number;
  pageCount?: number;
};

export function usePdfPage(pdf: Pdf, page: number, width: number, enabled: boolean) {
  const { database } = useDatabaseReady();
  const key = `${documentKey(database, pdf)}:${page}:${bucket(width)}`;
  const [image, setImage] = useState<PageImage | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let url: string | undefined;
    loadPdfPage(database, pdf, page, width).then(
      result => {
        if (!alive) return;
        url = URL.createObjectURL(result.blob);
        setImage({ key, url, error: false, page: result.page, pageCount: result.pageCount });
      },
      () => alive && setImage({ key, url: null, error: true })
    );
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key 包含库、文件、页码与宽度档
  }, [key, enabled]);
  return enabled && image?.key === key ? image : null;
}
