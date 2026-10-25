import type { Descendant } from "slate";
import type { ContentOwnerEntity } from "@tau/plugins/host";
import { readPluginContent } from "@/commands/plugin-data";
import { locateEntity } from "@/commands/entity";
import { bindDatabaseCommands } from "@/services/command-context";
import type { EntityKind } from "@/types";
import { decodeContentRef } from "@/utils/plugin-content-ref";

/** ContentRef 指向的正文及其所属实体：组件补全协作来源与编辑身份、动作取标题与内容都用它 */
export interface PluginContentTarget {
  contentId: number;
  /** 引用这份正文的实体类型（权限按任一类型判断） */
  owners: ContentOwnerEntity[];
  /** 作为协作来源与编辑身份的实体；只是插件自有内容时为 null */
  owner: {
    entity: ContentOwnerEntity;
    id: number;
    sourceType: "card" | "article" | "project-item";
  } | null;
  /** 是当前插件自有内容的正文时为该实体（读写不需要业务权限） */
  own: { id: number; title: string } | null;
  /** 主库中的正文快照；有协作会话时可能落后约 1 秒 */
  nodes: Descendant[];
  contracts?: import("@tau/db-schema/content-contracts").ContentContractDictionary;
}

const LOCATE_KINDS: Record<ContentOwnerEntity, EntityKind> = {
  card: "card",
  article: "article",
  document: "project_item",
};
const SOURCE_TYPES = { card: "card", article: "article", document: "project-item" } as const;

/** 正文不存在、创建时间不符（ID 被复用），或既不属于卡片 / 文章 / 项目文档、也不是该插件的自有内容时返回 null */
export async function resolvePluginContentTarget(
  databaseName: string,
  pluginId: string,
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
  if (!record) return null;
  const own = record.pluginOwners.find(owner => owner.pluginId === pluginId);
  const entity = record.owners[0];
  const location = entity
    ? await commands.locateEntity({ contentId: decoded.contentId, kind: LOCATE_KINDS[entity] })
    : null;
  if (!location && !own) return null;
  return {
    contentId: decoded.contentId,
    owners: record.owners,
    owner:
      entity && location ? { entity, id: location.id, sourceType: SOURCE_TYPES[entity] } : null,
    own: own ? { id: own.id, title: own.title } : null,
    nodes: (record.nodes ?? []) as Descendant[],
    contracts: record.contracts,
  };
}
