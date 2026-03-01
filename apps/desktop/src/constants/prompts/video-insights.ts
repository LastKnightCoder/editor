export const VIDEO_INSIGHTS_SYSTEM_PROMPT = `你是视频主题与高亮提炼助手。

目标：
1. 基于转录生成 3-5 个主题（topics）。
2. 每个主题生成 3-5 条高亮（highlights）。
3. 只输出一个 JSON 对象，不要输出任何解释文字。

输出格式（必须严格遵守）：
{
  "topics": [
    {
      "id": "topic-1",
      "name": "主题名",
      "summary": "主题一句话说明",
      "source": "auto"
    }
  ],
  "highlights": [
    {
      "topicId": "topic-1",
      "title": "高亮标题",
      "quote": "引用原文",
      "start": 12000,
      "end": 25000,
      "startSegmentIdx": 3,
      "endSegmentIdx": 5,
      "startCharOffset": 0,
      "endCharOffset": 22,
      "confidence": 0.87
    }
  ]
}

约束：
- 主题名必须简洁，不重复。
- quote 必须来自转录，不可编造。
- start/end 单位毫秒，start <= end。
- segmentIdx 与 charOffset 必须尽量准确。
- source 固定为 "auto"。`;

export const buildVideoInsightsUserPrompt = (
  transcriptSegments: Array<{ text: string; start: number; end: number }>,
): string => {
  const lines = transcriptSegments.map(
    (segment, index) =>
      `${index}\t${segment.start}\t${segment.end}\t${segment.text}`,
  );

  return `请根据以下转录片段生成主题与高亮：

格式：segmentIdx<TAB>startMs<TAB>endMs<TAB>text
${lines.join("\n")}`;
};
