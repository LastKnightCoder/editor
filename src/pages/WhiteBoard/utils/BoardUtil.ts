import { BoardElement, Board, Operation } from '../types';

export class BoardUtil {
  static isBoard(value: any): value is Board {
    return value && value.boardFlag === Board.boardFlag;
  }

  static getHitElements(board: Board, x: number, y: number): BoardElement[] {
    const hitElements: BoardElement[] = [];
    this.dfs(board, node => {
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

  static inverseOperation = (op: Operation): Operation => {
    switch (op.type) {
        case 'insert_node': {
            return { ...op, type: 'remove_node' };
        }

        case 'remove_node': {
            return { ...op, type: 'insert_node' };
        }

        // TODO
        // case 'move_node': {
        //     const { newPath, path } = op;

        //     // PERF: in this case the move operation is a no-op anyways.
        //     if (Path.equals(newPath, path)) {
        //         return op;
        //     }

        //     // when operation path is [0,0] -> [0,2], should exec Path.transform to get [0,1] -> [0,0]
        //     // shoud not return [0,2] -> [0,0] #WIK-8981
        //     // if (Path.isSibling(path, newPath)) {
        //     //     return { ...op, path: newPath, newPath: path };
        //     // }

        //     // If the move does not happen within a single parent it is possible
        //     // for the move to impact the true path to the location where the node
        //     // was removed from and where it was inserted. We have to adjust for this
        //     // and find the original path. We can accomplish this (only in non-sibling)
        //     // moves by looking at the impact of the move operation on the node
        //     // after the original move path.
        //     const inversePath = Path.transform(path, op)!;
        //     const inverseNewPath = Path.transform(Path.next(path), op)!;
        //     return { ...op, path: inversePath, newPath: inverseNewPath };
        // }

        case 'set_node': {
            const { properties, newProperties } = op;
            return { ...op, properties: newProperties, newProperties: properties };
        }

        case 'set_selection': {
            const { properties, newProperties } = op;
            return { ...op, properties: newProperties, newProperties: properties };
        }

        case 'set_viewport': {
            const { properties, newProperties } = op;
            if (properties == null) {
                return {
                    ...op,
                    properties: newProperties,
                    newProperties: newProperties
                };
            } else if (newProperties == null) {
                return {
                    ...op,
                    properties: properties,
                    newProperties: properties
                };
            } else {
                return { ...op, properties: newProperties, newProperties: properties };
            }
        }

        // case 'set_theme': {
        //     const { properties, newProperties } = op;
        //     return { ...op, properties: newProperties, newProperties: properties };
        // }

        default: {
          throw new Error('unsupport operation');
        }
    }
  }
}

export default BoardUtil;
