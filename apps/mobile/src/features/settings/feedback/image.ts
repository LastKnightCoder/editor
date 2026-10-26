// 反馈截图压缩：长边压到 1920，WebP 质量逐级下调直到不超过单张上限；
// WebView 不支持 WebP 编码时回退 JPEG。

import { APP_FEEDBACK_LIMITS } from "../../../services/appFeedback";

const MAX_EDGE = 1920;
const QUALITIES = [0.82, 0.7, 0.55, 0.4];

export interface CompressedImage {
  bytes: Uint8Array;
  /** 上传时声明的 MIME（png/jpeg/webp，服务端仍按魔数复核） */
  type: string;
  previewUrl: string;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(blob => resolve(blob), type, quality));
}

export async function compressImage(file: Blob): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法处理图片");
    context.drawImage(bitmap, 0, 0, width, height);
    for (const type of ["image/webp", "image/jpeg"]) {
      for (const quality of QUALITIES) {
        const blob = await canvasToBlob(canvas, type, quality);
        // 不支持该编码时浏览器静默回退 PNG，按 type 不符处理
        if (!blob || blob.type !== type) break;
        if (blob.size <= APP_FEEDBACK_LIMITS.imageBytes) {
          return {
            bytes: new Uint8Array(await blob.arrayBuffer()),
            type,
            previewUrl: URL.createObjectURL(blob),
          };
        }
      }
    }
    throw new Error("截图过大，压缩后仍超过 1.5 MB");
  } finally {
    bitmap.close();
  }
}
