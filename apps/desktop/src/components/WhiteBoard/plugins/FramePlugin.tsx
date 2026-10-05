import { Ungroup, Maximize, Frame as FrameIcon } from "lucide-react";
import {
  Board,
  BoardElement,
  EHandlerPosition,
  IBoardPlugin,
  Point,
  FrameElement,
  Operation,
  ContextMenuContext,
  PluginContextMenuItem,
  ECreateBoardElementType,
  IElementCapabilities,
} from "../types";
import {
  SnapBehavior,
  ContainmentBehavior,
  MovementBehavior,
  ChildrenRenderOrder,
} from "../types/capabilities";
import { CommonPlugin } from "./CommonPlugin";
import { FrameUtil, PathUtil, BoardUtil } from "../utils";
import Frame from "../components/Frame";

export class FramePlugin extends CommonPlugin implements IBoardPlugin {
  name = "frame";

  getCapabilities(): IElementCapabilities {
    return {
      snap: {
        behavior: SnapBehavior.Normal,
      },
      containment: {
        asContainer: ContainmentBehavior.Any,
        canBeContained: false,
        // 注意：arrow 的排除是多余的,因为 ArrowPlugin 已声明 canBeContained: false
        // 这里只需排除 frame 以防止嵌套
        canContain: (child: BoardElement) => child.type !== "frame",

        buildDragFeedbackOps: (board: Board, container: BoardElement, feedback) => {
          const frame = container as FrameElement;
          const path = PathUtil.getPathByElement(board, frame);
          if (!path) return [];
          const isChildMoveIn = feedback ? feedback.isTarget && !feedback.isCurrent : false;
          if (frame.isChildMoveIn === isChildMoveIn) return [];
          return [
            {
              type: "set_node",
              path,
              properties: { isChildMoveIn: frame.isChildMoveIn },
              newProperties: { isChildMoveIn },
            },
          ];
        },

        isDropFeedbackActive: (container: BoardElement) =>
          (container as FrameElement).isChildMoveIn === true,

        calculateBounds: (board, container) =>
          FrameUtil.calculateFrameBounds(board, container as FrameElement),

        // 容器协议实现
        isElementInContainer: (_board: Board, container: BoardElement, element: BoardElement) => {
          const frame = container as FrameElement;
          return FrameUtil.isElementInFrame(element, frame, frame.containmentPolicy);
        },

        isChildInContainer: (container: BoardElement, child: BoardElement) => {
          return FrameUtil.isChildInFrame(container as FrameElement, child);
        },

        getDropIndex: (_board: Board, container: BoardElement, _dropY: number) => {
          // Frame 不关心插入顺序，始终添加到末尾
          return (container as FrameElement).children?.length ?? 0;
        },

        prepareElementForInsertion: async (
          _board: Board,
          _container: BoardElement,
          element: BoardElement
        ) => {
          // Frame 不调整元素尺寸，保持原样
          return element;
        },

        onChildInserted: (board: Board, container: BoardElement) => {
          const frame = container as FrameElement;
          if (frame.autoResize) {
            const newBounds = FrameUtil.calculateFrameBounds(board, frame);
            const framePath = PathUtil.getPathByElement(board, frame);
            if (framePath) {
              board.apply(
                {
                  type: "set_node",
                  path: framePath,
                  properties: {
                    x: frame.x,
                    y: frame.y,
                    width: frame.width,
                    height: frame.height,
                  },
                  newProperties: {
                    x: newBounds.x,
                    y: newBounds.y,
                    width: newBounds.width,
                    height: newBounds.height,
                  },
                },
                true
              );
            }
          }
        },

        onChildRemoved: (board: Board, container: BoardElement) => {
          const frame = container as FrameElement;
          if (frame.autoResize) {
            const newBounds = FrameUtil.calculateFrameBounds(board, frame);
            const framePath = PathUtil.getPathByElement(board, frame);
            if (framePath) {
              board.apply(
                {
                  type: "set_node",
                  path: framePath,
                  properties: {
                    x: frame.x,
                    y: frame.y,
                    width: frame.width,
                    height: frame.height,
                  },
                  newProperties: {
                    x: newBounds.x,
                    y: newBounds.y,
                    width: newBounds.width,
                    height: newBounds.height,
                  },
                },
                true
              );
            }
          }
        },
      },
      movement: {
        behavior: MovementBehavior.MoveWithChildren,
        collectMoveSubtree: element => FrameUtil.getAllChildren(element as FrameElement),
      },
      render: {
        childrenOrder: ChildrenRenderOrder.Reversed,
        getColorTheme: () => "purple",
      },
      refLine: {
        participatesInRefLines: true,
      },
    };
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements } = context;
    const items: PluginContextMenuItem[] = [];

    // 右键空白区域 → 添加「创建 Frame」菜单
    if (targetElements.length === 0) {
      items.push({
        key: "create-frame",
        label: "画框",
        icon: <FrameIcon size={14} />,
        priority: 180,
        onSelect: (ctx: ContextMenuContext) => {
          ctx.board.currentCreateType = ECreateBoardElementType.Frame;
        },
      });
    }

    // 右键点击 Frame → 添加「解散 Frame」和「自适应内容」菜单
    const frameElement = targetElements.find(el => el.type === "frame") as FrameElement | undefined;
    if (frameElement) {
      items.push({
        key: "dissolve-frame",
        label: "解散画框",
        icon: <Ungroup size={14} />,
        priority: 200,
        onSelect: (ctx: ContextMenuContext) => {
          const frame = ctx.targetElements.find(el => el.type === "frame") as FrameElement;
          if (!frame) return;

          const framePath = PathUtil.getPathByElement(ctx.board, frame);
          if (!framePath) return;

          const ops: Operation[] = [];

          // 将 Frame 内的子元素移动到画板根级别
          frame.children.forEach((_, index) => {
            ops.push({
              type: "move_node",
              path: [...framePath, index],
              newPath: [ctx.board.children.length + index],
            });
          });

          // 删除 Frame
          ops.push({
            type: "remove_node",
            path: framePath,
            node: frame,
          });

          // 清除选择
          ops.push({
            type: "set_selection",
            properties: ctx.board.selection,
            newProperties: {
              selectedElements: [],
              selectArea: null,
            },
          });

          ctx.board.apply(ops);
        },
      });

      items.push({
        key: "fit-frame-content",
        label: "自适应内容",
        icon: <Maximize size={14} />,
        priority: 201,
        onSelect: (ctx: ContextMenuContext) => {
          const frame = ctx.targetElements.find(el => el.type === "frame") as FrameElement;
          if (!frame) return;

          const newBounds = FrameUtil.calculateFrameFitBounds(ctx.board, frame);
          const framePath = PathUtil.getPathByElement(ctx.board, frame);
          if (!framePath) return;

          ctx.board.apply([
            {
              type: "set_node",
              path: framePath,
              properties: {
                x: frame.x,
                y: frame.y,
                width: frame.width,
                height: frame.height,
              },
              newProperties: {
                x: newBounds.x,
                y: newBounds.y,
                width: newBounds.width,
                height: newBounds.height,
              },
            },
          ]);
        },
      });
    }

    return items;
  }

  moveElement(_board: Board, element: FrameElement, dx: number, dy: number): BoardElement | null {
    return FrameUtil.moveAll(element, dx, dy);
  }

  protected onResize(
    board: Board,
    element: FrameElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio = false,
    isAdsorb = false
  ) {
    const updatedFrame = Object.assign(
      {},
      super.onResize(board, element, position, startPoint, endPoint, isPreserveRatio, isAdsorb)
    );

    if (Object.keys(updatedFrame).length === 0) return;

    const ops: Operation[] = [];

    const capService = board.capabilityService;
    const newElementsInArea = board.children.filter((boardElement: BoardElement) => {
      // 使用能力查询：跳过容器和不可被包含的元素
      if (capService.isContainer(boardElement) || !capService.canBeContained(boardElement))
        return false;

      // 跳过已经被其他容器包含的元素
      const parent = BoardUtil.getParent(board, boardElement);
      if (parent && capService.isContainer(parent)) return false;

      return FrameUtil.isElementInFrame(boardElement, updatedFrame);
    });

    // 处理移出 frame 的元素 - 使用 move_node 从 frame.children 移动到 board.children
    const outChildren = element.children.filter(child => {
      return !FrameUtil.isElementInFrame(child, updatedFrame);
    });

    outChildren.forEach(child => {
      const oldPath = PathUtil.getPathByElement(board, child);
      if (!oldPath) return;

      // 新路径：移动到 board.children 的末尾
      const newPath = [board.children.length];

      ops.push({
        type: "move_node",
        path: oldPath,
        newPath,
      });
    });

    const framePath = PathUtil.getPathByElement(board, element);
    if (!framePath) return;

    // 处理新进入 frame 的元素 - 使用 move_node 从 board.children 移动到 frame.children
    newElementsInArea.forEach(boardElement => {
      const oldPath = PathUtil.getPathByElement(board, boardElement);
      if (!oldPath) return;

      const newPath = [...framePath, element.children.length];

      ops.push({
        type: "move_node",
        path: oldPath,
        newPath,
      });
    });

    if (ops.length > 0) {
      board.apply(ops, false);
    }
  }

  protected onResizeEnd(board: Board) {
    if (this.originResizeElement && this.originResizeElement.type === "frame") {
      const frame = this.originResizeElement as FrameElement;
      const newestFrame = BoardUtil.getElementById(board, frame.id);

      if (newestFrame && newestFrame.autoResize) {
        const newBounds = FrameUtil.calculateFrameBounds(board, newestFrame as FrameElement);
        const framePath = PathUtil.getPathByElement(board, frame);
        const newFrame = {
          ...newestFrame,
          ...newBounds,
        };

        if (framePath) {
          board.apply([
            {
              type: "set_node",
              path: framePath,
              properties: {
                x: newestFrame.x,
                y: newestFrame.y,
                width: newestFrame.width,
                height: newestFrame.height,
              },
              newProperties: {
                x: newFrame.x,
                y: newFrame.y,
                width: newFrame.width,
                height: newFrame.height,
              },
            },
            {
              type: "set_selection",
              properties: board.selection,
              newProperties: {
                selectedElements: [newFrame],
                selectArea: null,
              },
            },
          ]);
        }
      }
    }

    super.onResizeEnd(board);
  }

  render(_board: Board, { element, children }: { element: FrameElement; children?: any }) {
    return (
      <g key={element.id}>
        <Frame
          element={element}
          onResize={this.onResize.bind(this)}
          onResizeStart={this.onResizeStart.bind(this)}
          onResizeEnd={this.onResizeEnd.bind(this)}
        />
        {children}
      </g>
    );
  }
}
