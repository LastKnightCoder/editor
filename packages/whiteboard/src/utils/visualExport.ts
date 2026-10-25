import type Board from "../Board";
import type { BoardElement } from "../types/element";
export function missingExportElements(board: Board, elements: readonly BoardElement[]): string[] {
  return elements.flatMap(element => [
    ...(board.extensions?.unknownElementReason(element) ? [element.id] : []),
    ...missingExportElements(board, element.children ?? []),
  ]);
}
export function assertVisualExport(
  board: Board,
  elements: readonly BoardElement[],
  allowPlaceholders = false
): void {
  if (!allowPlaceholders && missingExportElements(board, elements).length)
    throw new Error("部分元素缺少匹配的插件，无法完整导出；可选择保留占位标记的导出");
}
