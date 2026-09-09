/**
 * Node 原生文档转 Markdown 转换器
 *
 * 替代原 Python 侧 markitdown 库：
 * - DOCX：mammoth（保留标题/列表/表格结构）→ turndown 转 Markdown
 * - PDF/PPTX/XLSX/ODF/RTF：officeparser
 * - HTML：turndown
 * - EPUB：7zip 解包 + spine 顺序提取 xhtml 文本
 * - 纯文本/CSV/JSON/XML 等：直接读取（CSV 转 Markdown 表格）
 */

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import { parseOffice } from "officeparser";
import mammoth from "mammoth";
import TurndownService from "turndown";
import sevenZip from "7zip-min";

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

/** 纯文本类扩展名（直接读取，不做转换） */
const PLAIN_TEXT_EXTENSIONS = [
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".xml",
  ".yml",
  ".yaml",
  ".log",
];

/** officeparser 支持的扩展名 */
const OFFICE_PARSER_EXTENSIONS = [
  ".docx",
  ".pptx",
  ".xlsx",
  ".ods",
  ".odp",
  ".odt",
  ".pdf",
  ".rtf",
];

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

function unpack7z(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sevenZip.unpack(archivePath, destDir, (err: Error | null) => {
      if (err) {
        reject(new Error(`解压失败: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * EPUB 提取：epub 是 zip 包，解压后按 spine 顺序拼接 xhtml 文本
 * （知识库索引用途，纯文本提取即可满足分块需要）
 */
async function convertEpubToMarkdown(epubPath: string): Promise<string> {
  const extractDir = path.join(os.tmpdir(), `tau-epub-${uuidv4()}`);
  try {
    await fs.mkdir(extractDir, { recursive: true });
    await unpack7z(epubPath, extractDir);

    // 解析 container.xml 定位 OPF
    const containerPath = path.join(extractDir, "META-INF", "container.xml");
    const containerXml = await fs.readFile(containerPath, "utf-8");
    const opfMatch = containerXml.match(/full-path="([^"]+)"/);
    if (!opfMatch) {
      throw new Error("无效的 EPUB 文件：缺少 container.xml");
    }
    const opfPath = path.join(extractDir, opfMatch[1]);
    const opfDir = path.dirname(opfPath);
    const opfXml = await fs.readFile(opfPath, "utf-8");

    // 按 spine 中 manifest 项的顺序提取 xhtml
    const manifestMatches = [...opfXml.matchAll(/<item\b[^>]*>/g)];
    const manifest = new Map<string, string>();
    for (const item of manifestMatches) {
      const idMatch = item[0].match(/id="([^"]+)"/);
      const hrefMatch = item[0].match(/href="([^"]+)"/);
      if (idMatch && hrefMatch) {
        manifest.set(idMatch[1], hrefMatch[1]);
      }
    }

    const itemrefMatches = [...opfXml.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)];
    const parts: string[] = [];
    for (const ref of itemrefMatches) {
      const href = manifest.get(ref[1]);
      if (!href) {
        continue;
      }
      const xhtmlPath = path.join(opfDir, decodeURIComponent(href));
      try {
        const xhtml = await fs.readFile(xhtmlPath, "utf-8");
        const text = stripHtmlToText(xhtml);
        if (text) {
          parts.push(text);
        }
      } catch {
        // 跳过缺失或损坏的章节
      }
    }

    return parts.join("\n\n");
  } finally {
    await fs.rm(extractDir, { recursive: true, force: true }).catch(() => undefined);
  }
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

    if (PLAIN_TEXT_EXTENSIONS.includes(ext)) {
      const content = await fs.readFile(filePath, "utf-8");
      if (ext === ".csv" || ext === ".tsv") {
        // CSV 转为 Markdown 表格（首行视为表头）
        const separator = ext === ".tsv" ? "\t" : ",";
        const lines = content.split(/\r?\n/).filter(line => line.trim());
        if (lines.length > 0) {
          const rows = lines.map(line => line.split(separator));
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
    } else if (ext === ".docx") {
      // mammoth 保留标题/列表/表格结构，再转 Markdown
      const { value: html } = await mammoth.convertToHtml({ path: filePath });
      markdown = turndownService.turndown(html);
    } else if (ext === ".html" || ext === ".htm") {
      const html = await fs.readFile(filePath, "utf-8");
      try {
        markdown = turndownService.turndown(html);
      } catch {
        markdown = stripHtmlToText(html);
      }
    } else if (ext === ".epub") {
      markdown = await convertEpubToMarkdown(filePath);
    } else if (OFFICE_PARSER_EXTENSIONS.includes(ext)) {
      const ast = await parseOffice(filePath);
      markdown = ast.toText();
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
