import { IBoardPlugin, ArrowElement, Board, Point } from "../types";
import ArrowElementComponent from '../components/ArrowElementComponent';
import { PathUtil } from "../utils";

export class ArrowPlugin implements IBoardPlugin {
  name = 'arrow';

  constructor() {
    this.onPointsChange = this.onPointsChange.bind(this);
  }

  onPointsChange(board: Board, element: ArrowElement, points: Point[]) {
    const path = PathUtil.getPathByElement(board, element);
    if (!path) return;

    const newElement = {
      ...element,
      points,
    }
    board.apply({
      type: 'set_node',
      path,
      properties: {},
      newProperties: newElement,
    })
  }

  render(_board: Board, { element }: { element: ArrowElement }) {
    return (
      <ArrowElementComponent
        key={element.id}
        element={element}
        onPointsChange={this.onPointsChange}
      />
    )
  }
}