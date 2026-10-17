import type { ElementSketch } from "../../types/sketch";
type SketchPatch = Partial<Record<keyof ElementSketch, unknown>>;

/** 合并覆盖：值为 undefined 的字段删除，全部删空则返回 undefined（回到完全跟随页面） */
export function patchSketch(
  sketch: ElementSketch | undefined,
  patch: SketchPatch
): ElementSketch | undefined {
  const next: Record<string, unknown> = { ...(sketch ?? {}), ...patch };
  Object.keys(next).forEach(key => next[key] === undefined && delete next[key]);
  return Object.keys(next).length ? (next as ElementSketch) : undefined;
}
