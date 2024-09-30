import { Board } from "../types";
import Geometry from "../components/Geometry";
import { CommonPlugin, CommonElement } from './CommonPlugin';

export interface GeometryElement extends CommonElement {
  type: "geometry",
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  paths: string[];
}

export class GeometryPlugin extends CommonPlugin {
  name = "geometry";

  constructor() {
    super();
  }

  render(_board: Board, { element }: { element: GeometryElement }) {
    return (
      <Geometry
        key={element.id}
        element={element}
        onResizeStart={this.onResizeStart.bind(this)}
        onResize={this.onResize.bind(this)}
        onResizeEnd={this.onResizeEnd.bind(this)}
      />
    )
  }
}

export default GeometryPlugin;
