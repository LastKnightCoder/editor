import { useState } from "react";
import { useMemoizedFn } from "ahooks";
import { chatLLM } from "./useChatLLM";
import {
  TOPIC_HIGHLIGHTS_SYSTEM_PROMPT,
  buildTopicHighlightsUserPrompt,
} from "@/constants/prompts/topic-highlights";
import {
  computeTranscriptHash,
  mergeTopicInsights,
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

interface UseTopicHighlightsResult {
  isGenerating: boolean;
  error: Error | null;
  generateTopicHighlights: (
    topicName: string,
    transcriptSegments: TranscriptSegment[],
    transcript: string | undefined,
    currentInsights?: VideoNoteInsights,
  ) => Promise<VideoNoteInsights>;
}

export const useTopicHighlights = (
  providerConfig: ProviderConfig | null,
  modelConfig: ModelConfig | null,
): UseTopicHighlightsResult => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generateTopicHighlights = useMemoizedFn(
    async (
      topicName: string,
      transcriptSegments: TranscriptSegment[],
      transcript: string | undefined,
      currentInsights?: VideoNoteInsights,
    ): Promise<VideoNoteInsights> => {
      if (!providerConfig || !modelConfig) {
        const err = new Error("未配置视频总结模型");
        setError(err);
        throw err;
      }
      if (!topicName.trim()) {
        throw new Error("主题词不能为空");
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
            content: [{ type: "text", text: TOPIC_HIGHLIGHTS_SYSTEM_PROMPT }],
          },
          {
            role: Role.User,
            content: [
              {
                type: "text",
                text: buildTopicHighlightsUserPrompt(
                  topicName,
                  transcriptSegments,
                ),
              },
            ],
          },
        ];

        const response = await chatLLM(providerConfig, modelConfig, messages);
        const transcriptHash = computeTranscriptHash(
          transcript,
          transcriptSegments,
        );
        const parsed = parseVideoInsightsResponse(response || "", {
          mode: "topic",
          customTopicName: topicName,
          transcriptHash,
          transcriptSegments,
          modelMeta: {
            providerId: providerConfig.id,
            providerName: providerConfig.name,
            modelName: modelConfig.name,
          },
        });
        return mergeTopicInsights(currentInsights, parsed);
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
    generateTopicHighlights,
  };
};

export default useTopicHighlights;
