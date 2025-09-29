import { Board } from "../types";
import Geometry from "../components/Geometry";
import { CommonPlugin, CommonElement } from "./CommonPlugin";
import { Descendant } from "slate";

export interface GeometryElement extends CommonElement {
  type: "geometry";
  geometryType: string;
  theme?: "light" | "dark";
  color?: string;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  sketchEnabled?: boolean;
  sketchOptions?: {
    seed?: number;
    roughness?: number;
    fillStyle?:
      | "hachure"
      | "solid"
      | "zigzag"
      | "cross-hatch"
      | "dots"
      | "dashed"
      | "zigzag-line";
    fillWeight?: number;
    hachureAngle?: number;
    hachureGap?: number;
    dashOffset?: number;
    dashGap?: number;
    zigzagOffset?: number;
  };
  paths: string[];
  extraInfo?: Record<string, any>;
  text: {
    align: "left" | "center" | "right";
    content: Descendant[];
  };
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
    );
  }
}

export default GeometryPlugin;
