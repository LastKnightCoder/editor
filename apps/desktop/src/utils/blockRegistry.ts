/**
 * 对话块渲染器注册表（D-057）：`renderers/<Name>/index.tsx` 默认导出 defineBlockRenderer(...)，
 * 这里以 glob 收集（文件即注册）。按围栏语言（含别名）+ accept 解析渲染器。
 */

import type { BlockData, BlockRenderer, BlockType } from "@/types/block-preview";
import type { ResolveBlockType } from "@/features/previews/model/chatBlocks";

const modules = import.meta.glob<{ default: BlockRenderer }>("../renderers/*/index.tsx", {
  eager: true,
});

const byType = new Map<BlockType, BlockRenderer>();
const byLang = new Map<string, BlockRenderer>();
for (const mod of Object.values(modules)) {
  const renderer = mod.default;
  if (!renderer?.type) continue;
  byType.set(renderer.type, renderer);
  for (const lang of [renderer.type, ...(renderer.aliases ?? [])]) byLang.set(lang, renderer);
}

export const blockRegistry = {
  get(type: BlockType): BlockRenderer | undefined {
    return byType.get(type);
  },

  /** 围栏语言 + 内容 → 渲染器（不构成块时返回 undefined） */
  resolve(lang: string | undefined, content: string): BlockRenderer | undefined {
    if (!lang) return undefined;
    const renderer = byLang.get(lang.toLowerCase());
    if (!renderer) return undefined;
    return !renderer.accept || renderer.accept(content) ? renderer : undefined;
  },

  /** 快照块（页面参数 JSON）：按类型，退回语言 */
  find(block: BlockData): BlockRenderer | undefined {
    return byType.get(block.type) ?? blockRegistry.resolve(block.metadata.language, block.content);
  },

  all(): BlockRenderer[] {
    return [...byType.values()];
  },
};

/** 给纯模型用的解析函数（extractChatBlocks） */
export const resolveBlockType: ResolveBlockType = (lang, content) => {
  const renderer = blockRegistry.resolve(lang, content);
  if (!renderer) return null;
  return { type: renderer.type, title: c => renderer.title?.(c) };
};

/** 大小文案：≥0.1 KB 用 KB，否则字节 */
export function formatBlockSize(content: string): string {
  const kb = content.length / 1024;
  return kb >= 0.1 ? `${kb.toFixed(1)} KB` : `${content.length} 字节`;
}
