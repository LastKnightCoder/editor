import type { Point } from "../../types/point";
import type { MindDragTarget, MindNodeElement } from "../../types/mind";

export type MindLayoutId = "mind" | "logic" | "org" | "tree";
export type MindSide = "left" | "right";
export type MindArrowKey = "up" | "down" | "left" | "right";
/** 方向键在当前布局下的语义 */
export type MindNavRole = "child" | "parent" | "prev" | "next";

export interface MindBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 父 → 子连线：水平布局沿用曲线箭头，其余布局给出现成路径 */
export type MindConnector = { kind: "curve"; from: Point; to: Point } | { kind: "path"; d: string };

export type MindDropDistance = Omit<MindDragTarget, "node" | "insertIndex">;

export interface MindLayout {
  id: MindLayoutId;
  /**
   * 根节点的子分支能放在哪几侧。单向布局只有 "right"：节点原有的 direction 不改写、也不参与排布，
   * 切回思维导图时恢复原来的左右分配。
   */
  sides: readonly MindSide[];
  /** 在 immer 草稿上写入可见节点的坐标与高度投影；根节点位置不动 */
  place(root: MindNodeElement): void;
  connector(
    parent: MindNodeElement,
    child: MindBox & Pick<MindNodeElement, "direction">
  ): MindConnector;
  /** 折叠按钮圆心 at；收起后从节点边缘 from 画一小段线连到按钮 */
  foldHandle(node: MindNodeElement, side: MindSide): { at: Point; from: Point };
  navigate(
    node: Pick<MindNodeElement, "level" | "direction">,
    key: MindArrowKey
  ): MindNavRole | null;
  /** parentLevel 这一层父节点的子节点沿哪条轴排列，决定拖拽插入位置比较 x 还是 y */
  siblingAxis(parentLevel: number): "x" | "y";
  /** 拖拽候选：被拖节点能否挂到 parent 的 side 一侧，以及屏幕距离评分 */
  dropDistance(
    dragged: MindBox,
    parent: MindNodeElement,
    side: MindSide,
    zoom: number
  ): MindDropDistance | null;
}
