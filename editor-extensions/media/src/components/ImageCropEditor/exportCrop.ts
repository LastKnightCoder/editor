import { rotationOf, type ImageCropTransform, type Size } from "./geometry";

/** 画布单边上限（浏览器对超大 canvas 会静默失败） */
const MAX_CANVAS_SIDE = 8192;
const JPEG_QUALITY = 0.92;

const FORMATS: Record<string, { mime: string; ext: string }> = {
  png: { mime: "image/png", ext: "png" },
  jpg: { mime: "image/jpeg", ext: "jpg" },
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  webp: { mime: "image/webp", ext: "webp" },
};

/** 画布绘制参数：把原图按裁剪参数画进 cropWidth × cropHeight 的输出画布 */
export function drawCrop(
  ctx: Pick<CanvasRenderingContext2D, "translate" | "rotate" | "scale" | "drawImage">,
  image: CanvasImageSource,
  imageSize: Size,
  transform: ImageCropTransform
) {
  ctx.translate(
    transform.cropWidth / 2 + transform.offsetX,
    transform.cropHeight / 2 + transform.offsetY
  );
  ctx.rotate(rotationOf(transform));
  ctx.scale(transform.flipX ? -1 : 1, 1);
  ctx.drawImage(
    image,
    -imageSize.width / 2,
    -imageSize.height / 2,
    imageSize.width,
    imageSize.height
  );
}

/** 按原图扩展名决定输出格式：PNG / WebP 保持（透明底不丢），JPEG 保持，其余（GIF、SVG 等）出 PNG */
export function outputFormatOf(url: string): { mime: string; ext: string } {
  const ext = url.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
  return FORMATS[ext] ?? FORMATS.png;
}

/** 把原图按裁剪参数画到画布并导出；跨域且无 CORS 的图片会污染画布，此时抛错由调用方提示 */
export function exportCrop(
  image: HTMLImageElement,
  transform: ImageCropTransform,
  mime: string
): Promise<Blob> {
  const width = Math.max(1, Math.round(transform.cropWidth));
  const height = Math.max(1, Math.round(transform.cropHeight));
  const shrink = Math.min(1, MAX_CANVAS_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * shrink);
  canvas.height = Math.round(height * shrink);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("无法创建画布"));
  }
  ctx.imageSmoothingQuality = "high";
  ctx.scale(shrink, shrink);
  drawCrop(ctx, image, { width: image.naturalWidth, height: image.naturalHeight }, transform);
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error("导出图片失败"))),
        mime,
        mime === "image/jpeg" ? JPEG_QUALITY : undefined
      );
    } catch (error) {
      reject(error);
    }
  });
}
