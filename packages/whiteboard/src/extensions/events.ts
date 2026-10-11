import type { BoardElement, PageSketch, Selection, ViewPort } from "../types";

/**
 * 白板内核事件表：事件名 → 监听器参数元组。
 * 内核事件只有内核代码能发（board.emit），扩展只能经 api.on 监听；
 * 经扩展 API 监听时载荷为冻结快照（见 runtime 的快照替换表）。
 */
export interface WhiteboardKernelEvents {
  /** 任意文档变更提交后发出（无参数） */
  change: [];
  /** children 变化 */
  "value:change": [children: BoardElement[]];
  /** 选区变化 */
  "selection:change": [selection: Selection];
  /** 视口变化 */
  "viewport:change": [viewPort: ViewPort];
  /** 页级画风变化 */
  "sketch:change": [sketch: PageSketch];
  /** 只读状态变化 */
  "readonly:change": [readonly: boolean];
  /** 已有元素数据变化 */
  "element:change": [elements: BoardElement[]];
  /** 元素插入 */
  "element:insert": [elements: BoardElement[]];
  /** 元素移除 */
  "element:remove": [elements: BoardElement[]];
  /** 元素拖动中（每帧） */
  "element:move": [elements: BoardElement[]];
  /** 元素拖动结束 */
  "element:move-end": [];
  /** 让指定元素闪烁提示（如定位到引用） */
  "element:flash": [id: string];
  /** 激活工具切换 */
  "active-tool:change": [id: string, options: Readonly<Record<string, unknown>> | null];
}

export type KernelEventName = keyof WhiteboardKernelEvents;

/** 内核事件名集合（运行时校验用），与 WhiteboardKernelEvents 的键一一对应 */
export const KERNEL_EVENT_NAMES: readonly KernelEventName[] = [
  "change",
  "value:change",
  "selection:change",
  "viewport:change",
  "sketch:change",
  "readonly:change",
  "element:change",
  "element:insert",
  "element:remove",
  "element:move",
  "element:move-end",
  "element:flash",
  "active-tool:change",
];

/** 扩展事件名：`<命名空间>.<名称>`，命名空间取扩展 id 第一段 */
export type ExtensionEventName = `${string}.${string}`;

/** internal: 前缀事件只在白板包内使用，不进入公共事件通道 */
const INTERNAL_EVENT_PREFIX = "internal:";
const EXTENSION_EVENT_PATTERN = /^[a-z0-9-]+\..+/;

export function isKernelEventName(event: string): event is KernelEventName {
  return (KERNEL_EVENT_NAMES as readonly string[]).includes(event);
}

/** api.on 允许的事件：内核事件 + 任意命名空间的扩展事件（扩展间通信） */
export function assertSubscribableEventName(event: string): void {
  if (isKernelEventName(event)) return;
  if (event.startsWith(INTERNAL_EVENT_PREFIX))
    throw new Error(`internal: 前缀的白板事件只在包内使用，不能订阅：${event}`);
  if (EXTENSION_EVENT_PATTERN.test(event)) return;
  throw new Error(
    `未知白板事件名：${event}（仅允许内核事件或 "<命名空间>.<名称>" 格式的扩展事件）`
  );
}

/**
 * api.emit 允许的事件：扩展事件且不能是内核事件或 internal: 前缀；
 * 传入 namespace（扩展 id 第一段）时还要求事件归属该命名空间。
 */
export function assertEmittableEventName(event: string, namespace?: string): void {
  if (isKernelEventName(event))
    throw new Error(`内核事件只能由白板内核发出，扩展不能伪造：${event}`);
  if (event.startsWith(INTERNAL_EVENT_PREFIX))
    throw new Error(`internal: 前缀的白板事件只在包内使用，扩展不能发出：${event}`);
  if (!EXTENSION_EVENT_PATTERN.test(event))
    throw new Error(`扩展事件名必须是 "<命名空间>.<名称>" 格式：${event}`);
  if (namespace !== undefined && !event.startsWith(`${namespace}.`))
    throw new Error(`扩展只能发出自己命名空间的事件：${event} 不在命名空间 "${namespace}." 下`);
}
