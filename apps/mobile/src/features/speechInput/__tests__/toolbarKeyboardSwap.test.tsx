import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.mock("../../cards/editorExtensions/ContentLinkPickerSheet", () => ({ default: () => null }));
vi.mock("../../../components/KeyboardViewportProvider", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../components/KeyboardViewportProvider")>()),
  useKeyboardViewport: () => ({
    viewportHeight: 544,
    keyboardHeight: 300,
    rawKeyboardHeight: 300,
    reservedHeight: 0,
    lastKeyboardHeight: 300,
  }),
}));
vi.mock("../useEditorDictation", () => ({
  useEditorDictation: (options: { onKeyboardSwapChange?: (active: boolean) => void }) => ({
    begin: () => options.onKeyboardSwapChange?.(true),
    finish: () => options.onKeyboardSwapChange?.(false),
    cancel: () => options.onKeyboardSwapChange?.(false),
    phase: "listening",
    active: true,
    startedAt: null,
    panelHeight: 300,
    unavailableReason: null,
    setCancelArmed: () => undefined,
    pillActions: {},
  }),
}));

import { MobileEditorBottomToolbar } from "../../cards/editorToolbar/MobileEditorBottomToolbar";
import { createControllerStub } from "../../cards/__tests__/toolbarControllerStub";

it("语音收键盘后失焦不卸载入口，松手后才恢复普通工具栏显隐", () => {
  vi.useFakeTimers();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (focused: boolean) =>
    act(() =>
      root.render(
        <MobileEditorBottomToolbar
          controller={createControllerStub({ isToolbarVisible: focused })}
        />
      )
    );
  const pointer = (type: string, target: EventTarget) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: 1 });
    target.dispatchEvent(event);
  };
  try {
    render(true);
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="按住说话"]');
    if (!button) throw new Error("语音输入入口未挂载");
    act(() => pointer("pointerdown", button));
    act(() => vi.advanceTimersByTime(250));
    render(false);
    expect(document.querySelector("[data-mobile-editor-toolbar]")).toBeTruthy();
    expect(document.querySelector("[data-dictation-overlay]")).toBeTruthy();
    act(() => pointer("pointerup", window));
    expect(document.querySelector("[data-mobile-editor-toolbar]")).toBeNull();
    expect(document.querySelector("[data-dictation-overlay]")).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  }
});
