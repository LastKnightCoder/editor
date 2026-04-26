import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  closeInlineAIComposer,
  isInlineAIComposerOpen,
  openInlineAIComposer,
  toggleInlineAIComposer,
} from "../panel-manager";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/services/editorServices", () => ({
  createEditorServices: vi.fn(() => ({
    theme: {
      getCurrentTheme: () => "light",
      subscribe: () => () => undefined,
    },
    settings: {
      get: () => ({}),
      subscribe: () => () => undefined,
    },
  })),
}));

vi.mock("../components/InlineAIComposerPanel", async () => {
  const { App } = await import("antd");
  const { useDragDropManager } = await import("react-dnd");
  const { useEditorServices } =
    await import("@tau/editor/src/contexts/EditorServicesContext");

  const MockInlineAIComposerPanel = () => {
    const services = useEditorServices();
    const app = App.useApp();
    const dragDropManager = useDragDropManager();
    return (
      <div data-testid="inline-ai-composer-panel">
        {services && app?.message && dragDropManager
          ? "Ask AI 输入框"
          : "缺少服务"}
      </div>
    );
  };

  return {
    default: MockInlineAIComposerPanel,
  };
});

describe("inline-ai-assistant/panel-manager", () => {
  afterEach(async () => {
    await act(async () => {
      closeInlineAIComposer();
    });
    document.getElementById("inline-ai-composer-root")?.remove();
  });

  it("openInlineAIComposer 应为独立 root 面板补齐 EditorServicesProvider", async () => {
    await act(async () => {
      openInlineAIComposer({} as never, "hovering");
    });

    const container = document.getElementById("inline-ai-composer-root");
    expect(container).toBeTruthy();
    expect(container?.textContent).toContain("Ask AI 输入框");
    expect(isInlineAIComposerOpen()).toBe(true);
  });

  it("toggleInlineAIComposer 应支持打开与关闭独立 root 面板", async () => {
    await act(async () => {
      toggleInlineAIComposer({} as never, "hotkey");
    });

    expect(document.getElementById("inline-ai-composer-root")).toBeTruthy();
    expect(isInlineAIComposerOpen()).toBe(true);

    await act(async () => {
      toggleInlineAIComposer({} as never, "hotkey");
    });

    expect(document.getElementById("inline-ai-composer-root")).toBeNull();
    expect(isInlineAIComposerOpen()).toBe(false);
  });
});
