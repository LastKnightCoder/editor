import CommonPlugin, { CommonElement } from "./CommonPlugin";
import { Board, IBoardPlugin, WebviewElement } from "../types";
import WebviewElementComponent from "../components/WebviewElement";

const DRAG_PADDING = 20;

export class WebviewPlugin extends CommonPlugin implements IBoardPlugin {
  name = "webview";

  constructor() {
    super();
  }

  isHit(
    _board: Board,
    element: CommonElement & any,
    x: number,
    y: number,
  ): boolean {
    const { x: elementX, y: elementY, width, height } = element;
    return (
      x >= elementX - DRAG_PADDING &&
      x <= elementX + width + DRAG_PADDING &&
      y >= elementY - DRAG_PADDING &&
      y <= elementY + height + DRAG_PADDING
    );
  }

  render(_board: Board, { element }: { element: WebviewElement }) {
    return (
      <WebviewElementComponent
        key={element.id}
        element={element}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeEnd={this.onResizeEnd}
      />
    );
  }
}
