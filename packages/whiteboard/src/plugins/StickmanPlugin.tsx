import { Board } from "../types";
import Stickman from "../components/Stickman";
import type { StickBody, StickTint } from "../utils/stickman";
import { CommonPlugin, CommonElement } from "./CommonPlugin";

export interface StickmanElement extends CommonElement {
  type: "stickman";
  /** 姿态 key（utils/stickman/poses），图形由数据现算，不存 SVG */
  pose: string;
  body: StickBody;
  tint: StickTint;
  /** 水平翻转：只镜像图形，文字字形不镜像 */
  flip?: boolean;
}

export class StickmanPlugin extends CommonPlugin {
  name = "stickman";

  render(_board: Board, { element }: { element: StickmanElement }) {
    return (
      <Stickman
        key={element.id}
        element={element}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeEnd={this.onResizeEnd}
      />
    );
  }
}

export default StickmanPlugin;
