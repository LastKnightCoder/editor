import type { Descendant } from "slate";

/**
 * 整体导出的作用范围：某个项目
 */
export interface BatchExportScope {
  type: "project";
  id: number;
  title: string;
}

/**
 * 展平后的待导出章节（按应用内树的 DFS 顺序）
 */
export interface BatchExportChapter {
  id: number;
  title: string;
  depth: number;
  content: Descendant[];
  /**
   * 分组条目：无正文的文件夹条目，自身不产生内容，
   * 仅在存在选中后代时插入，用于保留目录/标题层级
   */
  isGroup?: boolean;
}

/**
 * 整体导出规则：分页 / 标题注入（可组合）
 */
export interface BatchExportRule {
  /** 每个文档（条目）分页 */
  pageBreak: boolean;
  /** 把文档标题作为标题插入正文 */
  asHeading: boolean;
  /** 根级条目的标题层级，子级依次 +1（封顶 H6） */
  headingLevel: 1 | 2 | 3;
}

/**
 * 按 database 名称 + 作用范围记忆的整体导出设置
 */
export interface BatchExportSettings {
  /** 被排除的条目 id（默认全选，记录排除项） */
  excludedIds: number[];
  formats: {
    pdf: boolean;
    epub: boolean;
    /** 合并为一个大 Markdown 文件 */
    markdown: boolean;
    /** 按目录层级导出 ZIP，每个条目一个 Markdown 文件 */
    markdownZip: boolean;
  };
  rule: BatchExportRule;
  /** PDF 导出的目录相关设置 */
  pdf?: {
    /** 生成书签大纲（阅读器侧边栏导航） */
    outline: boolean;
    /** 在正文开头插入目录页（依赖 rule.asHeading） */
    tocPage: boolean;
  };
  epubMeta: {
    author?: string;
    language?: string;
  };
}
