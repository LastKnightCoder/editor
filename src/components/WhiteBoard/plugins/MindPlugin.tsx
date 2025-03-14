import { Board, IBoardPlugin, MindNodeElement, Selection } from "../types";
import { isRectIntersect, MindUtil, selectAreaToRect } from "../utils";
import MindNode from "../components/MindNode";

export class MindPlugin implements IBoardPlugin {
  name = "mind-node";

  isHit(_board: Board, element: MindNodeElement, x: number, y: number) {
    const { x: left, y: top, width, height } = element;

    return x >= left && x <= left + width && y >= top && y <= top + height;
  }

  moveElement(_board: Board, element: MindNodeElement, dx: number, dy: number) {
    if (MindUtil.isRoot(element)) {
      return MindUtil.moveAll(element, dx, dy);
    }

    return null;
  }

  isElementSelected(
    board: Board,
    element: MindNodeElement,
    selectArea: Selection["selectArea"] = board.selection.selectArea,
  ) {
    if (!selectArea) return false;
    const selectRect = selectAreaToRect(selectArea);
    return isRectIntersect(element, selectRect);
  }

  render(
    _board: Board,
    { element, children }: { element: MindNodeElement; children?: any },
  ) {
    return (
      <g key={element.id}>
        <MindNode element={element} />
        {children}
      </g>
    );
  }
}

export default MindPlugin;
