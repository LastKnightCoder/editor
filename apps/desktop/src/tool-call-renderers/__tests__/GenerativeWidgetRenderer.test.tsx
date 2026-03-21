import { App } from "antd";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GenerativeWidgetRenderer from "../GenerativeWidgetRenderer";
import { buildGenerativeWidgetPayload } from "@/generative-ui/widget-render-payload";
import { SHOW_WIDGET_TOOL_NAME } from "@/generative-ui/constants";
import type { ToolCallExecutionState } from "@/types";

vi.mock("@/commands", () => ({
  openExternal: vi.fn(),
}));

vi.mock("../generative-widget/interaction-context", () => ({
  useChatWidgetInteraction: () => null,
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const createExecution = (
  overrides: Partial<ToolCallExecutionState> = {},
): ToolCallExecutionState => {
  const payload = buildGenerativeWidgetPayload({
    toolCallId: "widget-call-1",
    title: "测试 Widget",
    widgetCode:
      '<section class="panel"><h1>测试 Widget</h1><p>支持全屏查看</p></section>',
    phase: "final",
  });

  return {
    toolCallId: "widget-call-1",
    toolName: SHOW_WIDGET_TOOL_NAME,
    status: "success",
    input: '{"title":"测试 Widget"}',
    output: "",
    timestamp: Date.now(),
    metadata: {
      render: {
        rendererKey: "generative-widget",
        payload,
      },
    },
    ...overrides,
  };
};

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<App>{node}</App>);
  });
  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("GenerativeWidgetRenderer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("支持打开全屏查看渲染内容", async () => {
    const execution = createExecution();
    const { root, container } = await mount(
      <GenerativeWidgetRenderer
        execution={execution}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />,
    );

    const fullscreenButton = container.querySelector(
      'button[aria-label="全屏查看渲染内容"]',
    ) as HTMLButtonElement | null;

    expect(fullscreenButton).toBeTruthy();

    await act(async () => {
      fullscreenButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(document.body.textContent).toContain("测试 Widget · 全屏预览");
    expect(
      document.querySelectorAll('iframe[title="测试 Widget"]'),
    ).toHaveLength(2);
    expect(document.body.innerHTML).not.toContain("overflow-auto p-4");

    await unmount(root, container);
  });

  it("支持导出为可独立打开的 HTML 文件", async () => {
    const execution = createExecution();
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:widget-export");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    const { root, container } = await mount(
      <GenerativeWidgetRenderer
        execution={execution}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />,
    );

    const exportButton = container.querySelector(
      'button[aria-label="导出 HTML 文件"]',
    ) as HTMLButtonElement | null;

    expect(exportButton).toBeTruthy();

    await act(async () => {
      exportButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const downloadBlob = createObjectURL.mock.calls[0]?.[0];
    expect(downloadBlob).toBeInstanceOf(Blob);
    expect((downloadBlob as Blob).type).toBe("text/html;charset=utf-8");
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:widget-export");

    await unmount(root, container);
  });
});
