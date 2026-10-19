import type { ResizeDirection } from "../hooks/useImageResize";

/** 块级媒体（图片、视频）容器的水平对齐 */
export const MEDIA_ALIGN_CLASS: Record<"left" | "center" | "right", string> = {
  left: "ml-0 mr-auto",
  center: "mx-auto",
  right: "ml-auto mr-0",
};

/** 选中描边：随媒体圆角、外扩 3px */
export const MEDIA_SELECTED_OUTLINE_CLASS =
  "outline-solid outline-2 outline-offset-[3px] outline-[var(--ed-accent)]";

/** 块级媒体四角缩放句柄：纸色底 accent 描边圆点，中心压在容器角上 */
export const MEDIA_CORNER_HANDLE_CLASS =
  "absolute z-[2] h-[12px] w-[12px] touch-none rounded-full border-2 border-solid border-[var(--ed-accent)] bg-[var(--ed-bg-surface)]";

export const MEDIA_CORNER_POSITION_CLASS: Partial<Record<ResizeDirection, string>> = {
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2",
  sw: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
  se: "bottom-0 right-0 translate-x-1/2 translate-y-1/2",
};

/** 两侧中点的单向拖宽句柄：竖向胶囊 */
export const MEDIA_SIDE_HANDLE_CLASS =
  "absolute top-1/2 z-[2] h-[28px] w-[6px] -translate-y-1/2 touch-none rounded-full border-2 border-solid border-[var(--ed-accent)] bg-[var(--ed-bg-surface)]";

export const MEDIA_SIDE_POSITION_CLASS: Partial<Record<ResizeDirection, string>> = {
  w: "left-0 -translate-x-1/2",
  e: "right-0 translate-x-1/2",
};

/** 缩放时的尺寸提示：底部居中的深色小胶囊 */
export const MEDIA_RESIZE_INFO_CLASS =
  "text-tau-micro pointer-events-none absolute bottom-3 left-1/2 z-[3] -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--ed-text)] px-2.5 py-0.5 tabular-nums text-[var(--ed-text-inverse)] [font-family:var(--ed-font-mono)]";
