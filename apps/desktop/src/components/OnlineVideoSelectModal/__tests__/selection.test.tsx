import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
const wire = vi.hoisted(() => ({
  call: vi.fn(),
  providers: { ready: true, providers: [{ id: "raw-provider", name: "用户提供方名" }] },
}));
vi.mock("@/commands/plugin-video", () => ({
  callPluginVideo: wire.call,
  getVideoProviders: () => wire.providers,
}));
vi.mock("@/hooks/useVideoProviders", () => ({ useVideoProviderName: () => "用户提供方名" }));
vi.mock("@/utils/mediaSource", async original => {
  const actual = await original<typeof import("@/utils/mediaSource")>();
  return { ...actual, resolveMediaSource: async (url: string) => ({ url, method: "remote" }) };
});
import OnlineVideoSelectModal from "../index";
let root: Root | undefined;
let host: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  document.body.innerHTML = "";
  desktopLocaleSource.setLocale("zh-CN");
  vi.clearAllMocks();
});
it("解析挂起与清晰度选择期间换语不取消请求或重置，提交保留原插件视频数据", async () => {
  let finish!: (info: unknown) => void;
  let signal!: AbortSignal;
  wire.call.mockImplementation((request, requestSignal) => {
    signal = requestSignal;
    return request.kind === "match"
      ? Promise.resolve("raw-provider")
      : new Promise(resolve => {
          finish = resolve;
        });
  });
  const confirm = vi.fn();
  const cancel = vi.fn();
  function View() {
    useSyncExternalStore(desktopI18n.subscribe, desktopI18n.getSnapshot, desktopI18n.getSnapshot);
    return (
      <OnlineVideoSelectModal
        open
        providerId="raw-provider"
        initialUrl="https://raw.example/影片"
        onConfirm={confirm}
        onCancel={cancel}
      />
    );
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<View />));
  const input = document.querySelector<HTMLInputElement>('input[type="url"]');
  if (!input) throw new Error("missing URL input");
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  );
  expect(wire.call).toHaveBeenCalledTimes(2);
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(document.querySelector('input[type="url"]')).toBe(input);
    expect(input.value).toBe("https://raw.example/影片");
    expect(wire.call).toHaveBeenCalledTimes(2);
    expect(signal.aborted).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  }
  await act(async () => desktopLocaleSource.setLocale("zh-CN"));
  const ref = { raw: "variant-ref-二" };
  await act(async () =>
    finish({
      title: "插件返回原视频名",
      cover: "https://raw.example/封面",
      variants: [
        { label: "原始清晰度甲", ref: { raw: 1 } },
        { label: "原始清晰度乙", hint: "原始提示", ref },
      ],
      defaultVariant: 1,
    })
  );
  const choice = document.querySelector<HTMLElement>('[role="combobox"]');
  if (!choice) throw new Error("missing variant selector");
  await act(async () => choice.focus());
  const submit = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    button => button.textContent?.trim() === "确认添加"
  );
  if (!submit) throw new Error("missing confirmation");
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(document.querySelector('[role="combobox"]')).toBe(choice);
    expect(document.activeElement).toBe(choice);
    expect(choice.textContent).toContain("原始清晰度乙");
    expect(wire.call).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
    expect(signal.aborted).toBe(false);
  }
  await act(async () => submit.click());
  expect(confirm).toHaveBeenCalledExactlyOnceWith({
    url: "https://raw.example/影片",
    providerId: "raw-provider",
    providerName: "用户提供方名",
    title: "插件返回原视频名",
    cover: "https://raw.example/封面",
    ref,
  });
});
