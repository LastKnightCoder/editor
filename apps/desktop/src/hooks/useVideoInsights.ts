import { useState } from "react";
import { useMemoizedFn } from "ahooks";
import { piCompleteChat } from "@/services/piLLM";
import {
  VIDEO_INSIGHTS_SYSTEM_PROMPT,
  buildVideoInsightsUserPrompt,
} from "@/constants/prompts/video-insights";
import { computeTranscriptHash, parseVideoInsightsResponse } from "./video-insights-parser";
import { Role } from "@/constants";
import type { LLMProviderSetting, LLMModelSetting } from "@/types/pi-llm";
import type { RequestMessage, TranscriptSegment, VideoNoteInsights } from "@/types";

interface UseVideoInsightsResult {
  isGenerating: boolean;
  error: Error | null;
  generateInsights: (transcriptSegments: TranscriptSegment[]) => Promise<VideoNoteInsights>;
}

export const useVideoInsights = (
  provider: LLMProviderSetting | null,
  model: LLMModelSetting | null
): UseVideoInsightsResult => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generateInsights = useMemoizedFn(
    async (transcriptSegments: TranscriptSegment[]): Promise<VideoNoteInsights> => {
      if (!provider || !model) {
        const err = new Error("未配置视频总结模型");
        setError(err);
        throw err;
      }
      if (!transcriptSegments.length) {
        throw new Error("没有可用的转录片段");
      }

      setIsGenerating(true);
      setError(null);

      try {
        const messages: RequestMessage[] = [
          {
            role: Role.System,
            content: [{ type: "text", text: VIDEO_INSIGHTS_SYSTEM_PROMPT }],
          },
          {
            role: Role.User,
            content: [
              {
                type: "text",
                text: buildVideoInsightsUserPrompt(transcriptSegments),
              },
            ],
          },
        ];

        const outcome = await piCompleteChat({
          provider,
          model,
          messages,
          source: { feature: "videoInsights" },
        });
        if (!outcome.ok) throw new Error(outcome.error ?? "模型请求失败");
        const response = outcome.text;
        const transcriptHash = computeTranscriptHash("", transcriptSegments);

        return parseVideoInsightsResponse(response || "", {
          mode: "full",
          transcriptHash,
          transcriptSegments,
          modelMeta: {
            providerId: provider.id,
            providerName: provider.name,
            modelName: model.name,
          },
        });
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
    generateInsights,
  };
};

export default useVideoInsights;
