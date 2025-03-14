import { BoardElement, Board } from "../types";
import BoardUtil from "./BoardUtil.ts";

export type Path = number[];

export class PathUtil {
  static getPathByElement(
    board: Board,
    element: BoardElement & any,
  ): Path | null {
    const path: Path = [];
    const dfs = (node: Board | BoardElement, index?: number) => {
      if (!BoardUtil.isBoard(node)) {
        path.push(index!);
        if (node.id === element.id) {
          return true;
        }
      }
      const children = node.children;
      if (children) {
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (dfs(child, i)) {
            return true;
          }
          path.pop();
        }
      }
    };
    return dfs(board) && path.length > 0 ? path : null;
  }

  static getElementByPath(board: Board, path: number[]): BoardElement {
    if (path.length === 0) {
      throw new Error("path is empty");
    }
    const { children } = board;
    // 根据 path 从数组中找到对应的节点，如果不存在抛出异常
    // value 是一个数组
    const node = this.getElement(children, path);
    if (!node) {
      throw new Error(`node not found by path: ${path}`);
    } else {
      return node;
    }
  }

  static getElement(children: BoardElement[], path: Path): BoardElement | null {
    const element = children[path[0]];
    if (path.length === 1) {
      return element;
    }
    if (!element.children) return null;

    return this.getElement(element.children, path.slice(1));
  }

  static getParentByPath(
    board: Board,
    path: Path,
  ): Board | BoardElement | null {
    if (path.length === 0) return null;
    if (path.length === 1) return board;
    const parentPath = path.slice(0, -1);
    return this.getElementByPath(board, parentPath);
  }
}

export default PathUtil;
