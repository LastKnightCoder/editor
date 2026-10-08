import { Board, BoardElement } from "../types";

/**
 * 统一的嵌套约束（已迁移到能力系统）
 * @deprecated 使用 board.capabilityService.canContain(parent, child) 代替
 */
export function canNest(board: Board, parent: BoardElement, child: BoardElement): boolean {
  return board.capabilityService.canContain(parent, child);
}
