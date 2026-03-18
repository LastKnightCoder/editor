import { describe, expect, it } from "vitest";
import {
  buildGenerativeWidgetPayload,
  normalizeWidgetVisualHtml,
  sanitizeWidgetPreviewHtml,
} from "../widget-render-payload";

describe("widget-render-payload", () => {
  it("preview 阶段应去除完整 script 并截断半截 script", () => {
    const html = `<div>hello</div><script>console.log("x")</script><div>tail</div><script>window.foo =`;

    const preview = sanitizeWidgetPreviewHtml(html);

    expect(preview).toContain("<div>hello</div>");
    expect(preview).toContain("<div>tail</div>");
    expect(preview).not.toContain("<script");
    expect(preview).not.toContain("console.log");
  });

  it("应为同视觉内容生成稳定签名，并保留最终脚本", () => {
    const payload = buildGenerativeWidgetPayload({
      toolCallId: "call-1",
      title: "demo",
      widgetCode:
        '<div class="box" onclick="alert(1)">Hi</div><script>window.done=true;</script>',
      phase: "final",
    });

    expect(payload.previewHtml).toBe('<div class="box">Hi</div>');
    expect(payload.finalHtml).toContain("<script>");
    expect(payload.visualSignature).toBe(
      normalizeWidgetVisualHtml(payload.finalHtml),
    );
    expect(payload.hasScripts).toBe(true);
  });
});
