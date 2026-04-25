import { describe, expect, it } from "vitest";
import {
  computeTranscriptHash,
  mergeTopicInsights,
  parseVideoInsightsResponse,
} from "@/hooks/video-insights-parser";
import type { TranscriptSegment, VideoNoteInsights } from "@/types";

const segments: TranscriptSegment[] = [
  { text: "第一段介绍了系统架构设计。", start: 0, end: 5000 },
  { text: "第二段讲了主题抽取和高亮定位。", start: 5000, end: 12000 },
  { text: "第三段补充了聊天工具如何引用证据。", start: 12000, end: 20000 },
];

describe("video-insights-parser", () => {
  it("存在转录片段时应仅基于片段计算 hash", () => {
    const transcriptText =
      "第一段介绍了系统架构设计。 第二段讲了主题抽取和高亮定位。 第三段补充了聊天工具如何引用证据。";

    expect(computeTranscriptHash("", segments)).toBe(
      computeTranscriptHash(transcriptText, segments),
    );
  });

  it("转录片段内容或时间变化时应生成不同 hash", () => {
    const modifiedSegments: TranscriptSegment[] = [
      segments[0],
      { ...segments[1], end: 12500 },
      { ...segments[2], text: "第三段补充了聊天工具如何引用更多证据。" },
    ];

    expect(computeTranscriptHash("", segments)).not.toBe(
      computeTranscriptHash("", modifiedSegments),
    );
  });

  it("可解析并补齐高亮偏移字段", () => {
    const transcriptHash = computeTranscriptHash("", segments);
    const payload = {
      topics: [
        { id: "topic-1", name: "架构", source: "auto" },
        { id: "topic-2", name: "工具", source: "auto" },
      ],
      highlights: [
        {
          topicId: "topic-1",
          title: "架构介绍",
          quote: "系统架构设计",
          start: 1000,
          end: 4500,
        },
        {
          topicId: "topic-2",
          title: "工具引用",
          quote: "聊天工具如何引用证据",
          start: 13000,
          end: 18000,
          startSegmentIdx: 2,
          endSegmentIdx: 2,
          startCharOffset: 0,
          endCharOffset: 8,
        },
      ],
    };

    const parsed = parseVideoInsightsResponse(JSON.stringify(payload), {
      mode: "full",
      transcriptHash,
      transcriptSegments: segments,
    });

    expect(parsed.topics).toHaveLength(2);
    expect(parsed.highlights).toHaveLength(2);
    expect(parsed.highlights[0].startSegmentIdx).toBe(0);
    expect(parsed.highlights[0].endSegmentIdx).toBe(0);
    expect(parsed.highlights[1].startSegmentIdx).toBe(2);
    expect(parsed.transcriptHash).toBe(transcriptHash);
  });

  it("无有效主题/高亮时抛错", () => {
    const transcriptHash = computeTranscriptHash("", segments);
    expect(() =>
      parseVideoInsightsResponse(
        JSON.stringify({
          topics: [],
          highlights: [],
        }),
        {
          mode: "full",
          transcriptHash,
          transcriptSegments: segments,
        },
      ),
    ).toThrowError();
  });

  it("增量主题合并会按主题名去重并替换旧高亮", () => {
    const base: VideoNoteInsights = {
      version: 1,
      transcriptHash: "h1",
      generatedAt: 1,
      topics: [
        { id: "auto-1", name: "架构", source: "auto" },
        { id: "custom-old", name: "自定义主题", source: "custom" },
      ],
      highlights: [
        {
          id: "a1",
          topicId: "auto-1",
          title: "A",
          quote: "A",
          start: 0,
          end: 1,
        },
        {
          id: "c1",
          topicId: "custom-old",
          title: "C1",
          quote: "C1",
          start: 2,
          end: 3,
        },
      ],
    };
    const incoming: VideoNoteInsights = {
      version: 1,
      transcriptHash: "h2",
      generatedAt: 2,
      topics: [{ id: "custom-zhuti", name: "自定义主题", source: "custom" }],
      highlights: [
        {
          id: "c2",
          topicId: "custom-zhuti",
          title: "C2",
          quote: "C2",
          start: 4,
          end: 5,
        },
      ],
    };

    const merged = mergeTopicInsights(base, incoming);

    expect(merged.topics).toHaveLength(2);
    expect(
      merged.topics.filter((item) => item.name === "自定义主题").length,
    ).toBe(1);
    expect(
      merged.highlights.some((item) => item.topicId === "custom-old"),
    ).toBe(false);
    expect(
      merged.highlights.some((item) => item.topicId === "custom-zhuti"),
    ).toBe(true);
    expect(merged.transcriptHash).toBe("h2");
  });
});
