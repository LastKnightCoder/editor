import type Board from "../../Board";
import {
  BoardElement,
  ECreateBoardElementType,
  FrameElement,
  ColumnElement,
  Operation,
} from "../../types";
import { SnapBehavior } from "../../types/capabilities";
import {
  BoardUtil,
  PointUtil,
  PathUtil,
  Rect,
  isValid,
  FrameUtil,
  collectGroupMembers,
  expandSelectionByGroup,
  isPointInAnySelectedGroupBounds,
  getElementGroupId,
} from "../../utils";
import type { InteractionState } from "../InteractionState";

/**
 * 元素拖拽状态（原 MovePlugin 的指针手势部分）。
 * 由 InteractionManager 在 pointerdown 广播未被插件中断后裁决进入，
 * pointerup 提交移动（含容器拖入/拖出）后销毁。
 */
export class DraggingState implements InteractionState {
  readonly name = "dragging";

  private moveElements: BoardElement[] | null = null;
  private startPoint: { x: number; y: number } | null = null;
  private isHitSelected = false;
  private isMoved = false;

  private constructor() {}

  /**
   * pointerdown 仲裁（原 MovePlugin.onPointerDown）。
   * 返回 null 表示本次按下不属于拖拽手势（未命中、多选点击、创建模式等）。
   */
  static tryStart(board: Board, e: PointerEvent): DraggingState | null {
    if (
      e.button !== 0 ||
      board.currentCreateType !== ECreateBoardElementType.None ||
      board.presentationManager.isPresentationMode
    ) {
      return null;
    }

    const startPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!startPoint) return null;

    const selectedElements = expandSelectionByGroup(
      board,
      board.selection.selectedElements,
    );
    const hitElements = BoardUtil.getHitElements(
      board,
      startPoint.x,
      startPoint.y,
    );
    const isHitSelectedElement = hitElements.some((element) =>
      selectedElements.find(
        (selectedElement) => selectedElement.id === element.id,
      ),
    );
    const isHitSelectedGroupBounds =
      hitElements.length === 0 &&
      selectedElements.length > 0 &&
      isPointInAnySelectedGroupBounds(
        board,
        selectedElements,
        startPoint.x,
        startPoint.y,
      );
    const isHitSelected = isHitSelectedElement || isHitSelectedGroupBounds;
    // 如果有选中元素，并且点击到其中之一，则移动所有选中的元素，
    // 否则没有选中元素，但是有点击到元素，则移动选中的元素，
    //    经过广度优先遍历，选最后一个是最上面的
    // 否则没有选中元素，也没有点击到元素，则不移动任何元素
    // 注意：需要获取最新的元素状态（因为可能被 relayout 更新了位置）
    let moveElements: BoardElement[] | null;
    if (selectedElements.length > 0 && isHitSelected) {
      moveElements = selectedElements.map(
        (el) => BoardUtil.getElementById(board, el.id) || el,
      );
    } else if (hitElements.length > 0) {
      const hitElement = hitElements[hitElements.length - 1];
      const hitGroupId = getElementGroupId(hitElement);
      const candidates = hitGroupId
        ? collectGroupMembers(board, hitGroupId)
        : [hitElement];
      moveElements = candidates.map(
        (element) => BoardUtil.getElementById(board, element.id) || element,
      );
    } else {
      moveElements = null;
    }

    // ctrl/meta 点击交给点选逻辑处理多选，不开启拖拽
    const isMultiSelect = e.ctrlKey || e.metaKey;
    if (!moveElements || isMultiSelect) return null;

    // 找到所有的容器元素（如 frame），如果容器的 children 中包含移动的元素，
    // 把这些 children 从 moveElements 中移除（子元素随容器整体移动）
    if (moveElements.length > 1) {
      const capService = board.capabilityService;
      const frameElements = moveElements.filter((el) =>
        capService.shouldMoveWithChildren(el),
      ) as FrameElement[];
      frameElements.forEach((frame) => {
        moveElements =
          moveElements?.filter(
            (el) =>
              !frame.children.some((child: BoardElement) => child.id === el.id),
          ) || null;
      });
      if (!moveElements) return null;
    }

    const state = new DraggingState();
    state.moveElements = moveElements;
    state.startPoint = startPoint;
    state.isHitSelected = isHitSelected;

    if (!isEditableEventTarget(e.target)) {
      e.preventDefault();
      window.getSelection?.()?.removeAllRanges();
    }
    // 拖拽期间隐藏选中态，pointerup 时恢复（点选恢复由选择逻辑负责）
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
    return state;
  }

  // 这里需要处理吸附后元素位置问题
  private getUpdatedInfo(
    e: PointerEvent,
    board: Board,
  ): { movedElements: BoardElement[] } {
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

  /**
   * 目前支持"拖拽进出"的容器都位于根层（Frame/Column 等 canBeContained=false），
   * 因此这里优先只扫描 root children，避免在拖拽循环中做全树 DFS。
   */
  private getDragContainers(board: Board): BoardElement[] {
    const capService = board.capabilityService;
    return board.children.filter((el) => {
      if (!capService.isContainer(el)) return false;
      // 只有实现了 isElementInContainer 的容器才参与拖拽进出检测（例如 Frame/Column）。
      const caps = capService.getContainmentCapability(el.type);
      return typeof caps.isElementInContainer === "function";
    });
  }

  /**
   * Column 不允许被包含，永远在根层；构建 childId -> Column 的索引用于拖拽过程的特殊处理。
   */
  private getColumnChildMap(board: Board): Map<string, ColumnElement> {
    const columnChildMap = new Map<string, ColumnElement>();
    for (const element of board.children) {
      if (element.type !== "column") continue;
      const column = element as ColumnElement;
      for (const child of column.children) {
        columnChildMap.set(child.id, column);
      }
    }
    return columnChildMap;
  }

  onPointerMove(e: PointerEvent, board: Board) {
    if (
      !this.moveElements ||
      !this.startPoint ||
      board.presentationManager.isPresentationMode
    )
      return;
    if (!isEditableEventTarget(e.target)) {
      e.preventDefault();
      window.getSelection?.()?.removeAllRanges();
    }
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
    const capService = board.capabilityService;

    // 找出哪些元素是 Column 的子元素，以及对应的 Column
    const columnChildMap = this.getColumnChildMap(board); // childId -> Column

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

      // 容器/RootOnly 节点移动需要带着子树一起移动：用子树平移 ops，避免 set_node 写入 children。
      const snapCap = capService.getSnapCapability(movedElement.type);
      const shouldTranslateSubtree =
        capService.shouldMoveWithChildren(movedElement) ||
        (snapCap.behavior === SnapBehavior.RootOnly &&
          Boolean(snapCap.moveAll) &&
          Array.isArray(movedElement.children) &&
          movedElement.children.length > 0);
      if (shouldTranslateSubtree) {
        let current: BoardElement | null = null;
        try {
          current = PathUtil.getElementByPath(board, path);
        } catch {
          current = null;
        }
        if (
          current &&
          typeof current.x === "number" &&
          typeof current.y === "number" &&
          typeof movedElement.x === "number" &&
          typeof movedElement.y === "number"
        ) {
          const dx = movedElement.x - current.x;
          const dy = movedElement.y - current.y;
          operations.push(
            ...BoardUtil.buildTranslateSubtreeOps(current, path, dx, dy),
          );
        }
        return;
      }

      // 普通元素：只 patch 变化字段（不含 children）
      let current: BoardElement | null = null;
      try {
        current = PathUtil.getElementByPath(board, path);
      } catch {
        current = null;
      }
      if (!current) return;
      operations.push(
        ...BoardUtil.diffNodePatchOnly(current, movedElement, path),
      );
    });

    // 更新 Column 的拖拽状态
    columnDragUpdates.forEach(({ column, childId, position }) => {
      const columnPath = PathUtil.getPathByElement(board, column);
      if (!columnPath) return;
      operations.push(
        ...BoardUtil.diffNodePatchOnly(
          column,
          {
            ...column,
            draggingChildId: childId,
            draggingPosition: position,
          },
          columnPath,
        ),
      );
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
    this.updateContainerDragPreviewState(
      board,
      movedElements,
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
      return;
    }

    if (!this.isMoved) {
      // 如果没有移动，也要清除参考线
      board.clearRefLines();
      board.emit("element:move-end");
      return;
    }

    const { movedElements } = this.getUpdatedInfo(e, board);
    const capService = board.capabilityService;

    // 先把移动本身写入 history（使用拖拽开始时的快照作为 oldProps），
    // 这样即便拖拽过程中是 apply(..., false)，Undo 也能还原位置。
    const commitOps: Operation[] = [];

    // Column 子元素在拖拽中不直接更新位置，交给容器移动/relayout 处理，因此这里跳过。
    const columnChildMap = this.getColumnChildMap(board); // childId -> Column

    movedElements.forEach((movedElement) => {
      const originElement = this.moveElements?.find(
        (el) => el.id === movedElement.id,
      );
      const path = PathUtil.getPathByElement(board, movedElement);
      if (!path || !originElement) return;

      if (columnChildMap.has(movedElement.id)) return;

      const snapCap = capService.getSnapCapability(movedElement.type);
      const shouldTranslateSubtree =
        capService.shouldMoveWithChildren(movedElement) ||
        (snapCap.behavior === SnapBehavior.RootOnly &&
          Boolean(snapCap.moveAll) &&
          Array.isArray(movedElement.children) &&
          movedElement.children.length > 0);

      if (shouldTranslateSubtree) {
        if (
          typeof originElement.x === "number" &&
          typeof originElement.y === "number" &&
          typeof movedElement.x === "number" &&
          typeof movedElement.y === "number"
        ) {
          const dx = movedElement.x - originElement.x;
          const dy = movedElement.y - originElement.y;
          commitOps.push(
            ...BoardUtil.buildTranslateSubtreeOps(originElement, path, dx, dy),
          );
        }
        return;
      }

      commitOps.push(
        ...BoardUtil.diffNodePatchOnly(originElement, movedElement, path),
      );
    });

    if (commitOps.length > 0) {
      board.apply(commitOps, true);
    }

    // 统一容器拖拽检测（Frame 和 Column）- 执行实际移动
    // 注意：这是同步调用，异步的高度测量会在内部处理
    // 传递鼠标位置用于判断是否进入容器
    this.commitContainerDragMove(board, movedElements, endPoint);

    const operations: Operation[] = [];

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
    }

    // 确保清除参考线
    board.clearRefLines();

    if (operations.length > 0) {
      // selection 等 UI 状态不应进入 history
      board.apply(operations, false);
    }

    board.emit("element:move-end");
  }

  /**
   * 放下时提交容器结构移动（move_node）
   * 用于 onPointerUp 中立即执行容器移动。
   */
  private commitContainerDragMove(
    board: Board,
    movedElements: BoardElement[],
    pointerPosition?: { x: number; y: number },
  ) {
    if (!movedElements || movedElements.length === 0) return;

    const capService = board.capabilityService;

    // 使用能力检测获取所有容器元素（Frame/Column 等）
    const containers = this.getDragContainers(board);
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

      // 优化：如果容器已经有 isChildDraggingOver 状态，优先信任该状态
      // 避免在 onPointerUp 时重新计算导致性能问题
      for (const container of containers) {
        if (container.type === "column") {
          const column = container as ColumnElement;
          // 如果该 Column 显示了拖拽指示器，说明拖拽过程中判断为在容器内
          if (column.isChildDraggingOver) {
            targetContainer = container;
            break;
          }
        } else if (container.type === "frame") {
          const frame = container as FrameElement;
          // 如果该 Frame 高亮，说明拖拽过程中判断为进入该容器
          if (frame.isChildMoveIn) {
            targetContainer = container;
            break;
          }
        }
      }

      // 如果没有找到有拖拽状态的容器，才进行完整判断
      if (!targetContainer) {
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
      }

      moveInfos.push({
        element,
        currentContainer,
        targetContainer,
      });
    });

    // 按容器分组计算最终状态
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
          element.id,
        );
        const currentIndex = oldPath[oldPath.length - 1];

        if (newIndex !== currentIndex) {
          const containerPath = PathUtil.getPathByElement(
            board,
            currentContainer,
          );
          if (containerPath) {
            reorderOperations.push({
              type: "move_node",
              path: oldPath,
              newPath: [...containerPath, newIndex],
            });
          }
        }
        return;
      }

      // 场景2：容器发生变化
      if (currentContainer !== targetContainer) {
        // 记录需要移动的元素（包含 currentContainer 信息）
        elementsToMove.push({ element, currentContainer, targetContainer });
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
            elementMoveOperations.push(
              ...BoardUtil.diffNodePatchOnly(
                currentElement,
                { ...currentElement, x: element.x, y: element.y },
                elementPath,
              ),
            );
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
      board.apply(reorderOperations, true);
    }

    // 再应用跨容器移动操作
    if (elementMoveOperations.length > 0) {
      board.apply(elementMoveOperations, true);
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
   * 容器拖拽预览态检测
   * 只更新视觉状态（例如 Column 的 dropIndex、Frame 的 isChildMoveIn），不做结构移动。
   */
  private updateContainerDragPreviewState(
    board: Board,
    movedElements: BoardElement[],
    pointerPosition?: { x: number; y: number },
  ) {
    if (!movedElements || movedElements.length === 0) return;

    const capService = board.capabilityService;

    // 获取所有容器元素（Frame/Column 等）
    const containers = this.getDragContainers(board);

    if (containers.length === 0) {
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

    // 拖拽中：只更新视觉状态
    this.updateContainerDragState(
      board,
      containers,
      moveInfos,
      pointerPosition,
    );
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
          dropIndex = capService.getDropIndex(
            container,
            pointerPosition.y,
            draggingElement?.id,
          );
        }

        // 计算拖拽位置（用于预览）
        let draggingPosition: { x: number; y: number } | undefined;
        if (draggingElement) {
          draggingPosition = { x: draggingElement.x, y: draggingElement.y };
        }

        ops.push(
          ...BoardUtil.diffNodePatchOnly(
            column,
            {
              ...column,
              isChildDraggingOver: isTarget,
              dropIndex,
              draggingChildId: draggingElement?.id,
              draggingPosition,
            },
            path,
          ),
        );
      } else if (container.type === "frame") {
        const frame = container as FrameElement;
        const isChildMoveIn = isTarget && !isCurrent;

        if (frame.isChildMoveIn !== isChildMoveIn) {
          ops.push({
            type: "set_node",
            path,
            properties: { isChildMoveIn: frame.isChildMoveIn },
            newProperties: { isChildMoveIn },
          });
        }
      }
    }

    if (ops.length > 0) {
      board.apply(ops, false);
    }
  }

  /**
   * 清除所有容器的拖拽状态
   */
  private clearAllContainerDragState(board: Board) {
    const containers = this.getDragContainers(board);

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
          ops.push(
            ...BoardUtil.diffNodePatchOnly(
              column,
              {
                ...column,
                isChildDraggingOver: false,
                dropIndex: undefined,
                draggingChildId: undefined,
                draggingPosition: undefined,
              },
              path,
            ),
          );
        }
      } else if (container.type === "frame") {
        const frame = container as FrameElement;
        if (frame.isChildMoveIn) {
          ops.push({
            type: "set_node",
            path,
            properties: { isChildMoveIn: frame.isChildMoveIn },
            newProperties: { isChildMoveIn: false },
          });
        }
      }
    }

    if (ops.length > 0) {
      board.apply(ops, false);
    }
  }
}

const isEditableEventTarget = (target: EventTarget | null): boolean => {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  if (!element) return false;

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return true;
  }

  return Boolean(
    (element instanceof HTMLElement && element.isContentEditable) ||
    element.closest('[contenteditable="true"]') ||
    element.closest("[data-slate-editor]") ||
    element.closest("input") ||
    element.closest("textarea"),
  );
};
