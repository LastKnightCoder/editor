import { useState } from "react";
import { useMemoizedFn } from "ahooks";
import { chatLLM } from "./useChatLLM";
import {
  VIDEO_INSIGHTS_SYSTEM_PROMPT,
  buildVideoInsightsUserPrompt,
} from "@/constants/prompts/video-insights";
import {
  computeTranscriptHash,
  parseVideoInsightsResponse,
} from "./video-insights-parser";
import { Role } from "@/constants";
import type {
  ProviderConfig,
  ModelConfig,
  RequestMessage,
  TranscriptSegment,
  VideoNoteInsights,
} from "@/types";

interface UseVideoInsightsResult {
  isGenerating: boolean;
  error: Error | null;
  generateInsights: (
    transcriptSegments: TranscriptSegment[],
    transcript?: string,
  ) => Promise<VideoNoteInsights>;
}

export const useVideoInsights = (
  providerConfig: ProviderConfig | null,
  modelConfig: ModelConfig | null,
): UseVideoInsightsResult => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generateInsights = useMemoizedFn(
    async (
      transcriptSegments: TranscriptSegment[],
      transcript?: string,
    ): Promise<VideoNoteInsights> => {
      if (!providerConfig || !modelConfig) {
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

        const response = await chatLLM(providerConfig, modelConfig, messages);
        const transcriptHash = computeTranscriptHash(
          transcript,
          transcriptSegments,
        );

        return parseVideoInsightsResponse(response || "", {
          mode: "full",
          transcriptHash,
          transcriptSegments,
          modelMeta: {
            providerId: providerConfig.id,
            providerName: providerConfig.name,
            modelName: modelConfig.name,
          },
        });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
  );

  return {
    isGenerating,
    error,
    generateInsights,
  };
};

export default useVideoInsights;
