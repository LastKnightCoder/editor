import Board, { BoardElement } from "@/pages/WhiteBoard/Board";
import BoardUtil from "@/pages/WhiteBoard/BoardUtil.ts";

export type Path = number[];

export class PathUtil {
  static getPathByElement(board: Board, element: BoardElement): Path | null {
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
    }
    return dfs(board) && path.length > 0 ? path : null;
  }
}

export default PathUtil;
