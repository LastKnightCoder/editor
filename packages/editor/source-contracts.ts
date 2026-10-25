import type { MouseEvent, ReactNode, ReactElement } from "react";
import type { LucideIcon } from "lucide-react";
import type { Editor, Element, Path } from "slate";
import type { ElementBehaviors, ParagraphElement, BlockElement } from "./api";
import { createServiceId } from "@tau/shared/service-contract";

export type { TextFieldSnapshot, TextFieldDelta, EditorTextField } from "./text-field-contract";
import type { EditorTextField } from "./text-field-contract";

export interface EditorTextFields {
  open(editor: Editor, element: Element, field: string): EditorTextField;
}
export const IEditorTextFields = createServiceId<EditorTextFields>("editorTextFields");

export interface EditorNodeViews {
  read(nodeId: string): Readonly<Record<string, unknown>> | undefined;
  write(nodeId: string, patch: Record<string, unknown>): Promise<Readonly<Record<string, unknown>>>;
}
export const IEditorNodeViews = createServiceId<EditorNodeViews>("editorNodeViews");

export interface TextFieldEditor {
  /** 交给原生 input/textarea 的 ref；宿主负责输入法、选区、撤销和卸载冲刷。 */
  readonly inputRef: import("react").RefCallback<HTMLInputElement | HTMLTextAreaElement>;
  readonly value: string;
  readonly revision: string;
  readonly readOnly: boolean;
  readonly ready: boolean;
  readonly error: string | null;
  edit(change: { offset: number; remove: number; text: string }): void;
  editBatch(changes: readonly { offset: number; remove: number; text: string }[]): void;
  undo(): void;
  redo(): void;
}

interface SourceBlockEditorBaseProps {
  mode: string;
  title: string;
  icon: LucideIcon;
  element: Element;
  center?: boolean;
  extend?: boolean;
  children?: ReactNode;
}

export type SourceBlockEditorProps = SourceBlockEditorBaseProps & { field: string };
export interface RuntimeStyleCompiler {
  compile(request: { source: string; language: "html" | "tsx" }): Promise<string>;
}
export interface SourceEditorRuntime {
  useTextField(element: Element, field: string): TextFieldEditor;
  SourceBlockEditor(props: SourceBlockEditorProps): ReactElement;
  useSourceBlock(element: Element): {
    theme: { isDark: boolean; token(word: string): string };
    compiler: RuntimeStyleCompiler | undefined;
    update(properties: Record<string, unknown>): void;
  };
  useReportPreviewError(error: string | null, options?: { stale?: boolean }): boolean;
  insertSourceBlock(editor: Editor, element: BlockElement, line?: number): Path | undefined;
  sourceBlockParagraphBehavior(type: string): ElementBehaviors<ParagraphElement>;
}
export interface ElementAccess {
  view: Readonly<Record<string, unknown>>;
  updateView(properties: Record<string, unknown>): void;
  readOnly: boolean;
  /** 外框里的块是否被点选；未声明外框时恒为 false */
  selected: boolean;
  /** 字段合并进节点，进入撤销记录并同步给协作者；只读、节点已被替换或卸载后不写入 */
  update(properties: Record<string, unknown>): void;
  remove(): void;
  /** 选中外框里的块 */
  select(): void;
  /** 在指定位置打开块菜单；需要外框 */
  openMenu(position: { x: number; y: number }): void;
}
export interface BlockToolbarProps {
  /** 无障碍名称（如「画廊属性」） */
  label: string;
  className?: string;
  children: ReactNode;
}
export interface BlockToolbarButtonProps {
  /** 按钮名称：图标按钮的提示与无障碍名称 */
  title: string;
  shortcut?: string;
  /** 显示在图标旁的文字（主操作用） */
  label?: string;
  icon?: ReactNode;
  active?: boolean;
  mono?: boolean;
  onClick(event: MouseEvent<HTMLButtonElement>): void;
}
export interface ElementRuntime {
  useElement(element: Element): ElementAccess;
  /** 打开文档图片查看器，定位到该元素的第 index 个图片资源（按资源声明计） */
  useMediaViewer(element: Element): (index?: number) => void;
  BlockToolbar(props: BlockToolbarProps): ReactElement;
  BlockToolbarButton(props: BlockToolbarButtonProps): ReactElement;
  BlockToolbarGap(): ReactElement;
}
export interface InlineSourceRuntime {
  useInlineSource(element: Element): {
    readOnly: boolean;
    compiler: RuntimeStyleCompiler | undefined;
    update(properties: Record<string, unknown>): void;
    remove(): void;
  };
  insertInlineSource(editor: Editor, element: Element): void;
  InlineSourceBoundary(): ReactElement;
}
