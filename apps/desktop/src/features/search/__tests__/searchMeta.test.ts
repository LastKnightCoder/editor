/**
 * 访问记录可回跳判据守护：二级页（match: params/multi）不得进搜索面板的
 * 「最近访问/常用」——visits 只存 page key，缺 id 的 push 被 sanitizeParams
 * 整条拒绝，条目点了没反应。
 */

import { describe, expect, it } from "vitest";
import { registerPageMeta } from "@/page/core/pageMeta";
// 触发真实 page 注册（与壳层 Vite glob 注册等价的最小副作用集）
import "@/features/cards/pages/cards.page";
import "@/features/cards/pages/card-detail.page";
import "@/features/articles/pages/article-detail.page";
import { isReplayableVisit } from "../searchMeta";

describe("isReplayableVisit", () => {
  it("single 页面无参即可还原实例，允许进访问记录", () => {
    expect(isReplayableVisit("cards")).toBe(true);
  });

  it("params 二级页缺 id 无法重放，拒绝", () => {
    expect(isReplayableVisit("card-detail")).toBe(false);
    expect(isReplayableVisit("article-detail")).toBe(false);
  });

  it("multi 页面每次新建、无稳定重放目标，拒绝", () => {
    registerPageMeta({
      key: "test-multi-page",
      match: "multi",
      label: "多实例测试页",
      fields: {},
    });
    expect(isReplayableVisit("test-multi-page")).toBe(false);
  });

  it("未注册 key 拒绝", () => {
    expect(isReplayableVisit("not-registered-key")).toBe(false);
  });
});
