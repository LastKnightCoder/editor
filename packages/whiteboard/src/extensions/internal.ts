import type Board from "../Board";
import type { IBoardPlugin } from "../types";
import type { ElementCreateSpec, WhiteboardContributions, WhiteboardExtension } from "./api";

/** 内置元素复用交互实现的私有装配口，不从公共入口导出。 */
const factories = new WeakMap<WhiteboardExtension, (board: Board) => IBoardPlugin[]>();

export function withInternalPlugins(
  extension: WhiteboardExtension,
  create: (board: Board) => IBoardPlugin[]
): WhiteboardExtension {
  factories.set(extension, create);
  return extension;
}

export function createInternalPlugins(extension: WhiteboardExtension, board: Board) {
  return factories.get(extension)?.(board) ?? [];
}

/**
 * 内置扩展的内部贡献形态：creators 为「本扩展内部插件提供的元素 type」登记创建规格，
 * 与公共 element.create 合并进同一个创建规格注册表并走同样校验（仅登记规格，不提供渲染）。
 */
export interface InternalContributions extends WhiteboardContributions {
  creators?: Record<string, ElementCreateSpec>;
}
