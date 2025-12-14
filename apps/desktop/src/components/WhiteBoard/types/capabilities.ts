import type { BoardElement } from "./board";
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
}

/**
 * 移动能力接口
 */
export interface IMovementCapability {
  /** 移动行为类型 */
  behavior: MovementBehavior;

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
  arrow: "indigo",
  whiteboard: "violet",
};
