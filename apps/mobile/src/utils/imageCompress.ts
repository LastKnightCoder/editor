// 上传前的前端图片预压缩：相机原图常见 3–8MB，先在 WebView 内压成 webp
// （长边 2048、质量 0.85，画质视觉无损），把 IPC 与图床的负载降到 1/10 以下。
// gif（canvas 重绘会丢动画）与小图不压；压缩无收益时回退原图。

export type CompressedImage = {
  blob: Blob;
  fileName: string;
  mimeType: string;
};

const SKIP_COMPRESSION_BYTES = 300 * 1024;
const MAX_EDGE = 2048;
const WEBP_QUALITY = 0.85;

export async function compressImageForUpload(file: File): Promise<CompressedImage> {
  const fallback: CompressedImage = {
    blob: file,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
  };
  if (file.type === "image/gif" || file.size <= SKIP_COMPRESSION_BYTES) {
    return fallback;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return fallback;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY)
    );
    if (!blob || blob.size >= file.size) {
      return fallback;
    }
    const stem = file.name.replace(/\.[^.]+$/, "") || "image";
    return { blob, fileName: `${stem}.webp`, mimeType: "image/webp" };
  } catch {
    return fallback;
  }
}
