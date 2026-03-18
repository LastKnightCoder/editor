import { describe, expect, it } from "vitest";
import {
  buildToolStreamingMetadata,
  resolveToolExecutionMetadata,
  stripToolRenderMetadata,
} from "../streaming-tool-adapter";

describe("streaming-tool-adapter", () => {
  it("show_widget 的流式 metadata 只应生成 preview 阶段，不应提前标记 final", () => {
    const metadata = buildToolStreamingMetadata(
      "call-1",
      "show_widget",
      '{"title":"demo","widget_code":"<div>ok</div>"}',
      "preview",
    ) as { render?: { payload?: { phase?: string } } };

    expect(metadata.render?.payload?.phase).toBe("preview");
  });

  it("stripToolRenderMetadata 应移除 render 字段", () => {
    const metadata = {
      render: {
        rendererKey: "generative-widget",
        payload: { phase: "preview" },
      },
      other: {
        keep: true,
      },
    };

    expect(stripToolRenderMetadata(metadata)).toEqual({
      other: {
        keep: true,
      },
    });
    expect(
      stripToolRenderMetadata({
        render: {
          rendererKey: "generative-widget",
        },
      }),
    ).toBeUndefined();
  });

  it("show_widget 执行成功后应以最终 metadata 覆盖 preview payload", () => {
    const currentMetadata = buildToolStreamingMetadata(
      "call-1",
      "show_widget",
      '{"title":"demo","widget_code":"<div>preview</div>"}',
      "preview",
    );

    const resolved = resolveToolExecutionMetadata({
      toolName: "show_widget",
      currentMetadata,
      execution: {
        content: "ok",
        metadata: {
          render: {
            rendererKey: "generative-widget",
            payload: {
              phase: "final",
              title: "demo",
              finalHtml: "<div>final</div>",
            },
          },
        },
      },
    }) as { render?: { payload?: { phase?: string; finalHtml?: string } } };

    expect(resolved.render?.payload?.phase).toBe("final");
    expect(resolved.render?.payload?.finalHtml).toBe("<div>final</div>");
  });
});
