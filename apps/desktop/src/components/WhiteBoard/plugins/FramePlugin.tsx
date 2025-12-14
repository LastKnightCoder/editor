import SVG from "react-inlinesvg";
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
  SnapBehavior,
  ContainmentBehavior,
  MovementBehavior,
  ChildrenRenderOrder,
} from "../types";
import { CommonPlugin } from "./CommonPlugin";
import { FrameUtil, PathUtil, BoardUtil } from "../utils";
import Frame from "../components/Frame";
import frameIcon from "@/assets/white-board/frame.svg";

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
      },
      movement: {
        behavior: MovementBehavior.MoveWithChildren,
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
        label: "Frame",
        icon: <SVG src={frameIcon} width={14} height={14} />,
        priority: 180,
        onSelect: (ctx: ContextMenuContext) => {
          ctx.board.currentCreateType = ECreateBoardElementType.Frame;
        },
      });
    }

    // 右键点击 Frame → 添加「解散 Frame」和「自适应内容」菜单
    const frameElement = targetElements.find((el) => el.type === "frame") as
      | FrameElement
      | undefined;
    if (frameElement) {
      items.push({
        key: "dissolve-frame",
        label: "解散 Frame",
        priority: 200,
        onSelect: (ctx: ContextMenuContext) => {
          const frame = ctx.targetElements.find(
            (el) => el.type === "frame",
          ) as FrameElement;
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
        priority: 201,
        onSelect: (ctx: ContextMenuContext) => {
          const frame = ctx.targetElements.find(
            (el) => el.type === "frame",
          ) as FrameElement;
          if (!frame) return;

          const newBounds = FrameUtil.calculateFrameFitBounds(ctx.board, frame);
          const framePath = PathUtil.getPathByElement(ctx.board, frame);
          if (!framePath) return;

          ctx.board.apply([
            {
              type: "set_node",
              path: framePath,
              properties: frame,
              newProperties: {
                ...frame,
                ...newBounds,
              },
            },
          ]);
        },
      });
    }

    return items;
  }

  moveElement(
    _board: Board,
    element: FrameElement,
    dx: number,
    dy: number,
  ): BoardElement | null {
    return FrameUtil.moveAll(element, dx, dy);
  }

  protected onResize(
    board: Board,
    element: FrameElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio = false,
    isAdsorb = false,
  ) {
    const updatedFrame = Object.assign(
      {},
      super.onResize(
        board,
        element,
        position,
        startPoint,
        endPoint,
        isPreserveRatio,
        isAdsorb,
      ),
    );

    if (Object.keys(updatedFrame).length === 0) return;

    const ops: Operation[] = [];

    const capService = board.capabilityService;
    const newElementsInArea = board.children.filter(
      (boardElement: BoardElement) => {
        // 使用能力查询：跳过容器和不可被包含的元素
        if (
          capService.isContainer(boardElement) ||
          !capService.canBeContained(boardElement)
        )
          return false;

        // 跳过已经被其他容器包含的元素
        const parent = BoardUtil.getParent(board, boardElement);
        if (parent && capService.isContainer(parent)) return false;

        return FrameUtil.isElementInFrame(boardElement, updatedFrame);
      },
    );

    // 处理移出 frame 的元素 - 使用 move_node 从 frame.children 移动到 board.children
    const outChildren = element.children.filter((child) => {
      return !FrameUtil.isElementInFrame(child, updatedFrame);
    });

    outChildren.forEach((child) => {
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
    newElementsInArea.forEach((boardElement) => {
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
        const newBounds = FrameUtil.calculateFrameBounds(
          board,
          newestFrame as FrameElement,
        );
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
              properties: newestFrame,
              newProperties: newFrame,
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

  render(
    _board: Board,
    { element, children }: { element: FrameElement; children?: any },
  ) {
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
