import { nodeFetch } from "@/commands";
import { Message } from "@/types";
import { CONVERT_PROMPT, Role } from "@/constants";
import { chatLLM } from "@/hooks/useChatLLM.ts";
import { Descendant } from "slate";
import { importFromMarkdown } from "@/utils/markdown.ts";

interface WebClipResult {
  result: boolean;
  error?: string;
  value?: Descendant[];
}

export const getContentHTML = (html: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  // 移除所有的 scripts
  doc.querySelectorAll("script").forEach((script) => script.remove());
  // 微信公众号的内容都在 page-content 中
  const pageContent = doc.getElementById("page-content");
  return pageContent?.innerHTML || doc.body.innerHTML;
};

export const convertHTMLToMarkdown = async (html: string): Promise<string> => {
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

  const convertRes: string =
    (await chatLLM(convertMessages).catch((e) => {
      console.error(e);
      return "";
    })) || "";
  return convertRes;
};

export const webClipFromUrl = async (url: string): Promise<WebClipResult> => {
  const res = await nodeFetch(url, {
    method: "GET",
  });

  const html = getContentHTML(res as string);
  const convertRes = await convertHTMLToMarkdown(html);

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
