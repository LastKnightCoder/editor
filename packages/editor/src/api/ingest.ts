import type { Editor, Point } from "slate";

/**
 * 内容注入声明（01 §5.4）：drop 与 paste 归并为一条认领式管线（共同形状是 DataTransfer）。
 * 扩展声明自己认领什么（files 的 MIME / text 的谓词），内核负责分桶、隔离与熔断；
 * drop 与 paste 共用同一个 run，经 ctx.source 区分来源。
 */

export interface IngestContext {
  editor: Editor;
  /** 认领到的文件（files 侧）；drop 与 paste 都可能是多个 */
  files?: readonly File[];
  /** 原始剪贴板 / 拖拽数据（text 侧认领与兜底读取用） */
  data: DataTransfer;
  /** 拖放落点（source 为 drop 时有；粘贴跟随当前选区） */
  point?: Point;
  source: "drop" | "paste";
}

export interface IngestFilesRule {
  /** MIME 认领（`image/*` 前缀通配或 `application/pdf` 精确）；完全相同 accept 重复声明建 kit 抛错 */
  accept: string;
  /** 认领到的整批文件一次处理；抛错按贡献扩展熔断 */
  run: (ctx: IngestContext) => void | Promise<void>;
}

export interface IngestTextRule {
  /** 文本侧认领谓词；求值在 markdown 导入之前 */
  when: (data: DataTransfer) => boolean;
  run: (ctx: IngestContext) => void | Promise<void>;
}

export interface ElementIngestSpec {
  files?: IngestFilesRule;
  text?: IngestTextRule;
}

/** 一个扩展的内容注入声明（装配产出的形态）；owner 用于隔离熔断与日志 */
export interface IngestSource {
  readonly owner: string;
  readonly files?: IngestFilesRule;
  readonly text?: IngestTextRule;
}

/** accept 匹配：`*` 全收、`type/*` 前缀、其余精确 */
export const ingestAccepts = (accept: string, mimeType: string): boolean =>
  accept === "*" || accept.endsWith("/*")
    ? mimeType.startsWith(accept.slice(0, -1))
    : accept === mimeType;
