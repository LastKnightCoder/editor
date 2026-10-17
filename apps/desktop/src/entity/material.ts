/**
 * 外部材料的地址：摘录（微信读书 / 插件划线）、PDF 标注、剪藏解析文档。纯 TypeScript，主进程与渲染端共用。
 *
 * 与 EntityRef（我的思考：卡片、文章、项目文档、日记）分开：材料没有可共用的正文，不进知识地图、
 * 不挂脉络入口；谱系端点、向量 prefixed_id 的 type、问题材料都用同一组 kind 字符串（KL-031）。
 */

export const MATERIAL_KINDS = ["excerpt", "pdf-annotation", "web-clip"] as const;

export type MaterialKind = (typeof MATERIAL_KINDS)[number];

export interface MaterialRef {
  kind: MaterialKind;
  id: number;
}

export const isMaterialKind = (value: unknown): value is MaterialKind =>
  typeof value === "string" && (MATERIAL_KINDS as readonly string[]).includes(value);

export const materialKey = (ref: MaterialRef): string => `${ref.kind}:${ref.id}`;

/** 打开材料到原处：由主进程按材料解析出来，渲染端 openMaterialTarget 执行 */
export type MaterialOpenTarget =
  /** 摘录：提供方插件已启用时交给它打开，否则用 url 外部打开 */
  | {
      page: "excerpt-provider";
      sourceType: string;
      sourceKey: string;
      externalId: string;
      label: string;
      url: string | null;
    }
  | { page: "pdf-detail"; pdfId: number; annotationId: number }
  | { page: "external-url"; url: string }
  | { page: "project-web-clip"; itemId: number };

/** 材料的展示信息（脉络、搜索、对话引用共用） */
export interface MaterialInfo {
  ref: MaterialRef;
  /** 引文（截断）或剪藏标题 */
  title: string;
  /** 来源：「微信读书 · 《书名》 · 章节」「网页 · 标题」「PDF · 文件名 · 第 3 页」「剪藏」 */
  meta: string;
  /** 引文 + 想法 / 批注的纯文本（搜索摘要、转为卡片用） */
  quote: string;
  note: string;
  /** 源端已删除（摘录软删除）：保留引文，不可打开 */
  deleted: boolean;
  /** 无法打开（已删除、剪藏已脱离网页条目）时为 null */
  open: MaterialOpenTarget | null;
}
