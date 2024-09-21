import Board, { BoardElement } from "./Board.ts";
import get from 'lodash/get';

export default class BoardUtil {
  static isBoard(value: any): value is Board {
    return value && value.boardFlag === Board.boardFlag;
  }

  static getNodeByPath(board: Board, path: number[]): BoardElement {
    if (path.length === 0) {
      throw new Error('path is empty');
    }
    const { value } = board;
    // 根据 path 从数组中找到对应的节点，如果不存在抛出异常
    // value 是一个数组
    const node: BoardElement | undefined = get(value, path);
    if (!node) {
      throw new Error(`node not found by path: ${path}`);
    } else {
      return node;
    }
  }
}