import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ICard } from "@/types";

const titles = vi.hoisted(() => ({ current: {} as Record<string, string> }));
vi.mock("@/commands/content-ai", () => ({
  getContentAiTitles: vi.fn(async () => titles.current),
}));

import { cardTitle } from "@/utils/card-title";
import { cardDetailKey, cardsKey, patchCardAiTitles } from "../queries";

const paragraph = (text: string) =>
  ({ type: "paragraph", children: [{ type: "formatted", text }] }) as never;
const card = (id: number, contentId: number, text: string, aiTitle?: string) =>
  ({ id, contentId, content: [paragraph(text)], aiTitle }) as unknown as ICard;

describe("卡片 AI 标题", () => {
  it("cardTitle：AI 标题优先，否则正文前 N 字", () => {
    expect(cardTitle(card(1, 10, "正文开头很长很长", "AI 标题"), 4)).toBe("AI 标题");
    expect(cardTitle(card(1, 10, "正文开头很长很长"), 4)).toBe("正文开头");
    expect(cardTitle(card(1, 10, "正文开头", "  "), 20)).toBe("正文开头");
  });

  it("变更通知按正文补进列表与详情缓存，其他库与未变化的卡片不动", async () => {
    const client = new QueryClient();
    client.setQueryData(cardsKey("data.db"), [card(1, 10, "a", "旧"), card(2, 20, "b")]);
    client.setQueryData(cardDetailKey("data.db", 2), card(2, 20, "b"));
    client.setQueryData(cardsKey("other.db"), [card(3, 20, "c")]);
    titles.current = { "20": "新标题" };
    await patchCardAiTitles(client, "data", [20]);
    expect(client.getQueryData<ICard[]>(cardsKey("data.db"))?.map(c => c.aiTitle)).toEqual([
      "旧",
      "新标题",
    ]);
    expect(client.getQueryData<ICard>(cardDetailKey("data.db", 2))?.aiTitle).toBe("新标题");
    expect(client.getQueryData<ICard[]>(cardsKey("other.db"))?.[0].aiTitle).toBeUndefined();
  });
});
