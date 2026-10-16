/**
 * 摘录提供方的「打开原处」登记：插件运行时按来源类型登记打开函数，材料打开时优先交给它。
 * 未登记（插件停用、卸载）时回落到摘录的外链；都没有则提示启用提供方。
 */

import type { MaterialOpenTarget } from "@/entity/material";

export interface ExcerptOpenTarget {
  sourceKey: string;
  externalId: string;
}

type Opener = (target: ExcerptOpenTarget) => void | Promise<void>;

const openers = new Map<string, Opener>();

/** 同一来源类型只允许一个打开函数；返回注销函数，只注销自己登记的那一个 */
export function registerExcerptOpener(sourceType: string, open: Opener): () => void {
  if (openers.has(sourceType)) throw new Error(`摘录来源已有打开方式：${sourceType}`);
  openers.set(sourceType, open);
  return () => {
    if (openers.get(sourceType) === open) openers.delete(sourceType);
  };
}

export async function openExcerptAtProvider(
  target: Extract<MaterialOpenTarget, { page: "excerpt-provider" }>
): Promise<void> {
  const open = openers.get(target.sourceType);
  if (open) {
    await open({ sourceKey: target.sourceKey, externalId: target.externalId });
    return;
  }
  if (target.url) {
    // 插件宿主在启动时加载本模块，平台命令按需加载
    const { openExternal } = await import("@/commands/extra");
    await openExternal(target.url);
    return;
  }
  throw new Error(`需启用「${target.label}」插件才能打开到原处`);
}
