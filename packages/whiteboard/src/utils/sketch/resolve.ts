import type { ElementSketch, PageSketch, ResolvedSketch } from "../../types/sketch";
import { hashSeed } from "./random";

/** 跟随手绘的元素类型；手写本来就是墨迹，不在其列 */
const SKETCHABLE_TYPES = new Set([
  "geometry",
  "stickman",
  "arrow",
  "frame",
  "column",
  "richtext",
  "document",
  "mind-node",
  "image",
  "video",
  "webview",
  "audio",
  "whiteboard",
]);

/** 该类型是否跟随手绘（与当前画风无关，只看类型） */
export const isSketchableType = (type: string) => SKETCHABLE_TYPES.has(type);

interface SketchCarrier {
  id: string;
  type: string;
  sketch?: ElementSketch;
}

/**
 * 页面默认画风 + 元素覆盖 → 生效画风。
 * 思维导图整棵树共用根节点的覆盖与笔迹种子，所以传入 owner 为根节点。
 */
export function resolveSketch(
  page: PageSketch,
  element: SketchCarrier,
  owner: SketchCarrier = element
): ResolvedSketch {
  const own = owner.sketch ?? {};
  const idSeed = hashSeed(element.id);
  // 共用种子时与各自 id 混合，同尺寸的导图节点不会画成一模一样
  const seed =
    own.seed === undefined
      ? idSeed
      : owner.id === element.id
        ? own.seed
        : (own.seed ^ idSeed) >>> 0;
  return {
    enabled: SKETCHABLE_TYPES.has(element.type) && (own.mode ?? page.mode) === "sketch",
    level: own.level ?? page.level,
    seed,
  };
}
