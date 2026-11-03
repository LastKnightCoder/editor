import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from "@/types/tool";

interface EntityMetadata {
  id: number;
  contentId: number;
  isTop: boolean;
  tags: string[];
  update_time: number;
}

interface EntityMetadataPatch {
  isTop?: boolean;
  tags?: string[];
}

export function createEntityMetadataTools(
  kind: "card" | "article",
  update: (
    id: number,
    patch: EntityMetadataPatch,
    context: ToolExecutionContext & { databaseName: string }
  ) => Promise<EntityMetadata>
): ToolDefinition[] {
  const label = kind === "card" ? "卡片" : "文章";
  const idKey = `${kind}Id`;
  const idDescription = `${label} ID，不是 contentId。`;
  const execute = async (
    args: Record<string, unknown>,
    patch: EntityMetadataPatch,
    context?: ToolExecutionContext
  ): Promise<ToolExecutionResult> => {
    const id = args[idKey];
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`${idKey} 必须是正整数${label} ID，不能使用 contentId`);
    }
    if (!context?.databaseName) throw new Error("工具缺少数据库身份，请重新发起操作");
    const entity = await update(id, patch, { ...context, databaseName: context.databaseName });
    return {
      content: JSON.stringify({
        success: true,
        [kind]: {
          id: entity.id,
          contentId: entity.contentId,
          isTop: Boolean(entity.isTop),
          tags: entity.tags,
          updateTime: entity.update_time,
        },
      }),
    };
  };
  return [
    {
      name: `set_${kind}_pinned`,
      displayName: `设置${label}置顶`,
      risk: "write",
      description:
        `设置${label}的置顶状态。pinned 为 true 表示置顶，为 false 表示取消置顶；重复设置不会反转状态。` +
        `${idKey} 是${label}实体 ID，不是正文 contentId，可从 search_knowledge 的 ${kind} 类型结果中取得 id。保留正文与标签。`,
      parameters: {
        type: "object",
        properties: {
          [idKey]: { type: "integer", minimum: 1, description: idDescription },
          pinned: { type: "boolean", description: "是否置顶：true 置顶，false 取消置顶。" },
        },
        required: [idKey, "pinned"],
        additionalProperties: false,
      },
      executor: (args, context) => {
        if (typeof args.pinned !== "boolean") throw new Error("pinned 必须是布尔值");
        return execute(args, { isTop: args.pinned }, context);
      },
    },
    {
      name: `update_${kind}_tags`,
      displayName: `修改${label}标签`,
      risk: "write",
      description:
        `整体替换${label}的 tags 标签列表，传 [] 清空标签；自动去除标签首尾空白和重复项，不接受空白标签。` +
        `仅增删部分标签时，先用只读 sql_query 读取该${label}当前 tags，再提交完整列表以保留其他标签。` +
        `标签使用名称字符串，层级标签保留斜杠。${idKey} 是${label}实体 ID，不是正文 contentId。保留正文与置顶状态。`,
      parameters: {
        type: "object",
        properties: {
          [idKey]: { type: "integer", minimum: 1, description: idDescription },
          tags: {
            type: "array",
            items: { type: "string", minLength: 1 },
            description: "更新后的完整标签名称列表，传 [] 清空。",
          },
        },
        required: [idKey, "tags"],
        additionalProperties: false,
      },
      executor: (args, context) => {
        if (!Array.isArray(args.tags)) throw new Error("tags 必须是标签名称字符串数组");
        const tags = args.tags.map(tag => {
          if (typeof tag !== "string" || !tag.trim()) {
            throw new Error("tags 中的标签必须是非空字符串");
          }
          return tag.trim();
        });
        return execute(args, { tags: [...new Set(tags)] }, context);
      },
    },
  ];
}
