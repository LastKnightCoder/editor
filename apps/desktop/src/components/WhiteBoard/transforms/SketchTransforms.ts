import type { Board, PageSketch } from "../types";

export class SketchTransforms {
  /** 修改页级画风（进撤销历史）；值未变化时不产生操作 */
  static setPageSketch(board: Board, patch: Partial<PageSketch>) {
    const keys = (Object.keys(patch) as (keyof PageSketch)[]).filter(
      key => board.sketch[key] !== patch[key]
    );
    if (keys.length === 0) return;
    const properties: Partial<PageSketch> = {};
    const newProperties: Partial<PageSketch> = {};
    keys.forEach(key => {
      Object.assign(properties, { [key]: board.sketch[key] });
      Object.assign(newProperties, { [key]: patch[key] });
    });
    board.apply({ type: "set_sketch", properties, newProperties });
  }
}
