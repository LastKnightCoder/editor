import { addContentLink, removeContentLink } from "@/commands/content-link";
import { ENTITY_REF_KINDS, normalizeEntityRefKind, type EntityRef } from "@/entity/ref";
import { bindDatabaseCommands } from "@/services/command-context";
import type { ToolDefinition, ToolParameterSchema } from "@/types/tool";
import type { MCPProviderDefinition } from "./types";

const entityRefSchema: ToolParameterSchema = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: [...ENTITY_REF_KINDS],
      description: "内容实体类型：卡片、文章、项目文档、日记片段或插件内容。",
    },
    id: {
      type: "integer",
      minimum: 1,
      description: "对应类型的实体 ID，不是正文 contentId；日记使用片段 ID。",
    },
  },
  required: ["kind", "id"],
  additionalProperties: false,
};

function parseEntityRef(value: unknown, label: string): EntityRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须包含内容实体的 kind 与 id`);
  }
  const input = value as Record<string, unknown>;
  const kind = normalizeEntityRefKind(input.kind);
  if (!kind || !ENTITY_REF_KINDS.includes(kind)) {
    throw new Error(`${label} 的内容实体类型无效`);
  }
  if (typeof input.id !== "number" || !Number.isSafeInteger(input.id) || input.id <= 0) {
    throw new Error(`${label} 的 id 必须是正整数实体 ID，不能使用 contentId`);
  }
  return { kind, id: input.id };
}

export const contentLinkToolsProvider: MCPProviderDefinition = {
  id: "content-link-tools",
  name: "内容连接工具",
  description: "直接添加或解除内容之间的双向显式连接。",
  defaultEnabled: true,
  tools: (): ToolDefinition[] =>
    [
      {
        name: "add_content_link",
        displayName: "添加内容连接",
        description:
          "在两份内容之间添加双向显式连接。支持卡片、文章、项目文档、日记片段和插件内容互连。" +
          "from/to 均传 {kind, id}，可由 search_knowledge 结果的 type/id 取得；id 不是正文 contentId。" +
          "连接绑定各自的正文，共用正文的身份共享连接。返回 changed 表示是否新增；已连接或两端共用同一正文时为 false。",
        command: addContentLink,
      },
      {
        name: "remove_content_link",
        displayName: "删除内容连接",
        description:
          "解除两份内容之间的双向显式连接，from/to 的顺序不影响结果。" +
          "from/to 均传 {kind, id}，类型支持 card、article、project-item、diary-moment、plugin-entity，id 不是正文 contentId。" +
          "返回 changed 表示是否删除；连接不存在、端点不存在或没有正文、两端共用同一正文时为 false。" +
          "只解除显式连接，正文里的内联引用和外部超链接保持原样。",
        command: removeContentLink,
      },
    ].map(({ name, displayName, description, command }) => ({
      name,
      displayName,
      description,
      risk: "write",
      parameters: {
        type: "object",
        properties: {
          from: { ...entityRefSchema, description: "连接起点的内容实体。" },
          to: { ...entityRefSchema, description: "连接目标的内容实体。" },
        },
        required: ["from", "to"],
        additionalProperties: false,
      },
      executor: async (args, context) => {
        const from = parseEntityRef(args.from, "from");
        const to = parseEntityRef(args.to, "to");
        if (!context?.databaseName) throw new Error("工具缺少数据库身份，请重新发起操作");
        const commands = bindDatabaseCommands({ mutate: command }, context);
        const changed = await commands.mutate(from, to);
        return { content: JSON.stringify({ success: true, changed, from, to }) };
      },
    })),
};
