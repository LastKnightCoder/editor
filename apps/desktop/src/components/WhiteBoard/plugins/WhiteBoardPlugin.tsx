import { Layout } from "lucide-react";
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
import { getResizedBBox, PathUtil } from "../utils";
import { WHITEBOARD_CARD_HEIGHT } from "../components/WhiteBoardCard";
import WhiteBoardElementComponent from "../components/WhiteBoardElement";
import { CommonPlugin, CommonElement } from "./CommonPlugin";
import { SelectTransforms } from "../transforms";

export interface WhiteBoardElement extends CommonElement {
  type: "whiteboard";
  whiteBoardContentId: number;
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

  constructor() {
    super();
    this.onResize = this.onResize.bind(this);
  }

  getCapabilities(): IElementCapabilities {
    return {
      snap: { behavior: SnapBehavior.Normal },
      containment: {
        asContainer: ContainmentBehavior.None,
        canBeContained: true,
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
    if (targetElements.length === 0) {
      items.push({
        key: "create-whiteboard",
        label: "白板",
        icon: <Layout size={14} />,
        priority: 190,
        children: [
          {
            key: "create-whiteboard-new",
            label: "创建新白板",
            priority: 0,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("context-menu:open-modal", {
                type: "whiteboard",
                action: "create",
              });
            },
          },
          {
            key: "create-whiteboard-reference",
            label: "引用已有白板",
            priority: 1,
            onSelect: (ctx: ContextMenuContext) => {
              ctx.board.emit("context-menu:open-modal", {
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
    isAdsorb = false,
  ) {
    if (!this.originResizeElement) return;
    const newBBox = getResizedBBox(
      this.originResizeElement,
      position,
      startPoint,
      endPoint,
    );

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

    board.refLine.setCurrentRects([
      {
        key: newElement.id,
        x: newBBox.x,
        y: element.y,
        width: newBBox.width,
        height: WHITEBOARD_CARD_HEIGHT,
      },
    ]);
    const updateElement = board.refLine.getUpdateCurrent(
      isAdsorb,
      5 / board.viewPort.zoom,
      true,
      position,
    );
    board.refLine.setCurrent(updateElement);
    newElement.x = updateElement.rects[0].x;
    // y 坐标保持不变
    newElement.width = updateElement.rects[0].width;
    // 高度保持固定值

    board.apply(
      {
        type: "set_node",
        path,
        properties: element,
        newProperties: newElement,
      },
      false,
    );

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
