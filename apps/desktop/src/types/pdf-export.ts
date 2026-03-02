/**
 * 代码块分页策略
 */
export type CodeBlockBreakStrategy =
  | "avoid" // 避免分页（可能导致空白）
  | "auto" // 自动分页（所有代码块都允许分页）
  | "smart" // 智能分页（根据行数阈值决定）
  | "adaptive"; // 自适应分页（按页剩余空间 + 代码长度动态决定）

export interface CodeBlockBreakOptions {
  strategy: CodeBlockBreakStrategy;
  /**
   * 智能分页的行数阈值
   * 当 strategy 为 'smart' 时生效
   * 超过此行数的代码块允许分页
   */
  smartThreshold?: number;
}

export interface PdfExportOptions {
  pageSize: "A3" | "A4" | "A5" | "Letter" | "Legal" | "Tabloid";
  landscape: boolean;
  margins: {
    top: number; // mm
    bottom: number;
    left: number;
    right: number;
  };
  printBackground: boolean;
  displayHeaderFooter: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  chapterBreak: boolean; // H1 是否强制换页
  codeBlockBreak: CodeBlockBreakOptions; // 代码块分页策略
}

export interface PdfExportPayload {
  html: string; // 从 htmlSerializerRegistry 生成
  styles: string; // 从 tailwindCssCollector 收集
  metadata: {
    title: string;
    author?: string;
    subject?: string;
    keywords?: string;
  };
  options: PdfExportOptions;
  defaultFileName?: string;
}

export interface PdfExportResult {
  canceled: boolean;
  filePath: string | null;
  warnings: string[];
}
