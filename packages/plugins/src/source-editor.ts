import type { SourceEditorRuntime } from "@tau/editor/source-contracts";
export type {
  SourceBlockEditorProps,
  RuntimeStyleCompiler as PluginRuntimeStyleCompiler,
  SourceEditorRuntime,
} from "@tau/editor/source-contracts";

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
