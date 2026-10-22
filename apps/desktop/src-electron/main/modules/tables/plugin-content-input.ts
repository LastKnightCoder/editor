import type Database from "better-sqlite3";
import type { Descendant } from "slate";
import { assertContentNodes } from "@tau/plugins/content-input";
import { parseMarkdownNodes } from "../../services/content-conversion";
import type { PluginContentSource } from "@/types/plugin-data";
import ContentTable from "./content";
import EntitySearchTable from "./entity-search";

const ADDRESSABLE_KINDS = new Set(["card", "article", "project-item"]);

/** 插件可寻址的正文：卡片、文章、项目文档，或任一插件实体的正文（与 plugin-data:content 一致） */
function isAddressable(db: Database.Database, contentId: number): boolean {
  if (db.prepare("SELECT 1 FROM plugin_entities WHERE content_id = ?").get(contentId)) return true;
  return (EntitySearchTable.locateAll(db, [contentId]).get(contentId) ?? []).some(ref =>
    ADDRESSABLE_KINDS.has(ref.kind)
  );
}

/** copyOf 读取来源的当前正文（有编辑会话时取会话内容）并深拷贝，不核对来源读取权限 */
function copyContent(
  db: Database.Database,
  source: { contentId: number; createdAt: number }
): Descendant[] {
  const exists = db
    .prepare("SELECT 1 FROM contents WHERE id = ? AND create_time = ?")
    .get(source.contentId, source.createdAt);
  const content =
    exists && isAddressable(db, source.contentId)
      ? ContentTable.getContentById(db, source.contentId)
      : null;
  if (!content) throw new Error("要复制的正文不存在");
  return structuredClone(content.content);
}

/**
 * shareOf 的来源：必须是这个插件自己的内容的正文（未被孤儿回收）。返回正文 ID，
 * 调用方让新内容引用同一份正文并增加引用计数。
 */
export function sharedContentId(
  db: Database.Database,
  pluginId: string,
  source: { contentId: number; createdAt: number }
): number {
  const owned = db
    .prepare(
      `SELECT 1 FROM plugin_entities e JOIN contents c ON c.id = e.content_id
       WHERE e.plugin_id = ? AND e.content_id = ? AND e.orphaned_time IS NULL AND c.create_time = ?`
    )
    .get(pluginId, source.contentId, source.createdAt);
  if (!owned) throw new Error("只能共用本插件内容的正文");
  return source.contentId;
}

/**
 * 插件正文输入解析为节点：Markdown 经内容转换，nodes 复核结构后原样使用，copyOf 复制来源正文；
 * shareOf 不产生节点，由新建卡片、文章、项目文档的入口单独处理。
 * 结果为空时返回 fallback 的副本；Markdown 转换是异步的，调用方返回后须重新确认数据库仍有效。
 */
export async function resolvePluginContent(
  db: Database.Database,
  source: PluginContentSource | undefined,
  fallback: readonly Descendant[]
): Promise<Descendant[]> {
  let nodes: Descendant[] = [];
  if (source && "markdown" in source) {
    if (source.markdown.trim()) nodes = await parseMarkdownNodes(source.markdown);
  } else if (source && "nodes" in source) {
    assertContentNodes(source.nodes);
    nodes = structuredClone(source.nodes);
  } else if (source && "copyOf" in source) nodes = copyContent(db, source.copyOf);
  else if (source && "shareOf" in source)
    throw new Error("shareOf 只能用于新建卡片、文章、项目文档与插入到项目");
  else if (source) throw new Error("正文输入无效");
  return nodes.length ? nodes : structuredClone(fallback as Descendant[]);
}
