import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import RemoteAudioSelectModal from "../index";
import RemoteVideoSelectModal from "@/components/RemoteVideoSelectModal";
let root: Root | undefined;
let host: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  document.body.innerHTML = "";
  desktopLocaleSource.setLocale("zh-CN");
});
async function mount(kind: "audio" | "video") {
  const confirm = vi.fn();
  const cancel = vi.fn();
  function View() {
    useSyncExternalStore(desktopI18n.subscribe, desktopI18n.getSnapshot, desktopI18n.getSnapshot);
    return kind === "audio" ? (
      <RemoteAudioSelectModal open onConfirm={confirm} onCancel={cancel} />
    ) : (
      <RemoteVideoSelectModal open onConfirm={confirm} onCancel={cancel} />
    );
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<View />));
  const input = document.querySelector<HTMLInputElement>('input[type="url"]');
  if (!input) throw new Error("missing URL input");
  return { input, confirm, cancel };
}
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("missing native setter");
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const submit = (input: HTMLInputElement) =>
  act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
it.each(["audio", "video"] as const)(
  "%s URL错误与草稿换语不丢失，确认仍原样trim并保留原payload形状",
  async kind => {
    const { input, confirm, cancel } = await mount(kind);
    await type(input, "invalid url");
    await submit(input);
    const error = document.querySelector('[role="alert"]');
    if (!error) throw new Error("missing validation error");
    await act(async () => {
      input.focus();
      input.setSelectionRange(2, 5);
    });
    const initialError = error.textContent;
    for (const locale of ["en-US", "zh-TW"] as const) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(document.querySelector('input[type="url"]')).toBe(input);
      expect(input.value).toBe("invalid url");
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
      expect(document.querySelector('[role="alert"]')).toBe(error);
      expect(error.textContent).not.toBe(initialError);
      expect(confirm).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
    }
    const url = "https://raw.example/原文%20media?item=原始";
    await type(input, `  ${url}  `);
    await submit(input);
    expect(confirm).toHaveBeenCalledExactlyOnceWith(kind === "audio" ? url : { url });
  }
);
it.each(["audio", "video"] as const)(
  "%s维持原URL协议校验，不因显示语言收紧或放宽接受范围",
  async kind => {
    const { input, confirm } = await mount(kind);
    await type(input, "ftp://raw.example/media");
    await submit(input);
    if (kind === "audio") {
      expect(confirm).not.toHaveBeenCalled();
      expect(document.querySelector('[role="alert"]')).not.toBeNull();
    } else expect(confirm).toHaveBeenCalledExactlyOnceWith({ url: "ftp://raw.example/media" });
  }
);
