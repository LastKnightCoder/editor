import {
  Board,
  BoardElement,
  ECreateBoardElementType,
  IBoardPlugin,
  MindNodeElement,
  Operation,
  FrameElement,
} from "../types";
import {
  BoardUtil,
  PointUtil,
  PathUtil,
  isValid,
  Rect,
  MindUtil,
  FrameUtil,
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

    // 找到所有的 frame 元素，如果 frame 元素的 children 中包含移动的元素
    // 把这些 children 从 this.moveElements 中移除
    if (this.moveElements && this.moveElements.length > 1) {
      const frameElements = this.moveElements.filter(
        (el) => el.type === "frame",
      ) as FrameElement[];
      frameElements.forEach((frame) => {
        this.moveElements =
          this.moveElements?.filter(
            (el) =>
              !frame.children.some((child: BoardElement) => child.id === el.id),
          ) || null;
      });
    }

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
    const frames = movedElements.filter(
      (el) => el.type === "frame",
    ) as FrameElement[];
    const frameChildren = frames
      .map((frame) => FrameUtil.getAllChildren(frame))
      .flat()
      .map((ele) => {
        if (ele.type === "arrow") return;
        return {
          key: ele.id,
          x: ele.x,
          y: ele.y,
          width: ele.width,
          height: ele.height,
        };
      })
      .filter(isValid);

    board.refLine.setCurrentRects([...currentMoved, ...frameChildren]);

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

    if (operations.length > 0) {
      board.apply(operations, false);
    }

    // 处理Frame拖拽检测
    this.handleFrameDragDetection(board, movedElements);

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

    this.handleFrameDragDetection(board, movedElements, true);
    this.clearAllFrameChildMoveIn(board);

    movedElements.forEach((movedElement) => {
      const element = this.moveElements?.find(
        (element) => element.id === movedElement.id,
      );
      const path = PathUtil.getPathByElement(board, movedElement);
      if (!path || !element) return;
      const newestElement = PathUtil.getElementByPath(board, path);
      if (!newestElement) return;
      operations.push({
        type: "set_node",
        path,
        properties: element,
        newProperties: newestElement,
      });
    });

    if (this.isHitSelected) {
      operations.push({
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectedElements: movedElements
            .map((me) => {
              const path = PathUtil.getPathByElement(board, me);
              if (!path) return;
              const newestMe = PathUtil.getElementByPath(board, path);
              if (!newestMe) return;
              return newestMe;
            })
            .filter(isValid),
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

  // 处理Frame拖拽检测
  private handleFrameDragDetection(
    board: Board,
    movedElements: BoardElement[],
    resizeFrame = false,
  ) {
    if (!movedElements || movedElements.length === 0) return;

    const frames = board.children.filter(
      (el) => el.type === "frame",
    ) as FrameElement[];

    if (frames.length === 0) return;

    const moveInfos: Array<{
      element: BoardElement;
      currentFrame: FrameElement | null;
      targetFrame: FrameElement | null;
    }> = [];

    // 批量收集所有元素的移动信息
    movedElements.forEach((element) => {
      // 跳过Frame元素本身
      if (element.type === "frame" || element.type === "arrow") return;

      let targetFrame: FrameElement | null = null;
      let currentFrame: FrameElement | null = null;

      // 找到元素当前所在的Frame
      for (const frame of frames) {
        if (FrameUtil.isChildInFrame(frame, element)) {
          currentFrame = frame;
          break;
        }
      }

      // 找到元素现在应该进入的Frame
      for (const frame of frames) {
        if (
          FrameUtil.isElementInFrame(element, frame, frame.containmentPolicy)
        ) {
          targetFrame = frame;
          break;
        }
      }

      moveInfos.push({
        element,
        currentFrame,
        targetFrame,
      });
    });

    // 按Frame分组计算最终状态
    const frameUpdates = new Map<
      string,
      {
        frame: FrameElement;
        finalChildren: BoardElement[];
        hasChildMoveIn: boolean;
      }
    >();

    // 初始化所有涉及的Frame的初始状态
    frames.forEach((frame) => {
      frameUpdates.set(frame.id, {
        frame,
        finalChildren: [...frame.children],
        hasChildMoveIn: false,
      });
    });

    // 处理所有移动操作，计算每个Frame的最终children状态
    const elementMoveOperations: Operation[] = [];

    moveInfos.forEach(({ element, currentFrame, targetFrame }) => {
      // 如果Frame发生变化
      if (currentFrame !== targetFrame) {
        // 从源Frame中移除
        if (currentFrame) {
          const frameUpdate = frameUpdates.get(currentFrame.id);
          if (frameUpdate) {
            frameUpdate.finalChildren = frameUpdate.finalChildren.filter(
              (child: BoardElement) => child.id !== element.id,
            );
          }
        }

        // 添加到目标Frame（约束：禁止 frame 嵌套 frame，禁止 arrow 进入 frame）
        if (targetFrame) {
          if (element.type !== "frame" && element.type !== "arrow") {
            const frameUpdate = frameUpdates.get(targetFrame.id);
            if (frameUpdate) {
              if (
                frameUpdate.finalChildren.find(
                  (child) => child.id === element.id,
                )
              ) {
                frameUpdate.finalChildren = frameUpdate.finalChildren.filter(
                  (child) => child.id !== element.id,
                );
              }
              frameUpdate.finalChildren.push(element);
              frameUpdate.hasChildMoveIn = true;
            }
          }
        }

        // 生成元素移动操作
        const oldPath = PathUtil.getPathByElement(board, element);
        let newPath: number[] | null = null;

        if (targetFrame) {
          if (element.type === "frame" || element.type === "arrow") {
            // 不允许放入 frame，路径回落到根层
            newPath = [board.children.length];
          } else {
            const targetFramePath = PathUtil.getPathByElement(
              board,
              targetFrame,
            );
            if (targetFramePath) {
              newPath = [...targetFramePath, targetFrame.children.length];
            }
          }
        } else {
          newPath = [board.children.length];
        }

        if (oldPath && newPath) {
          elementMoveOperations.push({
            type: "move_node",
            path: oldPath,
            newPath,
          });
        }
      } else if (currentFrame) {
        // 元素仍在当前Frame中，标记为有移动
        const frameUpdate = frameUpdates.get(currentFrame.id);
        if (frameUpdate) {
          frameUpdate.hasChildMoveIn = true;
        }
      }
    });

    // 生成Frame更新操作
    const frameUpdateOperations: Operation[] = [];

    frameUpdates.forEach(({ frame, finalChildren, hasChildMoveIn }) => {
      const framePath = PathUtil.getPathByElement(board, frame);
      if (!framePath) return;

      let newProperties = {
        ...frame,
        isChildMoveIn: hasChildMoveIn,
        // children: finalChildren,
      };

      // 如果children发生了变化或需要调整大小，重新计算边界
      const childrenChanged =
        finalChildren.length !== frame.children.length ||
        !finalChildren.every(
          (child, index) => frame.children[index]?.id === child.id,
        );

      if (resizeFrame && (childrenChanged || hasChildMoveIn)) {
        const newBounds = FrameUtil.calculateFrameBounds(frame, finalChildren);
        newProperties = {
          ...newProperties,
          ...newBounds,
        };
      }

      // 只有当属性确实发生变化时才添加操作
      const hasPropertyChange =
        newProperties.isChildMoveIn !== frame.isChildMoveIn ||
        newProperties.x !== frame.x ||
        newProperties.y !== frame.y ||
        newProperties.width !== frame.width ||
        newProperties.height !== frame.height;

      if (hasPropertyChange) {
        frameUpdateOperations.push({
          type: "set_node",
          path: framePath,
          properties: frame,
          newProperties,
        });
      }
    });

    // 合并所有操作：先更新Frame，再移动元素
    const allOperations = [...frameUpdateOperations, ...elementMoveOperations];

    if (allOperations.length > 0) {
      board.apply(allOperations, false);
    }
  }

  private clearAllFrameChildMoveIn(board: Board) {
    const frames = board.children.filter(
      (el) => el.type === "frame",
    ) as FrameElement[];
    const ops = frames
      .map((frame) => {
        if (!frame.isChildMoveIn) return;
        const path = PathUtil.getPathByElement(board, frame);
        if (!path) return;
        return {
          type: "set_node",
          path,
          properties: frame,
          newProperties: {
            ...frame,
            isChildMoveIn: false,
          },
        } as Operation;
      })
      .filter(isValid);
    if (ops.length > 0) {
      board.apply(ops, false);
    }
  }
}
