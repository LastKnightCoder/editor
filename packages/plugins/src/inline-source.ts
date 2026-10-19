import type { InlineSourceRuntime } from "@tau/editor/source-contracts";
export type { InlineSourceRuntime } from "@tau/editor/source-contracts";

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
