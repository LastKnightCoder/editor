import { BaseSketchRenderer } from "./BaseSketchRenderer";
import { SketchRendererProps } from "./ISketchRenderer";

/**
 * 矩形草图渲染器
 */
export class RectangleSketchRenderer extends BaseSketchRenderer {
  /**
   * 构造函数
   */
  constructor() {
    super(["rectangle"], 10);
  }

  /**
   * 渲染草图
   * @param props 渲染参数
   */
  render(props: SketchRendererProps): boolean {
    const { element, width, height, roughSvg, svgRef } = props;

    if (!svgRef.current) return false;

    // 获取圆角值
    const cornerRadius = element.extraInfo?.cornerRadius || 0;

    // 获取Rough.js渲染选项
    const options = this.getRoughOptions(props);

    if (cornerRadius > 0) {
      // 对于有圆角的矩形，使用路径
      const path = `M ${cornerRadius} 0 
                    L ${width - cornerRadius} 0 
                    Q ${width} 0, ${width} ${cornerRadius} 
                    L ${width} ${height - cornerRadius} 
                    Q ${width} ${height}, ${width - cornerRadius} ${height} 
                    L ${cornerRadius} ${height} 
                    Q 0 ${height}, 0 ${height - cornerRadius} 
                    L 0 ${cornerRadius} 
                    Q 0 0, ${cornerRadius} 0 Z`;

      const pathNode = roughSvg.path(path, options);
      svgRef.current.appendChild(pathNode);
    } else {
      // 对于无圆角的矩形，直接使用 rectangle
      const rectNode = roughSvg.rectangle(0, 0, width, height, options);
      svgRef.current.appendChild(rectNode);
    }

    return true;
  }
}
