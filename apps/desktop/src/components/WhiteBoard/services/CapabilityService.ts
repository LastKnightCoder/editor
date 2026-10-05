import type Board from "../Board";
import type { BoardElement, IBoardPlugin, Operation, Point } from "../types";
import { BoardUtil } from "../utils";
import {
  type IElementCapabilities,
  type ISnapCapability,
  type IContainmentCapability,
  type IMovementCapability,
  type IRenderCapability,
  type IMeasurementCapability,
  type ContainerDragFeedback,
  SnapBehavior,
  ContainmentBehavior,
  MovementBehavior,
  ChildrenRenderOrder,
  DEFAULT_CAPABILITIES,
  ELEMENT_COLOR_THEMES,
} from "../types/capabilities";

/**
 * 能力查询服务
 * 提供统一的能力查询接口，支持渐进式迁移
 */
export class CapabilityService {
  private registry: Map<string, IElementCapabilities> = new Map();
  private board: Board;

  constructor(board: Board) {
    this.board = board;
  }

  /**
   * 注册插件能力到缓存
   */
  registerPlugin(plugin: IBoardPlugin): void {
    if (plugin.getCapabilities) {
      this.registry.set(plugin.name, plugin.getCapabilities());
    }
  }

  /**
   * 清除缓存（当插件更新时调用）
   */
  clearCache(elementType?: string): void {
    if (elementType) {
      this.registry.delete(elementType);
    } else {
      this.registry.clear();
    }
  }

  /**
   * 获取元素的能力声明
   * 优先从插件获取，如果没有则使用默认能力
   */
  getCapabilities(elementType: string): IElementCapabilities {
    // 优先从缓存获取
    if (this.registry.has(elementType)) {
      return this.registry.get(elementType)!;
    }

    // 尝试从插件动态获取
    const plugin = this.board.getPlugin<IBoardPlugin>(elementType);
    if (plugin?.getCapabilities) {
      const capabilities = plugin.getCapabilities();
      this.registry.set(elementType, capabilities);
      return capabilities;
    }

    // 回退到默认能力
    return DEFAULT_CAPABILITIES;
  }

  // ===========================================================================
  // 便捷查询方法 - 吸附相关
  // ===========================================================================

  /**
   * 获取吸附能力
   */
  getSnapCapability(elementType: string): ISnapCapability {
    const caps = this.getCapabilities(elementType);
    return caps.snap ?? { behavior: SnapBehavior.Normal };
  }

  /**
   * 检查元素是否参与吸附
   */
  shouldElementSnap(element: BoardElement): boolean {
    const snap = this.getSnapCapability(element.type);

    switch (snap.behavior) {
      case SnapBehavior.None:
        return false;
      case SnapBehavior.RootOnly:
        return snap.isRoot?.(element) ?? false;
      case SnapBehavior.Normal:
      default:
        return true;
    }
  }

  /**
   * 对于 RootOnly 类型，整体移动所有子元素
   */
  snapMoveAll(element: BoardElement, dx: number, dy: number): BoardElement | null {
    const snap = this.getSnapCapability(element.type);
    if (snap.behavior === SnapBehavior.RootOnly && snap.moveAll) {
      return snap.moveAll(element, dx, dy);
    }
    return null;
  }

  // ===========================================================================
  // 便捷查询方法 - 容纳相关
  // ===========================================================================

  /**
   * 获取容纳能力
   */
  getContainmentCapability(elementType: string): IContainmentCapability {
    const caps = this.getCapabilities(elementType);
    return (
      caps.containment ?? {
        asContainer: ContainmentBehavior.None,
        canBeContained: true,
      }
    );
  }

  /**
   * 检查元素是否是容器
   */
  isContainer(element: BoardElement): boolean {
    const containment = this.getContainmentCapability(element.type);
    return containment.asContainer !== ContainmentBehavior.None;
  }

  /**
   * 检查元素是否可以被包含
   */
  canBeContained(element: BoardElement): boolean {
    const containment = this.getContainmentCapability(element.type);
    return containment.canBeContained;
  }

  /**
   * 检查容器是否可以包含指定元素
   */
  canContain(container: BoardElement, child: BoardElement): boolean {
    const containerCaps = this.getContainmentCapability(container.type);
    const childCaps = this.getContainmentCapability(child.type);

    // 检查子元素是否可以被包含
    if (!childCaps.canBeContained) {
      return false;
    }

    // 检查容器的包含能力
    switch (containerCaps.asContainer) {
      case ContainmentBehavior.None:
        return false;
      case ContainmentBehavior.Any:
        // Any 容器（如 frame）接受一切可被包含的元素，由容器方黑名单兜底；
        // 子方 canBeContainedBy 声明只用于向 Restricted 容器 opt-in，
        // 不构成对 Any 容器的排他限制
        return containerCaps.canContain?.(child) ?? true;
      case ContainmentBehavior.Restricted:
        // Restricted 容器（如 column/mind-node）的准入由子方声明反转决定，
        // 子方未声明时回退容器方的 canContain
        if (childCaps.canBeContainedBy) {
          return childCaps.canBeContainedBy(container);
        }
        return containerCaps.canContain?.(child) ?? false;
      default:
        return false;
    }
  }

  /**
   * 检查元素能否被指定类型的容器包含（无需真实容器实例，
   * 供创建流程等尚无容器元素的场合预判准入）。
   */
  canBeContainedByType(element: BoardElement, containerType: string): boolean {
    return this.canContain({ id: "", type: containerType } as BoardElement, element);
  }

  // ===========================================================================
  // 便捷查询方法 - 移动相关
  // ===========================================================================

  /**
   * 获取移动能力
   */
  getMovementCapability(elementType: string): IMovementCapability {
    const caps = this.getCapabilities(elementType);
    return caps.movement ?? { behavior: MovementBehavior.Normal };
  }

  /**
   * 获取移动行为
   */
  getMovementBehavior(element: BoardElement): MovementBehavior {
    return this.getMovementCapability(element.type).behavior;
  }

  /**
   * 收集移动该元素时需要一起移动的完整集合（含自身），
   * 未声明 collectMoveSubtree 能力的元素仅返回自身。
   */
  collectMoveSubtree(element: BoardElement): BoardElement[] {
    const movement = this.getMovementCapability(element.type);
    if (movement.collectMoveSubtree) {
      return movement.collectMoveSubtree(element);
    }
    return [element];
  }

  /**
   * 检查元素移动是否需要以子树平移提交
   * （MoveWithChildren 容器整体移动，或 RootOnly 元素带子节点的整树移动）。
   */
  shouldTranslateAsSubtree(element: BoardElement): boolean {
    if (this.shouldMoveWithChildren(element)) return true;
    const snap = this.getSnapCapability(element.type);
    return (
      snap.behavior === SnapBehavior.RootOnly &&
      Boolean(snap.moveAll) &&
      Array.isArray(element.children) &&
      element.children.length > 0
    );
  }

  /**
   * 生成元素移动 ops：子树元素生成整树平移 ops（避免 set_node 写入 children），
   * 普通元素只 patch 变化字段。
   */
  buildElementMoveOps(
    originElement: BoardElement,
    targetElement: BoardElement,
    path: number[]
  ): Operation[] {
    if (
      this.shouldTranslateAsSubtree(targetElement) &&
      typeof originElement.x === "number" &&
      typeof originElement.y === "number" &&
      typeof targetElement.x === "number" &&
      typeof targetElement.y === "number"
    ) {
      return BoardUtil.buildTranslateSubtreeOps(
        originElement,
        path,
        targetElement.x - originElement.x,
        targetElement.y - originElement.y
      );
    }
    return BoardUtil.diffNodePatchOnly(originElement, targetElement, path);
  }

  /**
   * 检查元素是否需要带着子元素一起移动
   */
  shouldMoveWithChildren(element: BoardElement): boolean {
    return this.getMovementBehavior(element) === MovementBehavior.MoveWithChildren;
  }

  /**
   * 检查元素移动后是否需要重新布局
   */
  requiresRelayout(element: BoardElement): boolean {
    return this.getMovementBehavior(element) === MovementBehavior.RequiresRelayout;
  }

  /**
   * 结构/图层变化移动元素后的 relayout 通知（如思维导图重排受影响的导图）
   */
  notifyAfterMove(element: BoardElement): void {
    this.getMovementCapability(element.type).afterMove?.(this.board, element);
  }

  // ===========================================================================
  // 便捷查询方法 - 渲染相关
  // ===========================================================================

  /**
   * 获取渲染能力
   */
  getRenderCapability(elementType: string): IRenderCapability {
    const caps = this.getCapabilities(elementType);
    return caps.render ?? { childrenOrder: ChildrenRenderOrder.Reversed };
  }

  /**
   * 获取子元素渲染顺序
   */
  getChildrenRenderOrder(element: BoardElement): ChildrenRenderOrder {
    return this.getRenderCapability(element.type).childrenOrder;
  }

  /**
   * 过滤渲染期可见的子元素（未声明能力时全部可见）
   */
  getVisibleChildren(element: BoardElement, children: BoardElement[]): BoardElement[] {
    const render = this.getRenderCapability(element.type);
    if (render.filterVisibleChildren) {
      return render.filterVisibleChildren(element, children);
    }
    return children;
  }

  /**
   * 子元素是否应该反向渲染
   */
  shouldReverseChildren(element: BoardElement): boolean {
    return this.getChildrenRenderOrder(element) === ChildrenRenderOrder.Reversed;
  }

  /**
   * 获取元素颜色主题（用于 UI 区分）
   */
  getColorTheme(element: BoardElement): string {
    const render = this.getRenderCapability(element.type);
    if (render.getColorTheme) {
      return render.getColorTheme(element);
    }
    return ELEMENT_COLOR_THEMES[element.type] ?? "gray";
  }

  /**
   * 获取元素显示名称
   */
  getDisplayName(element: BoardElement): string {
    const render = this.getRenderCapability(element.type);
    if (render.getDisplayName) {
      return render.getDisplayName(element);
    }
    return element.name ?? element.type;
  }

  // ===========================================================================
  // 便捷查询方法 - 参考线相关
  // ===========================================================================

  /**
   * 检查元素是否参与参考线计算
   */
  shouldParticipateInRefLines(element: BoardElement): boolean {
    const caps = this.getCapabilities(element.type);
    if (!caps.refLine) {
      return true; // 默认参与
    }

    if (!caps.refLine.participatesInRefLines) {
      return false;
    }

    if (caps.refLine.shouldParticipate) {
      return caps.refLine.shouldParticipate(element);
    }

    return true;
  }

  // ===========================================================================
  // 便捷查询方法 - 测量相关
  // ===========================================================================

  /**
   * 获取测量能力
   */
  getMeasurementCapability(elementType: string): IMeasurementCapability {
    const caps = this.getCapabilities(elementType);
    return caps.measurement ?? {};
  }

  /**
   * 测量元素在指定宽度下的高度
   */
  async measureElementHeight(element: BoardElement, targetWidth: number): Promise<number> {
    const measCap = this.getMeasurementCapability(element.type);
    if (measCap.measureHeightForWidth) {
      return measCap.measureHeightForWidth(element, targetWidth, this.board);
    }
    // 降级：保持当前高度
    return element.height || 50;
  }

  // ===========================================================================
  // 便捷查询方法 - 容器协议相关
  // ===========================================================================

  /**
   * 检查元素是否在容器范围内
   * @param pointerPosition 鼠标位置（可选），如果提供则用鼠标位置判断
   */
  isElementInContainer(
    container: BoardElement,
    element: BoardElement,
    pointerPosition?: Point
  ): boolean {
    const caps = this.getContainmentCapability(container.type);
    if (caps.isElementInContainer) {
      return caps.isElementInContainer(this.board, container, element, pointerPosition);
    }
    return false;
  }

  /**
   * 检查元素是否是容器的子元素
   */
  isChildInContainer(container: BoardElement, child: BoardElement): boolean {
    const caps = this.getContainmentCapability(container.type);
    if (caps.isChildInContainer) {
      return caps.isChildInContainer(container, child);
    }
    return container.children?.some(c => c.id === child.id) ?? false;
  }

  /**
   * 获取插入索引
   * @param excludeElementId - 排除某个元素（用于同一容器内拖拽）
   */
  getDropIndex(container: BoardElement, dropY: number, excludeElementId?: string): number {
    const caps = this.getContainmentCapability(container.type);
    if (caps.getDropIndex) {
      return caps.getDropIndex(this.board, container, dropY, excludeElementId);
    }
    return container.children?.length ?? 0;
  }

  /**
   * 准备元素插入（尺寸调整）
   */
  async prepareElementForInsertion(
    container: BoardElement,
    element: BoardElement
  ): Promise<BoardElement> {
    const caps = this.getContainmentCapability(container.type);
    if (caps.prepareElementForInsertion) {
      return caps.prepareElementForInsertion(this.board, container, element);
    }
    return element;
  }

  /**
   * 触发插入后回调
   */
  notifyChildInserted(container: BoardElement): void {
    const caps = this.getContainmentCapability(container.type);
    caps.onChildInserted?.(this.board, container);
  }

  /**
   * 触发移出后回调
   * @param container 容器元素
   * @param removedChild 被移除的子元素（可选，用于恢复属性等）
   */
  notifyChildRemoved(container: BoardElement, removedChild?: BoardElement): void {
    const caps = this.getContainmentCapability(container.type);
    caps.onChildRemoved?.(this.board, container, removedChild);
  }

  /**
   * 是否为有序容器（子元素位置由容器布局管理）
   */
  hasOrderedChildren(container: BoardElement): boolean {
    return this.getContainmentCapability(container.type).orderedChildren === true;
  }

  /**
   * 生成子元素拖拽时的容器反馈 ops（无声明返回空数组）
   */
  buildChildDragFeedbackOps(
    container: BoardElement,
    childId: string,
    position: { x: number; y: number }
  ): Operation[] {
    const caps = this.getContainmentCapability(container.type);
    if (!caps.buildChildDragFeedbackOps) return [];
    return caps.buildChildDragFeedbackOps(this.board, container, childId, position);
  }

  /**
   * 生成容器拖拽悬停反馈 ops；feedback 为 null 表示清除（无声明返回空数组）
   */
  buildDragFeedbackOps(
    container: BoardElement,
    feedback: ContainerDragFeedback | null
  ): Operation[] {
    const caps = this.getContainmentCapability(container.type);
    if (!caps.buildDragFeedbackOps) return [];
    return caps.buildDragFeedbackOps(this.board, container, feedback);
  }

  /**
   * 容器拖拽悬停反馈是否激活（无声明视为未激活）
   */
  isDropFeedbackActive(container: BoardElement): boolean {
    const caps = this.getContainmentCapability(container.type);
    return caps.isDropFeedbackActive?.(container) ?? false;
  }

  /**
   * 重算容器的外包 bounds（无声明返回 null，表示容器不自适应）
   */
  calculateContainerBounds(
    container: BoardElement
  ): { x: number; y: number; width: number; height: number } | null {
    const caps = this.getContainmentCapability(container.type);
    return caps.calculateBounds?.(this.board, container) ?? null;
  }
}

export default CapabilityService;
