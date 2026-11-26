import { whiteboardT } from "../i18n-runtime";
import { menuText } from "../menu-i18n";
import { Gauge, Link2, Minus, PenLine, Plus, Sparkles, Ungroup } from "lucide-react";
import { v4 as getUuid } from "uuid";
import { toast } from "@tau/ui";
import {
  Board,
  BoardElement,
  ContextMenuContext,
  IBoardPlugin,
  IElementCapabilities,
  Operation,
  PluginContextMenuItem,
} from "../types";
import { HANDWRITE_TOOL_ID } from "../constants/tools";
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
  BoardUtil,
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
import type { HandwriteInputPoint, HandwriteOutlinePoint, HandwriteStyle } from "../utils";

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
    updater: (style: HandwriteStyle) => HandwriteStyle
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
      nextStyle
    );
    if (!rebuilt) return;

    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    const nextElement: HandwriteElement = {
      ...element,
      ...rebuilt,
      style: nextStyle,
    };

    const ops = BoardUtil.diffNodePatchOnly(element, nextElement, path);
    if (ops.length > 0) {
      board.apply(ops);
    }
    saveHandwriteStyle(nextStyle);
  }

  private updateHandwriteGroup(
    board: Board,
    targetElements: BoardElement[],
    nextGroupId: string | null
  ): number {
    const handwriteElements = targetElements.filter(isHandwriteElement);
    if (handwriteElements.length === 0) return 0;

    const nextElements = applyHandwriteGroupIdPatch(handwriteElements, nextGroupId);

    const operations: Operation[] = [];

    nextElements.forEach((nextElement, index) => {
      const currentElement = handwriteElements[index];
      const path = PathUtil.getPathByElement(board, currentElement);
      if (!path) return;

      operations.push(...BoardUtil.diffNodePatchOnly(currentElement, nextElement, path));
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
        ...menuText(context.board, "menus.handwrite"),
        icon: <PenLine size={14} />,
        priority: 115,
        onSelect: (ctx: ContextMenuContext) => {
          ctx.board.setActiveTool(HANDWRITE_TOOL_ID);
        },
      });
    }

    if (isMergeableHandwriteSelection(targetElements)) {
      items.push({
        key: "handwrite-merge-group",
        ...menuText(context.board, "menus.handwrite.merge"),
        icon: <Link2 size={14} />,
        priority: 117,
        onSelect: (ctx: ContextMenuContext) => {
          const mergedCount = this.updateHandwriteGroup(ctx.board, ctx.targetElements, getUuid());
          if (mergedCount > 0) {
            toast.success(whiteboardT(ctx.board, "menus.handwrite.merged", { count: mergedCount }));
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
        ...menuText(context.board, "menus.handwrite.split"),
        icon: <Ungroup size={14} />,
        priority: 118,
        onSelect: (ctx: ContextMenuContext) => {
          const targetGroupId = getSharedHandwriteGroupId(ctx.targetElements);
          if (!targetGroupId) return;
          const members = collectHandwriteGroupMembers(ctx.board, targetGroupId);
          if (members.length < 2) return;
          const splitCount = this.updateHandwriteGroup(ctx.board, members, null);
          if (splitCount > 0) {
            toast.success(
              whiteboardT(ctx.board, "menus.handwrite.splitResult", { count: splitCount })
            );
          }
        },
      });
    }

    if (targetElements.length === 1 && targetElements[0].type === "handwrite") {
      const handwriteElement = targetElements[0] as HandwriteElement;
      items.push({
        key: "handwrite-shortcuts",
        ...menuText(context.board, "menus.handwrite.shortcuts"),
        icon: <Sparkles size={14} />,
        priority: 116,
        children: [
          {
            key: "handwrite-size-up",
            ...menuText(context.board, "menus.handwrite.wider"),
            icon: <Plus size={14} />,
            priority: 0,
            onSelect: (ctx: ContextMenuContext) => {
              this.updateElementStyle(ctx.board, handwriteElement, style => ({
                ...style,
                size: Math.min(64, style.size + 1),
              }));
            },
          },
          {
            key: "handwrite-size-down",
            ...menuText(context.board, "menus.handwrite.narrower"),
            icon: <Minus size={14} />,
            priority: 1,
            onSelect: (ctx: ContextMenuContext) => {
              this.updateElementStyle(ctx.board, handwriteElement, style => ({
                ...style,
                size: Math.max(1, style.size - 1),
              }));
            },
          },
          {
            key: "handwrite-toggle-pressure",
            ...menuText(context.board, "menus.handwrite.pressure"),
            icon: <Gauge size={14} />,
            priority: 2,
            onSelect: (ctx: ContextMenuContext) => {
              this.updateElementStyle(ctx.board, handwriteElement, style => ({
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
