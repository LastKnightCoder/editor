import {
  Board,
  BoardElement,
  ECreateBoardElementType,
  IBoardPlugin,
  MindNodeElement,
  Operation,
} from "../types";
import {
  BoardUtil,
  PointUtil,
  PathUtil,
  isValid,
  Rect,
  MindUtil,
} from "../utils";

export class MovePlugin implements IBoardPlugin {
  name = "move-plugin";

  moveElements: BoardElement[] | null = null;
  startPoint: { x: number; y: number } | null = null;
  isHitSelected = false;
  isMoved = false;

  // 键盘移动相关属性
  arrowKeyMoveInterval: number | null = null;
  currentArrowKey: string | null = null;
  isPreciseMode = false;

  onPointerDown(e: PointerEvent, board: Board) {
    if (
      board.currentCreateType !== ECreateBoardElementType.None ||
      board.presentationManager.isPresentationMode
    ) {
      return;
    }

    const startPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!startPoint) return;

    const selectedElements = board.selection.selectedElements;
    const hitElements = BoardUtil.getHitElements(
      board,
      startPoint.x,
      startPoint.y,
    );
    const isHitSelected = hitElements.some((element) =>
      selectedElements.find(
        (selectedElement) => selectedElement.id === element.id,
      ),
    );
    // 如果有选中元素，并且点击到其中之一，则移动所有选中的元素
    // 否则没有选中元素，但是有点击到元素，则移动选中的元素，
    //    经过广度优先遍历，选最后一个是最上面的
    // 否则没有选中元素，也没有点击到元素，则不移动任何元素
    if (selectedElements.length > 0 && isHitSelected) {
      this.moveElements = selectedElements;
    } else if (hitElements.length > 0) {
      this.moveElements = [hitElements[hitElements.length - 1]];
    } else {
      this.moveElements = null;
    }

    this.isHitSelected = isHitSelected;
    const isMultiSelect = e.ctrlKey || e.metaKey;

    // 多选情况下交给 SelectPlugin 处理
    if (this.moveElements && !isMultiSelect) {
      this.startPoint = startPoint;
      board.apply(
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectedElements: [],
          },
        },
        false,
      );
    }
  }

  // 这里需要处理吸附后元素位置问题
  getUpdatedInfo(e: PointerEvent, board: Board) {
    let movedElements: BoardElement[] = [];

    if (!this.moveElements || !this.startPoint) {
      board.clearRefLines();
      return {
        movedElements,
      };
    }

    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint) {
      board.clearRefLines();
      return {
        movedElements,
      };
    }

    const offsetX = endPoint.x - this.startPoint.x;
    const offsetY = endPoint.y - this.startPoint.y;

    this.moveElements.forEach((element) => {
      const movedElement = board.moveElement(element, offsetX, offsetY);
      if (movedElement) {
        movedElements.push(movedElement);
      }
    });

    // 更新正在移动的元素，这些元素的边界不会显示为参考线
    const currentMoved: Rect[] = movedElements
      .map((me) => {
        if (me.type === "arrow") return;
        return {
          key: me.id,
          x: me.x,
          y: me.y,
          width: me.width,
          height: me.height,
        };
      })
      .filter(isValid);
    board.refLine.setCurrentRects(currentMoved);

    // 按下 altKey 表示不吸附
    const isAdsorb = !e.altKey;

    // 获取吸附后的元素的位置
    const newCurrent = board.refLine.getUpdateCurrent(
      isAdsorb,
      5 / board.viewPort.zoom,
    );

    // 如果使用吸附，则根据吸附的结果 newCurrent 更新 movedElements
    if (isAdsorb) {
      movedElements = movedElements
        .map((me) => {
          // 箭头不参与吸附
          if (me.type === "arrow") return me;
          const rect = newCurrent.rects.find((rect) => rect.key === me.id);
          if (!rect) return;
          if (me.type === "mind-node") {
            if (!MindUtil.isRoot(me as MindNodeElement)) return;
            // 只有根节点参与吸附，并且需要整体调整
            const diffX = rect.x - me.x;
            const diffY = rect.y - me.y;
            return MindUtil.moveAll(me as MindNodeElement, diffX, diffY);
          }
          return {
            ...me,
            x: rect.x,
            y: rect.y,
          };
        })
        .filter(isValid);
    }
    board.refLine.setCurrent(newCurrent);

    return {
      movedElements,
    };
  }

  onPointerMove(e: PointerEvent, board: Board) {
    if (
      !this.moveElements ||
      !this.startPoint ||
      board.presentationManager.isPresentationMode
    )
      return;
    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint) return;
    const offsetX = endPoint.x - this.startPoint.x;
    const offsetY = endPoint.y - this.startPoint.y;

    if (!this.isMoved) {
      const diffL = Math.hypot(offsetX, offsetY);
      if (diffL > 5) {
        this.isMoved = true;
      }
    }
    if (!this.isMoved) return;

    const operations: Operation[] = [];

    const { movedElements } = this.getUpdatedInfo(e, board);

    movedElements.forEach((movedElement) => {
      const element = this.moveElements!.find(
        (element) => element.id === movedElement.id,
      );
      const path = PathUtil.getPathByElement(board, movedElement);
      if (!path || !element) return;
      operations.push({
        type: "set_node",
        path,
        properties: element,
        newProperties: movedElement,
      });
    });

    if (operations.length > 0) {
      board.apply(operations, false);
    }
    board.emit("element:move", movedElements);
  }

  onPointerUp(e: PointerEvent, board: Board) {
    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (
      !endPoint ||
      !this.startPoint ||
      !this.moveElements ||
      board.presentationManager.isPresentationMode
    ) {
      board.emit("element:move-end");
      this.moveElements = null;
      this.startPoint = null;
      this.isMoved = false;
      return;
    }

    if (!this.isMoved) {
      // 如果没有移动，也要清除参考线
      board.clearRefLines();
      board.emit("element:move-end");
      this.moveElements = null;
      this.startPoint = null;
      this.isMoved = false;
      return;
    }

    const { movedElements } = this.getUpdatedInfo(e, board);

    const operations: Operation[] = [];
    movedElements.forEach((movedElement) => {
      const element = this.moveElements?.find(
        (element) => element.id === movedElement.id,
      );
      const path = PathUtil.getPathByElement(board, movedElement);
      if (!path || !element) return;
      operations.push({
        type: "set_node",
        path,
        properties: element,
        newProperties: movedElement,
      });
    });

    if (this.isHitSelected) {
      operations.push({
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectedElements: movedElements,
        },
      });
      this.isHitSelected = false;
    }

    // 确保清除参考线
    board.clearRefLines();

    if (operations.length > 0) {
      board.apply(operations);
    }

    board.emit("element:move-end");
    this.moveElements = null;
    this.startPoint = null;
    this.isMoved = false;
  }

  // 执行元素移动 - 为键盘方向键移动服务
  moveSelectedElementsByOffset(board: Board, offsetX: number, offsetY: number) {
    const selectedElements = board.selection.selectedElements;
    if (selectedElements.length === 0) return false;

    const operations: Operation[] = [];
    const movedElements: BoardElement[] = [];

    selectedElements.forEach((element) => {
      // 使用 board.moveElement 方法获取移动后的元素位置
      const movedElement = board.moveElement(element, offsetX, offsetY);
      if (movedElement) {
        const path = PathUtil.getPathByElement(board, movedElement);
        if (path) {
          operations.push({
            type: "set_node",
            path,
            properties: element,
            newProperties: movedElement,
          });
          movedElements.push(movedElement);

          // 处理 mind-node 类型的元素的子节点
          if (
            movedElement.type === "mind-node" &&
            MindUtil.isRoot(movedElement as MindNodeElement)
          ) {
            // 把所有的子节点都移动添加到元素中
            MindUtil.dfs(movedElement as MindNodeElement, {
              before: (node: MindNodeElement) => {
                if (MindUtil.isRoot(node)) return;
                movedElements.push(node);
              },
            });
          }
        }
      }
    });

    if (operations.length > 0) {
      // 应用操作更新元素
      board.apply(operations, false);

      // 更新selection中的选中元素，确保使用最新位置
      board.apply(
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectArea: board.selection.selectArea,
            selectedElements: movedElements,
          },
        },
        false,
      );

      board.emit("element:move", movedElements);
      return true;
    }

    return false;
  }

  // 处理方向键移动
  handleArrowKeyNavigation(board: Board, key: string) {
    if (board.presentationManager.isPresentationMode) return false;

    const moveDistance = this.isPreciseMode ? 1 : 5;
    let offsetX = 0;
    let offsetY = 0;

    switch (key) {
      case "ArrowUp":
        offsetY = -moveDistance;
        break;
      case "ArrowDown":
        offsetY = moveDistance;
        break;
      case "ArrowLeft":
        offsetX = -moveDistance;
        break;
      case "ArrowRight":
        offsetX = moveDistance;
        break;
      default:
        return false;
    }

    return this.moveSelectedElementsByOffset(board, offsetX, offsetY);
  }

  // 开始持续移动
  startContinuousArrowMove(board: Board, key: string) {
    if (board.presentationManager.isPresentationMode) return;

    // 停止之前的移动
    this.stopContinuousArrowMove();

    this.currentArrowKey = key;
    // 立即执行一次移动
    this.handleArrowKeyNavigation(board, key);

    // 设置定时器持续移动
    this.arrowKeyMoveInterval = window.setInterval(() => {
      if (this.currentArrowKey) {
        this.handleArrowKeyNavigation(board, this.currentArrowKey);
      }
    }, 60);
  }

  // 停止持续移动
  stopContinuousArrowMove() {
    if (this.arrowKeyMoveInterval !== null) {
      clearInterval(this.arrowKeyMoveInterval);
      this.arrowKeyMoveInterval = null;
      this.currentArrowKey = null;
    }
  }

  onKeyDown(e: KeyboardEvent, board: Board) {
    if (board.presentationManager.isPresentationMode) return;

    // 检测精确模式 (alt/option键)
    if (e.altKey && !this.isPreciseMode) {
      this.isPreciseMode = true;
    }

    // 处理方向键
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) &&
      board.selection.selectedElements.length > 0
    ) {
      // 阻止默认行为（避免页面滚动）
      e.preventDefault();

      // 如果是新的方向键或者没有正在进行的移动，开始新的持续移动
      if (
        this.currentArrowKey !== e.key ||
        this.arrowKeyMoveInterval === null
      ) {
        this.startContinuousArrowMove(board, e.key);
      }
    }
  }

  onKeyUp(e: KeyboardEvent, board: Board) {
    if (board.presentationManager.isPresentationMode) return;

    // 检测精确模式结束
    if (!e.altKey && this.isPreciseMode) {
      this.isPreciseMode = false;
    }

    // 如果释放的是当前激活的方向键，停止持续移动
    if (this.currentArrowKey === e.key) {
      this.stopContinuousArrowMove();

      // 移动结束时触发事件
      board.emit("element:move-end");
    }
  }
}
