import type { ReactElement } from "react";
import type { Editor, Element } from "slate";
import type { PluginRuntimeStyleCompiler } from "./source-editor";

export interface InlineSourceRuntime {
  useInlineSource(element: Element): {
    readOnly: boolean;
    compiler: PluginRuntimeStyleCompiler | undefined;
    update(properties: Record<string, unknown>): void;
    remove(): void;
  };
  insertInlineSource(editor: Editor, element: Element): void;
  InlineSourceBoundary(): ReactElement;
}

let runtime: InlineSourceRuntime | undefined;
export function configureInlineSource(value: InlineSourceRuntime) {
  runtime = value;
}
function current() {
  if (!runtime) throw new Error("行内源码组件需要 Tau 编辑器宿主");
  return runtime;
}
export const useInlineSource: InlineSourceRuntime["useInlineSource"] = element =>
  current().useInlineSource(element);
export const insertInlineSource: InlineSourceRuntime["insertInlineSource"] = (...args) =>
  current().insertInlineSource(...args);
export const InlineSourceBoundary: InlineSourceRuntime["InlineSourceBoundary"] = () =>
  current().InlineSourceBoundary();
