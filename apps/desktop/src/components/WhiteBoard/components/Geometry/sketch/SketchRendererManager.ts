import { ISketchRenderer, SketchRendererProps } from "./ISketchRenderer";
import { PathSketchRenderer } from "./PathSketchRenderer";
import { RectangleSketchRenderer } from "./RectangleSketchRenderer";
import { CircleSketchRenderer } from "./CircleSketchRenderer";

/**
 * 草图渲染器管理类
 * 负责管理和调度所有草图渲染器
 */
export class SketchRendererManager {
  private static instance: SketchRendererManager;
  private renderers: ISketchRenderer[] = [];

  /**
   * 私有构造函数，防止外部直接创建实例
   */
  private constructor() {
    // 注册默认渲染器
    this.registerDefaultRenderers();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): SketchRendererManager {
    if (!SketchRendererManager.instance) {
      SketchRendererManager.instance = new SketchRendererManager();
    }
    return SketchRendererManager.instance;
  }

  /**
   * 注册默认的草图渲染器
   */
  private registerDefaultRenderers(): void {
    // 注册特定几何图形的渲染器
    this.register(new RectangleSketchRenderer());
    this.register(new CircleSketchRenderer());

    // 注册通用路径渲染器（优先级最低，作为兜底方案）
    this.register(new PathSketchRenderer());
  }

  /**
   * 注册草图渲染器
   * @param renderer 草图渲染器
   */
  public register(renderer: ISketchRenderer): void {
    this.renderers.push(renderer);

    // 按优先级排序，优先级高的排在前面
    this.renderers.sort((a, b) => b.getPriority() - a.getPriority());
  }

  /**
   * 渲染草图
   * @param props 渲染参数
   * @returns 是否成功渲染
   */
  public render(props: SketchRendererProps): boolean {
    const { element } = props;

    // 查找可以处理当前几何图形的渲染器
    for (const renderer of this.renderers) {
      if (renderer.canHandle(element.geometryType)) {
        const result = renderer.render(props);
        if (result) {
          return true; // 渲染成功
        }
      }
    }

    return false; // 没有找到合适的渲染器或渲染失败
  }
}
