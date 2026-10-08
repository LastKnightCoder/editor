import { CreditCard } from "lucide-react";
import {
  Board,
  BoardElement,
  IBoardPlugin,
  EHandlerPosition,
  Point,
  ContextMenuContext,
  PluginContextMenuItem,
  IElementCapabilities,
} from "../types";
import { ContainmentBehavior } from "../types/capabilities";
import { BoardUtil, getResizedBBox, PathUtil } from "../utils";
import Card from "../components/Card";
import { CommonPlugin, CommonElement } from "./CommonPlugin";
import { SelectTransforms } from "../transforms";
import { TextTone, TextVariant } from "../constants";

export interface CardElement extends CommonElement {
  type: "card";
  cardId: number;
  maxWidth: number;
  maxHeight: number;
  resized: boolean;
  readonly?: boolean;
  variant?: TextVariant;
  tone?: TextTone;
  /** @deprecated 旧版外观字段，只读，由 resolveTextStyle 换算成 variant/tone */
  background?: string;
  /** @deprecated 同上 */
  topColor?: string;
}

export class CardPlugin extends CommonPlugin implements IBoardPlugin {
  name = "card";

  constructor() {
    super();
    this.onEditorSizeChange = this.onEditorSizeChange.bind(this);
    this.onResize = this.onResize.bind(this);
  }

  getCapabilities(): IElementCapabilities {
    return {
      containment: {
        asContainer: ContainmentBehavior.None,
        canBeContained: true,
        // 声明可入 Column（准入与否由子方声明反转决定，见 CapabilityService.canContain）
        canBeContainedBy: (container: BoardElement) => container.type === "column",
      },
    };
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements } = context;
    const items: PluginContextMenuItem[] = [];

    // 右键空白区域 → 添加「创建卡片」菜单
    if (targetElements.length === 0) {
      items.push({
        key: "create-card",
        label: "卡片",
        icon: <CreditCard size={14} />,
        priority: 140,
        onSelect: (ctx: ContextMenuContext) => {
          ctx.board.emit("context-menu:open-modal", { type: "card" });
        },
      });
    }

    return items;
  }

  onResize(
    board: Board,
    element: CardElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    _isPreserveRatio = false,
    isAdsorb = false
  ) {
    if (!this.originResizeElement) return;
    const newBBox = getResizedBBox(this.originResizeElement, position, startPoint, endPoint);
    const newElement = {
      ...element,
      ...newBBox,
      resized: true,
      maxWidth: newBBox.width,
      maxHeight: newBBox.height,
    };
    const path = PathUtil.getPathByElement(board, newElement);
    if (!path) return;

    const snapped = board.snap.resize({
      element: newElement,
      bounds: newBBox,
      position,
      enabled: isAdsorb,
    });
    Object.assign(newElement, snapped, {
      maxWidth: snapped.width,
      maxHeight: snapped.height,
    });

    const ops = BoardUtil.diffNodePatchOnly(element, newElement, path);
    if (ops.length > 0) {
      board.apply(ops, false);
    }

    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements: [newElement],
    });
  }

  private onEditorSizeChange = (
    board: Board,
    element: CardElement,
    width: number,
    height: number
  ) => {
    const { width: w, height: h } = element;
    if (w === width && h === height) return;

    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    const newElement = {
      ...element,
      width: parseFloat(width.toFixed(2)),
      height: parseFloat(height.toFixed(2)),
    };
    const ops = BoardUtil.diffNodePatchOnly(element, newElement, path);
    if (ops.length > 0) {
      board.apply(ops);
    }
  };

  render(_board: Board, { element }: { element: CardElement }) {
    const { id } = element;
    return (
      <Card
        key={id}
        element={element}
        onEditorSizeChange={this.onEditorSizeChange}
        onResizeStart={this.onResizeStart}
        onResizeEnd={this.onResizeEnd}
        onResize={this.onResize}
      />
    );
  }
}
