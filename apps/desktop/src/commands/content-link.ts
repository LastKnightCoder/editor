import { contentLinkCommands } from "@/commands/contracts/content-link";
import type { EntityRef } from "@/entity/ref";
import type { ContentLinksOfContent } from "@/types/content-link";

/** 建立两个实体之间的显式连接（落在各自代表正文上，原子双边）；已连接或同正文返回 false */
export async function addContentLink(from: EntityRef, to: EntityRef): Promise<boolean> {
  return contentLinkCommands.add.call(from, to);
}

/** 解除两个实体之间的显式连接；本就没有连接返回 false */
export async function removeContentLink(from: EntityRef, to: EntityRef): Promise<boolean> {
  return contentLinkCommands.remove.call(from, to);
}

/** 批量取一组正文各自的连接目标（已解析为代表身份与标题） */
export async function listContentLinksByContentIds(
  contentIds: number[]
): Promise<ContentLinksOfContent[]> {
  return contentLinkCommands.listByContentIds.call(contentIds);
}
