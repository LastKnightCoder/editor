import { BaseSketchRenderer } from "./BaseSketchRenderer";
import { SketchRendererProps } from "./ISketchRenderer";
import { transformPath } from "../../../utils";

/**
 * 基于路径的默认草图渲染器
 * 用于处理所有几何图形的通用渲染
 */
export class PathSketchRenderer extends BaseSketchRenderer {
  /**
   * 构造函数
   */
  constructor() {
    // 使用通配符"*"表示可以处理所有几何图形
    // 设置较低的优先级，让特定的渲染器优先处理
    super(["*"], 1);
  }

  /**
   * 渲染草图
   * @param props 渲染参数
   */
  render(props: SketchRendererProps): boolean {
    const { element, width, height, roughSvg, svgRef } = props;
    const { paths } = element;

    if (!svgRef.current || !paths || paths.length === 0) return false;

    // 获取Rough.js渲染选项
    const options = this.getRoughOptions(props);

    // 使用路径渲染草图
    paths.forEach((path) => {
      const pathString = transformPath(path, width, height);
      const pathNode = roughSvg.path(pathString, options);

      svgRef.current?.appendChild(pathNode);
    });

    return true;
  }
}
