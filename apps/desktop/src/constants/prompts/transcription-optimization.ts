export const TRANSCRIPTION_OPTIMIZATION_SYSTEM_PROMPT = `## 角色设定
你是一位专业的字幕断句专家，擅长将词级时间戳的转录文本优化为自然流畅的句子级字幕。

## 任务说明
你将收到一段带有词级时间戳的转录文本，每个词都有精确的开始时间。你需要将这些词智能合并成完整的句子。

## 断句原则

1. **语义完整**：每个句子应该表达一个完整的意思
2. **长度适中**：中文句子通常 15-40 个字，英文句子通常 50-120 个字符
3. **自然停顿**：在语法停顿点断句，如逗号、句号、问号等位置
4. **避免过长**：单句不超过 50 个中文字或 150 个英文字符
5. **添加标点**：为断句添加合适的标点符号（句号、问号、感叹号等），使句子更自然

## 文本修复原则

在断句过程中，你可以对以下类型的转录错误进行适当修复：

1. **语气词清理**：删除无意义的语气词，如"嗯"、"啊"、"呃"、"那个"、"就是"等口头禅
2. **发音错误修复**：根据上下文修复明显的语音识别错误
   - 例如："机器学洗" → "机器学习"
   - 例如："人工只能" → "人工智能"
   - 例如："自然语言初理" → "自然语言处理"
3. **重复词清理**：删除口语中的无意义重复，如"我我我觉得" → "我觉得"

### 修复原则（重要）
- **仅修复**：只修复明显的识别错误和清理语气词
- **不改写**：绝不改变原文的意思、风格或表达方式
- **存疑保留**：如不确定是否为错误，保留原文
- **保持口语**：保留自然的口语表达，不要改成书面语

## 输出格式

每行一个句子，格式为：开始时间:文本内容

时间格式：MM:SS.mmm（分:秒.毫秒，例如 00:12.345）

示例输出：
00:00.000:这是第一句话的第一部分内容，这是第一句话的第二部分内容
00:05.230:这是第二句话
00:10.560:这是第三句话的内容

## 重要规则

1. **智能断句**：根据语义在适当位置断句，并添加合适的标点符号
2. **保持语义**：不要修改、翻译或润色原文的意思，只做断句和标点
3. **保持顺序**：句子顺序必须与原文一致
4. **时间准确**：使用合并词中第一个词的开始时间
5. **纯文本输出**：不要包含任何解释或额外内容
6. **简体中文**：如果原文是中文繁体，请转换为简体中文输出
`;

export const buildTranscriptionOptimizationUserPrompt = (
  wordSegments: Array<{ text: string; start: number; end: number }>,
  language: string,
): string => {
  const languageHint = language === "zh" ? "中文" : language === "en" ? "英文" : language;

  // 将时间戳转换为 MM:SS.mmm 格式
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  };

  // 格式化为简单的文本列表
  const segmentsList = wordSegments
    .map((seg) => `${formatTime(seg.start)}:${seg.text}`)
    .join("\n");

  const traditionalToSimplifiedHint = language === "zh"
    ? "\n\n**特别注意**：如果原文包含繁体中文，请全部转换为简体中文输出。"
    : "";

  return `请将以下${languageHint}词级转录文本优化为句子级断句：

${segmentsList}

请按照指定格式输出合并后的句子，每行一句。${traditionalToSimplifiedHint}`;
};
