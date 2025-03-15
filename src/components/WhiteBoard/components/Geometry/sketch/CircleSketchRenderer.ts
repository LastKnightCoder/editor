import { BaseSketchRenderer } from "./BaseSketchRenderer";
import { SketchRendererProps } from "./ISketchRenderer";

/**
 * 圆形草图渲染器
 */
export class CircleSketchRenderer extends BaseSketchRenderer {
  /**
   * 构造函数
   */
  constructor() {
    super(["circle"], 10);
  }

  /**
   * 渲染草图
   * @param props 渲染参数
   */
  render(props: SketchRendererProps): boolean {
    const { width, height, roughSvg, svgRef } = props;

    if (!svgRef.current) return false;

    // 获取Rough.js渲染选项
    const options = this.getRoughOptions(props);

    // 对于圆形，使用 ellipse
    const ellipseNode = roughSvg.ellipse(
      width / 2,
      height / 2,
      width,
      height,
      options,
    );
    svgRef.current.appendChild(ellipseNode);

    return true;
  }
}
