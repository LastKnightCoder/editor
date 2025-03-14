const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

export class CanvasUtil {
  static isPointInPath(path: Path2D, x: number, y: number) {
    if (!ctx) return false;
    return ctx.isPointInPath(path, x, y);
  }

  static isPointInStroke(
    path: Path2D,
    lineWidth: number,
    x: number,
    y: number,
  ) {
    if (!ctx) return false;
    ctx.save();
    ctx.lineWidth = lineWidth;
    const result = ctx.isPointInStroke(path, x, y);
    ctx.restore();
    return result;
  }
}

export default CanvasUtil;
