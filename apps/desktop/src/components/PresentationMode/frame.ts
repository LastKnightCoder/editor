/**
 * 舞台逻辑尺寸：正文按编辑器常规字号排版，放映时整体缩放铺满窗口。
 * 宽度固定、高度随窗口比例（16:10 屏也用满高度）；正文列固定宽度水平居中。
 */
export const STAGE_WIDTH = 1000;
/** 窗口过宽时的最小逻辑高度，避免正文被放得过大 */
const STAGE_MIN_HEIGHT = 480;
export const STAGE_CONTENT_WIDTH = 768;
export const STAGE_PAD_TOP = 56;
/** 底部多留一截给 HUD 胶囊 */
export const STAGE_PAD_BOTTOM = 72;
/** 缩略图 / 首帧测量前使用的比例 */
export const DEFAULT_ASPECT = 16 / 9;

export interface StageSize {
  /** 逻辑尺寸 */
  width: number;
  height: number;
  /** 逻辑像素 → 屏幕像素 */
  scale: number;
}

export function fitStage(viewportWidth: number, viewportHeight: number): StageSize {
  const scale = Math.max(
    0.1,
    Math.min(viewportWidth / STAGE_WIDTH, viewportHeight / STAGE_MIN_HEIGHT)
  );
  return { width: viewportWidth / scale, height: viewportHeight / scale, scale };
}

/** 镜头视口：每屏可完整显示的内容高度 */
export function cameraViewport(stageHeight: number) {
  return Math.max(120, stageHeight - STAGE_PAD_TOP - STAGE_PAD_BOTTOM);
}
