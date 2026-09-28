import { useState } from "react";
import { useMemoizedFn } from "ahooks";
import { piCompleteChat } from "@/services/piLLM";
import {
  VIDEO_HIGHLIGHTS_SYSTEM_PROMPT,
  buildVideoHighlightsUserPrompt,
} from "@/constants/prompts/video-highlights";
import { Role } from "@/constants";
import type { RequestMessage, VideoNoteHighlight } from "@/types";
import type { LLMProviderSetting, LLMModelSetting } from "@/types/pi-llm";

interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

interface UseVideoHighlightsResult {
  isGenerating: boolean;
  error: Error | null;
  highlights: VideoNoteHighlight[];
  generateHighlights: (segments: TranscriptSegment[]) => Promise<VideoNoteHighlight[]>;
}

const tryParseJsonArray = (text: string): any[] => {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const tryParse = (source: string) => {
    try {
      const parsed = JSON.parse(source);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return null;
    }
  };

  const direct = tryParse(trimmed);
  if (direct) return direct;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch) {
    const fenced = tryParse(fencedMatch[1]);
    if (fenced) return fenced;
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    const sliced = tryParse(trimmed.slice(firstBracket, lastBracket + 1));
    if (sliced) return sliced;
  }

  return [];
};

export const useVideoHighlights = (
  provider: LLMProviderSetting | null,
  model: LLMModelSetting | null
): UseVideoHighlightsResult => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [highlights, setHighlights] = useState<VideoNoteHighlight[]>([]);

  const generateHighlights = useMemoizedFn(
    async (segments: TranscriptSegment[]): Promise<VideoNoteHighlight[]> => {
      if (!provider || !model) {
        const err = new Error("未配置视频总结模型");
        setError(err);
        throw err;
      }
      if (!segments.length) {
        setHighlights([]);
        return [];
      }

      setIsGenerating(true);
      setError(null);
      try {
        const messages: RequestMessage[] = [
          {
            role: Role.System,
            content: [{ type: "text", text: VIDEO_HIGHLIGHTS_SYSTEM_PROMPT }],
          },
          {
            role: Role.User,
            content: [{ type: "text", text: buildVideoHighlightsUserPrompt(segments) }],
          },
        ];

        const outcome = await piCompleteChat({ provider, model, messages });
        if (!outcome.ok) throw new Error(outcome.error ?? "模型请求失败");
        const content = outcome.text;
        const parsed = tryParseJsonArray(content || "");
        const normalized = parsed
          .map((item: any, index: number): VideoNoteHighlight | null => {
            if (!item || typeof item !== "object") {
              return null;
            }
            const title = String(item.title || "").trim();
            const quote = String(item.quote || item.text || "").trim();
            const start = Number(item.start);
            const end = Number(item.end);
            if (!title || !quote || !Number.isFinite(start) || !Number.isFinite(end)) {
              return null;
            }
            return {
              id: `${Date.now()}-${index}`,
              title,
              quote,
              start: Math.max(0, Math.floor(start)),
              end: Math.max(Math.floor(start), Math.floor(end)),
            };
          })
          .filter((item: VideoNoteHighlight | null): item is VideoNoteHighlight => !!item);

        setHighlights(normalized);
        return normalized;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    }
  );

  return {
    isGenerating,
    error,
    highlights,
    generateHighlights,
  };
};

export default useVideoHighlights;
