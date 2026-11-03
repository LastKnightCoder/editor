import { addContentLinkByContentId, removeContentLinkByContentId } from "@/commands/content-link";
import { bindDatabaseCommands } from "@/services/command-context";
import type { ToolDefinition } from "@/types/tool";
import type { MCPProviderDefinition } from "./types";

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
          "在两份内容之间添加双向显式连接。fromContentId 与 toContentId 均是 contents.id，可从 search_knowledge 结果的 contentId 取得。" +
          "连接直接绑定两份正文；返回 changed 表示是否新增，重复连接或连接同一正文时为 false。",
        command: addContentLinkByContentId,
      },
      {
        name: "remove_content_link",
        displayName: "删除内容连接",
        description:
          "按 contents.id 解除两份正文之间的双向显式连接。fromContentId 与 toContentId 可从 search_knowledge 结果取得，顺序不影响结果。" +
          "返回 changed 表示是否删除；连接不存在或正文不存在时为 false。" +
          "只解除显式连接，正文里的内联引用和外部超链接保持原样。",
        command: removeContentLinkByContentId,
      },
    ].map(({ name, displayName, description, command }) => ({
      name,
      displayName,
      description,
      risk: "write",
      parameters: {
        type: "object",
        properties: {
          fromContentId: {
            type: "integer",
            minimum: 1,
            description: "连接起点在 contents 表中的 ID。",
          },
          toContentId: {
            type: "integer",
            minimum: 1,
            description: "连接目标在 contents 表中的 ID。",
          },
        },
        required: ["fromContentId", "toContentId"],
        additionalProperties: false,
      },
      executor: async (args, context) => {
        const fromContentId = args.fromContentId;
        const toContentId = args.toContentId;
        if (
          typeof fromContentId !== "number" ||
          !Number.isSafeInteger(fromContentId) ||
          fromContentId <= 0
        ) {
          throw new Error("fromContentId 必须是正整数");
        }
        if (
          typeof toContentId !== "number" ||
          !Number.isSafeInteger(toContentId) ||
          toContentId <= 0
        ) {
          throw new Error("toContentId 必须是正整数");
        }
        if (!context?.databaseName) throw new Error("工具缺少数据库身份，请重新发起操作");
        const commands = bindDatabaseCommands({ mutate: command }, context);
        const changed = await commands.mutate(fromContentId, toContentId);
        return {
          content: JSON.stringify({ success: true, changed, fromContentId, toContentId }),
        };
      },
    })),
};
