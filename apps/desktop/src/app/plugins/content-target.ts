import type { Descendant } from "slate";
import type { DataEntity } from "@tau/plugins/host";
import { readPluginContent } from "@/commands/plugin-data";
import { locateEntity } from "@/commands/entity";
import { bindDatabaseCommands } from "@/services/command-context";
import type { EntityKind } from "@/types";
import { decodeContentRef } from "./data";

/** ContentRef 指向的正文及其所属实体：组件补全协作来源与编辑身份、动作取标题与内容都用它 */
export interface PluginContentTarget {
  contentId: number;
  /** 引用这份正文的实体类型（权限按任一类型判断） */
  owners: DataEntity[];
  /** 作为协作来源与编辑身份的实体 */
  owner: { entity: DataEntity; id: number; sourceType: "card" | "article" | "project-item" };
  /** 主库中的正文快照；有协作会话时可能落后约 1 秒 */
  nodes: Descendant[];
}

const LOCATE_KINDS: Record<DataEntity, EntityKind> = {
  card: "card",
  article: "article",
  document: "project_item",
};
const SOURCE_TYPES = { card: "card", article: "article", document: "project-item" } as const;

/** 正文不存在、创建时间不符（ID 被复用）或不属于卡片 / 文章 / 项目文档时返回 null */
export async function resolvePluginContentTarget(
  databaseName: string,
  ref: string,
  signal?: AbortSignal
): Promise<PluginContentTarget | null> {
  const decoded = decodeContentRef(ref);
  if (!decoded) return null;
  const commands = bindDatabaseCommands(
    { readPluginContent, locateEntity },
    { databaseName, ...(signal ? { signal } : {}) }
  );
  const record = await commands.readPluginContent(
    databaseName,
    decoded.contentId,
    decoded.createdAt,
    "nodes"
  );
  const entity = record?.owners[0];
  if (!record || !entity) return null;
  const location = await commands.locateEntity({
    contentId: decoded.contentId,
    kind: LOCATE_KINDS[entity],
  });
  if (!location) return null;
  return {
    contentId: decoded.contentId,
    owners: record.owners,
    owner: { entity, id: location.id, sourceType: SOURCE_TYPES[entity] },
    nodes: (record.nodes ?? []) as Descendant[],
  };
}
