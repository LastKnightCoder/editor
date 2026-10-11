import { v4 as uuid } from "uuid";
import type {
  CreateGestureSession,
  CreatePointerContext,
  CustomCreateGesture,
  ElementCreateSpec,
  WhiteboardAPI,
} from "../api";
import type {
  BoardElement,
  ColumnElement,
  ElementBounds,
  FrameElement,
  MindNodeElement,
  Operation,
} from "../../types";
import { ColumnUtil, FrameUtil, MindUtil } from "../../utils";
import { constrainCreateGeometry } from "../../interactions/createGesture";

/** 旧 useCreateFrame 的最小创建尺寸（画布单位） */
export const FRAME_CREATE_MIN_SIZE = 10;

/**
 * 旧 useCreateFrame 的收纳判定（纯函数）：只看根层候选，排除 frame 与 arrow，
 * 并按能力查询（api.canContain("frame", …)）排除声明 canBeContained:false 的元素，
 * 与 frame（含 padding 容差）交集占元素面积 50% 以上算被框住（containmentPolicy "partial"）。
 * column 的 canBeContained:false 与"新框架可收纳 column"的旧规则冲突，此处例外放行。
 */
export function collectFrameChildren(
  api: WhiteboardAPI,
  rootChildren: readonly BoardElement[],
  frame: FrameElement
): BoardElement[] {
  return rootChildren.filter(
    element =>
      element.type !== "frame" &&
      element.type !== "arrow" &&
      (element.type === "column" || api.canContain("frame", element)) &&
      FrameUtil.isElementInFrame(element, frame)
  );
}

/** 纯函数版元素包围盒：column 高度按内容重算，mind-node 取可见子树，其余按 x/y/width/height */
export function getElementBounds(element: BoardElement): ElementBounds | null {
  if (element.type === "mind-node") return MindUtil.getSubtreeBounds(element as MindNodeElement);
  if (element.type === "column") {
    const column = element as ColumnElement;
    return {
      minX: column.x,
      minY: column.y,
      maxX: column.x + column.width,
      maxY: column.y + ColumnUtil.calculateHeightFromChildren(column),
    };
  }
  const { x, y, width, height } = element as BoardElement & {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  if (
    typeof x === "number" &&
    typeof y === "number" &&
    typeof width === "number" &&
    typeof height === "number"
  ) {
    return { minX: x, minY: y, maxX: x + width, maxY: y + height };
  }
  return null;
}

const underMinSize = (width: number, height: number) =>
  width < FRAME_CREATE_MIN_SIZE || height < FRAME_CREATE_MIN_SIZE;

/**
 * frame 创建手势（CustomCreateGesture）：拖动中只预览（frame + 高亮将被收纳元素），
 * 松手时一次性返回带 children 的 frame 与“从根层原位移除被收纳元素”的 remove_node 操作，
 * 与插入同属一个撤销步；不足 10×10 不创建。
 */
export const frameCreateGesture: CustomCreateGesture = {
  begin: beginContext => {
    // 预览与最终提交共用同一 id，避免每帧闪新元素
    const frameId = uuid();
    const compute = (ctx: CreatePointerContext) => {
      const rect = constrainCreateGeometry("box", ctx.start, ctx.point, ctx.shift, ctx.alt).rect;
      const frame = FrameUtil.createFrame(rect.x, rect.y, rect.width, rect.height);
      frame.id = frameId;
      const tooSmall = underMinSize(rect.width, rect.height);
      return {
        frame,
        captured: tooSmall ? [] : collectFrameChildren(ctx.api, ctx.api.children, frame),
        tooSmall,
      };
    };
    const session: CreateGestureSession = {
      move: moveCtx => {
        const state = compute(moveCtx);
        // 不足最小尺寸时不出现/不更新预览（沿用旧实现的门槛行为）
        if (state.tooSmall) return;
        // 预览只画容器本体：被收纳元素仍在根层原位渲染，由 highlight 标出
        beginContext.preview(state.frame, { highlight: state.captured.map(element => element.id) });
      },
      end: endCtx => {
        if (!endCtx.moved) return null;
        const state = compute(endCtx);
        if (state.tooSmall) return null;

        // 松手时按子元素包围盒扩张边界（与旧实现 FrameUtil.calculateFrameBounds 同一规则）
        const childBounds = state.captured
          .map(getElementBounds)
          .filter((bounds): bounds is ElementBounds => bounds !== null);
        const bounds = FrameUtil.calculateFrameBoundsFromBounds(state.frame, childBounds);
        const frame: FrameElement = { ...state.frame, ...bounds, children: state.captured };

        // 被收纳元素从根层原位移除（倒序删除避免路径位移），与插入同一个撤销步
        const rootChildren = endCtx.api.children;
        const capturedIds = new Set(state.captured.map(element => element.id));
        const operations: Operation[] = [];
        for (let index = rootChildren.length - 1; index >= 0; index--) {
          if (!capturedIds.has(rootChildren[index].id)) continue;
          operations.push({ type: "remove_node", path: [index], node: rootChildren[index] });
        }
        return operations.length ? { element: frame, operations } : frame;
      },
    };
    return session;
  },
};

export const frameCreateSpec: ElementCreateSpec = {
  gesture: frameCreateGesture,
  after: "select",
  hint: () => ["拖拽生成框架", "框内元素会收入框架"],
};
