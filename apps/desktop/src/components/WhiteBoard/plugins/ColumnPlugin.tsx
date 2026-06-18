import { Columns3, Ungroup } from "lucide-react";
import {
  Board,
  BoardElement,
  EHandlerPosition,
  IBoardPlugin,
  Point,
  ColumnElement,
  ContextMenuContext,
  PluginContextMenuItem,
  ECreateBoardElementType,
  IElementCapabilities,
  CustomOffset,
} from "../types";
import {
  SnapBehavior,
  ContainmentBehavior,
  MovementBehavior,
  ChildrenRenderOrder,
} from "../types/capabilities";
import { COLUMN_ALLOWED_CHILDREN } from "../types/column";
import { ARROW_CONNECT_ID } from "../constants";
import { CommonPlugin } from "./CommonPlugin";
import { ColumnUtil, PathUtil, BoardUtil } from "../utils";
import Column from "../components/Column";

export class ColumnPlugin extends CommonPlugin implements IBoardPlugin {
  name = "column";

  getCapabilities(): IElementCapabilities {
    return {
      snap: {
        behavior: SnapBehavior.Normal,
      },
      containment: {
        asContainer: ContainmentBehavior.Restricted,
        canBeContained: false,
        canContain: (child: BoardElement) => {
          return COLUMN_ALLOWED_CHILDREN.includes(
            child.type as (typeof COLUMN_ALLOWED_CHILDREN)[number],
          );
        },

        // 容器协议实现
        isElementInContainer: (
          board: Board,
          container: BoardElement,
          element: BoardElement,
          pointerPosition?: Point,
        ) => {
          return ColumnUtil.isElementInColumn(
            board,
            element,
            container as ColumnElement,
            pointerPosition,
          );
        },

        isChildInContainer: (container: BoardElement, child: BoardElement) => {
          return (container as ColumnElement).children.some(
            (c) => c.id === child.id,
          );
        },

        getDropIndex: (
          board: Board,
          container: BoardElement,
          dropY: number,
          excludeElementId?: string,
        ) => {
          return ColumnUtil.getDropIndex(
            board,
            container as ColumnElement,
            dropY,
            excludeElementId,
          );
        },

        prepareElementForInsertion: async (
          board: Board,
          container: BoardElement,
          element: BoardElement,
        ) => {
          const column = container as ColumnElement;
          const targetWidth = column.width - column.padding * 2;

          // 使用能力服务测量高度
          const newHeight = await board.capabilityService.measureElementHeight(
            element,
            targetWidth,
          );

          return {
            ...element,
            width: targetWidth,
            height: newHeight,
            resizable: false, // 禁用 resize
            autoHeight: true, // 启用高度自适应
          };
        },

        onChildInserted: (board: Board, container: BoardElement) => {
          // relayout 会自动设置子元素的 resizable: false 和 autoHeight: true
          const columnPath = PathUtil.getPathByElement(board, container);
          if (!columnPath) {
            ColumnUtil.relayout(board, container as ColumnElement);
            return;
          }

          // 获取最新的 column 引用
          const column = PathUtil.getElementByPath(
            board,
            columnPath,
          ) as ColumnElement;
          if (column) {
            ColumnUtil.relayout(board, column);
          }
        },

        onChildRemoved: (
          board: Board,
          container: BoardElement,
          removedChild?: BoardElement,
        ) => {
          // 恢复被移除元素的属性
          if (removedChild) {
            // 元素已被移动，需要通过 ID 在 board 中找到它
            const element = BoardUtil.getElementById(board, removedChild.id);
            if (element) {
              const elementPath = PathUtil.getPathByElement(board, element);
              if (elementPath) {
                // 设置 maxWidth/maxHeight 为当前宽高，并设置 resized: true
                // 这样 RichText 等组件在非 autoHeight 模式下会使用固定宽度
                // 而不是 "fit-content"
                board.apply(
                  {
                    type: "set_node",
                    path: elementPath,
                    properties: {
                      resizable: element.resizable,
                      autoHeight: element.autoHeight,
                      maxWidth: element.maxWidth,
                      maxHeight: element.maxHeight,
                      resized: element.resized,
                    },
                    newProperties: {
                      resizable: true,
                      autoHeight: false,
                      maxWidth: element.width,
                      maxHeight: element.height,
                      resized: true,
                    },
                  },
                  true,
                );
              }
            }
          }
          ColumnUtil.relayout(board, container as ColumnElement);
        },
      },
      movement: {
        behavior: MovementBehavior.MoveWithChildren,
      },
      render: {
        childrenOrder: ChildrenRenderOrder.Normal,
        getColorTheme: () => "teal",
      },
      refLine: {
        participatesInRefLines: true,
      },
    };
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements } = context;
    const items: PluginContextMenuItem[] = [];

    if (targetElements.length === 0) {
      items.push({
        key: "create-column",
        label: "Column",
        icon: <Columns3 size={14} />,
        priority: 185,
        onSelect: (ctx: ContextMenuContext) => {
          ctx.board.currentCreateType = ECreateBoardElementType.Column;
        },
      });
    }

    const columnElement = targetElements.find((el) => el.type === "column") as
      | ColumnElement
      | undefined;
    if (columnElement) {
      items.push({
        key: "dissolve-column",
        label: "Dissolve Column",
        icon: <Ungroup size={14} />,
        priority: 200,
        onSelect: (ctx: ContextMenuContext) => {
          const column = ctx.targetElements.find(
            (el) => el.type === "column",
          ) as ColumnElement;
          if (!column) return;

          ColumnUtil.dissolveColumn(ctx.board, column);

          ctx.board.apply({
            type: "set_selection",
            properties: ctx.board.selection,
            newProperties: {
              selectedElements: [],
              selectArea: null,
            },
          });
        },
      });
    }

    return items;
  }

  moveElement(
    _board: Board,
    element: ColumnElement,
    dx: number,
    dy: number,
  ): BoardElement | null {
    return ColumnUtil.moveAll(element, dx, dy);
  }

  getBounds(board: Board, element: ColumnElement) {
    const calculatedHeight = ColumnUtil.calculateHeight(board, element);
    return {
      minX: element.x,
      minY: element.y,
      maxX: element.x + element.width,
      maxY: element.y + calculatedHeight,
    };
  }

  // Override arrow connect points to use calculated height
  getArrowConnectPoints(board: Board, element: ColumnElement) {
    const { x, y, width } = element;
    const height = ColumnUtil.calculateHeight(board, element);
    return [
      { connectId: ARROW_CONNECT_ID.TOP, point: { x: x + 0.5 * width, y } },
      {
        connectId: ARROW_CONNECT_ID.BOTTOM,
        point: { x: x + 0.5 * width, y: y + height },
      },
      { connectId: ARROW_CONNECT_ID.LEFT, point: { x, y: y + 0.5 * height } },
      {
        connectId: ARROW_CONNECT_ID.RIGHT,
        point: { x: x + width, y: y + 0.5 * height },
      },
      {
        connectId: ARROW_CONNECT_ID.CENTER,
        point: { x: x + 0.5 * width, y: y + 0.5 * height },
      },
    ];
  }

  getArrowConnectExtendPoints(
    board: Board,
    element: ColumnElement,
    extend = 20,
  ) {
    const { x, y, width } = element;
    const height = ColumnUtil.calculateHeight(board, element);
    return [
      {
        connectId: ARROW_CONNECT_ID.TOP,
        point: { x: x + 0.5 * width, y: y - extend },
      },
      {
        connectId: ARROW_CONNECT_ID.BOTTOM,
        point: { x: x + 0.5 * width, y: y + height + extend },
      },
      {
        connectId: ARROW_CONNECT_ID.LEFT,
        point: { x: x - extend, y: y + 0.5 * height },
      },
      {
        connectId: ARROW_CONNECT_ID.RIGHT,
        point: { x: x + width + extend, y: y + 0.5 * height },
      },
    ];
  }

  getArrowBindPoint(
    board: Board,
    element: ColumnElement,
    connectId: string,
    customOffset?: CustomOffset,
  ) {
    const { x, y, width } = element;
    const height = ColumnUtil.calculateHeight(board, element);
    if (connectId === ARROW_CONNECT_ID.CUSTOM) {
      if (!customOffset) return null;
      return {
        x: x + customOffset.u * width,
        y: y + customOffset.v * height,
      };
    }
    switch (connectId) {
      case ARROW_CONNECT_ID.TOP:
        return { x: x + 0.5 * width, y };
      case ARROW_CONNECT_ID.BOTTOM:
        return { x: x + 0.5 * width, y: y + height };
      case ARROW_CONNECT_ID.LEFT:
        return { x, y: y + 0.5 * height };
      case ARROW_CONNECT_ID.RIGHT:
        return { x: x + width, y: y + 0.5 * height };
      case ARROW_CONNECT_ID.CENTER:
        return { x: x + 0.5 * width, y: y + 0.5 * height };
      default:
        return { x: x + 0.5 * width, y: y + 0.5 * height };
    }
  }

  isHit(board: Board, element: ColumnElement, x: number, y: number) {
    const calculatedHeight = ColumnUtil.calculateHeight(board, element);
    return (
      x >= element.x &&
      x <= element.x + element.width &&
      y >= element.y &&
      y <= element.y + calculatedHeight
    );
  }

  protected onResize(
    board: Board,
    element: ColumnElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    _isPreserveRatio = false,
    isAdsorb = false,
  ) {
    if (!this.originResizeElement) return;

    if (
      position !== EHandlerPosition.Left &&
      position !== EHandlerPosition.Right
    ) {
      return;
    }

    const originElement = this.originResizeElement as ColumnElement;
    const dx = endPoint.x - startPoint.x;

    let newX = originElement.x;
    let newWidth = originElement.width;

    if (position === EHandlerPosition.Left) {
      newX = originElement.x + dx;
      newWidth = originElement.width - dx;
    } else if (position === EHandlerPosition.Right) {
      newWidth = originElement.width + dx;
    }

    newWidth = Math.max(element.minWidth, Math.min(newWidth, element.maxWidth));

    if (position === EHandlerPosition.Left) {
      newX = originElement.x + originElement.width - newWidth;
    }

    // Create updated column with new position/width
    const updatedColumn: ColumnElement = {
      ...element,
      x: newX,
      width: newWidth,
    };

    // Apply layout to update children positions
    const layoutedColumn = ColumnUtil.layout(board, updatedColumn);

    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    board.refLine.setCurrentRects([
      {
        key: layoutedColumn.id,
        x: layoutedColumn.x,
        y: layoutedColumn.y,
        width: layoutedColumn.width,
        height: layoutedColumn.height,
      },
    ]);

    let finalColumn = layoutedColumn;

    if (isAdsorb) {
      const updateElements = board.refLine.getUpdateCurrent(
        true,
        5 / board.viewPort.zoom,
        true,
        position,
      );
      board.refLine.setCurrent(updateElements);
      const updateElement = updateElements.rects.find(
        (el) => el.key === layoutedColumn.id,
      );
      if (updateElement) {
        // 创建新对象避免修改只读对象
        const snappedColumn = {
          ...layoutedColumn,
          x: updateElement.x,
          width: updateElement.width,
        };
        // Re-layout after snap adjustment
        finalColumn = ColumnUtil.layout(board, snappedColumn);
      }
    }

    {
      const ops = BoardUtil.diffNode(element, finalColumn, path);
      BoardUtil.normalizeOperations(ops);
      if (ops.length > 0) {
        board.apply(ops, false);
      }
    }

    const selected =
      (BoardUtil.getElementById(
        board,
        finalColumn.id,
      ) as ColumnElement | null) ?? finalColumn;

    board.apply(
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectArea: null,
          selectedElements: [selected],
        },
      },
      false,
    );

    return selected;
  }

  protected onResizeEnd(board: Board) {
    this.originResizeElement = null;
    board.refLine.setCurrent({
      rects: [],
      lines: [],
    });
  }

  render(
    board: Board,
    { element, children }: { element: ColumnElement; children?: any },
  ) {
    return (
      <Column
        key={element.id}
        element={element}
        board={board}
        onResize={this.onResize.bind(this)}
        onResizeStart={this.onResizeStart.bind(this)}
        onResizeEnd={this.onResizeEnd.bind(this)}
      >
        {children}
      </Column>
    );
  }
}
