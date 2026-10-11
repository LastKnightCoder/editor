import { Layout, Link2, Plus } from "lucide-react";
import {
  Board,
  IBoardPlugin,
  EHandlerPosition,
  Point,
  ContextMenuContext,
  PluginContextMenuItem,
  IElementCapabilities,
} from "../types";
import {
  SnapBehavior,
  ContainmentBehavior,
  MovementBehavior,
  ChildrenRenderOrder,
} from "../types/capabilities";
import { BoardUtil, getResizedBBox, PathUtil } from "../utils";
import { WHITEBOARD_CARD_HEIGHT } from "../components/WhiteBoardCard";
import WhiteBoardElementComponent from "../components/WhiteBoardElement";
import { CommonPlugin, CommonElement } from "./CommonPlugin";
import { SelectTransforms } from "../transforms";

export interface WhiteBoardElement extends CommonElement {
  type: "whiteboard";
  /** 引用的整块白板 */
  whiteBoardId?: number;
  /** 旧元素：只引用了某一页（新元素不再写入） */
  whiteBoardContentId?: number;
  /** 插入时的白板标题（白板读取失败时兜底显示） */
  name: string;
  description?: string;
  snapshot?: string;
  maxWidth: number;
  maxHeight: number;
  resized: boolean;
  fill?: string;
  fillOpacity?: number;
  theme?: "light" | "dark";
  resizable?: boolean;
}

export class WhiteBoardPlugin extends CommonPlugin implements IBoardPlugin {
  name = "whiteboard";

  constructor(private readonly canCreate = false) {
    super();
    this.onResize = this.onResize.bind(this);
  }

  getCapabilities(): IElementCapabilities {
    return {
      snap: { behavior: SnapBehavior.Normal },
      containment: {
        asContainer: ContainmentBehavior.None,
        canBeContained: true,
        // 58f0660e53ef5165 ColumnFf0851c651654e0e542675315b5065b958f0660e53cd8f6c51b35b9aFf0c89c1 CapabilityService.canContainFf09
        canBeContainedBy: container => container.type === "column",
      },
      movement: { behavior: MovementBehavior.Normal },
      render: {
        childrenOrder: ChildrenRenderOrder.Reversed,
        getColorTheme: () => "purple",
      },
      refLine: { participatesInRefLines: true },
      measurement: {
        measureHeightForWidth: async (_element, _targetWidth) => {
          // 固定高度
          return WHITEBOARD_CARD_HEIGHT;
        },
      },
    };
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements } = context;
    const items: PluginContextMenuItem[] = [];

    // 右键空白区域 → 添加「白板」菜单（带二级子菜单）
    if (this.canCreate && targetElements.length === 0) {
      items.push({
        key: "create-whiteboard",
        label: "白板",
        icon: <Layout size={14} />,
        priority: 190,
        children: [
          {
            key: "create-whiteboard-new",
            label: "创建新白板",
            icon: <Plus size={14} />,
            priority: 0,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("tau.modal.open", {
                type: "whiteboard",
                action: "create",
              });
            },
          },
          {
            key: "create-whiteboard-reference",
            label: "引用已有白板",
            icon: <Link2 size={14} />,
            priority: 1,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("tau.modal.open", {
                type: "whiteboard",
                action: "reference",
              });
            },
          },
        ],
        onSelect: () => {},
      });
    }

    return items;
  }

  onResize(
    board: Board,
    element: WhiteBoardElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    _isPreserveRatio = false,
    isAdsorb = false
  ) {
    if (!this.originResizeElement) return;
    const newBBox = getResizedBBox(this.originResizeElement, position, startPoint, endPoint);

    // 白板高度固定，只允许宽度调整
    const newElement = {
      ...element,
      x: newBBox.x,
      y: element.y, // 保持 y 坐标不变
      width: newBBox.width,
      height: WHITEBOARD_CARD_HEIGHT, // 固定高度
      resized: true,
      maxWidth: newBBox.width,
      maxHeight: WHITEBOARD_CARD_HEIGHT, // 固定高度
    };
    const path = PathUtil.getPathByElement(board, newElement);
    if (!path) return;

    const snapped = board.snap.resize({
      element: newElement,
      bounds: {
        x: newBBox.x,
        y: element.y,
        width: newBBox.width,
        height: WHITEBOARD_CARD_HEIGHT,
      },
      position,
      enabled: isAdsorb,
      axes: ["x"],
    });
    newElement.x = snapped.x;
    newElement.width = snapped.width;
    newElement.maxWidth = snapped.width;

    const ops = BoardUtil.diffNodePatchOnly(element, newElement, path);
    if (ops.length > 0) {
      board.apply(ops, false);
    }

    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements: [newElement],
    });
  }

  render(board: Board, { element }: { element: WhiteBoardElement }) {
    return (
      <WhiteBoardElementComponent
        key={element.id}
        board={board}
        element={element}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeEnd={this.onResizeEnd}
      />
    );
  }
}
