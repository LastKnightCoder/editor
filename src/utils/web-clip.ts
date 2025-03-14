import { nodeFetch } from "@/commands";
import { Message } from "@/types";
import { CONVERT_PROMPT, Role, WEB_CLIP_PROMPT } from "@/constants";
import { chatLLM } from "@/hooks/useChatLLM.ts";
import { Descendant } from "slate";
import { importFromMarkdown } from "@/utils/markdown.ts";

interface WebClipOptions {
  directFromHTML?: boolean;
}

interface WebClipResult {
  result: boolean;
  error?: string;
  value?: Descendant[];
}

export const webClipFromUrl = async (
  url: string,
  options: WebClipOptions = {},
): Promise<WebClipResult> => {
  const { directFromHTML } = options;

  const res = await nodeFetch(url, {
    method: "GET",
  });

  const text = res as string;
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");

  // 移除所有的 scripts
  doc.querySelectorAll("script").forEach((script) => script.remove());
  const pageContent = doc.getElementById("page-content");
  const html = pageContent?.innerHTML || doc.body.innerHTML;

  if (directFromHTML) {
    const messages: Message[] = [
      {
        role: Role.System,
        content: WEB_CLIP_PROMPT,
      },
      {
        role: Role.User,
        content: html,
      },
    ];

    try {
      let aiRes = await chatLLM(messages);
      if (aiRes) {
        aiRes = aiRes.trim();
        if (aiRes.startsWith("```json") && aiRes.endsWith("```")) {
          aiRes = aiRes.slice(7, -3);
        }
      }
      try {
        return {
          result: true,
          value: JSON.parse(aiRes || "[]"),
        };
      } catch (e) {
        return {
          result: false,
          error: "parse error",
        };
      }
    } catch (e) {
      return {
        result: false,
        error: "AI Return Error",
      };
    }
  }

  const convertMessages: Message[] = [
    {
      role: Role.System,
      content: CONVERT_PROMPT,
    },
    {
      role: Role.User,
      content: html,
    },
  ];

  const convertRes = (await chatLLM(convertMessages).catch(() => "")) || "";
  if (!convertRes)
    return {
      result: false,
      error: "AI Return Error",
    };

  const content = importFromMarkdown(convertRes);

  return {
    result: true,
    value: content,
  };
};
