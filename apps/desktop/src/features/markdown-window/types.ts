import type { Descendant } from "slate";
import type { OutlineHeader } from "@/components/ContentOutline";

/** 打开中的文件视图对页面暴露的句柄：切换 / 改名 / 删除 / 关窗前先落盘 */
export interface FileViewHandle {
  flush(): Promise<void>;
}

/** Markdown 视图额外能力（源码切换、导出取数） */
export interface MarkdownViewHandle extends FileViewHandle {
  toggleSource(): void;
  getMarkdown(): string;
  getContent(): Descendant[];
}

/** 视图上报给页面的状态（面包屑 / 文件树未保存点、⋯ 菜单勾选态、侧栏大纲） */
export interface FileViewStatus {
  dirty: boolean;
  sourceMode?: boolean;
  outline?: {
    headers: OutlineHeader[];
    scrollEl: HTMLElement | null;
    resolveAnchor: (header: OutlineHeader, index: number) => HTMLElement | null;
  };
}

export type SaveState = "saved" | "dirty" | "saving" | "error";
