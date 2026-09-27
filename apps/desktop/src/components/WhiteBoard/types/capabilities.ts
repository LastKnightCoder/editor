import type { BoardElement } from "./board";
import type { Operation } from "./operation";
import type { Point } from "./point";
import type Board from "../Board";

// =============================================================================
// 能力枚举定义
// =============================================================================

/**
 * 吸附行为类型
 */
export enum SnapBehavior {
  /** 正常参与吸附 */
  Normal = "normal",
  /** 不参与吸附 (如 arrow) */
  None = "none",
  /** 仅根节点参与吸附，需要整体移动 (如 mind-node) */
  RootOnly = "root-only",
}

/**
 * 容纳行为类型 - 作为容器时的行为
 */
export enum ContainmentBehavior {
  /** 不是容器 */
  None = "none",
  /** 可以包含任何非容器元素 (如 frame) */
  Any = "any",
  /** 只能包含特定类型 (如 mind-node) */
  Restricted = "restricted",
}

/**
 * 移动行为类型
 */
export enum MovementBehavior {
  /** 普通移动 */
  Normal = "normal",
  /** 跟随连接点移动 (如 arrow) */
  FollowBinding = "follow-binding",
  /** 需要触发重新布局 (如 mind-node) */
  RequiresRelayout = "requires-relayout",
  /** 带着子元素一起移动 (如 frame) */
  MoveWithChildren = "move-with-children",
}

/**
 * 子元素渲染顺序
 */
export enum ChildrenRenderOrder {
  /** 正序渲染 (如 mind-node) */
  Normal = "normal",
  /** 倒序渲染 (大部分元素) */
  Reversed = "reversed",
}

// =============================================================================
// 能力接口定义
// =============================================================================

/**
 * 吸附能力接口
 */
export interface ISnapCapability {
  /** 吸附行为类型 */
  behavior: SnapBehavior;

  /**
   * 对于 RootOnly 类型，判断给定元素是否是根节点
   */
  isRoot?: (element: BoardElement) => boolean;

  /**
   * 对于 RootOnly 类型，整体移动所有子元素
   */
  moveAll?: (element: BoardElement, dx: number, dy: number) => BoardElement;
}

/** 容器拖拽悬停反馈（由交互内核在拖拽循环中计算，容器自行映射为视觉状态） */
export interface ContainerDragFeedback {
  /** 是否有元素悬停于该容器（候选目标） */
  isTarget: boolean;
  /** 是否有元素正从该容器拖出 */
  isCurrent: boolean;
  /** 正从该容器拖出的元素（预览显示用），无则 null */
  draggingElement: BoardElement | null;
  /** 悬停于该容器的元素（占位尺寸用），isTarget 为 false 时为 null */
  hoveringElement: BoardElement | null;
  /** 鼠标位置（计算插入索引用），无则 undefined */
  pointer: Point | undefined;
}

/**
 * 容纳能力接口
 */
export interface IContainmentCapability {
  /** 作为容器时的行为 */
  asContainer: ContainmentBehavior;

  /** 作为子元素时是否可以被包含 */
  canBeContained: boolean;

  /**
   * 对于 Restricted 或 Any 类型，检查是否可以包含指定元素
   */
  canContain?: (child: BoardElement) => boolean;

  /**
   * 检查是否可以被指定容器包含
   */
  canBeContainedBy?: (container: BoardElement) => boolean;

  /**
   * 有序容器：子元素位置由容器布局管理。拖拽中子元素的位置更新转交容器反馈，
   * 同容器内支持重排序，移出时按拖拽落点写回位置。
   */
  orderedChildren?: boolean;

  /**
   * 子元素拖拽时的容器反馈 ops（如 Column 的拖拽位置指示）
   */
  buildChildDragFeedbackOps?: (
    board: Board,
    container: BoardElement,
    childId: string,
    position: { x: number; y: number }
  ) => Operation[];

  /**
   * 拖拽悬停反馈 ops；feedback 为 null 表示清除（无变化时返回空数组）
   */
  buildDragFeedbackOps?: (
    board: Board,
    container: BoardElement,
    feedback: ContainerDragFeedback | null
  ) => Operation[];

  /**
   * 拖拽悬停反馈是否激活（pointerup 提交时优先信任，避免重算）
   */
  isDropFeedbackActive?: (container: BoardElement) => boolean;

  /**
   * 重算容器的外包 bounds（子元素变化后容器自适应）。
   * 返回 null 表示容器不自适应（如 Column 由 relayout 管理）。
   */
  calculateBounds?: (
    board: Board,
    container: BoardElement
  ) => { x: number; y: number; width: number; height: number } | null;

  // ============ 容器协议方法 ============

  /**
   * 检查元素是否在容器范围内（用于拖拽进入判断）
   * @param pointerPosition 鼠标位置（可选），如果提供则用鼠标位置判断，否则用元素边界
   */
  isElementInContainer?: (
    board: Board,
    container: BoardElement,
    element: BoardElement,
    pointerPosition?: Point
  ) => boolean;

  /**
   * 检查元素是否是容器的子元素
   */
  isChildInContainer?: (container: BoardElement, child: BoardElement) => boolean;

  /**
   * 获取插入位置索引
   * @param excludeElementId - 排除某个元素（用于同一容器内拖拽）
   */
  getDropIndex?: (
    board: Board,
    container: BoardElement,
    dropY: number,
    excludeElementId?: string
  ) => number;

  /**
   * 在插入前调整元素尺寸
   * 返回 Promise 因为可能需要 DOM 测量
   */
  prepareElementForInsertion?: (
    board: Board,
    container: BoardElement,
    element: BoardElement
  ) => Promise<BoardElement>;

  /**
   * 元素插入后的回调（如触发 relayout）
   */
  onChildInserted?: (board: Board, container: BoardElement) => void;

  /**
   * 元素移出后的回调
   * @param removedChild 被移除的子元素（可选，用于恢复属性等）
   */
  onChildRemoved?: (board: Board, container: BoardElement, removedChild?: BoardElement) => void;
}

/**
 * 移动能力接口
 */
export interface IMovementCapability {
  /** 移动行为类型 */
  behavior: MovementBehavior;

  /**
   * 收集移动该元素时需要一起移动的完整元素集合（含自身）。
   * 容器（Frame/Column）返回自身与全部后代，思维导图根节点返回整棵子树；
   * 未声明时视为仅自身移动。
   */
  collectMoveSubtree?: (element: BoardElement) => BoardElement[];

  /**
   * 移动后的回调（如需要重新布局）
   */
  afterMove?: (board: Board, element: BoardElement) => void;
}

/**
 * 渲染能力接口
 */
export interface IRenderCapability {
  /** 子元素渲染顺序 */
  childrenOrder: ChildrenRenderOrder;

  /**
   * 过滤渲染期可见的子元素（如思维导图按折叠方向隐藏子树），默认全部可见
   */
  filterVisibleChildren?: (element: BoardElement, children: BoardElement[]) => BoardElement[];

  /**
   * 获取显示名称
   */
  getDisplayName?: (element: BoardElement) => string;

  /**
   * 获取显示颜色主题（用于 UI 区分）
   */
  getColorTheme?: (element: BoardElement) => string;
}

/**
 * 参考线能力接口
 */
export interface IRefLineCapability {
  /** 是否参与参考线计算 */
  participatesInRefLines: boolean;

  /**
   * 对于部分参与的情况，判断具体元素是否参与
   */
  shouldParticipate?: (element: BoardElement) => boolean;
}

/**
 * 连接点能力接口（用于箭头连接）
 */
export interface IConnectableCapability {
  /** 是否可连接 */
  connectable: boolean;

  /**
   * 获取连接点列表
   */
  getConnectPoints?: (element: BoardElement) => Array<{
    connectId: string;
    point: Point;
  }>;

  /**
   * 获取绑定点位置
   */
  getBindPoint?: (element: BoardElement, connectId: string) => Point | null;
}

/**
 * 测量能力接口
 * 用于需要 DOM 测量高度的元素（如富文本、图片等）
 */
export interface IMeasurementCapability {
  /**
   * 测量元素在指定宽度下的高度
   * 返回 Promise 因为可能需要 DOM 渲染
   */
  measureHeightForWidth?: (element: BoardElement, targetWidth: number) => Promise<number>;
}

// =============================================================================
// 能力聚合接口
// =============================================================================

/**
 * 元素能力聚合接口
 * 每个插件可以声明其支持的能力
 */
export interface IElementCapabilities {
  /** 吸附能力 */
  snap?: ISnapCapability;
  /** 容纳能力 */
  containment?: IContainmentCapability;
  /** 移动能力 */
  movement?: IMovementCapability;
  /** 渲染能力 */
  render?: IRenderCapability;
  /** 参考线能力 */
  refLine?: IRefLineCapability;
  /** 连接点能力 */
  connectable?: IConnectableCapability;
  /** 测量能力 */
  measurement?: IMeasurementCapability;
}

// =============================================================================
// 默认能力配置
// =============================================================================

/**
 * 默认元素能力（适用于大多数普通元素）
 */
export const DEFAULT_CAPABILITIES: IElementCapabilities = {
  snap: {
    behavior: SnapBehavior.Normal,
  },
  containment: {
    asContainer: ContainmentBehavior.None,
    canBeContained: true,
  },
  movement: {
    behavior: MovementBehavior.Normal,
  },
  render: {
    childrenOrder: ChildrenRenderOrder.Reversed,
  },
  refLine: {
    participatesInRefLines: true,
  },
  connectable: {
    connectable: true,
  },
};

/**
 * 元素类型到颜色主题的映射
 */
export const ELEMENT_COLOR_THEMES: Record<string, string> = {
  richtext: "emerald",
  card: "blue",
  frame: "purple",
  "mind-node": "orange",
  image: "pink",
  video: "rose",
  webview: "cyan",
  geometry: "amber",
  handwrite: "indigo",
  arrow: "indigo",
  whiteboard: "violet",
  column: "teal",
};
