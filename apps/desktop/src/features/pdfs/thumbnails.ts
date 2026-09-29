/**
 * PDF 首页缩略图：渲染端用 pdfjs 画第 1 页 → webp，交主进程落盘并顺带记录页数。
 * 生成时机：导入时（手里已有字节）、打开详情时（文件已就位）、列表页为缺图的本地文件补生成。
 * 远程文件在列表页不补（会触发下载），打开过一次后才有图。
 */

import { readBinaryFile, savePdfThumbnail } from "@/commands";
import { queryClient } from "@/queryClient";

/** 缩略图宽度（像素）：封面格约 140–180 CSS 像素，按 2 倍图出 */
const THUMB_WIDTH = 360;

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

// pdfjs 体积大，只在真正需要生成时加载
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

export async function renderThumbnail(
  bytes: Uint8Array
): Promise<{ image: Uint8Array; pageCount: number }> {
  const pdfjs = await loadPdfjs();
  // pdfjs 会把数据转移给 worker，传副本免得调用方的字节被清空
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建画布");
    await page.render({ canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/webp", 0.82)
    );
    if (!blob) throw new Error("缩略图编码失败");
    return { image: new Uint8Array(await blob.arrayBuffer()), pageCount: doc.numPages };
  } finally {
    void doc.destroy();
  }
}

/** 渲染并保存；失败只记日志（缩略图缺失时列表回落文字封面） */
export async function saveThumbnailFromBytes(pdfId: number, bytes: Uint8Array): Promise<void> {
  try {
    const { image, pageCount } = await renderThumbnail(bytes);
    await savePdfThumbnail(pdfId, image, pageCount);
  } catch (error) {
    console.warn(`[pdfs] 生成缩略图失败: id=${pdfId}`, error);
  }
}

/* ───────── 串行队列：同一时刻只渲染一个，队列清空后统一刷新列表 ───────── */

const queued = new Set<number>();
/** 本次运行里失败过的不再重试，免得坏文件每次进列表都重跑 */
const failed = new Set<number>();
let running: Promise<void> = Promise.resolve();

export function enqueueThumbnail(pdfId: number, filePath: string): void {
  if (queued.has(pdfId) || failed.has(pdfId)) return;
  queued.add(pdfId);
  running = running.then(async () => {
    try {
      const bytes = await readBinaryFile(filePath);
      const { image, pageCount } = await renderThumbnail(bytes);
      await savePdfThumbnail(pdfId, image, pageCount);
    } catch (error) {
      failed.add(pdfId);
      console.warn(`[pdfs] 生成缩略图失败: id=${pdfId}`, error);
    } finally {
      queued.delete(pdfId);
      if (queued.size === 0) void queryClient.invalidateQueries({ queryKey: ["pdfs", "library"] });
    }
  });
}
