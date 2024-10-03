import { Board, IBoardPlugin, ImageElement } from "../types";
import CommonPlugin from "./CommonPlugin";
import ImageElementComponent from "../components/ImageElement";

export class ImagePlugin extends CommonPlugin implements IBoardPlugin {
  name = 'image';

  constructor() {
    super();
  }

  render(_board: Board, { element }: { element: ImageElement }) {
    return (
      <ImageElementComponent
        key={element.id}
        element={element}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeEnd={this.onResizeEnd}
      />
    )
  }
}