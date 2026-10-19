import type { ReactNode, ReactElement } from "react";
import type { LucideIcon } from "lucide-react";
import type { Editor, Element, Path } from "slate";
import type { ElementBehaviors, ParagraphElement, BlockElement } from "./api";

export interface SourceBlockEditorProps {
  mode: string;
  title: string;
  icon: LucideIcon;
  initValue: string;
  onChange(value: string): void;
  element: Element;
  center?: boolean;
  extend?: boolean;
  fluid?: boolean;
  children?: ReactNode;
}
export interface RuntimeStyleCompiler {
  compile(request: { source: string; language: "html" | "tsx" }): Promise<string>;
}
export interface SourceEditorRuntime {
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
