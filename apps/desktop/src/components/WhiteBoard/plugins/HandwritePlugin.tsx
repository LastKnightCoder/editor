import { Link2, Minus, PenLine, Plus, Sparkles, Ungroup } from "lucide-react";
import { v4 as getUuid } from "uuid";
import { message } from "antd";
import {
  Board,
  BoardElement,
  ContextMenuContext,
  ECreateBoardElementType,
  IBoardPlugin,
  IElementCapabilities,
  Operation,
  PluginContextMenuItem,
} from "../types";
import {
  ChildrenRenderOrder,
  ContainmentBehavior,
  MovementBehavior,
  SnapBehavior,
} from "../types/capabilities";
import Handwrite from "../components/Handwrite";
import { CommonElement, CommonPlugin } from "./CommonPlugin";
import {
  CanvasUtil,
  PathUtil,
  applyHandwriteGroupIdPatch,
  collectHandwriteGroupMembers,
  denormalizeOutline,
  expandSelectionByHandwriteGroup,
  getDefaultHandwriteStyle,
  getSharedHandwriteGroupId,
  isHandwriteElement,
  isMergeableHandwriteSelection,
  outlineToSvgPath,
  rebuildHandwriteGeometry,
  saveHandwriteStyle,
} from "../utils";
import type {
  HandwriteInputPoint,
  HandwriteOutlinePoint,
  HandwriteStyle,
} from "../utils";

export interface HandwriteElement extends CommonElement {
  type: "handwrite";
  name: string;
  points: HandwriteInputPoint[];
  outline: HandwriteOutlinePoint[];
  style: HandwriteStyle;
}

export class HandwritePlugin extends CommonPlugin implements IBoardPlugin {
  name = "handwrite";

  getCapabilities(): IElementCapabilities {
    return {
      snap: {
        behavior: SnapBehavior.Normal,
      },
      containment: {
        asContainer: ContainmentBehavior.None,
        canBeContained: true,
      },
      movement: {
        behavior: MovementBehavior.Normal,
      },
      render: {
        childrenOrder: ChildrenRenderOrder.Reversed,
        getColorTheme: () => "indigo",
      },
      refLine: {
        participatesInRefLines: true,
      },
    };
  }

  private updateElementStyle(
    board: Board,
    element: HandwriteElement,
    updater: (style: HandwriteStyle) => HandwriteStyle,
  ) {
    const nextStyle = updater({
      ...getDefaultHandwriteStyle(),
      ...element.style,
    });

    const rebuilt = rebuildHandwriteGeometry(
      element.points,
      {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      },
      nextStyle,
    );
    if (!rebuilt) return;

    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    const nextElement: HandwriteElement = {
      ...element,
      ...rebuilt,
      style: nextStyle,
    };

    board.apply({
      type: "set_node",
      path,
      properties: element,
      newProperties: nextElement,
    });
    saveHandwriteStyle(nextStyle);
  }

  private updateHandwriteGroup(
    board: Board,
    targetElements: BoardElement[],
    nextGroupId: string | null,
  ): number {
    const handwriteElements = targetElements.filter(isHandwriteElement);
    if (handwriteElements.length === 0) return 0;

    const nextElements = applyHandwriteGroupIdPatch(
      handwriteElements,
      nextGroupId,
    );

    const operations: Operation[] = [];

    nextElements.forEach((nextElement, index) => {
      const currentElement = handwriteElements[index];
      const path = PathUtil.getPathByElement(board, currentElement);
      if (!path) return;

      operations.push({
        type: "set_node",
        path,
        properties: currentElement,
        newProperties: nextElement,
      });
    });

    if (operations.length === 0) return 0;

    operations.push({
      type: "set_selection",
      properties: board.selection,
      newProperties: {
        selectArea: null,
        selectedElements: expandSelectionByHandwriteGroup(board, nextElements),
      },
    });

    board.apply(operations);
    return nextElements.length;
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements } = context;
    const items: PluginContextMenuItem[] = [];

    if (targetElements.length === 0) {
      items.push({
        key: "create-handwrite",
        label: "手写",
        icon: <PenLine size={14} />,
        priority: 115,
        onSelect: (ctx: ContextMenuContext) => {
          ctx.board.currentCreateType = ECreateBoardElementType.Handwrite;
        },
      });
    }

    if (isMergeableHandwriteSelection(targetElements)) {
      items.push({
        key: "handwrite-merge-group",
        label: "合并手写",
        icon: <Link2 size={14} />,
        priority: 117,
        onSelect: (ctx: ContextMenuContext) => {
          const mergedCount = this.updateHandwriteGroup(
            ctx.board,
            ctx.targetElements,
            getUuid(),
          );
          if (mergedCount > 0) {
            message.success(`已合并 ${mergedCount} 条手写`);
          }
        },
      });
    }

    const sharedGroupId = getSharedHandwriteGroupId(targetElements);
    const sharedGroupMembers = sharedGroupId
      ? collectHandwriteGroupMembers(context.board, sharedGroupId)
      : [];
    if (
      targetElements.length > 0 &&
      targetElements.every(isHandwriteElement) &&
      sharedGroupId &&
      sharedGroupMembers.length > 1
    ) {
      items.push({
        key: "handwrite-split-group",
        label: "拆分手写组",
        icon: <Ungroup size={14} />,
        priority: 118,
        onSelect: (ctx: ContextMenuContext) => {
          const targetGroupId = getSharedHandwriteGroupId(ctx.targetElements);
          if (!targetGroupId) return;
          const members = collectHandwriteGroupMembers(
            ctx.board,
            targetGroupId,
          );
          if (members.length < 2) return;
          const splitCount = this.updateHandwriteGroup(
            ctx.board,
            members,
            null,
          );
          if (splitCount > 0) {
            message.success(`已拆分 ${splitCount} 条手写`);
          }
        },
      });
    }

    if (targetElements.length === 1 && targetElements[0].type === "handwrite") {
      const handwriteElement = targetElements[0] as HandwriteElement;
      items.push({
        key: "handwrite-shortcuts",
        label: "手写快捷",
        icon: <Sparkles size={14} />,
        priority: 116,
        children: [
          {
            key: "handwrite-size-up",
            label: "线宽 +1",
            icon: <Plus size={14} />,
            priority: 0,
            onSelect: (ctx: ContextMenuContext) => {
              this.updateElementStyle(ctx.board, handwriteElement, (style) => ({
                ...style,
                size: Math.min(64, style.size + 1),
              }));
            },
          },
          {
            key: "handwrite-size-down",
            label: "线宽 -1",
            icon: <Minus size={14} />,
            priority: 1,
            onSelect: (ctx: ContextMenuContext) => {
              this.updateElementStyle(ctx.board, handwriteElement, (style) => ({
                ...style,
                size: Math.max(1, style.size - 1),
              }));
            },
          },
          {
            key: "handwrite-toggle-pressure",
            label: "切换压感模拟",
            priority: 2,
            onSelect: (ctx: ContextMenuContext) => {
              this.updateElementStyle(ctx.board, handwriteElement, (style) => ({
                ...style,
                simulatePressure: !style.simulatePressure,
              }));
            },
          },
        ],
        onSelect: () => {},
      });
    }

    return items;
  }

  isHit(_board: Board, element: HandwriteElement, x: number, y: number) {
    const outlinePoints = denormalizeOutline(element.outline, {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    });

    const pathData = outlineToSvgPath(outlinePoints);
    if (pathData) {
      const isInPath = CanvasUtil.isPointInPath(new Path2D(pathData), x, y);
      if (isInPath) {
        return true;
      }
    }

    return super.isHit(_board, element, x, y);
  }

  render(_board: Board, { element }: { element: HandwriteElement }) {
    return (
      <Handwrite
        key={element.id}
        element={element}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeEnd={this.onResizeEnd}
      />
    );
  }
}

export default HandwritePlugin;
