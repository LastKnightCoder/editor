import { BoardElement, Board } from '../types';

export class BoardUtil {
  static isBoard(value: any): value is Board {
    return value && value.boardFlag === Board.boardFlag;
  }

  static getHitElements(board: Board, x: number, y: number): BoardElement[] {
    const hitElements: BoardElement[] = [];
    this.bfs(board, node => {
      if (board.isHit(node, x, y)) {
        hitElements.push(node);
      }
    });
    return hitElements;
  }

  static dfs(node: BoardElement | Board, visit: (node: BoardElement) => void | boolean, quickQuit = false): boolean | void {
    if (!this.isBoard(node)) {
      visit(node);
    }
    const children = node.children;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const result = this.dfs(child, visit, quickQuit);
        if (quickQuit && result) {
          return result;
        }
      }
    }
  }

  static bfs(node: BoardElement | Board, visit: (node: BoardElement) => boolean | void, quickQuit = false): boolean | void {
    const queue: (BoardElement | Board)[] = [];
    queue.push(node);
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) continue;
      if (!this.isBoard(node)) {
        const result = visit(node);
        if (quickQuit && result) {
          return result;
        }
      }
      const children = node.children;
      if (children) {
        children.forEach(child => {
          queue.push(child);
        });
      }
    }
  }
}

export default BoardUtil;
