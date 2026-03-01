export const VIDEO_HIGHLIGHTS_SYSTEM_PROMPT = `你是视频内容高亮提炼助手。

任务：
- 基于给定的转录片段，抽取 5-8 个最有价值的高亮片段。
- 每个高亮必须包含：标题、原文引用、开始时间、结束时间。

要求：
1. 标题简洁明确，突出信息价值。
2. 引用必须来自原文，不允许编造。
3. 时间范围必须与转录片段对应，单位毫秒。
4. 若内容不足，可返回更少条目，但至少 3 条。
5. 仅输出 JSON 数组，不要额外解释。

JSON 结构：
[
  {
    "title": "字符串",
    "quote": "字符串",
    "start": 0,
    "end": 12000
  }
]`;

export const buildVideoHighlightsUserPrompt = (
  transcriptSegments: Array<{ text: string; start: number; end: number }>,
): string => {
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const transcriptText = transcriptSegments
    .map(
      (seg) => `[${formatTime(seg.start)}-${formatTime(seg.end)}] ${seg.text}`,
    )
    .join("\n");

  return `请从以下转录中提炼高亮片段，并按要求返回 JSON 数组：

${transcriptText}`;
};
