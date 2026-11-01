/**
 * 视频笔记 AI 章节：转录就绪且配了「视频总结」模型时自动生成，存 video_notes.insights；
 * 转录变化（hash 对不上）即视为过期并重新生成。未配模型时不生成，界面按无章节呈现。
 */

import { useEffect, useMemo, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@tau/ui";
import { Role } from "@/constants";
import { VIDEO_CHAPTERS_SYSTEM_PROMPT, buildVideoChaptersUserPrompt } from "@/constants/prompts";
import { updateVideoNoteInsights } from "@/commands";
import { useLLMConfig } from "@/hooks/useLLMConfig";
import { piCompleteChat } from "@/services/piLLM";
import type { RequestMessage, TranscriptSegment, VideoNote, VideoNoteChapter } from "@/types";

/** FNV-1a：转录内容指纹，只用于判断章节是否过期 */
export const hashTranscript = (segments: TranscriptSegment[]): string => {
  let hash = 0x811c9dc5;
  for (const segment of segments) {
    const line = `${segment.start}\t${segment.text}\n`;
    for (let i = 0; i < line.length; i++) {
      hash ^= line.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16);
};

/** 解析模型输出；起点吸附到最近的转录句首，首章从 0 开始，同一起点只留一章 */
export const parseChapters = (text: string, segments: TranscriptSegment[]): VideoNoteChapter[] => {
  const body = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const raw = (JSON.parse(body) as { chapters?: unknown }).chapters;
  if (!Array.isArray(raw)) throw new Error("章节格式不正确");
  const starts = segments.map(segment => segment.start);
  const snap = (value: number) =>
    starts.reduce((best, start) =>
      Math.abs(start - value) < Math.abs(best - value) ? start : best
    );
  const chapters = raw
    .filter(
      (item): item is { start: number; title: string; summary?: unknown } =>
        !!item &&
        typeof item.start === "number" &&
        typeof item.title === "string" &&
        !!item.title.trim()
    )
    .map(item => ({
      start: snap(item.start),
      title: item.title.trim(),
      summary: typeof item.summary === "string" ? item.summary.trim() : "",
    }))
    .sort((a, b) => a.start - b.start)
    .filter((item, index, list) => index === 0 || item.start !== list[index - 1].start);
  if (!chapters.length) throw new Error("没有生成章节");
  chapters[0].start = 0;
  return chapters;
};

const NO_CHAPTERS: VideoNoteChapter[] = [];

interface UseVideoNoteChaptersOptions {
  videoNote: VideoNote | null;
  /** 转录 / 断句进行中不生成 */
  busy: boolean;
  onSaved: (insights: VideoNote["insights"]) => void;
}

export function useVideoNoteChapters({ videoNote, busy, onSaved }: UseVideoNoteChaptersOptions) {
  const { provider, model } = useLLMConfig("videoSummary");
  const segments = videoNote?.transcriptSegments;
  const hash = useMemo(() => (segments?.length ? hashTranscript(segments) : null), [segments]);
  const insights = videoNote?.insights;
  const fresh = !!insights && insights.transcriptHash === hash;
  const chapters = fresh ? insights.chapters : NO_CHAPTERS;

  const mutation = useMutation({
    mutationFn: async (input: { id: number; hash: string; segments: TranscriptSegment[] }) => {
      if (!provider || !model) throw new Error("未配置视频总结模型");
      const messages: RequestMessage[] = [
        { role: Role.System, content: [{ type: "text", text: VIDEO_CHAPTERS_SYSTEM_PROMPT }] },
        {
          role: Role.User,
          content: [{ type: "text", text: buildVideoChaptersUserPrompt(input.segments) }],
        },
      ];
      const result = await piCompleteChat({
        provider,
        model,
        messages,
        source: { feature: "videoSummary", entityId: String(input.id) },
      });
      if (!result.ok) throw new Error(result.error || "章节生成失败");
      const next = {
        version: 2 as const,
        transcriptHash: input.hash,
        generatedAt: Date.now(),
        chapters: parseChapters(result.text, input.segments),
      };
      await updateVideoNoteInsights(input.id, next);
      return { id: input.id, insights: next };
    },
  });

  const videoNoteIdRef = useRef(videoNote?.id);
  videoNoteIdRef.current = videoNote?.id;
  const run = (manual: boolean) => {
    if (!videoNote || !hash || !segments?.length) return;
    mutation.mutate(
      { id: videoNote.id, hash, segments },
      {
        onSuccess: ({ id, insights: next }) => {
          if (id === videoNoteIdRef.current) onSaved(next);
          if (manual) toast.success("章节已重新生成");
        },
        onError: error => {
          console.error("Failed to generate video chapters:", error);
          if (manual) toast.error(`章节生成失败：${error.message}`);
        },
      }
    );
  };

  // 自动生成每个「笔记 + 转录版本」只尝试一次，失败不反复重试
  const attemptedRef = useRef<string | null>(null);
  const configured = !!provider && !!model;
  useEffect(() => {
    if (!configured || busy || fresh || !hash || !videoNote || mutation.isPending) return;
    const key = `${videoNote.id}:${hash}`;
    if (attemptedRef.current === key) return;
    attemptedRef.current = key;
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, busy, fresh, hash, videoNote?.id]);

  return {
    chapters,
    generating: mutation.isPending,
    /** 配了模型且有转录时才可手动重新生成 */
    canRegenerate: configured && !!hash,
    regenerate: () => run(true),
  };
}
