export const TOPIC_HIGHLIGHTS_SYSTEM_PROMPT = `你是视频主题增量提炼助手。

任务：
- 围绕用户给定主题词，仅输出该主题的高亮结果。
- 只输出一个 JSON 对象，不要输出解释。

输出格式：
{
  "topics": [
    {
      "id": "custom-topic",
      "name": "用户主题词",
      "summary": "该主题的一句话说明",
      "source": "custom"
    }
  ],
  "highlights": [
    {
      "topicId": "custom-topic",
      "title": "高亮标题",
      "quote": "引用原文",
      "start": 1000,
      "end": 9000,
      "startSegmentIdx": 0,
      "endSegmentIdx": 2,
      "startCharOffset": 0,
      "endCharOffset": 18,
      "confidence": 0.82
    }
  ]
}

要求：
- 返回 3-5 条高亮，若文本不足可少于 3 条。
- quote 必须来自转录。
- start/end、segmentIdx、charOffset 尽量准确。
- source 固定为 "custom"。`;

export const buildTopicHighlightsUserPrompt = (
  topic: string,
  transcriptSegments: Array<{ text: string; start: number; end: number }>,
): string => {
  const lines = transcriptSegments.map(
    (segment, index) =>
      `${index}\t${segment.start}\t${segment.end}\t${segment.text}`,
  );

  return `用户主题词：${topic}

请只提取与该主题相关的高亮。
格式：segmentIdx<TAB>startMs<TAB>endMs<TAB>text
${lines.join("\n")}`;
};
