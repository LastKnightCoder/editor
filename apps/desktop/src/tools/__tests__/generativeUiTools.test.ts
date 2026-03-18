import { describe, expect, it } from "vitest";
import {
  createShowWidgetTool,
  createVisualizeReadMeTool,
} from "../generativeUiTools";

describe("generativeUiTools", () => {
  it("应按 signal 隔离 visualize_read_me 已读状态", async () => {
    const readMeTool = createVisualizeReadMeTool();
    const showWidgetTool = createShowWidgetTool();
    const signalA = new AbortController().signal;
    const signalB = new AbortController().signal;

    await readMeTool.executor(
      { modules: ["interactive"] },
      {
        toolCallId: "readme-a",
        toolName: "visualize_read_me",
        source: "test",
        signal: signalA,
      },
    );

    const success = await showWidgetTool.executor(
      {
        i_have_seen_read_me: true,
        title: "demo",
        widget_code: "<div>ok</div>",
      },
      {
        toolCallId: "show-a",
        toolName: "show_widget",
        source: "test",
        signal: signalA,
      },
    );

    const failure = await showWidgetTool.executor(
      {
        i_have_seen_read_me: true,
        title: "demo",
        widget_code: "<div>ok</div>",
      },
      {
        toolCallId: "show-b",
        toolName: "show_widget",
        source: "test",
        signal: signalB,
      },
    );

    expect(
      typeof success === "string" ? success : success?.isParameterError,
    ).not.toBe(true);
    expect(
      typeof failure === "string" ? undefined : failure?.isParameterError,
    ).toBe(true);
  });

  it("应在缺少会话 token 时不共享 visualize_read_me 状态", async () => {
    const readMeTool = createVisualizeReadMeTool();
    const showWidgetTool = createShowWidgetTool();

    await readMeTool.executor(
      { modules: ["interactive"] },
      {
        toolCallId: "readme-anon",
        toolName: "visualize_read_me",
        source: "test",
      },
    );

    const result = await showWidgetTool.executor(
      {
        i_have_seen_read_me: true,
        title: "demo",
        widget_code: "<div>ok</div>",
      },
      {
        toolCallId: "show-anon",
        toolName: "show_widget",
        source: "test",
      },
    );

    expect(
      typeof result === "string" ? result : result?.isParameterError,
    ).not.toBe(true);
  });
});
