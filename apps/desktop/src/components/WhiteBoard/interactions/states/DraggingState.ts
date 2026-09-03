import type Board from "../../Board";
import { BoardElement, ECreateBoardElementType, Operation } from "../../types";
import { SnapBehavior } from "../../types/capabilities";
import {
  BoardUtil,
  PointUtil,
  PathUtil,
  Rect,
  isValid,
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
  isFinished = false;

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

    // 找到所有的容器元素（如 frame/column），如果移动集合包含容器的子元素，
    // 把这些子元素从 moveElements 中移除（它们随容器整体移动）
    if (moveElements.length > 1) {
      const capService = board.capabilityService;
      const containers = moveElements.filter((el) =>
        capService.shouldMoveWithChildren(el),
      );
      containers.forEach((container) => {
        const memberIds = new Set(
          capService.collectMoveSubtree(container).map((member) => member.id),
        );
        moveElements =
          moveElements?.filter(
            (el) => el.id === container.id || !memberIds.has(el.id),
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
    // 获取所有需要带子元素一起移动的容器（含其自身与后代，均不作为参考线）
    const containers = movedElements.filter((el) =>
      capService.shouldMoveWithChildren(el),
    );
    const containerChildren = containers
      .flatMap((container) => capService.collectMoveSubtree(container))
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
   * 获取参与拖入/拖出判定的容器：排除正随拖动集合移动的容器自身。
   * 运动中的容器与鼠标的相对位置恒定（如全选拖动时从 Column 内部按下），
   * "鼠标在容器内"是拖动集合自身造成的伪状态，会把集合外的元素误判为拖入。
   */
  private getDropTargetContainers(
    board: Board,
    movedElements: BoardElement[],
  ): BoardElement[] {
    const movingIds = new Set(movedElements.map((element) => element.id));
    return this.getDragContainers(board).filter(
      (container) => !movingIds.has(container.id),
    );
  }

  /**
   * 找到管理该元素布局的有序容器（如 Column）：拖拽中子元素的位置更新
   * 转交容器反馈，不直接提交位置。
   */
  private findManagedChildContainer(
    board: Board,
    element: BoardElement,
  ): BoardElement | null {
    const capService = board.capabilityService;
    for (const candidate of board.children) {
      if (!capService.hasOrderedChildren(candidate)) continue;
      if (capService.isChildInContainer(candidate, element)) {
        return candidate;
      }
    }
    return null;
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

    // 收集需要更新拖拽反馈的有序容器（如 Column 的拖拽位置指示）
    const childDragUpdates = new Map<
      string,
      {
        container: BoardElement;
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

      // 有序容器的子元素：更新容器的拖拽反馈而不是元素位置
      const managedContainer = this.findManagedChildContainer(
        board,
        movedElement,
      );
      if (managedContainer) {
        childDragUpdates.set(managedContainer.id, {
          container: managedContainer,
          childId: movedElement.id,
          position: { x: movedElement.x, y: movedElement.y },
        });
        return;
      }

      let current: BoardElement | null = null;
      try {
        current = PathUtil.getElementByPath(board, path);
      } catch {
        current = null;
      }
      if (!current) return;
      // 子树元素生成整树平移 ops，普通元素只 patch 变化字段（能力判定在 service 内）
      operations.push(
        ...capService.buildElementMoveOps(current, movedElement, path),
      );
    });

    // 更新有序容器的子元素拖拽反馈
    childDragUpdates.forEach(({ container, childId, position }) => {
      operations.push(
        ...capService.buildChildDragFeedbackOps(container, childId, position),
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

  /** 拖拽手势在 pointerup 后必然结束 */
  onPointerUp(e: PointerEvent, board: Board) {
    try {
      this.handlePointerUp(e, board);
    } finally {
      this.isFinished = true;
    }
  }

  private handlePointerUp(e: PointerEvent, board: Board) {
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

    movedElements.forEach((movedElement) => {
      const originElement = this.moveElements?.find(
        (el) => el.id === movedElement.id,
      );
      const path = PathUtil.getPathByElement(board, movedElement);
      if (!path || !originElement) return;

      // 有序容器的子元素在拖拽中不直接更新位置，
      // 交给容器移动/relayout 处理，因此这里跳过
      if (this.findManagedChildContainer(board, movedElement)) return;

      // 子树元素生成整树平移 ops，普通元素只 patch 变化字段（能力判定在 service 内）
      commitOps.push(
        ...capService.buildElementMoveOps(originElement, movedElement, path),
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

    // 使用能力检测获取所有容器元素（Frame/Column 等），排除随拖动集合移动的容器
    const containers = this.getDropTargetContainers(board, movedElements);
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

      // 优化：如果容器已有激活的拖拽悬停反馈，优先信任该状态
      // 避免在 pointerup 时重新计算导致性能问题
      for (const container of containers) {
        if (capService.isDropFeedbackActive(container)) {
          targetContainer = container;
          break;
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

    // 收集同一有序容器内重排序的操作
    const reorderOperations: Operation[] = [];

    moveInfos.forEach(({ element, currentContainer, targetContainer }) => {
      const isSameContainer =
        currentContainer &&
        targetContainer &&
        currentContainer.id === targetContainer.id;

      // 场景1：同一有序容器（如 Column）内重排序
      if (isSameContainer && capService.hasOrderedChildren(currentContainer)) {
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

    // 先处理从有序容器移出的元素的位置更新（保留在容器中调整过的宽高）
    elementsToMove.forEach(({ element, currentContainer, targetContainer }) => {
      // 如果从有序容器（如 Column）移出到画布或其他容器，
      // 需要先按拖拽落点更新元素位置（保留容器中调整过的宽高）
      const isMovingOutOfManagedContainer =
        currentContainer !== null &&
        capService.hasOrderedChildren(currentContainer) &&
        (!targetContainer || targetContainer.id !== currentContainer.id);
      if (isMovingOutOfManagedContainer) {
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

    // 获取所有容器元素（Frame/Column 等），排除随拖动集合移动的容器
    const containers = this.getDropTargetContainers(board, movedElements);

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

    // 拖拽中：只更新视觉状态，反馈字段的映射由各容器插件实现
    for (const container of containers) {
      ops.push(
        ...capService.buildDragFeedbackOps(container, {
          isTarget: targetContainerIds.has(container.id),
          isCurrent: currentContainerIds.has(container.id),
          draggingElement: draggingElements.get(container.id) ?? null,
          pointer: pointerPosition,
        }),
      );
    }

    if (ops.length > 0) {
      board.apply(ops, false);
    }
  }

  /**
   * 清除所有容器的拖拽状态
   */
  private clearAllContainerDragState(board: Board) {
    const capService = board.capabilityService;
    const containers = this.getDragContainers(board);

    const ops: Operation[] = [];

    for (const container of containers) {
      ops.push(...capService.buildDragFeedbackOps(container, null));
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
