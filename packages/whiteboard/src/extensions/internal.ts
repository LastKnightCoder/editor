import type Board from "../Board";
import type { IBoardPlugin } from "../types";
import type { WhiteboardExtension } from "./api";

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
