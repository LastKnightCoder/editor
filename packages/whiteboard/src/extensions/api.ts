import type { ComponentType, ReactNode } from "react";
import type { BoardElement, ElementBounds, Operation, Selection, ViewPort } from "../types";

export interface WhiteboardSnapshot {
  children: BoardElement[];
  viewPort: ViewPort;
  selection: Selection;
  presentationSequences?: import("../types").PresentationSequence[];
  sketch?: import("../types").PageSketch;
}

/** 返回的数据是副本，写入只能通过提交入口。 */
export interface WhiteboardAPI {
  readonly children: BoardElement[];
  readonly selection: Selection;
  readonly viewPort: ViewPort;
  readonly readonly: boolean;
  readonly isDestroyed: boolean;
  currentCreateType: string;
  getSnapshot(): WhiteboardSnapshot;
  getElement(id: string): BoardElement | undefined;
  submit(operations: readonly Operation[], options?: { historyGroup?: string }): void;
  apply(operations: Operation | Operation[], updateHistory?: boolean): void;
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

export interface WhiteboardElementDefinition {
  type: string;
  render: ComponentType<{ element: BoardElement; children?: ReactNode }>;
  getBounds?(element: BoardElement): ElementBounds | null;
  isHit?(element: BoardElement, x: number, y: number): boolean;
  move?(element: BoardElement, dx: number, dy: number): BoardElement;
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
  elements?: readonly WhiteboardElementDefinition[];
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
