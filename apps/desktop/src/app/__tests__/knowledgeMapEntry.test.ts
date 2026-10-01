import { describe, expect, it, vi } from "vitest";

vi.mock("@/platform", () => ({ isWinOrLinux: false }));

import { focusKeyOf } from "../Titlebar";

describe("知识地图入口的 focus", () => {
  it("卡片、文章、项目文档详情转成地图节点键", () => {
    expect(focusKeyOf({ key: "card-detail", params: { id: 12 } })).toBe("card:12");
    expect(focusKeyOf({ key: "article-detail", params: { id: "3" } })).toBe("article:3");
    expect(focusKeyOf({ key: "project-detail", params: { id: 7, itemId: 5 } })).toBe(
      "project-item:5"
    );
  });

  it("其他页面、项目首页（没有选中文档）与非法 id 不带 focus", () => {
    expect(focusKeyOf({ key: "cards", params: { id: "前端" } })).toBeUndefined();
    expect(focusKeyOf({ key: "project-detail", params: { id: 7 } })).toBeUndefined();
    expect(focusKeyOf({ key: "card-detail", params: { id: 0 } })).toBeUndefined();
    expect(focusKeyOf(undefined)).toBeUndefined();
  });
});
