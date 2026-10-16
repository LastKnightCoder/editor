import type { ReactNode, ReactElement } from "react";
import type { LucideIcon } from "lucide-react";
import type { Editor, Element, Path } from "slate";
import type { ElementBehaviors, ParagraphElement, BlockElement } from "@tau/editor/api";

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
export interface PluginRuntimeStyleCompiler {
  compile(request: { source: string; language: "html" | "tsx" }): Promise<string>;
}
export interface SourceEditorRuntime {
  SourceBlockEditor(props: SourceBlockEditorProps): ReactElement;
  useSourceBlock(element: Element): {
    theme: { isDark: boolean; token(word: string): string };
    compiler: PluginRuntimeStyleCompiler | undefined;
    update(properties: Record<string, unknown>): void;
  };
  useReportPreviewError(error: string | null, options?: { stale?: boolean }): boolean;
  insertSourceBlock(editor: Editor, element: BlockElement, line?: number): Path | undefined;
  sourceBlockParagraphBehavior(type: string): ElementBehaviors<ParagraphElement>;
}

let runtime: SourceEditorRuntime | undefined;
export function configureSourceEditor(value: SourceEditorRuntime) {
  runtime = value;
}
function current() {
  if (!runtime) throw new Error("源码编辑组件需要 Tau 编辑器宿主");
  return runtime;
}
export const SourceBlockEditor: SourceEditorRuntime["SourceBlockEditor"] = props =>
  current().SourceBlockEditor(props);
export const useSourceBlock: SourceEditorRuntime["useSourceBlock"] = element =>
  current().useSourceBlock(element);
export const useReportPreviewError: SourceEditorRuntime["useReportPreviewError"] = (...args) =>
  current().useReportPreviewError(...args);
export const insertSourceBlock: SourceEditorRuntime["insertSourceBlock"] = (...args) =>
  current().insertSourceBlock(...args);
export const sourceBlockParagraphBehavior: SourceEditorRuntime["sourceBlockParagraphBehavior"] =
  type => ({
    deleteBackward: (...args) =>
      current().sourceBlockParagraphBehavior(type).deleteBackward!(...args),
  });
