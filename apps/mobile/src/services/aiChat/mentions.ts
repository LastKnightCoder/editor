// 引用进入模型：用户消息上挂的 mentions 展开成正文前缀，模型据此知道「这段」「这篇」指什么。
// 会话 display 条目保留原始消息（含 mentions），历史仍显示用户原话与引用条。

import type { MentionRef, MessageContent } from "@tau/shared/chat-core";
import { prepareUserContent } from "@tau/ai/runtime";

const KIND_LABEL: Record<MentionRef["entityType"], string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
  diary: "日记",
};

const escapeAttribute = (value: string) => value.replace(/"/g, "'").replace(/\s+/g, " ").trim();

/** 选中文字给原文；整篇只给身份，模型按需用 get_content_markdown 读取 */
export function formatMention(mention: MentionRef) {
  const head = `type="${KIND_LABEL[mention.entityType] ?? mention.entityType}" contentId=${mention.contentId} title="${escapeAttribute(mention.title)}"`;
  return mention.quote
    ? `<引用 ${head} 范围="选中片段">\n${mention.previewText.trim()}\n</引用>`
    : `<引用 ${head} 范围="整篇">需要正文时用 get_content_markdown 读取</引用>`;
}

export function mentionsOf(content: readonly MessageContent[]): MentionRef[] {
  return content.flatMap(item => (item.type === "text" ? (item.mentions ?? []) : []));
}

/** 运行时 prepareInput：文本块前置引用，图片保持原样 */
export async function prepareMobileInput(content: MessageContent[]) {
  const expanded = content.map(item => {
    if (item.type !== "text" || !item.mentions?.length) return item;
    const prefix = item.mentions.map(formatMention).join("\n");
    return { type: "text" as const, text: `${prefix}\n\n${item.text}` };
  });
  return prepareUserContent(expanded);
}
