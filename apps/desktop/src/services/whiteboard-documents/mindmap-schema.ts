import type { ToolParameterSchema, ToolJsonSchema } from "@/types/tool";
import { mindCapabilities, mindFields } from "../../../shared/whiteboard-mindmap";

const string = (description?: string): ToolParameterSchema => ({
  type: "string",
  ...(description ? { description } : {}),
});
const bool: ToolParameterSchema = { type: "boolean" };
const integer = (minimum: number, maximum: number): ToolParameterSchema => ({
  type: "integer",
  minimum,
  maximum,
});
const choice = (values: readonly string[], description?: string): ToolParameterSchema => ({
  type: "string",
  enum: [...values],
  ...(description ? { description } : {}),
});
const object = (
  properties: Record<string, ToolParameterSchema>,
  required: string[] = []
): ToolJsonSchema => ({ type: "object", properties, required, additionalProperties: false });
const point = object({ x: { type: "number" }, y: { type: "number" } }, ["x", "y"]);
const ids: ToolParameterSchema = { type: "array", items: string(), minItems: 1, maxItems: 256 };
const content: ToolParameterSchema = {
  type: "array",
  description:
    "完整正文节点数组。读取结果的 content 中包含 collabId；新正文支持 paragraph、link 与文字叶节点。",
  items: { type: "object", additionalProperties: true },
  minItems: 1,
};
const placement = {
  parentId: string("目标父节点；省略且没有兄弟锚点时为当前页独立导图，也可指定原生画框 ID"),
  beforeId: string("插入到此同级节点之前；不能与 afterId 同时使用"),
  afterId: string("插入到此同级节点之后"),
  side: choice(["left", "right"], "仅双向布局的一级分支可选左右；更深层继承父分支"),
  at: { ...point, description: "独立导图根节点坐标；子节点由原生布局定位，不填坐标" },
};
const variant = (
  kind: string,
  description: string,
  properties: Record<string, ToolParameterSchema>,
  required: string[] = []
) => ({
  ...object(
    {
      kind: choice([kind]),
      id: string("创建时用唯一临时名，修改时用读取到的稳定 ID"),
      ...properties,
    },
    ["kind", "id", ...required]
  ),
  description,
});
const range = {
  action: choice(["create", "update", "remove"]),
  nodeIds: { ...ids, description: "同父、同侧、连续相邻的普通节点；创建时必填" },
};

export const mindmapOperationSchema: ToolParameterSchema = {
  type: "object",
  anyOf: [
    variant(
      "insert",
      "新建原生导图或插入节点。text/content/markdown/sourceId/transfer 五选一。新建独立导图必须有 at。可引用本批前面创建的临时 ID。",
      {
        ...placement,
        text: string(),
        content,
        markdown: string("整段 Markdown 大纲，作为子节点或独立导图导入；不截断"),
        sourceId: string("将独立原生文本框转换成导图节点，成功后移除原文本框"),
        transfer: {
          type: "object",
          description: "read_whiteboard_mindmap format=transfer 返回的完整 transfer 对象",
          additionalProperties: true,
        },
      }
    ),
    variant(
      "edit_text",
      "修改正文。text 默认替换唯一文字块并保留未改变部分格式；offset/remove 做局部编辑。复杂正文指定 blockId；content/markdown 明确整体替换正文。",
      {
        text: string(),
        content,
        markdown: string(),
        blockId: string("读取 content 内的文字块 collabId；不是导图节点 ID"),
        offset: integer(0, 8192),
        remove: integer(0, 8192),
        length: {
          ...integer(0, 8192),
          description: "marks 的格式范围长度；不删除文字。offset/remove/length 使用 UTF-16 偏移。",
        },
        marks: {
          type: "object",
          description:
            "局部文字格式；bold/italic/underline/strikethrough/code 用布尔或 null，color/backgroundColor/fontFamily 用字符串或 null，fontSize 用数值；null 移除格式",
          additionalProperties: true,
        },
        url: string("修改已有 link 正文元素的 URL，blockId 指向 link 的 collabId"),
      }
    ),
    variant(
      "move",
      "移动原节点，保持身份和子树。parentId/beforeId/afterId 表示换父节点、调整顺序或升降级；均省略表示拆成独立导图。at 只用于独立导图。",
      placement
    ),
    variant(
      "copy",
      "复制完整分支，重分配节点、外框及正文身份，保留格式和笔记关联；默认放在原分支后。复制为独立导图须提供 at。独立联系线不自动复制。",
      { sourceId: string(), ...placement },
      ["sourceId"]
    ),
    variant(
      "remove",
      "删除整个目标分支或整图，自动收缩概要和外框，并清理连到被删节点的联系线。",
      {}
    ),
    variant(
      "fold",
      "显式展开或收起，不使用 toggle。scope=node/subtree 时必填 folded；scope=depth 时必填 depth，按目标子树相对层级展开。",
      {
        folded: bool,
        scope: choice(["node", "subtree", "depth"]),
        side: choice(["left", "right"]),
        depth: integer(1, 64),
      }
    ),
    variant(
      "configure",
      "调整导图布局、主题或节点样式。layout/themeId/themeStyle/theme/sketch 作用于所在导图；background/border/textColor 作用于指定节点；reset 恢复继承。saveAsDefault=true 保存为本机新导图默认，必须单独一批提交，只有用户明确要求时使用。",
      {
        layout: choice(mindCapabilities.layouts),
        themeId: choice(mindCapabilities.palettes.map(p => p.id)),
        themeStyle: choice(mindCapabilities.themeStyles),
        theme: choice(["light", "dark"]),
        background: string(),
        border: string(),
        textColor: string(),
        sketch: object({
          mode: choice(["normal", "sketch"]),
          level: choice(["neat", "natural", "loose"]),
          seed: integer(0, 2147483647),
        }),
        reset: {
          type: "array",
          items: choice([
            "layout",
            "themeId",
            "themeStyle",
            "theme",
            "background",
            "border",
            "textColor",
            "sketch",
          ]),
          minItems: 1,
        },
        saveAsDefault: bool,
      }
    ),
    variant(
      "summary",
      "创建、更新或删除概要。创建必须给 nodeIds，id 是新临时名；更新或删除用已有概要节点 ID。已有同范围概要时返回其 ID，不覆盖正文。",
      { ...range, text: string("概要正文") }
    ),
    variant(
      "boundary",
      "创建、更新或删除外框。创建必须给 nodeIds，id 是新临时名；更新或删除用读取到的外框 ID。",
      { ...range, title: string("外框标题，空串清除标题") }
    ),
    variant(
      "relation",
      "创建或编辑原生联系线。create 必填 from/to；update 可改两端、标签、样式或 reverse=true；remove 删除联系线。联系线不表示父子层级。",
      {
        action: choice(["create", "update", "remove"]),
        from: string(),
        to: string(),
        text: string("联系线标签"),
        reverse: bool,
        style: object({
          lineType: choice(["straight", "curve", "orthogonal"]),
          lineWidth: { type: "number", exclusiveMinimum: 0, maximum: 32 },
          themeColorId: string(),
          dashed: bool,
          animated: bool,
          animationSpeed: integer(1, 10),
          sourceMarker: choice([
            "none",
            "arrow",
            "open-arrow",
            "closed-arrow",
            "diamond",
            "circle",
          ]),
          targetMarker: choice([
            "none",
            "arrow",
            "open-arrow",
            "closed-arrow",
            "diamond",
            "circle",
          ]),
          midPoint: point,
        }),
      }
    ),
    variant(
      "note",
      "关联或替换笔记。提供当前资料库的 contentId，或稳定 entity 引用，二选一；卡片、文章等实体会解析为原生正文关联；entity=null 解除关联，不删除原笔记。新建和编辑笔记正文用已有笔记工具。",
      {
        contentId: integer(1, Number.MAX_SAFE_INTEGER),
        entity: {
          type: ["object", "null"],
          properties: {
            sourceId: string(),
            kind: choice(["content", "card", "article", "project-item", "diary-moment"]),
            entityId: string(),
          },
          required: ["sourceId", "kind", "entityId"],
          additionalProperties: false,
        },
        title: string(),
      }
    ),
  ],
};

export const mindmapReadParameters = object(
  {
    target: string(),
    nodeId: string("任意导图节点 ID；省略时列出当前页导图，选中单个导图节点时默认读取该子树"),
    depth: integer(0, 64),
    limit: integer(1, 64),
    offset: integer(0, 5000),
    revision: integer(0, Number.MAX_SAFE_INTEGER),
    includeContent: bool,
    format: choice(
      ["tree", "markdown", "transfer", "image"],
      "默认 tree。有损大纲用 markdown；完整可编辑往返使用 transfer，不手写契约；image 打开原生图片导出窗口，用户确认导出后才生成文件"
    ),
    section: choice(
      ["nodes", "relations", "boundaries"],
      "默认 nodes；联系线或外框较多时用对应 section 分页读取"
    ),
    openNote: bool,
  },
  ["target"]
);

export const mindmapWriteParameters = object(
  {
    target: string(),
    requestId: string(
      "稳定且唯一的请求 ID。同一原请求重试保持所有参数不变；修正失败操作后使用新 ID"
    ),
    preconditions: {
      type: "array",
      description:
        "读取工具返回的 preconditions 原样传回，执行层仅校验当前操作依赖的字段；纯新建独立导图可省略",
      maxItems: 512,
      items: object(
        { id: string(), ...Object.fromEntries(mindFields.map(field => [field, string()])) },
        ["id", ...mindFields]
      ),
    },
    operations: { type: "array", items: mindmapOperationSchema, minItems: 1, maxItems: 256 },
  },
  ["target", "requestId", "operations"]
);
