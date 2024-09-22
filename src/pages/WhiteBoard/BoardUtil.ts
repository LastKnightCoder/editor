import Board, { BoardElement } from "./Board.ts";
import get from 'lodash/get';

export default class BoardUtil {
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
        const result =visit(node);
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

  static getNodeByPath(board: Board, path: number[]): BoardElement {
    if (path.length === 0) {
      throw new Error('path is empty');
    }
    const { children } = board;
    // 根据 path 从数组中找到对应的节点，如果不存在抛出异常
    // value 是一个数组
    const node: BoardElement | undefined = get(children, path);
    if (!node) {
      throw new Error(`node not found by path: ${path}`);
    } else {
      return node;
    }
  }
}