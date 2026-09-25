import { describe, expect, it } from "vitest";
import { Role } from "@/constants";
import type { AssistantBlock, ChatSessionMessage } from "@/types/llm";
import { findFenceIndex, parseFences } from "../model/fences";
import {
  extractChatBlocks,
  normalizeTitle,
  versionsOf,
  type ResolveBlockType,
} from "../model/chatBlocks";

const resolve: ResolveBlockType = (lang, content) => {
  if (lang === "html" && /^<!DOCTYPE\s+html>/i.test(content.trim()))
    return { type: "html", title: c => /<title>(.*?)<\/title>/i.exec(c)?.[1] };
  if (lang === "mind-map")
    return { type: "mind-map", title: c => c.split("\n")[0]?.replace(/^[-*]\s*/, "") };
  if (lang === "tikz" || lang === "latex-tikz") return { type: "tikz", title: () => undefined };
  return null;
};

const text = (content: string, state: "streaming" | "final" = "final"): AssistantBlock => ({
  id: Math.random().toString(36),
  turnId: "t",
  type: "text",
  state,
  content,
});
const tool = (): AssistantBlock =>
  ({ id: "x", turnId: "t", type: "tool_call", state: "final", toolCall: {} }) as AssistantBlock;

const user = (content: string) => ({ role: Role.User, content }) as ChatSessionMessage;
const assistant = (...blocks: AssistantBlock[]) =>
  ({ role: Role.Assistant, content: "", assistant_blocks: blocks }) as ChatSessionMessage;
const system = { role: Role.System, content: "sys" } as ChatSessionMessage;

const html = (title: string, body = "") =>
  `<!DOCTYPE html>\n<html><head><title>${title}</title></head><body>${body}</body></html>`;

describe("parseFences", () => {
  it("与 react-markdown 同口径：语言取 info 首词，内容不含首尾换行", () => {
    const fences = parseFences("前言\n```html title=x\n<a>\n  b\n```\n后记\n~~~\nplain\n~~~");
    expect(fences).toEqual([
      { lang: "html", content: "<a>\n  b", closed: true },
      { lang: "", content: "plain", closed: true },
    ]);
  });

  it("闭栏须同字符且不短于开栏；末尾未闭合的围栏返回 closed=false", () => {
    expect(parseFences("````md\n```\ninner\n```\n````")).toEqual([
      { lang: "md", content: "```\ninner\n```", closed: true },
    ]);
    expect(parseFences("```mind-map\n- 根\n  - 子")).toEqual([
      { lang: "mind-map", content: "- 根\n  - 子", closed: false },
    ]);
  });

  it("列表内缩进的围栏：内容行剥掉开栏缩进", () => {
    expect(parseFences("1. 步骤\n   ```js\n   a()\n     b()\n   ```")[0].content).toBe(
      "a()\n  b()"
    );
  });

  it("findFenceIndex 按内容定位段内序号", () => {
    const seg = "```html\nA\n```\n\n```html\nB\n```";
    expect(findFenceIndex(seg, "B")).toBe(1);
    expect(findFenceIndex(seg, "C")).toBe(-1);
  });
});

describe("extractChatBlocks", () => {
  it("key = 可见消息序号 . 内容段序号 . 段内围栏序号（与 MessageView 分段一致）", () => {
    const chat = {
      messages: [
        system,
        user("做一个页面"),
        assistant(
          text("   "), // 空文本段被 MessageView 过滤，不占段号
          tool(),
          text(`说明\n\`\`\`html\n${html("甲")}\n\`\`\`\n\`\`\`python\nprint(1)\n\`\`\``),
          text(`\`\`\`mind-map\n- 导图\n\`\`\``)
        ),
      ],
    };
    const blocks = extractChatBlocks(chat, resolve);
    expect(blocks.map(b => [b.key, b.type, b.title])).toEqual([
      ["1.1.0", "html", "甲"],
      ["1.2.0", "mind-map", "导图"],
    ]);
  });

  it("同段两块同语言不再撞 id", () => {
    const chat = {
      messages: [
        assistant(text(`\`\`\`html\n${html("A")}\n\`\`\`\n\`\`\`html\n${html("B")}\n\`\`\``)),
      ],
    };
    expect(extractChatBlocks(chat, resolve).map(b => b.key)).toEqual(["0.0.0", "0.0.1"]);
  });

  it("不完整的 HTML（无 DOCTYPE）不算块", () => {
    const chat = { messages: [assistant(text("```html\n<div>片段</div>\n```"))] };
    expect(extractChatBlocks(chat, resolve)).toEqual([]);
  });

  it("generating：仅最后一条消息、围栏未闭合且文本段仍在流式", () => {
    const streaming = { messages: [assistant(text("```mind-map\n- 根\n  - 子", "streaming"))] };
    expect(extractChatBlocks(streaming, resolve)[0].generating).toBe(true);

    const interrupted = { messages: [assistant(text("```mind-map\n- 根", "final"))] };
    expect(extractChatBlocks(interrupted, resolve)[0].generating).toBe(false);

    const notLast = {
      messages: [assistant(text("```mind-map\n- 根", "streaming")), user("继续")],
    };
    expect(extractChatBlocks(notLast, resolve)[0].generating).toBe(false);
  });

  it("版本：同类型同名（忽略 v 后缀）归一组，按出现顺序编号；无标题各自独立", () => {
    const chat = {
      messages: [
        assistant(text(`\`\`\`html\n${html("演示模板 v1")}\n\`\`\``)),
        user("再改改"),
        assistant(text(`\`\`\`html\n${html("演示模板 v2.0")}\n\`\`\``)),
        user("导图"),
        assistant(text("```mind-map\n- 演示模板\n```\n```tikz\na\n```\n```tikz\nb\n```")),
        user("最终版"),
        assistant(text(`\`\`\`html\n${html("演示模板（V3）")}\n\`\`\``)),
      ],
    };
    const blocks = extractChatBlocks(chat, resolve);
    const htmls = blocks.filter(b => b.type === "html");
    expect(htmls.map(b => [b.version, b.versionCount])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(versionsOf(blocks, htmls[1]).map(b => b.key)).toEqual(htmls.map(b => b.key));
    // 导图同名但类型不同，不并入；无标题的 tikz 各自为 1/1
    expect(blocks.filter(b => b.type !== "html").map(b => b.versionCount)).toEqual([1, 1, 1]);
  });

  it("normalizeTitle 去掉常见版本后缀", () => {
    expect(normalizeTitle("电影感全屏演示超级模板 v3.0")).toBe("电影感全屏演示超级模板");
    expect(normalizeTitle("Deck-V2")).toBe("deck");
    expect(normalizeTitle("规划 (v10)")).toBe("规划");
    expect(normalizeTitle("Vue 入门")).toBe("vue 入门");
  });
});
