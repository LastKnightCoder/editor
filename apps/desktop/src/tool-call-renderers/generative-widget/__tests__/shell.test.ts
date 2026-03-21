import { describe, expect, it } from "vitest";
import { buildGenerativeWidgetPayload } from "@/generative-ui/widget-render-payload";
import { getStandaloneGenerativeWidgetHtml } from "../shell";

describe("generative-widget/shell", () => {
  it("应生成可独立打开的导出 HTML", () => {
    const payload = buildGenerativeWidgetPayload({
      toolCallId: "widget-export-1",
      title: "测试导出",
      widgetCode:
        '<section><h1>测试导出</h1><a href="https://example.com">查看详情</a><script>console.log("ok")</script></section>',
      phase: "final",
    });

    const html = getStandaloneGenerativeWidgetHtml({
      documentTitle: "测试导出页面",
      payload,
      effectivePhase: "final",
      theme: {
        "--widget-accent": "#2563eb",
      },
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("window.__TAU_WIDGET_STANDALONE_CONFIG__=");
    expect(html).toContain('"effectivePhase":"final"');
    expect(html).toContain('"documentTitle":"测试导出页面"');
    expect(html).toContain("\\u003Cscript\\u003Econsole.log(");
    expect(html).toContain('data-widget-standalone="true"');
  });
});
