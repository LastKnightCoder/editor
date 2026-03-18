import { describe, expect, it } from "vitest";
import { extractPartialShowWidgetArgs } from "../partial-show-widget-parser";

describe("extractPartialShowWidgetArgs", () => {
  it("应能从未闭合 JSON 中提取已生成的 widget_code", () => {
    const raw = `{"i_have_seen_read_me":true,"title":"compound_interest","loading_messages":["正在生成"],"widget_code":"<div class=\\"card\\">hello`;

    const result = extractPartialShowWidgetArgs(raw);

    expect(result.iHaveSeenReadMe).toBe(true);
    expect(result.title).toBe("compound_interest");
    expect(result.loadingMessages).toEqual(["正在生成"]);
    expect(result.widgetCode).toBe('<div class="card">hello');
    expect(result.isLikelyComplete).toBe(false);
  });

  it("应在 JSON 完整闭合时返回 complete 状态", () => {
    const raw = `{"i_have_seen_read_me":true,"title":"widget","loading_messages":["a","b"],"widget_code":"<div>ok</div>"}`;

    const result = extractPartialShowWidgetArgs(raw);

    expect(result.title).toBe("widget");
    expect(result.loadingMessages).toEqual(["a", "b"]);
    expect(result.widgetCode).toBe("<div>ok</div>");
    expect(result.isLikelyComplete).toBe(true);
  });
});
