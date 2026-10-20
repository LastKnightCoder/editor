import { APP_FEEDBACK_LIMITS } from "@/types/app-feedback";

/** 标注：框选（描边）与打码（实心遮盖）；坐标按原图宽高归一化到 0..1，与显示尺寸无关 */
export interface Annotation {
  kind: "box" | "mask";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationColors {
  box: string;
  mask: string;
}

// 长边上限：1920 足够看清界面文字，Retina 整窗截图压缩后约 150–400 KB
const MAX_EDGE = 1920;
const QUALITIES = [0.82, 0.7, 0.55, 0.4];

/** 拖拽起止点 → 归一化矩形；过小（误点）返回 null */
export function rectFromDrag(
  kind: Annotation["kind"],
  start: { x: number; y: number },
  end: { x: number; y: number },
  minSize = 0.005
): Annotation | null {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const x = clamp(Math.min(start.x, end.x));
  const y = clamp(Math.min(start.y, end.y));
  const width = clamp(Math.max(start.x, end.x)) - x;
  const height = clamp(Math.max(start.y, end.y)) - y;
  return width < minSize || height < minSize ? null : { kind, x, y, width, height };
}

export function exportSize(width: number, height: number) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** 打码先画、框选后画：框选不会被遮盖压住 */
export function drawAnnotations(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  annotations: readonly Annotation[],
  width: number,
  height: number,
  colors: AnnotationColors
) {
  const ordered = [...annotations].sort(
    (a, b) => Number(a.kind === "box") - Number(b.kind === "box")
  );
  const line = Math.max(2, Math.round(Math.max(width, height) / 400));
  for (const item of ordered) {
    const rect = [
      item.x * width,
      item.y * height,
      item.width * width,
      item.height * height,
    ] as const;
    if (item.kind === "mask") {
      context.fillStyle = colors.mask;
      context.fillRect(...rect);
    } else {
      context.strokeStyle = colors.box;
      context.lineWidth = line;
      context.lineJoin = "round";
      context.strokeRect(...rect);
    }
  }
}

/** 标注颜色取当前主题 token：打码用正文墨色（实心不可逆），框选用警示色 */
export function annotationColors(): AnnotationColors {
  const style = getComputedStyle(document.documentElement);
  return {
    box: style.getPropertyValue("--tau-danger").trim() || "red",
    mask: style.getPropertyValue("--tau-ink-2").trim() || "gray",
  };
}

/** 原图 + 标注 → 压缩后的 WebP；画质逐级下调直到不超过单张上限 */
export async function exportScreenshot(
  source: ImageBitmap,
  annotations: readonly Annotation[]
): Promise<Uint8Array> {
  const { width, height } = exportSize(source.width, source.height);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法处理截图");
  context.drawImage(source, 0, 0, width, height);
  drawAnnotations(context, annotations, width, height, annotationColors());
  for (const quality of QUALITIES) {
    const blob = await canvas.convertToBlob({ type: "image/webp", quality });
    if (blob.size <= APP_FEEDBACK_LIMITS.imageBytes)
      return new Uint8Array(await blob.arrayBuffer());
  }
  throw new Error("截图过大，压缩后仍超过 1.5 MB");
}
