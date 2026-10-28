import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { Descendant } from "slate";
import { QuickCaptureSheet } from "../QuickCaptureSheet";

const draft = vi.hoisted(() => ({ read: vi.fn(), clear: vi.fn(), write: vi.fn() }));
vi.mock("../quickCaptureDraft", () => ({
  readQuickCaptureDraft: draft.read,
  clearQuickCaptureDraft: draft.clear,
  writeQuickCaptureDraft: draft.write,
}));
vi.mock("../../../services/editorKit", () => ({
  getMobileContentKit: () => ({}),
  useMobileContentKit: () => ({}),
}));
vi.mock("../editorToolbar/useMobileEditorToolbarController", () => ({
  useMobileEditorToolbarController: () => ({
    syncSelection: () => undefined,
    openContentMention: vi.fn(),
  }),
}));
vi.mock("../editorToolbar/MobileEditorBottomToolbar", () => ({
  MobileEditorBottomToolbar: () => null,
}));
vi.mock("../../../components/SnapSheet", () => ({
  SnapSheet: Object.assign(
    ({ open, children }: { open: boolean; children: ReactNode }) => (open ? children : null),
    { Handle: () => null, FixedFooterScroll: ({ children }: { children: ReactNode }) => children }
  ),
}));
vi.mock("@tau/editor", async () => {
  const { useState, forwardRef, useImperativeHandle } = await import("react");
  return {
    Editor: forwardRef(({ initValue }: { initValue: Descendant[] }, ref) => {
      const [initial] = useState(initValue);
      useImperativeHandle(
        ref,
        () => ({ getEditor: () => ({ children: initial }), getEditableElement: () => null }),
        [initial]
      );
      return <output>{JSON.stringify(initial)}</output>;
    }),
  };
});

it("恢复草稿与清空建立新会话，关闭取得当前内容", async () => {
  const content: Descendant[] = [
    { type: "paragraph", children: [{ type: "formatted", text: "保留的草稿" }] },
  ];
  draft.read.mockReturnValue(content);
  const close = vi.fn();
  const host = document.createElement("div"),
    root = createRoot(host);
  const click = async (text: string) => {
    const button = [...host.querySelectorAll("button")].find(
      item => item.textContent === text || item.getAttribute("aria-label") === text
    );
    if (!button) throw new Error(`未找到 ${text}`);
    await act(async () => button.click());
  };
  try {
    await act(async () =>
      root.render(<QuickCaptureSheet open saving={false} onRequestClose={close} />)
    );
    const original = host.querySelector("output");
    await click("恢复草稿");
    expect(host.querySelector("output")).not.toBe(original);
    expect(host.querySelector("output")?.textContent).toContain("保留的草稿");
    await act(async () =>
      root.render(
        <QuickCaptureSheet
          open
          saving={false}
          onContentChange={() => undefined}
          onRequestClose={close}
        />
      )
    );
    expect(host.querySelector("output")?.textContent).toContain("保留的草稿");
    await click("关闭快速捕获");
    expect(close).toHaveBeenLastCalledWith(content);
    await click("清空");
    expect(host.querySelector("output")?.textContent).not.toContain("保留的草稿");
    expect(draft.clear).toHaveBeenCalled();
    await click("关闭快速捕获");
    expect(JSON.stringify(close.mock.calls[close.mock.calls.length - 1])).not.toContain(
      "保留的草稿"
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
