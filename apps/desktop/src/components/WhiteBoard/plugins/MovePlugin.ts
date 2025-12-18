import {
  Board,
  BoardElement,
  ECreateBoardElementType,
  IBoardPlugin,
  MindNodeElement,
  Operation,
  FrameElement,
  ColumnElement,
} from "../types";
import { SnapBehavior } from "../types/capabilities";
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
    // 注意：需要获取最新的元素状态（因为可能被 relayout 更新了位置）
    if (selectedElements.length > 0 && isHitSelected) {
      this.moveElements = selectedElements.map(
        (el) => BoardUtil.getElementById(board, el.id) || el,
      );
    } else if (hitElements.length > 0) {
      const hitElement = hitElements[hitElements.length - 1];
      this.moveElements = [
        BoardUtil.getElementById(board, hitElement.id) || hitElement,
      ];
    } else {
      this.moveElements = null;
    }

    this.isHitSelected = isHitSelected;
    const isMultiSelect = e.ctrlKey || e.metaKey;

    // 找到所有的容器元素（如 frame），如果容器的 children 中包含移动的元素
    // 把这些 children 从 this.moveElements 中移除
    if (this.moveElements && this.moveElements.length > 1) {
      const capService = board.capabilityService;
      const frameElements = this.moveElements.filter((el) =>
        capService.shouldMoveWithChildren(el),
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
    const capService = board.capabilityService;
    const currentMoved: Rect[] = movedElements
      .map((me) => {
        // 使用能力查询判断是否参与参考线
        if (!capService.shouldParticipateInRefLines(me)) return;
        return {
          key: me.id,
          x: me.x,
          y: me.y,
          width: me.width,
          height: me.height,
        };
      })
      .filter(isValid);
    // 获取所有需要带子元素一起移动的容器
    const containers = movedElements.filter((el) =>
      capService.shouldMoveWithChildren(el),
    ) as FrameElement[];
    const containerChildren = containers
      .map((container) => FrameUtil.getAllChildren(container))
      .flat()
      .map((ele) => {
        if (!capService.shouldParticipateInRefLines(ele)) return;
        return {
          key: ele.id,
          x: ele.x,
          y: ele.y,
          width: ele.width,
          height: ele.height,
        };
      })
      .filter(isValid);

    board.refLine.setCurrentRects([...currentMoved, ...containerChildren]);

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
          // 使用能力查询判断是否参与吸附
          if (!capService.shouldElementSnap(me)) return me;
          const rect = newCurrent.rects.find((rect) => rect.key === me.id);
          if (!rect) return;
          // 对于 RootOnly 类型的吸附（如 mind-node），需要整体移动
          const snapCap = capService.getSnapCapability(me.type);
          if (snapCap.behavior === SnapBehavior.RootOnly && snapCap.moveAll) {
            const diffX = rect.x - me.x;
            const diffY = rect.y - me.y;
            return snapCap.moveAll(me, diffX, diffY);
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

    // 找出哪些元素是 Column 的子元素，以及对应的 Column
    const columnChildMap = new Map<string, ColumnElement>(); // childId -> Column
    BoardUtil.dfs(board, (element: BoardElement) => {
      if (element.type === "column") {
        const column = element as ColumnElement;
        column.children.forEach((child) =>
          columnChildMap.set(child.id, column),
        );
      }
    });

    // 收集需要更新拖拽位置的 Column
    const columnDragUpdates = new Map<
      string,
      {
        column: ColumnElement;
        childId: string;
        position: { x: number; y: number };
      }
    >();

    movedElements.forEach((movedElement) => {
      const element = this.moveElements?.find(
        (element) => element.id === movedElement.id,
      );
      const path = PathUtil.getPathByElement(board, movedElement);
      if (!path || !element) return;

      // 如果元素是 Column 的子元素，更新 Column 的拖拽位置而不是元素位置
      const parentColumn = columnChildMap.get(movedElement.id);
      if (parentColumn) {
        columnDragUpdates.set(parentColumn.id, {
          column: parentColumn,
          childId: movedElement.id,
          position: { x: movedElement.x, y: movedElement.y },
        });
        return;
      }

      operations.push({
        type: "set_node",
        path,
        properties: element,
        newProperties: movedElement,
      });
    });

    // 更新 Column 的拖拽状态
    columnDragUpdates.forEach(({ column, childId, position }) => {
      const columnPath = PathUtil.getPathByElement(board, column);
      if (!columnPath) return;
      operations.push({
        type: "set_node",
        path: columnPath,
        properties: column,
        newProperties: {
          ...column,
          draggingChildId: childId,
          draggingPosition: position,
        },
      });
    });

    if (operations.length > 0) {
      board.apply(operations, false);
    }

    // 统一容器拖拽检测（Frame 和 Column）
    // 传递鼠标位置用于判断是否进入容器
    const pointerPosition = PointUtil.screenToViewPort(
      board,
      e.clientX,
      e.clientY,
    );
    this.handleContainerDragDetection(
      board,
      movedElements,
      false,
      pointerPosition ?? undefined,
    );

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

    // 统一容器拖拽检测（Frame 和 Column）- 执行实际移动
    // 注意：这是同步调用，异步的高度测量会在内部处理
    // 传递鼠标位置用于判断是否进入容器
    this.handleContainerDragDetectionSync(board, movedElements, endPoint);

    // 找出哪些元素仍在 Column 中（这些元素的位置由 Column relayout 决定）
    const columnChildIds = new Set<string>();
    BoardUtil.dfs(board, (element: BoardElement) => {
      if (element.type === "column") {
        const column = element as ColumnElement;
        column.children.forEach((child) => columnChildIds.add(child.id));
      }
    });

    movedElements.forEach((movedElement) => {
      const element = this.moveElements?.find(
        (element) => element.id === movedElement.id,
      );
      const path = PathUtil.getPathByElement(board, movedElement);
      if (!path || !element) return;
      const newestElement = PathUtil.getElementByPath(board, path);
      if (!newestElement) return;

      // 如果元素仍在 Column 中，跳过位置更新（让 Column relayout 决定位置）
      if (columnChildIds.has(movedElement.id)) {
        return;
      }

      // 使用 movedElement 的位置（拖拽后的位置）更新元素
      operations.push({
        type: "set_node",
        path,
        properties: newestElement,
        newProperties: {
          ...newestElement,
          x: movedElement.x,
          y: movedElement.y,
        },
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
              // 使用 movedElement 的位置，因为 newestMe 是操作应用前的状态
              return {
                ...newestMe,
                x: me.x,
                y: me.y,
              };
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

          // 对于 RootOnly 吸附类型的元素（如 mind-node），需要把所有子节点都添加到 movedElements
          const capService = board.capabilityService;
          const snapCap = capService.getSnapCapability(movedElement.type);
          if (snapCap.behavior === SnapBehavior.RootOnly && snapCap.isRoot) {
            if (snapCap.isRoot(movedElement)) {
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

  /**
   * 同步版本的容器拖拽检测
   * 用于 onPointerUp 中立即执行容器移动
   * 使用能力检测系统，避免与具体容器类型耦合
   * @param pointerPosition 鼠标位置，用于判断是否进入容器
   */
  private handleContainerDragDetectionSync(
    board: Board,
    movedElements: BoardElement[],
    pointerPosition?: { x: number; y: number },
  ) {
    if (!movedElements || movedElements.length === 0) return;

    const capService = board.capabilityService;

    // 使用能力检测获取所有容器元素
    const containers = board.children.filter((el) =>
      capService.isContainer(el),
    );
    if (containers.length === 0) {
      this.clearAllContainerDragState(board);
      return;
    }

    const moveInfos: Array<{
      element: BoardElement;
      currentContainer: BoardElement | null;
      targetContainer: BoardElement | null;
    }> = [];

    // 批量收集所有元素的移动信息
    movedElements.forEach((element) => {
      // 使用能力检测：跳过不能被包含的元素
      const canBeContained = capService.canBeContained(element);

      if (!canBeContained) return;

      let targetContainer: BoardElement | null = null;
      let currentContainer: BoardElement | null = null;

      // 使用能力检测：找到元素当前所在的容器
      for (const container of containers) {
        const isChild = capService.isChildInContainer(container, element);
        if (isChild) {
          currentContainer = container;
          break;
        }
      }

      // 使用能力检测：找到元素现在应该进入的容器（使用鼠标位置判断）
      for (const container of containers) {
        const isInContainer = capService.isElementInContainer(
          container,
          element,
          pointerPosition,
        );
        if (isInContainer) {
          targetContainer = container;
          break;
        }
      }

      moveInfos.push({
        element,
        currentContainer,
        targetContainer,
      });
    });

    // 按容器分组计算最终状态
    const containerUpdates = new Map<
      string,
      {
        container: BoardElement;
        finalChildren: BoardElement[];
        hasChildMoveIn: boolean;
      }
    >();

    // 初始化所有涉及的容器的初始状态
    containers.forEach((container) => {
      containerUpdates.set(container.id, {
        container,
        finalChildren: [...(container.children || [])],
        hasChildMoveIn: false,
      });
    });

    // 收集需要移动的元素信息
    const elementsToMove: Array<{
      element: BoardElement;
      currentContainer: BoardElement | null;
      targetContainer: BoardElement | null;
    }> = [];

    // 收集同一 Column 内重排序的操作
    const reorderOperations: Operation[] = [];

    moveInfos.forEach(({ element, currentContainer, targetContainer }) => {
      const isSameContainer =
        currentContainer &&
        targetContainer &&
        currentContainer.id === targetContainer.id;

      // 场景1：同一 Column 内重排序
      if (isSameContainer && currentContainer.type === "column") {
        const oldPath = PathUtil.getPathByElement(board, element);
        if (!oldPath || !pointerPosition) return;

        // 使用鼠标 Y 位置计算插入索引
        const newIndex = capService.getDropIndex(
          currentContainer,
          pointerPosition.y,
        );
        const currentIndex = oldPath[oldPath.length - 1];

        if (newIndex !== currentIndex) {
          const containerPath = PathUtil.getPathByElement(
            board,
            currentContainer,
          );
          if (containerPath) {
            // move_node 是先删后插，当 newIndex > currentIndex 时需要调整索引
            const adjustedIndex =
              newIndex > currentIndex ? newIndex - 1 : newIndex;
            reorderOperations.push({
              type: "move_node",
              path: oldPath,
              newPath: [...containerPath, adjustedIndex],
            });
          }
        }
        return;
      }

      // 场景2：容器发生变化
      if (currentContainer !== targetContainer) {
        // 从源容器中移除（更新 finalChildren 状态）
        if (currentContainer) {
          const containerUpdate = containerUpdates.get(currentContainer.id);
          if (containerUpdate) {
            containerUpdate.finalChildren =
              containerUpdate.finalChildren.filter(
                (child: BoardElement) => child.id !== element.id,
              );
          }
        }

        // 添加到目标容器（使用能力检测）
        if (targetContainer) {
          if (capService.canContain(targetContainer, element)) {
            const containerUpdate = containerUpdates.get(targetContainer.id);
            if (containerUpdate) {
              if (
                containerUpdate.finalChildren.find(
                  (child) => child.id === element.id,
                )
              ) {
                containerUpdate.finalChildren =
                  containerUpdate.finalChildren.filter(
                    (child) => child.id !== element.id,
                  );
              }
              containerUpdate.finalChildren.push(element);
              containerUpdate.hasChildMoveIn = true;
            }
          }
        }

        // 记录需要移动的元素（包含 currentContainer 信息）
        elementsToMove.push({ element, currentContainer, targetContainer });
      } else if (currentContainer) {
        // 元素仍在当前容器中，标记为有移动
        const containerUpdate = containerUpdates.get(currentContainer.id);
        if (containerUpdate) {
          containerUpdate.hasChildMoveIn = true;
        }
      }
    });

    // 生成元素移动操作
    const elementMoveOperations: Operation[] = [];

    // 先处理从 Column 移出的元素的位置更新（保留在 Column 中调整过的宽高）
    elementsToMove.forEach(({ element, currentContainer, targetContainer }) => {
      // 如果从 Column 移出（到画布或其他容器），需要先更新元素位置
      // 注意：只更新位置，保留当前元素的宽高（在 Column 中已调整过）
      const isMovingOutOfColumn =
        currentContainer?.type === "column" &&
        (!targetContainer || targetContainer.id !== currentContainer.id);
      if (isMovingOutOfColumn) {
        const elementPath = PathUtil.getPathByElement(board, element);
        if (elementPath) {
          const currentElement = PathUtil.getElementByPath(board, elementPath);
          if (currentElement) {
            elementMoveOperations.push({
              type: "set_node",
              path: elementPath,
              properties: currentElement,
              newProperties: {
                ...currentElement, // 保留当前元素的宽高等属性
                x: element.x, // 只更新位置
                y: element.y,
              },
            });
          }
        }
      }
    });

    elementsToMove.forEach(({ element, targetContainer }) => {
      const oldPath = PathUtil.getPathByElement(board, element);
      let newPath: number[] | null = null;

      if (targetContainer) {
        if (!capService.canContain(targetContainer, element)) {
          // 不允许放入容器，路径回落到根层
          newPath = [board.children.length];
        } else {
          const targetContainerPath = PathUtil.getPathByElement(
            board,
            targetContainer,
          );
          if (targetContainerPath && pointerPosition) {
            // 使用鼠标 Y 位置获取插入位置
            const dropIndex = capService.getDropIndex(
              targetContainer,
              pointerPosition.y,
            );
            newPath = [...targetContainerPath, dropIndex];
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
    });

    // 先应用重排序操作
    if (reorderOperations.length > 0) {
      board.apply(reorderOperations, false);
    }

    // 再应用跨容器移动操作
    if (elementMoveOperations.length > 0) {
      board.apply(elementMoveOperations, false);
    }

    // 触发容器的回调（如 autoResize、relayout 等）
    // 注意：由于 board.apply 使用不可变数据结构，moveInfos 中的容器引用可能已过期
    // 需要通过 ID 重新获取最新的容器对象
    for (const { element, currentContainer, targetContainer } of moveInfos) {
      if (currentContainer && currentContainer !== targetContainer) {
        // 重新获取最新的容器引用
        const latestCurrentContainer = BoardUtil.getElementById(
          board,
          currentContainer.id,
        );
        if (latestCurrentContainer) {
          // 传递被移除的元素，以便容器可以恢复其属性
          capService.notifyChildRemoved(latestCurrentContainer, element);
        }
      }
      if (targetContainer && targetContainer !== currentContainer) {
        // 重新获取最新的容器引用
        const latestTargetContainer = BoardUtil.getElementById(
          board,
          targetContainer.id,
        );
        if (latestTargetContainer) {
          capService.notifyChildInserted(latestTargetContainer);
        }
      }
      // 同一容器内移动也需要触发 relayout（例如 Column 内部重排序）
      if (currentContainer && currentContainer === targetContainer) {
        const latestContainer = BoardUtil.getElementById(
          board,
          currentContainer.id,
        );
        if (latestContainer) {
          capService.notifyChildInserted(latestContainer);
        }
      }
    }

    // 清除所有容器的拖拽状态（如 Frame 的 isChildMoveIn、Column 的 isChildDraggingOver 等）
    this.clearAllContainerDragState(board);
  }

  /**
   * 统一的容器拖拽检测
   * 处理 Frame 和 Column 两种容器类型
   * @param pointerPosition 鼠标位置，用于判断是否进入容器
   */
  private async handleContainerDragDetection(
    board: Board,
    movedElements: BoardElement[],
    isDropping = false,
    pointerPosition?: { x: number; y: number },
  ) {
    if (!movedElements || movedElements.length === 0) return;

    const capService = board.capabilityService;

    // 获取所有容器元素（包括嵌套的）
    const containers: BoardElement[] = [];
    BoardUtil.dfs(board, (element: BoardElement) => {
      if (capService.isContainer(element)) {
        containers.push(element);
      }
    });

    if (containers.length === 0) {
      if (isDropping) this.clearAllContainerDragState(board);
      return;
    }

    const moveInfos: Array<{
      element: BoardElement;
      currentContainer: BoardElement | null;
      targetContainer: BoardElement | null;
    }> = [];

    // 批量收集所有元素的移动信息
    movedElements.forEach((element) => {
      // 跳过不能被包含的元素（如 arrow、frame、column）
      if (!capService.canBeContained(element)) return;

      let targetContainer: BoardElement | null = null;
      let currentContainer: BoardElement | null = null;

      // 找到元素当前所在的容器
      for (const container of containers) {
        if (capService.isChildInContainer(container, element)) {
          currentContainer = container;
          break;
        }
      }

      // 找到元素现在应该进入的容器（使用鼠标位置判断）
      for (const container of containers) {
        if (
          capService.isElementInContainer(
            container,
            element,
            pointerPosition,
          ) &&
          capService.canContain(container, element)
        ) {
          targetContainer = container;
          break;
        }
      }

      moveInfos.push({
        element,
        currentContainer,
        targetContainer,
      });
    });

    if (!isDropping) {
      // 拖拽中：只更新视觉状态
      this.updateContainerDragState(
        board,
        containers,
        moveInfos,
        pointerPosition,
      );
    } else {
      // 放下：执行实际的容器移动
      await this.commitContainerMove(
        board,
        containers,
        moveInfos,
        pointerPosition,
      );
    }
  }

  /**
   * 更新容器拖拽状态（视觉反馈）
   * @param pointerPosition 鼠标位置，用于计算插入索引
   */
  private updateContainerDragState(
    board: Board,
    containers: BoardElement[],
    moveInfos: Array<{
      element: BoardElement;
      currentContainer: BoardElement | null;
      targetContainer: BoardElement | null;
    }>,
    pointerPosition?: { x: number; y: number },
  ) {
    const capService = board.capabilityService;
    const ops: Operation[] = [];

    // 收集目标容器和当前容器
    const targetContainerIds = new Set<string>();
    const currentContainerIds = new Set<string>();
    const draggingElements = new Map<string, BoardElement>(); // containerId -> draggingElement

    moveInfos.forEach(({ element, currentContainer, targetContainer }) => {
      if (targetContainer) targetContainerIds.add(targetContainer.id);
      if (currentContainer) {
        currentContainerIds.add(currentContainer.id);
        // 记录正在从该容器拖出的元素（不管是否移到其他容器）
        // 这样可以保持拖拽预览显示
        draggingElements.set(currentContainer.id, element);
      }
    });

    // 更新每个容器的状态
    for (const container of containers) {
      const path = PathUtil.getPathByElement(board, container);
      if (!path) continue;

      const isTarget = targetContainerIds.has(container.id);
      const isCurrent = currentContainerIds.has(container.id);
      const draggingElement = draggingElements.get(container.id);

      if (container.type === "column") {
        const column = container as ColumnElement;
        let dropIndex: number | undefined;

        // 计算 dropIndex（使用鼠标 Y 位置）
        if (isTarget && pointerPosition) {
          dropIndex = capService.getDropIndex(container, pointerPosition.y);
        }

        // 计算拖拽位置（用于预览）
        let draggingPosition: { x: number; y: number } | undefined;
        if (draggingElement) {
          draggingPosition = { x: draggingElement.x, y: draggingElement.y };
        }

        const newProperties: ColumnElement = {
          ...column,
          isChildDraggingOver: isTarget,
          dropIndex,
          draggingChildId: draggingElement?.id,
          draggingPosition,
        };

        // 只有状态变化时才更新
        if (
          column.isChildDraggingOver !== newProperties.isChildDraggingOver ||
          column.dropIndex !== newProperties.dropIndex ||
          column.draggingChildId !== newProperties.draggingChildId ||
          column.draggingPosition?.x !== newProperties.draggingPosition?.x ||
          column.draggingPosition?.y !== newProperties.draggingPosition?.y
        ) {
          ops.push({
            type: "set_node",
            path,
            properties: container,
            newProperties,
          });
        }
      } else if (container.type === "frame") {
        const frame = container as FrameElement;
        const isChildMoveIn = isTarget && !isCurrent;

        if (frame.isChildMoveIn !== isChildMoveIn) {
          ops.push({
            type: "set_node",
            path,
            properties: container,
            newProperties: {
              ...frame,
              isChildMoveIn,
            },
          });
        }
      }
    }

    if (ops.length > 0) {
      board.apply(ops, false);
    }
  }

  /**
   * 执行容器移动
   * @param pointerPosition 鼠标位置，用于计算插入索引
   */
  private async commitContainerMove(
    board: Board,
    containers: BoardElement[],
    moveInfos: Array<{
      element: BoardElement;
      currentContainer: BoardElement | null;
      targetContainer: BoardElement | null;
    }>,
    pointerPosition?: { x: number; y: number },
  ) {
    const capService = board.capabilityService;
    const ops: Operation[] = [];

    // 按容器分组计算最终状态
    const containerUpdates = new Map<
      string,
      {
        container: BoardElement;
        finalChildren: BoardElement[];
        hasChildMoveIn: boolean;
      }
    >();

    // 初始化所有涉及的容器的初始状态
    containers.forEach((container) => {
      containerUpdates.set(container.id, {
        container,
        finalChildren: [...(container.children || [])],
        hasChildMoveIn: false,
      });
    });

    // 处理所有移动操作
    for (const { element, currentContainer, targetContainer } of moveInfos) {
      const isSameContainer =
        currentContainer &&
        targetContainer &&
        currentContainer.id === targetContainer.id;

      // 场景1：同一容器内重排序（仅适用于 Column）
      if (isSameContainer && currentContainer.type === "column") {
        const oldPath = PathUtil.getPathByElement(board, element);
        if (!oldPath || !pointerPosition) continue;

        // 使用鼠标 Y 位置计算插入索引
        const newIndex = capService.getDropIndex(
          currentContainer,
          pointerPosition.y,
        );
        const currentIndex = oldPath[oldPath.length - 1];

        if (newIndex !== currentIndex) {
          const containerPath = PathUtil.getPathByElement(
            board,
            currentContainer,
          );
          if (containerPath) {
            // 计算实际的新路径
            let adjustedNewIndex = newIndex;
            if (newIndex > currentIndex) {
              adjustedNewIndex = newIndex; // move_node 会自动处理
            }
            ops.push({
              type: "move_node",
              path: oldPath,
              newPath: [...containerPath, adjustedNewIndex],
            });
          }
        }
        continue;
      }

      // 场景2：容器发生变化
      if (currentContainer !== targetContainer) {
        // 从源容器中移除
        if (currentContainer) {
          const containerUpdate = containerUpdates.get(currentContainer.id);
          if (containerUpdate) {
            containerUpdate.finalChildren =
              containerUpdate.finalChildren.filter(
                (child: BoardElement) => child.id !== element.id,
              );
          }
        }

        // 如果从 Column 移出（到画布或其他容器），需要先更新元素位置
        // 因为在 onPointerMove 中跳过了 Column 子元素的位置更新
        // 注意：只更新位置，保留当前元素的宽高（在 Column 中已调整过）
        const isMovingOutOfColumn = currentContainer?.type === "column";
        if (isMovingOutOfColumn) {
          const elementPath = PathUtil.getPathByElement(board, element);
          if (elementPath) {
            const currentElement = PathUtil.getElementByPath(
              board,
              elementPath,
            );
            if (currentElement) {
              ops.push({
                type: "set_node",
                path: elementPath,
                properties: currentElement,
                newProperties: {
                  ...currentElement, // 保留当前元素的宽高等属性
                  x: element.x, // 只更新位置
                  y: element.y,
                },
              });
            }
          }
        }

        // 准备元素并添加到目标容器
        if (
          targetContainer &&
          capService.canContain(targetContainer, element)
        ) {
          const containerUpdate = containerUpdates.get(targetContainer.id);
          if (containerUpdate) {
            // 对于 Column，需要调整元素尺寸
            let preparedElement = element;
            if (targetContainer.type === "column") {
              preparedElement = await capService.prepareElementForInsertion(
                targetContainer,
                element,
              );

              // 如果尺寸变化，先更新元素
              if (
                preparedElement.width !== element.width ||
                preparedElement.height !== element.height
              ) {
                const elementPath = PathUtil.getPathByElement(board, element);
                if (elementPath) {
                  ops.push({
                    type: "set_node",
                    path: elementPath,
                    properties: element,
                    newProperties: preparedElement,
                  });
                }
              }
            }

            containerUpdate.finalChildren.push(preparedElement);
            containerUpdate.hasChildMoveIn = true;
          }
        }

        // 生成元素移动操作
        const oldPath = PathUtil.getPathByElement(board, element);
        let newPath: number[] | null = null;

        if (targetContainer) {
          if (!capService.canContain(targetContainer, element)) {
            newPath = [board.children.length];
          } else {
            const targetContainerPath = PathUtil.getPathByElement(
              board,
              targetContainer,
            );
            if (targetContainerPath) {
              // 对于 Column，使用鼠标 Y 位置计算插入位置
              if (targetContainer.type === "column" && pointerPosition) {
                const dropIndex = capService.getDropIndex(
                  targetContainer,
                  pointerPosition.y,
                );
                newPath = [...targetContainerPath, dropIndex];
              } else {
                newPath = [
                  ...targetContainerPath,
                  targetContainer.children?.length || 0,
                ];
              }
            }
          }
        } else {
          newPath = [board.children.length];
        }

        if (oldPath && newPath) {
          ops.push({
            type: "move_node",
            path: oldPath,
            newPath,
          });
        }
      }
    }

    // 生成容器更新操作（用于 Frame 的 autoResize）
    containerUpdates.forEach(({ container, finalChildren, hasChildMoveIn }) => {
      if (container.type === "frame") {
        const frame = container as FrameElement;
        const framePath = PathUtil.getPathByElement(board, frame);
        if (!framePath) return;

        const childrenChanged =
          finalChildren.length !== frame.children.length ||
          !finalChildren.every(
            (child, index) => frame.children[index]?.id === child.id,
          );

        if (frame.autoResize && (childrenChanged || hasChildMoveIn)) {
          const newBounds = FrameUtil.calculateFrameBounds(
            board,
            frame,
            finalChildren,
          );
          ops.push({
            type: "set_node",
            path: framePath,
            properties: frame,
            newProperties: {
              ...frame,
              ...newBounds,
            },
          });
        }
      }
    });

    if (ops.length > 0) {
      board.apply(ops, false);
    }

    // 触发容器回调
    for (const { element, currentContainer, targetContainer } of moveInfos) {
      if (currentContainer && currentContainer !== targetContainer) {
        // 传递被移除的元素，以便容器可以恢复其属性
        capService.notifyChildRemoved(currentContainer, element);
      }
      if (targetContainer && targetContainer !== currentContainer) {
        capService.notifyChildInserted(targetContainer);
      }
    }

    // 清除所有拖拽状态
    this.clearAllContainerDragState(board);
  }

  /**
   * 清除所有容器的拖拽状态
   */
  private clearAllContainerDragState(board: Board) {
    const capService = board.capabilityService;
    const containers: BoardElement[] = [];
    BoardUtil.dfs(board, (element: BoardElement) => {
      if (capService.isContainer(element)) {
        containers.push(element);
      }
    });

    const ops: Operation[] = [];

    for (const container of containers) {
      const path = PathUtil.getPathByElement(board, container);
      if (!path) continue;

      if (container.type === "column") {
        const column = container as ColumnElement;
        if (
          column.isChildDraggingOver ||
          column.dropIndex !== undefined ||
          column.draggingChildId ||
          column.draggingPosition
        ) {
          ops.push({
            type: "set_node",
            path,
            properties: container,
            newProperties: {
              ...column,
              isChildDraggingOver: false,
              dropIndex: undefined,
              draggingChildId: undefined,
              draggingPosition: undefined,
            },
          });
        }
      } else if (container.type === "frame") {
        const frame = container as FrameElement;
        if (frame.isChildMoveIn) {
          ops.push({
            type: "set_node",
            path,
            properties: container,
            newProperties: {
              ...frame,
              isChildMoveIn: false,
            },
          });
        }
      }
    }

    if (ops.length > 0) {
      board.apply(ops, false);
    }
  }
}
