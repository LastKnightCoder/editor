import type { Element } from "slate";
import { WIDTH_PRESETS, editorContentWidth, matchWidthPreset } from "./mediaWidth";

/** 视频最小宽度，与 VideoComponent 的档位计算一致 */
const VIDEO_MIN_WIDTH = 200;

/** 媒体块宽度档位的写入（组件内同步缩放状态，由渲染中的组件登记） */
export interface MediaWidthControl {
  /** 按可用宽度的比例设置宽度并写回节点 */
  applyPreset: (ratio: number) => void;
}

export const mediaWidthControls = new WeakMap<Element, MediaWidthControl>();

/**
 * 节点宽度命中的档位比例（按节点数据计算，节点刚改写、组件尚未重新登记时也准确）：
 * 图片宽度以 em×16 存储、按编辑区字号与内容宽度换算；视频宽度为 px，档位按编辑器宽度计算
 * （同 VideoComponent）；不在档位上或未存宽度返回 null。
 */
export function matchMediaWidthPreset(
  element: Element,
  insideEditor: HTMLElement | null | undefined
): number | null {
  const { type, width } = element as { type?: string; width?: number };
  if (!width || !insideEditor || (type !== "image" && type !== "video")) return null;
  const editorEl = insideEditor.closest<HTMLElement>('[data-slate-editor="true"]');
  if (type === "video") {
    const editorWidth = editorEl?.clientWidth ?? 0;
    if (!editorWidth) return null;
    return (
      WIDTH_PRESETS.find(
        ratio => Math.abs(Math.max(VIDEO_MIN_WIDTH, Math.round(editorWidth * ratio)) - width) <= 2
      ) ?? null
    );
  }
  const available = editorContentWidth(insideEditor);
  const fontSize = editorEl ? parseFloat(getComputedStyle(editorEl).fontSize) || 16 : 16;
  return matchWidthPreset((width * fontSize) / 16, available);
}
