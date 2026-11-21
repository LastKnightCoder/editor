import { createArticle, deleteArticle } from "@/commands/article";
import { createScopedCard, deleteScopedCard } from "@/commands/card";
import { mutateProjectDocument } from "@/commands/project";
import { DEFAULT_CARD_CONTENT } from "@/constants/card";
import { queryClient } from "@/queryClient";
import { bindDatabaseCommands } from "@/services/command-context";
import useSettingStore from "@/stores/useSettingStore";
import { mergeCardIntoCache, removeCardFromCache } from "@/features/cards/cache";
import type { ToolDefinition, ToolExecutionContext, ToolJsonSchema } from "@/types/tool";
import { getContentLength } from "@/utils/helper";
import type { MCPProviderDefinition } from "./types";

type Args = Record<string, unknown>;
const writeCommands = {
  createScopedCard,
  deleteScopedCard,
  createArticle,
  deleteArticle,
  mutateProjectDocument,
};
const positiveId = { type: "integer", minimum: 1 };
const parentId = { type: "integer", minimum: 0, description: "父文档 ID，项目根目录填 0。" };
const title = { type: "string", description: "标题" };
const markdown = { type: "string", description: "Markdown 正文，省略时创建空白正文。" };
const tags = { type: "array", items: { type: "string", minLength: 1 } };

function activeDatabase(name: string) {
  const active = useSettingStore.getState().setting.database.active;
  return active.replace(/\.db$/, "") === name.replace(/\.db$/, "") ? active : undefined;
}

function integer(args: Args, key: string, minimum = 1) {
  const value = args[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum)
    throw new Error(`${key} 必须是大于等于 ${minimum} 的整数`);
  return value;
}

function stringArg(args: Args, key: string, required = false): string {
  const value = args[key];
  if (!required && value === undefined) return "";
  if (typeof value !== "string" || (required && !value.trim()))
    throw new Error(`${key} 必须是有效文本`);
  return value;
}

function readTags(value: unknown): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    !value.every((tag): tag is string => typeof tag === "string" && !!tag.trim())
  )
    throw new Error("tags 必须是非空标签名称的数组");
  return [...new Set(value.map(tag => tag.trim()))];
}

async function readBody(args: Args) {
  const value = stringArg(args, "markdown");
  if (!value) return { content: DEFAULT_CARD_CONTENT, count: 0 };
  const { prepareContentMarkdown } = await import("@/services/editorKit");
  const parsed = await (await prepareContentMarkdown({})).importDocument(value);
  return { ...parsed, count: getContentLength(parsed.content) };
}

function writeTool(
  name: string,
  displayName: string,
  description: string,
  properties: ToolJsonSchema["properties"],
  required: string[],
  refreshKeys: string[],
  write: (args: Args, commands: typeof writeCommands, databaseName: string) => Promise<object>
): ToolDefinition {
  return {
    name,
    displayName,
    description,
    risk: "write",
    parameters: { type: "object", properties, required, additionalProperties: false },
    async executor(args, context?: ToolExecutionContext) {
      if (!context?.databaseName) throw new Error("工具缺少数据库身份，请重新发起操作");
      const { databaseName } = context;
      const result = await write(args, bindDatabaseCommands(writeCommands, context), databaseName);
      if (activeDatabase(databaseName)) {
        for (const key of refreshKeys) void queryClient.invalidateQueries({ queryKey: [key] });
      }
      return { content: JSON.stringify({ success: true, ...result }) };
    },
  };
}

export function entityWriteTools(kind: "card" | "article"): ToolDefinition[] {
  const isCard = kind === "card";
  const label = isCard ? "卡片" : "文章";
  const idKey = `${kind}Id`;
  const refreshKeys = isCard ? [] : ["articles"];
  return [
    writeTool(
      `create_${kind}`,
      `新建${label}`,
      `以 Markdown 正文和可选标签新建${label}，返回实体 ID 和 contentId。`,
      { markdown, tags, ...(isCard ? {} : { title }) },
      [],
      refreshKeys,
      async (args, commands, databaseName) => {
        const fields = { ...(await readBody(args)), tags: readTags(args.tags), isTop: false };
        if (isCard) {
          const card = await commands.createScopedCard(databaseName, fields);
          mergeCardIntoCache(
            queryClient,
            activeDatabase(databaseName) ?? databaseName,
            card,
            "upsert"
          );
          return { cardId: card.id, contentId: card.contentId };
        }
        const entity = await commands.createArticle({
          ...fields,
          title: stringArg(args, "title"),
          author: "",
          links: [],
          bannerBg: "",
          isDelete: false,
        });
        return { [idKey]: entity.id, contentId: entity.contentId };
      }
    ),
    writeTool(
      `delete_${kind}`,
      `删除${label}`,
      `按${label}实体 ID 删除${label}。可用 search_knowledge 查找实体 ID。共用正文的其他实体保留。`,
      { [idKey]: positiveId },
      [idKey],
      [...refreshKeys, "projects"],
      async (args, commands, databaseName) => {
        const id = integer(args, idKey);
        const changed = isCard
          ? await commands.deleteScopedCard(databaseName, id)
          : await commands.deleteArticle(id);
        if (!changed) throw new Error(`${label}不存在或已删除`);
        if (isCard)
          removeCardFromCache(queryClient, activeDatabase(databaseName) ?? databaseName, id);
        return { [idKey]: id, deleted: true };
      }
    ),
  ];
}

const positionFields = { projectId: positiveId, parentId };
function readPosition(args: Args) {
  return { projectId: integer(args, "projectId"), parentId: integer(args, "parentId", 0) };
}

export const projectDocumentToolsProvider: MCPProviderDefinition = {
  id: "project-document-tools",
  name: "项目文档工具",
  description: "新建、关联、移除和移动项目目录中的文档。",
  defaultEnabled: true,
  tools: () => [
    writeTool(
      "create_project_document",
      "新建项目文档",
      "在指定项目根目录或父文档末尾新建文档。共享父文档的所有挂载都会显示该文档。",
      { ...positionFields, title, markdown, tags },
      ["projectId", "title"],
      ["projects"],
      async (args, commands) =>
        commands.mutateProjectDocument({
          action: "create",
          position: readPosition({ parentId: 0, ...args }),
          item: {
            title: stringArg(args, "title", true),
            tags: readTags(args.tags),
            ...(await readBody(args)),
          },
        })
    ),
    writeTool(
      "link_to_project",
      "关联到项目",
      "把已有卡片、文章或项目文档添加到指定目录末尾，保留原位置。卡片和文章共用原正文，项目文档连同子目录共享。同一目录重复关联返回已有 documentId 和 changed=false。解除关联可按该位置调用 delete_project_document。",
      {
        ...positionFields,
        sourceType: { type: "string", enum: ["card", "article", "document"] },
        sourceId: {
          ...positiveId,
          description:
            "来源实体 ID。document 使用项目文档 ID，卡片和文章分别使用 cardId、articleId。",
        },
      },
      ["projectId", "sourceType", "sourceId"],
      ["projects"],
      async (args, commands) => {
        const { sourceType } = args;
        if (sourceType !== "card" && sourceType !== "article" && sourceType !== "document")
          throw new Error("sourceType 必须是 card、article 或 document");
        return commands.mutateProjectDocument({
          action: "link",
          position: readPosition({ parentId: 0, ...args }),
          sourceType,
          sourceId: integer(args, "sourceId"),
        });
      }
    ),
    writeTool(
      "delete_project_document",
      "按位置删除项目文档",
      "移除指定目录中的文档。共享父文档的所有挂载同步变化。最后一处挂载移除后，清理失去挂载的子树。stillMounted 表示此文档是否还有挂载。",
      { ...positionFields, documentId: positiveId },
      ["projectId", "parentId", "documentId"],
      ["projects"],
      async (args, commands) =>
        commands.mutateProjectDocument({
          action: "remove",
          position: readPosition(args),
          documentId: integer(args, "documentId"),
        })
    ),
    writeTool(
      "move_project_document",
      "移动项目文档",
      "在同一知识库内移动或重排指定挂载，可跨项目。共享父文档的子列表同步变化。index 是移动后的零基序号，省略时放在末尾。目录和挂载可用 sql_query 核对。",
      {
        ...positionFields,
        documentId: positiveId,
        targetProjectId: positiveId,
        targetParentId: parentId,
        index: { type: "integer", minimum: 0 },
      },
      ["projectId", "parentId", "documentId", "targetProjectId", "targetParentId"],
      ["projects"],
      async (args, commands) =>
        commands.mutateProjectDocument({
          action: "move",
          position: readPosition(args),
          documentId: integer(args, "documentId"),
          target: {
            projectId: integer(args, "targetProjectId"),
            parentId: integer(args, "targetParentId", 0),
          },
          index: args.index === undefined ? undefined : integer(args, "index", 0),
        })
    ),
  ],
};
