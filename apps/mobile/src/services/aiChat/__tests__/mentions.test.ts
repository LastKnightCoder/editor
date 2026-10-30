import { expect, it } from "vitest";
import type { MentionRef } from "@tau/shared/chat-core";
import { buildMessage } from "../chatController";
import { formatMention, prepareMobileInput } from "../mentions";

const quote: MentionRef = {
  entityType: "card",
  entityId: 3,
  contentId: 12,
  title: "间隔重复为什么有效",
  previewText: "记忆在学习后的最初几天衰减最快",
  quote: true,
};
const whole: MentionRef = {
  entityType: "diary",
  entityId: 40,
  contentId: 40,
  title: '10 月 29 日 "周四"',
  previewText: "",
};

it("选中片段带原文，整篇只给身份并提示按需读取", () => {
  expect(formatMention(quote)).toBe(
    '<引用 type="卡片" contentId=12 title="间隔重复为什么有效" 范围="选中片段">\n记忆在学习后的最初几天衰减最快\n</引用>'
  );
  const text = formatMention(whole);
  expect(text).toContain('type="日记" contentId=40');
  expect(text).toContain("title=\"10 月 29 日 '周四'\"");
  expect(text).toContain("get_content_markdown");
});

it("prepareInput 把引用前置到正文，图片原样保留；无引用与缺省处理一致", async () => {
  const content = await prepareMobileInput([
    { type: "image", image: "data:image/jpeg;base64,AAAA" },
    { type: "text", text: "为什么？", mentions: [quote] },
  ]);
  expect(content).toEqual([
    { type: "image", mimeType: "image/jpeg", data: "AAAA" },
    { type: "text", text: `${formatMention(quote)}\n\n为什么？` },
  ]);
  expect(await prepareMobileInput([{ type: "text", text: "你好" }])).toEqual([
    { type: "text", text: "你好" },
  ]);
});

it("buildMessage：只有引用没写字时补缺省问法；图片在前；空输入不产生消息", () => {
  expect(buildMessage({ text: "", mentions: [whole] })).toEqual([
    { type: "text", text: "请看看这些内容", mentions: [whole] },
  ]);
  expect(buildMessage({ text: " 看图 ", images: ["data:image/png;base64,QQ=="] })).toEqual([
    { type: "image", image: "data:image/png;base64,QQ==" },
    { type: "text", text: "看图" },
  ]);
  expect(buildMessage({ text: "  " })).toEqual([]);
});
