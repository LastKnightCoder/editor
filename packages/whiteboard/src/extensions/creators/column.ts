import { v4 as uuid } from "uuid";
import type {
  CreateGestureSession,
  CreatePointerContext,
  CustomCreateGesture,
  ElementCreateSpec,
  WhiteboardAPI,
} from "../api";
import type { BoardElement, Operation } from "../../types";
import { ColumnUtil } from "../../utils";

/** 旧 useCreateColumn 的宽度门槛（画布单位）：拖出宽度不足时不创建 */
export const COLUMN_CREATE_MIN_WIDTH = 50;

/**
 * 分栏创建的收纳判定（纯函数）：只看根层候选，准入由能力系统裁决
 * （api.canContain("column", element)，即各插件 containment.canBeContainedBy 对 column 的声明），
 * 元素中心点落在拖出的矩形内算被放入。
 */
export function collectColumnChildren(
  api: WhiteboardAPI,
  rootChildren: readonly BoardElement[],
  rect: { x: number; y: number; width: number; height: number }
): BoardElement[] {
  return rootChildren.filter(element => {
    if (!api.canContain("column", element)) return false;
    const { x, y, width, height } = element as BoardElement & {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    };
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      typeof width !== "number" ||
      typeof height !== "number"
    )
      return false;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    return (
      centerX >= rect.x &&
      centerX <= rect.x + rect.width &&
      centerY >= rect.y &&
      centerY <= rect.y + rect.height
    );
  });
}

const rawRect = (ctx: CreatePointerContext) => {
  const x = Math.min(ctx.start.x, ctx.point.x);
  const y = Math.min(ctx.start.y, ctx.point.y);
  return {
    x,
    y,
    width: Math.abs(ctx.point.x - ctx.start.x),
    height: Math.abs(ctx.point.y - ctx.start.y),
  };
};

/**
 * column 创建手势（CustomCreateGesture）：拖动中只预览（分栏按布局结果排布子元素并高亮），
 * 松手时一次性返回布局后的 column 与“从根层原位移除被放入元素”的 remove_node 操作，
 * 与插入同属一个撤销步；宽度不足 50 不创建。坐标取拖出矩形（宽高不约束）。
 */
export const columnCreateGesture: CustomCreateGesture = {
  begin: beginContext => {
    // 预览与最终提交共用同一 id，避免每帧闪新元素
    const columnId = uuid();
    const compute = (ctx: CreatePointerContext) => {
      const rect = rawRect(ctx);
      const base = ColumnUtil.createColumn(rect.x, rect.y, rect.width);
      base.id = columnId;
      const captured =
        rect.width < COLUMN_CREATE_MIN_WIDTH
          ? []
          : collectColumnChildren(ctx.api, ctx.api.children, rect);
      // 基础字段取 createColumn（含 minWidth/maxWidth 元数据），布局宽度用拖出的原始宽度（与旧实现一致）
      const layouted = ColumnUtil.layoutColumn({ ...base, width: rect.width, children: captured });
      return { rect, layouted, captured, tooNarrow: rect.width < COLUMN_CREATE_MIN_WIDTH };
    };
    const session: CreateGestureSession = {
      move: moveCtx => {
        const state = compute(moveCtx);
        // 宽度不足时不出现/不更新预览（沿用旧实现的门槛行为）
        if (state.tooNarrow) return;
        // 预览只画分栏容器（高度按布局结果）：被放入元素仍在根层原位渲染，由 highlight 标出
        beginContext.preview(
          { ...state.layouted, children: [] },
          {
            highlight: state.captured.map(element => element.id),
          }
        );
      },
      end: endCtx => {
        if (!endCtx.moved) return null;
        const state = compute(endCtx);
        if (state.tooNarrow) return null;

        // 被放入元素从根层原位移除（倒序删除避免路径位移），与插入同一个撤销步
        const rootChildren = endCtx.api.children;
        const capturedIds = new Set(state.captured.map(element => element.id));
        const operations: Operation[] = [];
        for (let index = rootChildren.length - 1; index >= 0; index--) {
          if (!capturedIds.has(rootChildren[index].id)) continue;
          operations.push({ type: "remove_node", path: [index], node: rootChildren[index] });
        }
        return operations.length ? { element: state.layouted, operations } : state.layouted;
      },
    };
    return session;
  },
};

export const columnCreateSpec: ElementCreateSpec = {
  gesture: columnCreateGesture,
  minSize: [COLUMN_CREATE_MIN_WIDTH, 1],
  after: "select",
  hint: () => ["拖拽绘制分栏"],
};
