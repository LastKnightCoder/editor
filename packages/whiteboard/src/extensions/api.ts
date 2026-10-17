import type { ComponentType, ReactNode } from "react";
import type { ServiceIdentifier } from "@tau/shared/service-contract";
import type { BoardElement, ElementBounds } from "../types/element";
import type { ContainerKind } from "../types/containment";
import type { Operation } from "../types/operation";
import type { Selection } from "../types/selection";
import type { ViewPort } from "../types/viewport";
import type { PresentationSequence } from "../types/presentation";
import type { PageSketch } from "../types/sketch";
import type { ResolvedSketch } from "../types/sketch";
import type { SchematicShape } from "../types/schematic";
import type { StandardSchemaV1 } from "./standard-schema";
import type { ExtensionEventName, WhiteboardKernelEvents } from "./events";

export interface WhiteboardSnapshot {
  children: BoardElement[];
  viewPort: ViewPort;
  selection: Selection;
  presentationSequences?: PresentationSequence[];
  sketch?: PageSketch;
  /** 保存时写入的文档版本（旧数据缺失由 getDocumentVersion 归一为 1） */
  version: number;
}

/** 返回的数据是副本，写入只能通过提交入口。 */
export interface WhiteboardAPI {
  readonly children: BoardElement[];
  readonly selection: Selection;
  readonly viewPort: ViewPort;
  readonly readonly: boolean;
  /** 只读原因：文档版本高于当前应用时为 "document-too-new"，普通只读为 null */
  readonly readonlyReason: "document-too-new" | null;
  readonly isDestroyed: boolean;
  /** 当前激活工具 id（"tau.select" 表示非创建模式） */
  readonly activeTool: string;
  /** 当前工具参数（如 geometry 的形状参数）；无参数为 null */
  readonly activeToolOptions: Readonly<Record<string, unknown>> | null;
  /**
   * 设置当前工具；id 必须是已注册工具 id 或 "tau.select"，否则抛错。
   * 只读画布下非 select 的设置被忽略并返回 false。
   */
  setActiveTool(id: string, options?: Record<string, unknown>): boolean;
  /** 订阅工具切换；返回取消函数，扩展作用域内随扩展卸载自动清理 */
  onActiveToolChange(
    listener: (id: string, options: Readonly<Record<string, unknown>> | null) => void
  ): () => void;
  /** 屏幕（client）坐标 → 画布坐标；容器未挂载时抛错 */
  screenToCanvas(point: { x: number; y: number }): { x: number; y: number };
  /** 画布坐标 → 屏幕（client）坐标；容器未挂载时抛错 */
  canvasToScreen(point: { x: number; y: number }): { x: number; y: number };
  getSnapshot(): WhiteboardSnapshot;
  getElement(id: string): BoardElement | undefined;
  getSketch(element: BoardElement, owner?: BoardElement): ResolvedSketch;
  /** 查询元素能否被指定类型的容器收纳（委托能力系统的 containment 声明，供创建手势等尚无容器实例的场合） */
  canContain(containerType: string, element: BoardElement): boolean;
  /** 数据不合规时抛 WhiteboardValidationError 且不应用任何变更 */
  submit(operations: readonly Operation[], options?: { historyGroup?: string }): void;
  /** 数据不合规时抛 WhiteboardValidationError 且不应用任何变更 */
  apply(operations: Operation | Operation[], updateHistory?: boolean): void;
  /** 数据不合规时抛 WhiteboardValidationError 且不应用任何变更 */
  updateElement(id: string, patch: Record<string, unknown>): boolean;
  select(ids: readonly string[]): void;
  captureSubmission(target?: string | BoardElement): () => boolean;
  subscribe(listener: () => void): () => void;
  execute(command: string, payload?: unknown): Promise<unknown>;
  /** 命令第一个绑定快捷键的展示文字（按仲裁顺序，tau 扩展优先）；无绑定返回 null */
  getShortcut(commandId: string): string | null;
  /** 让指定元素闪烁提示（内核事件 element:flash 的公开触发入口） */
  flashElement(id: string): void;
  /**
   * 获取必选宿主服务：只能取扩展 requires 声明过的 id；
   * 取未声明的 id 或对 optional 声明的 id 调用均抛错（编程错误）。
   * 仅扩展作用域的 api 提供，主 api 调用即抛错。
   */
  getService<T>(id: ServiceIdentifier<T>): T;
  /**
   * 获取可选宿主服务：只能取扩展 requires/optional 声明过的 id，
   * 未注册返回 undefined；取未声明的 id 抛错（编程错误）。
   */
  tryGetService<T>(id: ServiceIdentifier<T>): T | undefined;
  /** 订阅内核事件（按 WhiteboardKernelEvents 推断参数）或扩展事件（<命名空间>.<名称>） */
  on<K extends keyof WhiteboardKernelEvents>(
    event: K,
    listener: (...args: WhiteboardKernelEvents[K]) => void
  ): void;
  /** 扩展事件载荷由发送方自定义，不做静态约束（any[] 使具体类型监听器可直接传入） */
  on(event: ExtensionEventName, listener: (...args: any[]) => void): void;
  /** 非法事件名（internal: 前缀、未知裸名）在运行时抛错 */
  off(event: string, listener: (...args: any[]) => void): void;
  /** 只能发出扩展事件（<命名空间>.<名称>）；内核事件与 internal: 前缀事件在运行时抛错 */
  emit(event: ExtensionEventName, ...args: unknown[]): void;
}

export interface WhiteboardCommand {
  id: string;
  enabled?(api: WhiteboardAPI): boolean;
  execute(api: WhiteboardAPI, payload?: unknown): unknown;
}

/** 带类型的白板元素：第三方元素的私有数据收敛在 data 字段，由 schema 约束其形状 */
export type TypedBoardElement<TData> = BoardElement & { data: TData };

/** TData 恰为 unknown（缺省）时退化为 BoardElement，保证不带泛型参数的旧定义完全兼容 */
type ElementParam<TData> = unknown extends TData ? BoardElement : TypedBoardElement<TData>;

/** 元素收纳声明（子元素一侧）：能否被容器收纳，以及愿意进入的受限容器类别 */
export interface ElementContainmentSpec {
  /** 能否被任何容器收纳，默认 true */
  canBeContained?: boolean;
  /** 愿意进入的受限容器类别；目前只有 "layout"（子元素位置由容器布局决定，例如分栏） */
  joins?: readonly ContainerKind[];
}

export interface WhiteboardElementDefinition<TData = unknown> {
  type: string;
  presentation?: {
    label: string;
    icon?: ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
    getName?(element: ElementParam<TData>): string;
  };
  interaction?: {
    resize?: { handles?: "corners" | "all"; preserveAspectRatio?: boolean };
    connect?: "rect";
  };
  sketch?: true;
  schematic?(element: ElementParam<TData>, context: { dark: boolean }): readonly SchematicShape[];
  render: ComponentType<{ element: ElementParam<TData>; children?: ReactNode }>;
  getBounds?(element: ElementParam<TData>): ElementBounds | null;
  isHit?(element: ElementParam<TData>, x: number, y: number): boolean;
  move?(element: ElementParam<TData>, dx: number, dy: number): BoardElement;
  /** 元素数据结构版本（正整数，缺省 1）；数据低于该版本时按 migrate 逐步升级 */
  schemaVersion?: number;
  /** 键 n 表示“从 n 升到 n+1”的单步迁移；装配时要求覆盖 [1, schemaVersion) 的全部步骤 */
  migrate?: Record<number, (element: ElementParam<TData>) => BoardElement>;
  /** 约束 element.data 的 Standard Schema v1；提交与迁移产物校验均要求同步返回结果 */
  schema?: StandardSchemaV1<unknown, TData>;
  /** 收纳声明：未声明时可被容器收纳（能进 frame，不能进 layout 类受限容器） */
  containment?: ElementContainmentSpec;
  /** 创建规格：声明后可注册创建型工具（element 工具），在画布上手势创建该元素 */
  create?: ElementCreateSpec<TData>;
}

/** 创建手势中的画布坐标点 */
export interface CreatePoint {
  x: number;
  y: number;
}

/** 创建手势的指针上下文（画布坐标 + 修饰键 + 当前缩放） */
export interface CreatePointerContext {
  /** 当前指针（画布坐标） */
  point: CreatePoint;
  /** 按下点（画布坐标） */
  start: CreatePoint;
  shift: boolean;
  alt: boolean;
  zoom: number;
  /** 当前指针压力（PointerEvent.pressure 原始值；无压感设备为 0/0.5，由手势自行归一） */
  pressure: number;
  api: WhiteboardAPI;
}

/** 预览附加项：需要高亮包围盒的已有元素 id（如框架收纳提示） */
export interface CreatePreviewOptions {
  highlight?: readonly string[];
  /** 是否绘制预览元素的包围盒描边（默认 true；手写笔迹等不宜描边的元素传 false） */
  bounds?: boolean;
}

/** 手势产出：单个元素，或元素 + 与插入同属一个撤销步的附加操作 */
export type CreateResult =
  BoardElement | { element: BoardElement; operations?: readonly Operation[] };

/** build 的产出：与 CreateResult 同构（元素或元素 + 附加操作），可异步 */
export type CreateBuildResult<TData = unknown> =
  ElementParam<TData> | { element: ElementParam<TData>; operations?: readonly Operation[] };

/**
 * 一次创建手势会话：begin 之后由内核驱动 move/end/cancel。
 * end 与内置手势的 build 可返回 Promise：等待期间内核忽略新的创建手势
 * （工具保持但按下被吞掉），完成后按废弃守门（captureSubmission + 工具一致）决定提交或丢弃。
 */
export interface CreateGestureSession {
  move(ctx: CreatePointerContext): void;
  end(
    ctx: CreatePointerContext & { moved: boolean }
  ): CreateResult | null | Promise<CreateResult | null>;
  cancel?(): void;
}

/** 自定义创建手势：begin 返回 null 表示不接管本次按下 */
export interface CustomCreateGesture {
  begin(
    ctx: CreatePointerContext & {
      /** 设置预览元素（null 清除）；预览不进入文档、快照与历史 */
      preview(element: BoardElement | null, options?: CreatePreviewOptions): void;
    }
  ): CreateGestureSession | null;
}

/** 传给 build 的构造上下文：rect/start/end 均已应用约束 */
export interface CreateBuildContext {
  /** 画布坐标包围盒，已应用 Shift/Alt 约束 */
  rect: { x: number; y: number; width: number; height: number };
  /** 已应用约束的起止点 */
  start: CreatePoint;
  end: CreatePoint;
  /** 是否为单击（未拖动） */
  click: boolean;
  shift: boolean;
  alt: boolean;
  /** 激活工具时的参数（activeToolOptions） */
  options: Readonly<Record<string, unknown>> | null;
  api: WhiteboardAPI;
}

/** 元素创建规格 */
export interface ElementCreateSpec<TData = unknown> {
  /** "click"/"drag" 为内置手势；传对象则完全自定义 */
  gesture: "click" | "drag" | CustomCreateGesture;
  /** 仅 drag 生效：box = Shift 等比、Alt 从中心；line = Shift 吸附 45°。默认 box */
  constrain?: "box" | "line";
  /** click 必填；drag 单击时按此尺寸以按下点为中心创建，缺省则单击不创建 */
  defaultSize?: readonly [number, number];
  /** drag 生成的 rect 宽或高小于此值则不创建（line 约束改为检查长度），默认 [4,4]，画布单位 */
  minSize?: readonly [number, number];
  /** click/drag 必填：由构造上下文产出待插入元素（或元素 + 附加操作），返回 null 则不创建；可异步 */
  build?(
    ctx: CreateBuildContext
  ): CreateBuildResult<TData> | null | Promise<CreateBuildResult<TData> | null>;
  /** 创建后动作：select = 选中（默认）；edit = 选中并进入编辑；none = 不改选区 */
  after?: "select" | "edit" | "none";
  /** 创建后保持当前工具（默认 false，回到 tau.select） */
  stay?: boolean;
  /** 创建模式光标，默认 crosshair */
  cursor?: "crosshair" | "text";
  /**
   * 提示胶囊文案（激活创建工具时画布底部显示）；第一段为主提示。
   * 缺省时按手势兜底：click = 「点击放置 + label」，其它 = 「拖拽绘制 + label」。
   */
  hint?:
    readonly string[] | ((options: Readonly<Record<string, unknown>> | null) => readonly string[]);
}

/** 元素定义的声明辅助（恒等函数）：传入 schema 时 TData 由其输出类型推断 */
export function defineElement<TData = unknown>(
  definition: WhiteboardElementDefinition<TData>
): WhiteboardElementDefinition<TData> {
  return definition;
}

export interface WhiteboardToolProps {
  run(payload?: unknown): void;
}

export interface WhiteboardToolContribution {
  id: string;
  /** 提示与无障碍名（菜单项/提示胶囊文案也用它）；空串或空白会被拒绝装配 */
  label: string;
  /** 工具图标（lucide 图标组件即可） */
  icon: ComponentType<{ className?: string }>;
  /** 命令型工具：点击执行该命令（与 element 恰好二选一） */
  command?: string;
  /** 创建型工具：激活后在画布上手势创建该元素；须是本扩展声明且带 create 的元素 type */
  element?: string;
  order: number;
  group: string;
  /**
   * 工具按钮组件；仅 tau 命名空间工具在工具栏上渲染，
   * 第三方工具统一进入「扩展工具」菜单（菜单项由 label + icon 生成，component 被忽略）
   */
  component?: ComponentType<WhiteboardToolProps>;
}

export interface WhiteboardLayerContribution {
  id: string;
  position: "canvas" | "outside";
  component: ComponentType;
}

export interface WhiteboardMenuContribution {
  id: string;
  label: string;
  command: string;
  order: number;
  when?(api: WhiteboardAPI): boolean;
}

export interface WhiteboardContributions {
  ingest?: readonly {
    id: string;
    source: "paste" | "drop";
    accepts(event: ClipboardEvent | DragEvent): boolean;
    run(api: WhiteboardAPI, event: ClipboardEvent | DragEvent): void | Promise<void>;
  }[];
  commands?: readonly WhiteboardCommand[];
  tools?: readonly WhiteboardToolContribution[];
  layers?: readonly WhiteboardLayerContribution[];
  inspectors?: Readonly<Record<string, ComponentType<any>>>;
  menus?: readonly WhiteboardMenuContribution[];
  /** 快捷键（is-hotkey 键串，按 event.key 匹配）：tau 扩展优先于第三方同键声明，第一条 enabled 的命令执行；宿主保留键（mod+k/p/j、alt+方向、escape）不可声明 */
  hotkeys?: readonly { key: string; command: string }[];
  /** 每次激活启动，返回的清理函数在隐藏或卸载时执行。 */
  activate?(): void | (() => void);
  dispose?(): void;
}

export interface WhiteboardExtension {
  /** 静态元素定义供画布和无画布的数据消费者共用。 */
  readonly elements?: readonly WhiteboardElementDefinition<any>[];
  readonly id: string;
  /** 展示名（UI 显示"来自 xxx"用）；内置扩展可不填 */
  readonly name?: string;
  readonly apiVersion: 1;
  /**
   * 必选宿主服务：任一服务在宿主注册表中不存在时扩展被拒（reason "missing-service"）。
   * 声明过的 id 才能经 api.getService / api.tryGetService 获取。
   */
  readonly requires?: readonly ServiceIdentifier<unknown>[];
  /**
   * 可选宿主服务：缺失不影响装配，经 api.tryGetService 获取（返回 undefined 表示未提供）。
   * 对 optional 中的 id 调用 getService 会抛错。
   */
  readonly optional?: readonly ServiceIdentifier<unknown>[];
  create(api: WhiteboardAPI): WhiteboardContributions;
}

/** 扩展被禁用的原因：除编程错误外一律降级禁用单个扩展，不中断画布装配。 */
export type WhiteboardExtensionErrorReason =
  | "duplicate-extension"
  | "unsupported-api-version"
  | "invalid-namespace"
  | "conflict"
  | "missing-command"
  | "missing-service"
  | "invalid-definition"
  | "create-failed"
  | "migration-failed";

export interface WhiteboardExtensionError {
  extensionId: string;
  reason: WhiteboardExtensionErrorReason;
  message: string;
  /** 冲突对方扩展 id */
  conflictWith?: string;
  /** 冲突的元素 type / 命令 / 贡献 id，或缺失的宿主服务 id */
  target?: string;
}

export function defineWhiteboardExtension(
  definition: Omit<WhiteboardExtension, "apiVersion">
): WhiteboardExtension {
  if (!definition.id.includes(".")) throw new Error("白板扩展 ID 必须包含命名空间");
  return Object.freeze({ ...definition, apiVersion: 1 as const });
}

export interface WhiteboardOutline {
  open: boolean;
  width: number;
  onWidthChange(width: number): void;
  onDockWidthChange?(width: number): void;
}
