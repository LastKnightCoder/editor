import type { Descendant, Element } from "slate";

import type { MarkdownSerializer } from "./markdownSerializerRegistry.ts";

/** 业务 directive 解析器：键为 directive 名，返回 null 视为丢弃该节点 */
export type CustomDirectiveHandler = (
  attributes: Record<string, string | undefined>
) => Descendant | null;

/** mdast 节点（remark 解析产物）的最小形状，importNode 认领时只允许读这些字段 */
export interface MarkdownImportNode {
  type: string;
  value?: string;
  url?: string;
  alt?: string;
  lang?: string;
  meta?: string;
  depth?: 1 | 2 | 3 | 4 | 5 | 6;
  ordered?: boolean;
  identifier?: string;
  htmlType?: "block" | "inline";
  attributes?: Record<string, string | undefined>;
  children?: MarkdownImportNode[];
  [key: string]: unknown;
}

/** importNode 的认领上下文：块级 / 行内判断与脚注取值用 */
export interface MarkdownImportContext {
  parent: MarkdownImportNode | null;
  siblings: readonly MarkdownImportNode[];
  /** 脚注定义正文（footnoteReference 认领方用） */
  getFootnote: (identifier: string) => string;
}

/**
 * 一个元素类型的 Markdown 编解码（01 §8.2）。框架不自带任何元素类型：
 * 各扩展在自己的 markdown.ts（纯函数文件）里声明 codec，宿主把 codec 列表
 * 合成一次交给 createMarkdownProcessor，kit 与 Electron 主进程共用。
 */
export interface MarkdownCodec {
  /** 元素 type */
  type: string;
  /** 省略时归当前节点契约；历史版本只用于明确的导出分发。 */
  dataVersion?: number;
  /** 导入：按 directive 名解析（container / leaf / text 三种都查），优先于内置分支 */
  directives?: Record<string, CustomDirectiveHandler>;
  /**
   * 导入：声明式围栏认领——```lang 的代码围栏映射为 { type, [property]: 源码 }。
   * 语言小写匹配；同一语言被两个 codec 认领时建处理器直接报错
   */
  fence?: {
    language: string | readonly string[];
    /** 源码落进元素的字段名，默认 "content"，由领域声明覆盖。 */
    property?: string;
  };
  /**
   * 导入：通用 mdast 认领。返回元素（children 留空，由框架回填）或 null（不认领）。
   * 按声明顺序遍历、首个认领生效——宽认领（如 code-block 认领所有 code 节点）
   * 必须排在窄认领之后，由聚合列表的顺序保证
   */
  importNode?: (node: MarkdownImportNode, context: MarkdownImportContext) => Descendant | null;
  /** 导出 */
  serializer?: Omit<MarkdownSerializer, "type">;
  /** void 元素：位置映射只记元素级范围（导入、导出两个方向都生效） */
  isVoid?: boolean;
  /**
   * 行内包裹：导入时该 text directive 的子文本按 directive 整体范围记前后缀（位置映射用），
   * 值为 directive 名
   */
  inlineWrapperDirective?: string;
  /** 配对 HTML 标签的行内认领；框架匹配同名嵌套标签并回填 children，领域负责创建节点。 */
  inlineHtmlWrapper?: {
    tag: string;
    create: (opening: MarkdownImportNode) => Element;
  };
  /** 导入后规范化：返回替换本元素的序列（空数组 = 删除）或 null（保持原样） */
  normalize?: (
    element: any,
    context: {
      parent: Descendant | null;
      previousSibling: Descendant | null;
      nextSibling: Descendant | null;
      /** 按领域声明把块级子元素降级为行内形态，无声明则原样返回。 */
      demote: (child: Descendant) => Descendant;
    }
  ) => Descendant[] | null;
  /** 按目标类型贡献规范化，先于该类型自身 normalize；按 codec 顺序首个非 null 替换生效。 */
  normalizeFor?: Readonly<Record<string, NonNullable<MarkdownCodec["normalize"]>>>;
  /** 段落内行内形态的构造（导入规范化时框架经 ctx.demote 调用） */
  inlineForm?: (element: any) => Descendant;
  /**
   * 导入：从 code 节点（围栏或缩进代码块）认领的 void 元素，把源码区间记为
   * 该属性的属性级位置映射（如 code-block 的 "code"）；缺省只有元素级映射
   */
  fenceSourceProperty?: string;
  /** 导出：子块级元素之间的接续符，默认 "\n\n"；列表与表格声明 "\n" */
  childSeparator?: "\n" | "\n\n";
}
