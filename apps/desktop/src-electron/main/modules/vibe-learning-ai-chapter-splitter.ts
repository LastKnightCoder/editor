/**
 * AI 驱动的章节拆分模块
 *
 * 将大型 Markdown 文档通过 AI 智能拆分为多个章节，
 * 同时提取标题、描述并整理排版。
 *
 * 核心流程：
 * 1. 自定义段落级 chunking（均匀分块 + 多级降级）
 * 2. 每个 chunk 独立调用 AI 处理（带重试机制）
 * 3. 使用 delimiter-based 输出格式（比 JSON 更健壮）
 * 4. 合并跨 chunk 边界的章节
 * 5. 生成汇总索引文件
 */

import log from "electron-log";
import OpenAI from "openai";

// ============================================================
// 公开接口
// ============================================================

export interface Chapter {
  index: number; // 0-based
  title: string; // 章节标题
  description: string; // AI 生成的 1-2 句描述
  headingLevel: number; // AI 模式默认 1，降级模式保留实际级别
  content: string; // 章节完整 markdown 内容
}

export interface AIChapterConfig {
  llmApiKey: string;
  llmModel: string;
  llmBaseUrl?: string;
}

export interface SplitResult {
  chapters: Chapter[];
  summaryContent: string;
}

export interface TaskProgress {
  total: number; // 总任务数
  completed: number; // 已完成
  failed: number; // 失败数
  inProgress: number; // 进行中
}

const KIMI_CLI_USER_AGENT = "KimiCLI/1.37.0";

// ============================================================
// 内部类型
// ============================================================

interface ParsedChapterBlock {
  title: string;
  description: string;
  content: string;
  isContinuation: boolean;
  isIncomplete: boolean;
}

interface ChunkResult {
  chunkIndex: number;
  chapters: ParsedChapterBlock[];
  success: boolean;
  error?: string;
}

// ============================================================
// 常量
// ============================================================

const DEFAULT_MAX_CHUNK_LENGTH = 20_000; // 单个 chunk 的最大长度；调小可降低单次 LLM 请求压力与超时风险，但会增加 chunk 数量
const DEFAULT_OVERLAP = 1_000; // chunk 之间的重叠字符数
const MAX_RETRIES = 3; // 每个 chunk 的最大重试次数
const CONCURRENCY_LIMIT = 3; // chunk 并行处理的并发数

// ============================================================
// 主入口
// ============================================================

/**
 * 使用 AI 拆分大型 Markdown 文档为多个章节
 *
 * @param content - 原始 Markdown 文本
 * @param config - LLM 配置（API Key、模型、BaseURL）
 * @param resourceName - 资源名称，用于生成汇总索引
 * @param onProgress - 可选的进度回调（chunk 级别）
 * @returns 拆分后的章节数组和汇总索引内容
 */
export async function splitMarkdownByAI(
  content: string,
  config: AIChapterConfig,
  resourceName: string,
  onProgress?: (progress: TaskProgress) => void,
): Promise<SplitResult> {
  log.info(
    `[AIChapterSplitter] Starting AI chapter split for "${resourceName}", content length=${content.length}, model=${config.llmModel}, baseURL=${config.llmBaseUrl || "default"}, timeoutMs=1200000`,
  );

  // 1. 分块
  const chunks = chunkByParagraph(content);
  log.info(
    `[AIChapterSplitter] Split into ${chunks.length} chunks: ${chunks.map((c) => c.length).join(", ")}`,
  );

  // 2. 并行 chunk AI 处理（带并发限制和重试）
  const client = new OpenAI({
    apiKey: config.llmApiKey,
    baseURL: config.llmBaseUrl,
    timeout: 1_200_000,
    ...(config.llmModel === "kimi-for-coding"
      ? {
          defaultHeaders: {
            "User-Agent": KIMI_CLI_USER_AGENT,
          },
        }
      : {}),
  });

  // 进度计数器（共享状态，由各 worker 更新）
  let completedCount = 0;
  let failedCount = 0;
  let inProgressCount = 0;

  const reportProgress = () => {
    onProgress?.({
      total: chunks.length,
      completed: completedCount,
      failed: failedCount,
      inProgress: inProgressCount,
    });
  };

  const tasks = chunks.map((chunkText, i) => async (): Promise<ChunkResult> => {
    inProgressCount++;
    reportProgress();

    const result = await processChunkWithRetry(
      client,
      config.llmModel,
      chunkText,
      i,
      chunks.length,
    );

    inProgressCount--;
    if (result.success) {
      completedCount++;
    } else {
      failedCount++;
    }
    reportProgress();

    log.info(
      `[AIChapterSplitter] Chunk ${i + 1}/${chunks.length}: success=${result.success}, chapters=${result.chapters.length}`,
    );

    return result;
  });

  const chunkResults = await runWithConcurrency(tasks, CONCURRENCY_LIMIT);

  // 3. 合并跨 chunk 的章节
  const chapters = mergeChunkResults(chunkResults);

  log.info(`[AIChapterSplitter] Merged into ${chapters.length} chapters`);

  // 4. 生成汇总索引
  const summaryContent = generateSummaryIndex(resourceName, chapters);

  return { chapters, summaryContent };
}

// ============================================================
// 自定义段落级 Chunking
// ============================================================

/**
 * 按段落边界均匀分块，支持多级降级处理超大段落
 *
 * 均匀策略：先估算总 chunk 数，再按 targetSize 切分，避免最后一块过小
 */
export function chunkByParagraph(
  text: string,
  maxLength: number = DEFAULT_MAX_CHUNK_LENGTH,
  overlap: number = DEFAULT_OVERLAP,
): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  // 按段落分割，保留分隔符信息以便重组
  const paragraphs = splitIntoParagraphs(text);

  // 对超大段落进行多级降级拆分
  const normalizedBlocks = flattenOversizedBlocks(paragraphs, maxLength);

  // 均匀分块策略
  const totalLength = normalizedBlocks.reduce((sum, b) => sum + b.length, 0);
  const numChunks = Math.ceil(totalLength / maxLength);
  const targetSize = Math.floor(totalLength / numChunks);

  const chunks: string[] = [];
  let currentParts: string[] = [];
  let currentLength = 0;

  for (const block of normalizedBlocks) {
    // 如果加入当前 block 后超过 maxLength 硬上限，且已有内容，先切分
    if (currentLength + block.length > maxLength && currentLength > 0) {
      chunks.push(currentParts.join("\n\n"));
      currentParts = [];
      currentLength = 0;
    }

    currentParts.push(block);
    currentLength += block.length;

    // 接近 targetSize 时切分（但不超过 maxLength）
    if (currentLength >= targetSize && chunks.length < numChunks - 1) {
      chunks.push(currentParts.join("\n\n"));
      currentParts = [];
      currentLength = 0;
    }
  }

  // 剩余内容
  if (currentParts.length > 0) {
    chunks.push(currentParts.join("\n\n"));
  }

  // 添加 overlap
  if (overlap > 0 && chunks.length > 1) {
    return addOverlap(chunks, overlap);
  }

  return chunks;
}

/**
 * 按 \n\n+ 分割段落
 */
function splitIntoParagraphs(text: string): string[] {
  return text.split(/\n\n+/).filter((p) => p.length > 0);
}

/**
 * 对超大段落进行多级降级拆分，确保所有 block 不超过 maxLength
 *
 * 降级顺序：\n\n → \n → 句子边界 → 硬切
 */
function flattenOversizedBlocks(blocks: string[], maxLength: number): string[] {
  const result: string[] = [];

  for (const block of blocks) {
    if (block.length <= maxLength) {
      result.push(block);
    } else {
      // 降级 1：按单换行符分割
      const lines = block.split(/\n/).filter((l) => l.length > 0);
      for (const line of lines) {
        if (line.length <= maxLength) {
          result.push(line);
        } else {
          // 降级 2：按句子边界分割
          const sentences = splitBySentence(line);
          for (const sentence of sentences) {
            if (sentence.length <= maxLength) {
              result.push(sentence);
            } else {
              // 降级 3（兜底）：硬切
              for (let i = 0; i < sentence.length; i += maxLength) {
                result.push(sentence.slice(i, i + maxLength));
              }
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * 按句子边界分割（支持中英文标点）
 */
function splitBySentence(text: string): string[] {
  // 在句号、问号、感叹号后分割，保留标点在前一个句子中
  const parts = text.split(/(?<=[。.！!？?\n])\s*/);
  return parts.filter((p) => p.length > 0);
}

/**
 * 为 chunk 添加重叠区域
 * 从上一个 chunk 末尾取 ~overlap 字符，追加到下一个 chunk 开头
 */
function addOverlap(chunks: string[], overlap: number): string[] {
  const result: string[] = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i - 1];

    // 从上一个 chunk 末尾取 overlap 字符，在段落边界对齐
    let overlapText = "";
    if (prevChunk.length > overlap) {
      const tail = prevChunk.slice(-overlap * 2); // 取多一些，方便找段落边界
      const paragraphs = tail.split(/\n\n+/);
      // 从后往前累积段落，直到达到 overlap 大小
      const overlapParts: string[] = [];
      let overlapLen = 0;
      for (let j = paragraphs.length - 1; j >= 0; j--) {
        if (
          overlapLen + paragraphs[j].length > overlap &&
          overlapParts.length > 0
        ) {
          break;
        }
        overlapParts.unshift(paragraphs[j]);
        overlapLen += paragraphs[j].length;
      }
      overlapText = overlapParts.join("\n\n");
    } else {
      overlapText = prevChunk;
    }

    result.push(overlapText + "\n\n" + chunks[i]);
  }

  return result;
}

// ============================================================
// AI 处理 + 重试
// ============================================================

/**
 * 带重试机制的单 chunk AI 处理
 */
async function processChunkWithRetry(
  client: OpenAI,
  model: string,
  chunkText: string,
  chunkIndex: number,
  totalChunks: number,
  maxRetries: number = MAX_RETRIES,
): Promise<ChunkResult> {
  let lastError = "";

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // 指数退避 + 随机 jitter
        const delay = 1000 * Math.pow(2, attempt) + Math.random() * 1000;
        log.info(
          `[AIChapterSplitter] Retry ${attempt}/${maxRetries} for chunk ${chunkIndex + 1}, waiting ${Math.round(delay)}ms`,
        );
        await sleep(delay);
      }

      const requestStartedAt = Date.now();
      log.info(
        `[AIChapterSplitter] Sending LLM request for chunk ${chunkIndex + 1}/${totalChunks}, attempt ${attempt + 1}/${maxRetries}, model=${model}, chunkLength=${chunkText.length}`,
      );

      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          {
            role: "user",
            content: buildUserPrompt(chunkText, chunkIndex, totalChunks),
          },
        ],
        temperature: 0.1,
      });

      const elapsedMs = Date.now() - requestStartedAt;

      const output = response.choices[0]?.message?.content;
      if (!output) {
        lastError = "AI 返回空内容";
        log.warn(
          `[AIChapterSplitter] LLM request finished with empty content for chunk ${chunkIndex + 1}/${totalChunks}, attempt ${attempt + 1}, elapsedMs=${elapsedMs}`,
        );
        continue;
      }

      // 解析输出
      const chapters = parseAIOutput(output);
      if (chapters.length === 0) {
        lastError = "解析结果为空，未找到有效章节";
        log.warn(
          `[AIChapterSplitter] Empty parse result for chunk ${chunkIndex + 1}/${totalChunks}, attempt ${attempt + 1}, elapsedMs=${elapsedMs}, outputLength=${output.length}`,
        );
        continue;
      }

      log.info(
        `[AIChapterSplitter] LLM request succeeded for chunk ${chunkIndex + 1}/${totalChunks}, attempt ${attempt + 1}, elapsedMs=${elapsedMs}, outputLength=${output.length}, chapters=${chapters.length}`,
      );

      return {
        chunkIndex,
        chapters,
        success: true,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      const errorDetails = formatErrorForLog(error);
      log.warn(
        `[AIChapterSplitter] Error processing chunk ${chunkIndex + 1}/${totalChunks}, attempt ${attempt + 1}: ${errorDetails}`,
      );
    }
  }

  // 全部重试失败：将原始文本作为一个整体章节保存（防止内容丢失）
  log.error(
    `[AIChapterSplitter] All ${maxRetries} retries failed for chunk ${chunkIndex + 1}: ${lastError}`,
  );

  return {
    chunkIndex,
    chapters: [
      {
        title: `第 ${chunkIndex + 1} 部分（AI 处理失败）`,
        description: `该部分 AI 处理失败，已保留原始内容。错误: ${lastError}`,
        content: chunkText,
        isContinuation: false,
        isIncomplete: false,
      },
    ],
    success: false,
    error: lastError,
  };
}

function formatErrorForLog(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const detailParts = [error.message];
  const maybeStatus = Reflect.get(error, "status");
  const maybeCode = Reflect.get(error, "code");
  const maybeType = Reflect.get(error, "type");

  if (typeof maybeStatus === "number") {
    detailParts.push(`status=${maybeStatus}`);
  }
  if (typeof maybeCode === "string" && maybeCode.length > 0) {
    detailParts.push(`code=${maybeCode}`);
  }
  if (typeof maybeType === "string" && maybeType.length > 0) {
    detailParts.push(`type=${maybeType}`);
  }

  return detailParts.join(", ");
}

// ============================================================
// Prompt 模板
// ============================================================

function buildSystemPrompt(): string {
  return `你是一个专业的文档结构化处理助手。你的任务是将给定的文本内容拆分为逻辑清晰的章节，并进行高质量的 Markdown 排版格式化。

## 核心规则（必须严格遵守）

1. **绝对禁止修改原文内容**：严禁删除、缩减、改写、概括或省略任何原始文字内容。原文的每一个字、每一个标点都必须完整保留。
2. **必须输出完整内容**：每个章节必须包含该章节的完整原文。不允许使用省略号（...）、"以下省略"、"内容同上"、"此处省略 N 字"等任何偷懒方式。如果你发现自己想要省略内容，停下来，把完整内容输出。
3. **章节拆分原则**：根据内容的主题和逻辑结构进行章节拆分。每个章节应有一个清晰的主题。为每个章节提供准确的标题和 1-2 句简要描述。

## 格式化规则（在保持原文完整的前提下进行排版优化）

以下操作是**允许且鼓励**的——它们不改变原文内容，只改善可读性：

### 段落处理
- 连续多行短文本如果属于同一个语义段落，合并为完整段落
- 多个连续空行合并为一个段落分隔（一个空行）
- 超长段落（尤其是转录文本或长篇论述）按语义断点拆分为多个段落，使每段聚焦一个要点或论述
- 确保段落之间有一个空行分隔，符合 Markdown 规范

### 代码格式化
- 识别文本中的代码片段（如 CSS 属性声明、函数调用、变量赋值、命令行、配置项等），用 Markdown 代码块包裹，并标注语言类型：
  \`\`\`css
  border: 10px solid hsla(0, 0%, 100%, .5);
  \`\`\`
- 行内代码（如函数名 \`rgba()\`、属性名 \`border\`、文件名 \`index.js\` 等）用单反引号包裹
- 如果原文中已有代码块格式但格式不正确（如缺少语言标识、反引号数量错误），修复为正确格式

### 数学公式
- 识别数学表达式和公式：行内公式用 \`$...$\` 包裹，独立公式用 \`$$...$$\` 包裹
- 修复 MarkItDown 转换可能产生的 LaTeX 格式问题（如转义符丢失、括号不匹配等）

### 列表和表格
- 识别明显的列举内容，格式化为 Markdown 列表（有序或无序）
- 修复断裂的列表项（如缺少 \`-\` 或编号前缀）
- 修复断裂的表格（如列未对齐、缺少表头分隔行 \`|---|---|...\`）

### 标题层级
- 为明显缺少标题的内容段落添加适当层级的 Markdown 标题
- 修复标题层级混乱（如 \`#\` 后面直接跳到 \`####\`），保持层级递进合理

### 重要提醒
- **禁止**：删除文字、改变用词、概括内容、缩减篇幅
- **允许**：添加 Markdown 格式标记（代码块反引号、公式 $ 符号、列表 - 符号、标题 # 等）、调整换行和段落分割、添加/修复标题

## 输出格式

对于每个章节，严格使用以下格式输出：

===CHAPTER_START===
TITLE: 章节标题
DESCRIPTION: 对该章节内容的 1-2 句简要描述
CONTINUATION: false
INCOMPLETE: false
---CONTENT_START---
该章节的完整 Markdown 内容（已格式化）
---CONTENT_END---
===CHAPTER_END===

多个章节依次输出，每个章节使用上述格式包裹。

## 边界处理规则

你收到的文本可能是一个大文档的某一段（chunk）。请注意以下情况：

- 如果文本开头看起来是某个章节的中间部分（不是从一个完整主题开始的），将该部分标记为 \`CONTINUATION: true\`。这表示它是上一段（chunk）末尾章节的延续。
- 如果文本末尾看起来在一个章节中间被截断了（不是一个完整主题的结束），将该章节标记为 \`INCOMPLETE: true\`。这表示它会在下一段（chunk）中继续。
- 对于只有一段（1/1）的文本，CONTINUATION 和 INCOMPLETE 都应为 false。

## 再次强调

输出必须包含原文的所有内容，一字不漏。格式化只是添加 Markdown 标记和调整排版，绝不减少任何文字。这是最重要的要求。`;
}

function buildUserPrompt(
  chunkText: string,
  chunkIndex: number,
  totalChunks: number,
): string {
  return `请处理以下文本（第 ${chunkIndex + 1}/${totalChunks} 段）。严格按照指定格式输出，确保原文内容完整保留，不要遗漏任何内容。

---

${chunkText}`;
}

// ============================================================
// AI 输出解析器
// ============================================================

/**
 * 解析 AI 的 delimiter-based 输出格式
 *
 * 容错处理：
 * - 缺少 ===CHAPTER_END=== 时用下一个 ===CHAPTER_START=== 作为隐式结束
 * - 缺少 ---CONTENT_END--- 时取到块末尾
 * - 元数据字段缺失时使用默认值
 */
export function parseAIOutput(output: string): ParsedChapterBlock[] {
  const chapters: ParsedChapterBlock[] = [];

  // 按 ===CHAPTER_START=== 分割，第一个元素是分隔符之前的内容（通常为空或前导文字）
  const blocks = output.split("===CHAPTER_START===");

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    try {
      // 去掉 ===CHAPTER_END=== 之后的内容（如果有）
      const endIdx = block.indexOf("===CHAPTER_END===");
      const chapterBlock = endIdx >= 0 ? block.slice(0, endIdx) : block;

      // 提取元数据和内容
      const title = extractMetaValue(chapterBlock, "TITLE") || `章节 ${i}`;
      const description = extractMetaValue(chapterBlock, "DESCRIPTION") || "";
      const continuation =
        extractMetaValue(chapterBlock, "CONTINUATION")?.toLowerCase() ===
        "true";
      const incomplete =
        extractMetaValue(chapterBlock, "INCOMPLETE")?.toLowerCase() === "true";

      // 提取内容区域
      const content = extractContent(chapterBlock);

      if (content.trim().length > 0) {
        chapters.push({
          title,
          description,
          content: content.trim(),
          isContinuation: continuation,
          isIncomplete: incomplete,
        });
      }
    } catch (error) {
      log.warn(
        `[AIChapterSplitter] Failed to parse chapter block ${i}: ${error}`,
      );
      // 跳过解析失败的块，继续处理其他块
    }
  }

  return chapters;
}

/**
 * 从块文本中提取 KEY: value 格式的元数据值
 */
function extractMetaValue(block: string, key: string): string | null {
  // 匹配 KEY: value（value 取到行末）
  const regex = new RegExp(`^${key}:\\s*(.+)$`, "mi");
  const match = regex.exec(block);
  return match ? match[1].trim() : null;
}

/**
 * 从块文本中提取 ---CONTENT_START--- 到 ---CONTENT_END--- 之间的内容
 */
function extractContent(block: string): string {
  const startMarker = "---CONTENT_START---";
  const endMarker = "---CONTENT_END---";

  const startIdx = block.indexOf(startMarker);
  if (startIdx < 0) {
    // 没有 CONTENT_START 标记，尝试取元数据之后的所有内容
    // 找到最后一个元数据行之后的内容
    const lines = block.split("\n");
    let contentStart = 0;
    for (let i = 0; i < lines.length; i++) {
      if (
        /^(TITLE|DESCRIPTION|CONTINUATION|INCOMPLETE):/i.test(lines[i].trim())
      ) {
        contentStart = i + 1;
      }
    }
    return lines.slice(contentStart).join("\n");
  }

  const contentAfterStart = block.slice(startIdx + startMarker.length);
  const endIdx = contentAfterStart.indexOf(endMarker);

  if (endIdx < 0) {
    // 没有 CONTENT_END 标记，取到块末尾
    return contentAfterStart;
  }

  return contentAfterStart.slice(0, endIdx);
}

// ============================================================
// 章节合并
// ============================================================

/**
 * 合并多个 chunk 的处理结果，处理跨 chunk 边界的章节
 *
 * 规则：
 * - chunk N 末尾 isIncomplete=true + chunk N+1 开头 isContinuation=true → 合并
 * - 重新编号所有章节
 */
function mergeChunkResults(results: ChunkResult[]): Chapter[] {
  // 按 chunkIndex 排序
  const sorted = [...results].sort((a, b) => a.chunkIndex - b.chunkIndex);

  const allChapters: ParsedChapterBlock[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const chunkChapters = sorted[i].chapters;

    if (chunkChapters.length === 0) continue;

    if (i > 0 && allChapters.length > 0) {
      const prevLast = allChapters[allChapters.length - 1];
      const currentFirst = chunkChapters[0];

      // 检查是否需要合并：上一个 chunk 末尾 incomplete + 当前 chunk 开头 continuation
      if (prevLast.isIncomplete && currentFirst.isContinuation) {
        // 合并内容到上一个章节
        prevLast.content += "\n\n" + currentFirst.content;
        prevLast.isIncomplete = false;

        // 如果上一个章节缺少描述，使用当前的
        if (!prevLast.description && currentFirst.description) {
          prevLast.description = currentFirst.description;
        }

        // 跳过当前 chunk 的第一个章节（已合并），添加剩余的
        for (let j = 1; j < chunkChapters.length; j++) {
          allChapters.push(chunkChapters[j]);
        }
        continue;
      }
    }

    // 不需要合并，直接添加所有章节
    for (const chapter of chunkChapters) {
      allChapters.push(chapter);
    }
  }

  // 转换为 Chapter 接口并重新编号
  return allChapters.map((ch, idx) => ({
    index: idx,
    title: ch.title,
    description: ch.description,
    headingLevel: 1,
    content: ch.content,
  }));
}

// ============================================================
// 汇总索引生成
// ============================================================

/**
 * 生成汇总索引文件的 Markdown 内容
 */
export function generateSummaryIndex(
  resourceName: string,
  chapters: Chapter[],
): string {
  const totalSize = chapters.reduce((sum, ch) => sum + ch.content.length, 0);

  const lines: string[] = [];
  lines.push(`# ${resourceName} - 目录`);
  lines.push("");
  lines.push("## 文档概述");
  lines.push("");
  lines.push(
    `本文档共 ${chapters.length} 个章节，总计约 ${totalSize.toLocaleString()} 字符。`,
  );
  lines.push("");
  lines.push("## 章节目录");
  lines.push("");

  for (const ch of chapters) {
    const chapterFile = buildChapterFileName(ch.index, ch.title);
    const sizeStr = ch.content.length.toLocaleString();
    const desc = ch.description ? ` - ${ch.description}` : "";
    lines.push(
      `${ch.index + 1}. ${ch.title} (${chapterFile}, ${sizeStr} 字符)${desc}`,
    );
  }

  lines.push("");
  lines.push("> 使用 `read_resource_chapter` 工具读取具体章节内容。");
  lines.push("");
  lines.push("## 章节索引详情");
  lines.push("");

  for (const ch of chapters) {
    const chapterFile = buildChapterFileName(ch.index, ch.title);
    const sizeStr = ch.content.length.toLocaleString();
    lines.push(`### 章节 ${ch.index + 1}`);
    lines.push(`- 标题：${ch.title}`);
    lines.push(`- 摘要：${ch.description || "无"}`);
    lines.push(`- 文件：${chapterFile}`);
    lines.push(`- 字数：${sizeStr} 字符`);
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================
// 降级方案：简单标题拆分（无 LLM 时使用）
// ============================================================

/**
 * 按 # 和 ## 标题拆分的简单方案
 * 无 AI 处理，description 为空字符串
 */
export function simpleSplitByHeadings(content: string): Chapter[] {
  const lines = content.split("\n");
  const chapters: Chapter[] = [];
  let currentLines: string[] = [];
  let currentTitle = "前言";
  let currentLevel = 0;

  const headingRegex = /^(#{1,2})\s+(.+)$/;

  for (const line of lines) {
    const match = headingRegex.exec(line);
    if (match) {
      const level = match[1].length;
      // 保存前一个章节
      if (currentLines.length > 0) {
        const content = currentLines.join("\n").trim();
        if (content.length > 0) {
          chapters.push({
            index: chapters.length,
            title: currentTitle,
            description: "",
            headingLevel: currentLevel,
            content,
          });
        }
      }
      currentTitle = match[2].trim();
      currentLevel = level;
      currentLines = [line];
      continue;
    }
    currentLines.push(line);
  }

  // 保存最后一个章节
  if (currentLines.length > 0) {
    const lastContent = currentLines.join("\n").trim();
    if (lastContent.length > 0) {
      chapters.push({
        index: chapters.length,
        title: currentTitle,
        description: "",
        headingLevel: currentLevel,
        content: lastContent,
      });
    }
  }

  // 如果只有一个章节（整个文档没有 # 或 ## 标题），按段落边界拆分
  if (chapters.length <= 1) {
    return simpleSplitBySize(content);
  }

  return chapters;
}

/**
 * 按大小均匀拆分（完全没有标题时的最终降级）
 */
function simpleSplitBySize(content: string): Chapter[] {
  const targetSize = 30_000;
  const paragraphs = content.split(/\n\n+/);
  const chapters: Chapter[] = [];
  let currentContent = "";

  for (const paragraph of paragraphs) {
    if (
      currentContent.length + paragraph.length > targetSize &&
      currentContent.length > 0
    ) {
      chapters.push({
        index: chapters.length,
        title: `第 ${chapters.length + 1} 部分`,
        description: "",
        headingLevel: 0,
        content: currentContent.trim(),
      });
      currentContent = paragraph;
    } else {
      currentContent += (currentContent ? "\n\n" : "") + paragraph;
    }
  }

  if (currentContent.trim().length > 0) {
    chapters.push({
      index: chapters.length,
      title: `第 ${chapters.length + 1} 部分`,
      description: "",
      headingLevel: 0,
      content: currentContent.trim(),
    });
  }

  return chapters;
}

// ============================================================
// 章节文件命名
// ============================================================

/**
 * 生成章节文件名：01-标题.md 格式
 */
export function buildChapterFileName(index: number, title: string): string {
  const paddedIndex = String(index + 1).padStart(2, "0");
  const safeTitle = sanitizeFileName(title).slice(0, 50);
  return `${paddedIndex}-${safeTitle}.md`;
}

/**
 * 扫描章节目录，按数字前缀排序返回文件名列表
 */
export async function listChapterFilesSorted(
  chaptersDir: string,
): Promise<string[]> {
  const { promises: fsPromises } = await import("fs");
  const files = await fsPromises.readdir(chaptersDir);
  return files
    .filter((f) => /^\d+-.*\.md$/.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b));
}

/**
 * 替换文件系统中不允许的字符
 */
function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[<>:"/\\|?*\n\r\t]/g, "_").trim();
}

// ============================================================
// 工具函数
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带并发限制的并行执行
 * 结果数组按输入顺序排列，与 tasks 下标一一对应
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      try {
        results[index] = await tasks[index]();
      } catch (error) {
        // 兜底：processChunkWithRetry 不应抛出异常，但以防万一
        log.error(
          `[AIChapterSplitter] Unexpected error in worker for task ${index}: ${error}`,
        );
        results[index] = {
          chunkIndex: index,
          chapters: [],
          success: false,
          error: String(error),
        } as T;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}
