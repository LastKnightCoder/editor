import markdownSkillReadme from "@/constants/internal-skills/markdown.md?raw";

export const VIDEO_EBOOK_REWRITE_STYLE_OPTIONS = [
  "magazine",
  "academic",
  "casual",
  "technical",
] as const;

export type VideoEbookRewriteStyle =
  (typeof VIDEO_EBOOK_REWRITE_STYLE_OPTIONS)[number];

export const VIDEO_EBOOK_REWRITE_STYLE_INSTRUCTIONS: Record<
  VideoEbookRewriteStyle,
  string
> = {
  magazine: `写作风格：杂志长文（默认）。
- 叙事性强、可读性高，兼顾信息密度与阅读节奏。
- 遇到专业术语要解释清楚，不假设读者具备专业背景。
- 优先保留反直觉观点、关键洞察、关键引述与故事细节。`,
  academic: `写作风格：学术总结。
- 结构严谨、概念定义清晰，强调论点、论据与结论。
- 语言克制客观，减少修辞与情绪化表达。
- 对术语、方法、因果链条进行明确说明。`,
  casual: `写作风格：轻松博客。
- 语气自然亲切，段落短、节奏快，强调易读性。
- 用生活化例子解释复杂概念，避免堆砌术语。
- 保持信息准确，不口水化。`,
  technical: `写作风格：技术文档。
- 结构化表达，章节清晰，强调可检索性与准确性。
- 术语统一，必要时提供定义、前提和边界条件。
- 优先输出结论与关键要点，再展开细节。`,
};

export const VIDEO_EBOOK_REWRITE_SYSTEM_PROMPT = `你是一名专业中文写作者，请把视频转录文稿改写为可直接发布的中文文章（Markdown）。

硬性要求：

1. 输出必须是纯 Markdown，不要输出解释文字、前言或代码围栏。
2. 文章必须可独立阅读，不要出现“在这个视频里”等指代。
3. 可以清理口头语与转录噪声，但不得杜撰事实，不得改变核心观点。
4. 结合给定标题与描述，修正明显识别错误（人名、公司名、术语等）。
5. 首行使用新的吸引人标题（不同于原视频标题）。
6. 内容长度自行判断，保证是“可完整替代观看”的长文。

以下是支持的可扩展 Markdown 语法能力边界：
${markdownSkillReadme}`;

export interface BuildVideoEbookRewriteUserPromptInput {
  transcript: string;
  videoTitle?: string;
  videoDescription?: string;
  style: VideoEbookRewriteStyle;
}

export const buildVideoEbookRewriteUserPrompt = (
  input: BuildVideoEbookRewriteUserPromptInput,
): string => {
  const transcript = input.transcript.trim();
  const title = (input.videoTitle || "").trim();
  const description = (input.videoDescription || "").trim();
  const styleInstruction = VIDEO_EBOOK_REWRITE_STYLE_INSTRUCTIONS[input.style];

  return `请将以下视频转录文稿改写为中文电子书章节正文。

视频标题：
${title || "（无）"}

视频描述：
${description || "（无）"}

转录文稿：
${transcript}

改写要求：
${styleInstruction}

通用规则：
- 目标读者是“好奇、聪明，但不是该领域专家”的普通读者。
- 解释专业概念时要让非专家也能顺畅理解。
- 保留关键观点、反常识洞察、关键案例与关键引述（可清理语气词）。
- 不要照搬时间戳，不要写成逐句转录。
- 使用清晰的小节结构与自然段。`;
};
