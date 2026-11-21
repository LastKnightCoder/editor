/**
 * PDF 单页位图：白板文档卡的卡面与速览用。pdfjs 按需加载，同一份文件的文档对象按 id + updateTime 复用，
 * 渲染结果是 object URL，按「文件 + 页 + 宽度」缓存；最近用过的保留 MAX_PAGES 张，超出的释放。
 * 卡面只在画面里时才请求（调用方负责），离开画面的页随缓存淘汰释放。
 */

import { useEffect, useState } from "react";
import { readBinaryFile } from "@/commands";
import type { Pdf } from "@/types";
import { resolvePdfPath } from "./queries";

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

/** 打开着的文档：同时最多留几份（每份占着整份字节） */
const MAX_DOCUMENTS = 4;
/** 缓存的页图张数 */
const MAX_PAGES = 48;

const documents = new Map<string, Promise<PdfjsDocument>>();
const pages = new Map<string, Promise<string>>();

const documentKey = (pdf: Pick<Pdf, "id" | "updateTime">) => `${pdf.id}:${pdf.updateTime}`;

function touch<T>(
  map: Map<string, T>,
  key: string,
  value: T,
  max: number,
  drop: (value: T) => void
) {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const [oldest, stale] = map.entries().next().value as [string, T];
    map.delete(oldest);
    drop(stale);
  }
}

function openDocument(pdf: Pdf): Promise<PdfjsDocument> {
  const key = documentKey(pdf);
  const existing = documents.get(key);
  if (existing) {
    touch(documents, key, existing, MAX_DOCUMENTS, () => {});
    return existing;
  }
  const loading = (async () => {
    const [pdfjs, bytes] = await Promise.all([
      loadPdfjs(),
      resolvePdfPath(pdf).then(readBinaryFile),
    ]);
    return pdfjs.getDocument({ data: bytes.slice() }).promise;
  })();
  loading.catch(() => documents.delete(key));
  touch(documents, key, loading, MAX_DOCUMENTS, stale => {
    void stale.then(doc => doc.destroy()).catch(() => {});
  });
  return loading;
}

async function renderPage(pdf: Pdf, pageNumber: number, width: number): Promise<string> {
  const doc = await openDocument(pdf);
  const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
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
  return URL.createObjectURL(blob);
}

/** 渲染宽度按 160px 一档取整：缩放时不必每帧重画 */
const bucket = (width: number) => Math.max(160, Math.ceil(width / 160) * 160);

export function loadPdfPage(pdf: Pdf, pageNumber: number, width: number): Promise<string> {
  const key = `${documentKey(pdf)}:${pageNumber}:${bucket(width)}`;
  const existing = pages.get(key);
  if (existing) {
    touch(pages, key, existing, MAX_PAGES, () => {});
    return existing;
  }
  const rendering = renderPage(pdf, pageNumber, bucket(width));
  rendering.catch(() => pages.delete(key));
  touch(pages, key, rendering, MAX_PAGES, stale => {
    void stale.then(url => URL.revokeObjectURL(url)).catch(() => {});
  });
  return rendering;
}

/** 某一页的位图地址；enabled 为 false（卡片不在画面里）时不渲染，保留上一次的图 */
export function usePdfPage(
  pdf: Pdf | null,
  pageNumber: number,
  width: number,
  enabled = true
): { url: string | null; error: boolean } {
  const [state, setState] = useState<{ url: string | null; error: boolean }>({
    url: null,
    error: false,
  });
  const key = pdf ? `${documentKey(pdf)}:${pageNumber}:${bucket(width)}` : null;
  useEffect(() => {
    if (!pdf || !enabled) return;
    let alive = true;
    loadPdfPage(pdf, pageNumber, width).then(
      url => alive && setState({ url, error: false }),
      () => alive && setState(previous => ({ url: previous.url, error: true }))
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key 已含 pdf、页与宽度档
  }, [key, enabled]);
  return state;
}
