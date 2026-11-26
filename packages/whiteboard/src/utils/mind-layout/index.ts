import type { MindNodeElement } from "../../types/mind";
import type { MindLayout, MindLayoutId } from "./types";
import { createHorizontalLayout } from "./horizontal";
import { orgLayout } from "./org";
import { treeLayout } from "./tree";

export type * from "./types";
export {
  boundaryBox,
  createRangeGeometry,
  rangeBox,
  rangeNodes,
  subtreeBox,
  summaryBrace,
} from "./ranges";
export {
  isHiddenChild,
  isSummary,
  normalizeTree,
  reconcileRanges,
  resolveRange,
  shrinkRangesBeforeRemoval,
  stackChildren,
  summaryChildren,
  visibleChildren,
} from "./tree-shape";

const LAYOUTS: Record<MindLayoutId, MindLayout> = {
  mind: createHorizontalLayout("mind", true),
  logic: createHorizontalLayout("logic", false),
  org: orgLayout,
  tree: treeLayout,
};

export const MIND_LAYOUT_IDS = Object.keys(LAYOUTS) as MindLayoutId[];
export const DEFAULT_MIND_LAYOUT: MindLayoutId = "mind";

export const resolveMindLayoutId = (value: unknown): MindLayoutId =>
  typeof value === "string" && Object.hasOwn(LAYOUTS, value)
    ? (value as MindLayoutId)
    : DEFAULT_MIND_LAYOUT;

/** 未登记的布局值（新版本写入、旧版本打开）回落思维导图 */
export const getMindLayout = (root: Pick<MindNodeElement, "layout"> | null | undefined) =>
  LAYOUTS[resolveMindLayoutId(root?.layout)];
