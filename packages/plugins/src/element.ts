import type { ElementRuntime } from "@tau/editor/source-contracts";
export type {
  ElementAccess,
  BlockToolbarProps,
  BlockToolbarButtonProps,
  ElementRuntime,
} from "@tau/editor/source-contracts";
export type { ElementFrame as EditorElementFrame } from "@tau/editor/contracts";

let runtime: ElementRuntime | undefined;
export function configureElement(value: ElementRuntime) {
  runtime = value;
}
function current() {
  if (!runtime) throw new Error("块组件需要 Tau 编辑器宿主");
  return runtime;
}

/** 读写当前节点：只读状态、外框选中、合并字段、删除、打开块菜单 */
export const useElement: ElementRuntime["useElement"] = element => current().useElement(element);
/** 打开文档图片查看器，定位到该节点的第 index 个图片资源 */
export const useMediaViewer: ElementRuntime["useMediaViewer"] = element =>
  current().useMediaViewer(element);
// 宿主实现内部使用 hook；占位按函数组件直接调用，保持一个固定的组件身份
export const BlockToolbar: ElementRuntime["BlockToolbar"] = props => current().BlockToolbar(props);
export const BlockToolbarButton: ElementRuntime["BlockToolbarButton"] = props =>
  current().BlockToolbarButton(props);
export const BlockToolbarGap: ElementRuntime["BlockToolbarGap"] = () => current().BlockToolbarGap();
