import type { ComponentType, ReactNode } from "react";
import type { BoardElement, ElementBounds, Operation, Selection, ViewPort } from "../types";
import type { StandardSchemaV1 } from "./standard-schema";

export interface WhiteboardSnapshot {
  children: BoardElement[];
  viewPort: ViewPort;
  selection: Selection;
  presentationSequences?: import("../types").PresentationSequence[];
  sketch?: import("../types").PageSketch;
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
  currentCreateType: string;
  getSnapshot(): WhiteboardSnapshot;
  getElement(id: string): BoardElement | undefined;
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
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): void;
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

export interface WhiteboardElementDefinition<TData = unknown> {
  type: string;
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
  command: string;
  order: number;
  group: string;
  component: ComponentType<WhiteboardToolProps>;
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
  /** 泛型定义入表时擦除 TData（any 双向可赋值），避免不同 TData 间的逆变报错 */
  elements?: readonly WhiteboardElementDefinition<any>[];
  commands?: readonly WhiteboardCommand[];
  tools?: readonly WhiteboardToolContribution[];
  layers?: readonly WhiteboardLayerContribution[];
  inspectors?: Readonly<Record<string, ComponentType<any>>>;
  menus?: readonly WhiteboardMenuContribution[];
  hotkeys?: readonly { key: string; command: string }[];
  /** 每次激活启动，返回的清理函数在隐藏或卸载时执行。 */
  activate?(): void | (() => void);
  dispose?(): void;
}

export interface WhiteboardExtension {
  readonly id: string;
  readonly apiVersion: 1;
  create(api: WhiteboardAPI): WhiteboardContributions;
}

/** 扩展被禁用的原因：除编程错误外一律降级禁用单个扩展，不中断画布装配。 */
export type WhiteboardExtensionErrorReason =
  | "duplicate-extension"
  | "unsupported-api-version"
  | "invalid-namespace"
  | "conflict"
  | "missing-command"
  | "invalid-definition"
  | "create-failed"
  | "migration-failed";

export interface WhiteboardExtensionError {
  extensionId: string;
  reason: WhiteboardExtensionErrorReason;
  message: string;
  /** 冲突对方扩展 id */
  conflictWith?: string;
  /** 冲突的元素 type / 命令 / 贡献 id */
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
