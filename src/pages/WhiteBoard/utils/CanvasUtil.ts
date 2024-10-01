const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

export class CanvasUtil {
  static isPointInPath(path: Path2D, x: number, y: number) {
    if (!ctx) return false;
    return ctx.isPointInPath(path, x, y);
  }
}

export default CanvasUtil;