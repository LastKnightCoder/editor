/**
 * Node 原生文档转 Markdown 转换器
 *
 * 基于 @firecrawl/anydoc（Rust 实现，NAPI 绑定，输出 GitHub Flavored Markdown）：
 * - Word（doc/docx/docm）/PPT（ppt/pptx 等）/Excel（xls/xlsx 等）/ODF/RTF/EPUB/PDF/CSV
 * - HTML：turndown
 * - 纯文本/TSV/JSON/XML 等：直接读取（TSV 转 Markdown 表格）
 */

import { promises as fs } from "fs";
import path from "path";
import OpenAI from "openai";
import TurndownService from "turndown";
import { toMarkdown } from "@firecrawl/anydoc";

export interface ConvertFileResult {
  success: boolean;
  textContent: string | null;
  title: string | null;
  filePath: string;
  error: string | null;
}

export interface TranscriptionSegment {
  text: string;
  start: number; // 毫秒
  end: number; // 毫秒
}

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

/** 纯文本类扩展名（直接读取，不做转换；CSV 交给 anydoc） */
const PLAIN_TEXT_EXTENSIONS = [
  ".txt",
  ".md",
  ".markdown",
  ".tsv",
  ".json",
  ".xml",
  ".yml",
  ".yaml",
  ".log",
];

/** anydoc 支持的扩展名（含旧版二进制格式 .doc/.ppt/.xls） */
const ANYDOC_EXTENSIONS = [
  ".doc",
  ".docx",
  ".docm",
  ".ppt",
  ".pps",
  ".pot",
  ".pptx",
  ".pptm",
  ".ppsx",
  ".ppsm",
  ".xls",
  ".xlsx",
  ".xlsm",
  ".xlsb",
  ".odt",
  ".ods",
  ".odp",
  ".rtf",
  ".epub",
  ".pdf",
  ".csv",
];

/** anydoc 错误码（error.code）对应的用户可读提示，保留原始细节便于排查 */
function describeAnydocError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | null)?.code;
  const summary =
    {
      unsupported: "不支持的文件类型",
      needsOcr: "PDF 为扫描版或纯图片页面，无法提取文本",
      malformed: "文档已损坏或格式无效",
      encrypted: "文档已加密，无法解析",
      resourceLimit: "文档过大或嵌套超限，转换中止",
      missingPart: "文档缺少必要内容，无法完整转换",
      io: "读取文档失败",
    }[code ?? ""] ?? detail;
  if (summary === detail || !detail) {
    return summary;
  }
  return `${summary}（${detail}）`;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTitleFromMarkdown(markdown: string, fallback: string): string | null {
  const headingMatch = markdown.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim().slice(0, 100);
  }
  const firstLine = markdown
    .split("\n")
    .map(line => line.trim())
    .find(line => line.length > 0);
  if (firstLine) {
    return firstLine.slice(0, 100);
  }
  return fallback || null;
}

/**
 * 将普通文档转换为 Markdown
 */
export async function convertDocumentToMarkdown(filePath: string): Promise<ConvertFileResult> {
  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath, ext);
  const fail = (error: unknown): ConvertFileResult => ({
    success: false,
    textContent: null,
    title: null,
    filePath,
    error: error instanceof Error ? error.message : String(error),
  });

  try {
    let markdown = "";

    if (ANYDOC_EXTENSIONS.includes(ext)) {
      // anydoc 从文件内容探测格式（无签名的 CSV 以扩展名兜底）
      markdown = await toMarkdown(filePath);
    } else if (PLAIN_TEXT_EXTENSIONS.includes(ext)) {
      const content = await fs.readFile(filePath, "utf-8");
      if (ext === ".tsv") {
        // TSV 转为 Markdown 表格（首行视为表头）
        const lines = content.split(/\r?\n/).filter(line => line.trim());
        if (lines.length > 0) {
          const rows = lines.map(line => line.split("\t"));
          const [header, ...dataRows] = rows;
          const escapeCell = (cell: string) => cell.replace(/\|/g, "\\|");
          markdown = [
            `| ${header.map(escapeCell).join(" | ")} |`,
            `| ${header.map(() => "---").join(" | ")} |`,
            ...dataRows.map(row => `| ${row.map(escapeCell).join(" | ")} |`),
          ].join("\n");
        }
      } else {
        markdown = content;
      }
    } else if (ext === ".html" || ext === ".htm") {
      const html = await fs.readFile(filePath, "utf-8");
      try {
        markdown = turndownService.turndown(html);
      } catch {
        markdown = stripHtmlToText(html);
      }
    } else {
      // 其余类型（如 zip 等）不再支持，避免静默错误
      return fail(`不支持的文件类型: ${ext}`);
    }

    markdown = markdown.trim();
    if (!markdown) {
      return fail("文档内容为空或无法提取文本");
    }

    return {
      success: true,
      textContent: markdown,
      title: extractTitleFromMarkdown(markdown, baseName),
      filePath,
      error: null,
    };
  } catch (error) {
    if (ANYDOC_EXTENSIONS.includes(ext)) {
      return fail(describeAnydocError(error));
    }
    return fail(error);
  }
}

// ==================== LLM 转录优化（原 Python transcription_optimizer） ====================

const OPTIMIZATION_SYSTEM_PROMPT = `## 角色设定
你是一位专业的音视频转录整理专家，擅长将语音识别的原始文本整理成结构清晰、可读性强的 Markdown 文档。

## 任务说明
你将收到一段语音识别的转录文本。你需要将其整理为格式规范的 Markdown 文档。

## 整理原则

1. **段落划分**：根据语义和话题将内容分成合适的段落
2. **标点添加**：添加合适的标点符号使文本自然流畅
3. **清理冗余**：删除无意义的语气词（嗯、啊、那个等）和重复词
4. **修复错误**：修复明显的语音识别错误
5. **格式优化**：可以使用 Markdown 标题、列表等格式增强可读性

## 输出要求

1. 直接输出整理后的 Markdown 文本
2. 不要添加任何解释或说明
3. 保持原文意思，不要改写或润色
4. 如果是中文繁体，转换为简体中文`;

function createTranscriptionLLMClient(
  provider: string,
  apiKey?: string,
  baseUrl?: string
): OpenAI | null {
  if (!provider) {
    return null;
  }
  if (!apiKey) {
    console.warn("[MarkItDown] LLM API key is required");
    return null;
  }
  if (provider === "openai" || provider === "ollama" || provider === "azure") {
    const resolvedBaseUrl =
      baseUrl || (provider === "ollama" ? "http://localhost:11434/v1" : undefined);
    return new OpenAI({
      apiKey,
      baseURL: resolvedBaseUrl,
    });
  }
  console.warn(`[MarkItDown] Unknown LLM provider: ${provider}`);
  return null;
}

export async function optimizeTranscriptionWithLLM(options: {
  segments: TranscriptionSegment[];
  language?: string;
  llmProvider: string;
  llmApiKey?: string;
  llmModel: string;
  llmBaseUrl?: string;
}): Promise<string> {
  const client = createTranscriptionLLMClient(
    options.llmProvider,
    options.llmApiKey,
    options.llmBaseUrl
  );
  if (!client) {
    throw new Error("无法创建 LLM 客户端，请检查转录优化配置");
  }

  const joined = options.segments.map(segment => segment.text).join("\n");
  const completion = await client.chat.completions.create({
    model: options.llmModel,
    messages: [
      { role: "system", content: OPTIMIZATION_SYSTEM_PROMPT },
      {
        role: "user",
        content: `语言: ${options.language || "zh"}\n\n转录文本:\n${joined}`,
      },
    ],
  });

  const markdown = completion.choices[0]?.message?.content;
  if (!markdown) {
    throw new Error("LLM 返回内容为空");
  }
  return markdown;
}
