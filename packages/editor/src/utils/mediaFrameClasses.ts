import type { ResizeDirection } from "../hooks/useImageResize";

/** 块级媒体（图片、视频）容器的悬停 group 名：容器加它，工具条随悬停显隐 */
export const MEDIA_HOVER_GROUP = "group/media";

/** 悬停工具条；压在媒体上，固定深色半透明 + 白字，不随主题 */
export const MEDIA_ACTION_BAR_CLASS =
  "absolute right-[10px] top-[10px] z-[100] hidden rounded-[8px] bg-[rgba(38,38,38,0.6)] text-white opacity-0 transition-opacity duration-300 ease-in-out group-hover/media:flex group-hover/media:opacity-100";
export const MEDIA_ACTION_ITEM_CLASS =
  "flex h-[2em] w-[2em] cursor-pointer items-center justify-center";
export const MEDIA_ACTION_DIVIDER_CLASS =
  "mx-[0.25em] my-auto h-[1.1em] w-[0.0625em] bg-[rgba(255,255,255,0.1)]";

/** 块级媒体（图片、视频）容器的水平对齐 */
export const MEDIA_ALIGN_CLASS: Record<"left" | "center" | "right", string> = {
  left: "ml-0 mr-auto",
  center: "mx-auto",
  right: "ml-auto mr-0",
};

/** 块级媒体四角缩放句柄：白底 accent 描边圆点，中心压在容器角上 */
export const MEDIA_CORNER_HANDLE_CLASS =
  "absolute z-[2] h-[12px] w-[12px] touch-none rounded-full border-2 border-solid border-[var(--ed-accent)] bg-white";

export const MEDIA_CORNER_POSITION_CLASS: Partial<Record<ResizeDirection, string>> = {
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2",
  sw: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
  se: "bottom-0 right-0 translate-x-1/2 translate-y-1/2",
};

/** 缩放时左下角的尺寸提示；压在媒体上，固定深色半透明 + 白字，不随主题 */
export const MEDIA_RESIZE_INFO_CLASS =
  "pointer-events-none absolute bottom-[5px] left-[5px] z-[3] rounded-[3px] bg-[rgba(0,0,0,0.6)] px-[6px] py-[2px] text-[12px] text-white";
