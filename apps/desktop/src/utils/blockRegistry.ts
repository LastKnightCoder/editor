import { BlockData, BlockRenderer, BlockType } from "@/types/block-preview";

/**
 * 块注册管理器
 */
class BlockRegistry {
  private renderers: Map<BlockType, BlockRenderer> = new Map();

  /**
   * 注册块渲染器
   */
  register(renderer: BlockRenderer): void {
    if (this.renderers.has(renderer.type)) {
      console.warn(
        `Block renderer for type "${renderer.type}" already registered. Overwriting.`,
      );
    }
    this.renderers.set(renderer.type, renderer);
  }

  /**
   * 注销块渲染器
   */
  unregister(type: BlockType): boolean {
    return this.renderers.delete(type);
  }

  /**
   * 获取渲染器
   */
  getRenderer(type: BlockType): BlockRenderer | undefined {
    return this.renderers.get(type);
  }

  /**
   * 查找合适的渲染器
   */
  findRenderer(block: BlockData): BlockRenderer | undefined {
    // 首先尝试精确匹配
    const exactMatch = this.renderers.get(block.type);
    if (exactMatch && exactMatch.canRender(block)) {
      return exactMatch;
    }

    // 遍历所有渲染器，找到第一个可以渲染的
    for (const renderer of this.renderers.values()) {
      if (renderer.canRender(block)) {
        return renderer;
      }
    }

    return undefined;
  }

  /**
   * 获取所有已注册的类型
   */
  getRegisteredTypes(): BlockType[] {
    return Array.from(this.renderers.keys());
  }

  /**
   * 检查是否可预览
   */
  isPreviewable(type: BlockType): boolean {
    return this.renderers.has(type);
  }
}

// 导出单例
export const blockRegistry = new BlockRegistry();

/**
 * 注册块类型的便捷方法
 */
export function registerBlockType(renderer: BlockRenderer): void {
  blockRegistry.register(renderer);
}

/**
 * 批量注册
 */
export function registerBlockTypes(renderers: BlockRenderer[]): void {
  renderers.forEach((renderer) => blockRegistry.register(renderer));
}
