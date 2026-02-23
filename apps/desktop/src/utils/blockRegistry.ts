import { BlockData, BlockRenderer, BlockType } from "@/types/block-preview";

class BlockRegistry {
  private renderers: Map<BlockType, BlockRenderer> = new Map();

  register(renderer: BlockRenderer): void {
    if (this.renderers.has(renderer.type)) {
      console.warn(
        `Block renderer for type "${renderer.type}" already registered. Overwriting.`,
      );
    }
    this.renderers.set(renderer.type, renderer);
  }

  unregister(type: BlockType): boolean {
    return this.renderers.delete(type);
  }

  getRenderer(type: BlockType): BlockRenderer | undefined {
    return this.renderers.get(type);
  }

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

  getRegisteredTypes(): BlockType[] {
    return Array.from(this.renderers.keys());
  }

  isPreviewable(type: BlockType): boolean {
    return this.renderers.has(type);
  }
}

export const blockRegistry = new BlockRegistry();

export function registerBlockType(renderer: BlockRenderer): void {
  blockRegistry.register(renderer);
}

export function registerBlockTypes(renderers: BlockRenderer[]): void {
  renderers.forEach((renderer) => blockRegistry.register(renderer));
}
