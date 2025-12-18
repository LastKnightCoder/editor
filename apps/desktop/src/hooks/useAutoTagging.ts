import { useState, useCallback } from "react";
import type { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import { chatLLM } from "./useChatLLM";
import { getMarkdown } from "@/utils/markdown";
import {
  AUTO_TAGGING_SYSTEM_PROMPT,
  buildAutoTaggingUserPrompt,
} from "@/constants/prompts";
import { Role } from "@/constants";
import type { ProviderConfig, ModelConfig } from "@/types/llm";
import type { RequestMessage } from "@/types";

interface UseAutoTaggingResult {
  suggestedTags: string[];
  isGenerating: boolean;
  error: Error | null;
  generateTags: (
    content: Descendant[],
    existingTags: string[],
    allGlobalTags: string[],
  ) => Promise<string[]>;
  reset: () => void;
}

/**
 * 解析 LLM 返回的标签响应
 * 支持 JSON 数组格式，以及降级到逗号/换行分割
 */
function parseTagsResponse(response: string, existingTags: string[]): string[] {
  let cleaned = response.trim();

  // 移除 markdown 代码块
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  // 移除可能的 BOM 和其他不可见字符
  cleaned = cleaned.replace(/^\uFEFF/, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      // 过滤掉已有标签（大小写不敏感）
      const existingLower = new Set(existingTags.map((t) => t.toLowerCase()));
      return parsed
        .filter(
          (tag): tag is string =>
            typeof tag === "string" && tag.trim().length > 0,
        )
        .filter((tag) => !existingLower.has(tag.toLowerCase()))
        .map((tag) => tag.trim());
    }
  } catch {
    // JSON 解析失败，尝试逗号/换行分割
    const tags = cleaned
      .split(/[,，\n]/)
      .map((t) => t.trim().replace(/^["'\[\]]+|["'\[\]]+$/g, ""))
      .filter((t) => t.length > 0);

    const existingLower = new Set(existingTags.map((t) => t.toLowerCase()));
    return tags.filter((tag) => !existingLower.has(tag.toLowerCase()));
  }

  return [];
}

export const useAutoTagging = (
  providerConfig: ProviderConfig | null,
  modelConfig: ModelConfig | null,
): UseAutoTaggingResult => {
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generateTags = useMemoizedFn(
    async (
      content: Descendant[],
      existingTags: string[],
      allGlobalTags: string[],
    ): Promise<string[]> => {
      if (!providerConfig || !modelConfig) {
        setError(new Error("未配置自动打标签模型"));
        return [];
      }

      setIsGenerating(true);
      setError(null);
      setSuggestedTags([]);

      try {
        const markdown = getMarkdown(content);

        if (!markdown || markdown.trim().length === 0) {
          setError(new Error("卡片内容为空"));
          return [];
        }

        const userPrompt = buildAutoTaggingUserPrompt(
          markdown,
          existingTags,
          allGlobalTags,
        );

        const messages: RequestMessage[] = [
          {
            role: Role.System,
            content: [{ type: "text", text: AUTO_TAGGING_SYSTEM_PROMPT }],
          },
          {
            role: Role.User,
            content: [
              {
                type: "text",
                text: userPrompt,
              },
            ],
          },
        ];

        const response = await chatLLM(providerConfig, modelConfig, messages);

        if (!response) {
          throw new Error("模型返回为空");
        }

        // 解析并过滤标签
        const tags = parseTagsResponse(response, existingTags);
        setSuggestedTags(tags);
        return tags;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return [];
      } finally {
        setIsGenerating(false);
      }
    },
  );

  const reset = useCallback(() => {
    setSuggestedTags([]);
    setError(null);
    setIsGenerating(false);
  }, []);

  return {
    suggestedTags,
    isGenerating,
    error,
    generateTags,
    reset,
  };
};

export default useAutoTagging;
