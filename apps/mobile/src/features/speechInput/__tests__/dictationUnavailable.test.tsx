import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defaultSpeechInputSetting } from "@tau/asr";
import { DictationTrigger } from "../DictationTrigger";
import { setMobileSettingSnapshot } from "../../../services/mobileSettingsBridge";
import { useToastStore } from "../../../components/toast";
import type { SettingCompat } from "../../../types";

let host: HTMLDivElement;
let root: Root;
const getEditor = vi.fn(() => null);

function pointer(type: string, target: EventTarget) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "pointerId", { value: 1 });
  target.dispatchEvent(event);
}

function mount() {
  act(() =>
    root.render(
      <DictationTrigger
        getEditor={getEditor}
        mode="point"
        renderButton={({ bind }) => (
          <button type="button" aria-label="按住说话" {...bind}>
            mic
          </button>
        )}
      />
    )
  );
  return document.querySelector<HTMLButtonElement>('button[aria-label="按住说话"]')!;
}

function holdFor(button: HTMLElement, ms: number) {
  act(() => pointer("pointerdown", button));
  act(() => vi.advanceTimersByTime(ms));
  act(() => pointer("pointerup", window));
}

const toasts = () => useToastStore.getState().toasts.map(item => item.text);

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  useToastStore.getState().clearAll();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  setMobileSettingSnapshot(null);
});

it("选了系统识别：允许开始原生识别", () => {
  setMobileSettingSnapshot({
    speechInput: defaultSpeechInputSetting(),
  } as unknown as SettingCompat);
  const button = mount();
  holdFor(button, 300);
  expect(getEditor).toHaveBeenCalled();
  expect(toasts()).toEqual([]);
});

it("选了插件但没有账号：提示账号尚未配置", () => {
  setMobileSettingSnapshot({
    speechInput: {
      ...defaultSpeechInputSetting(),
      active: "plugin",
      plugin: { id: "tau.asr-seed", configurations: {} },
    },
  } as unknown as SettingCompat);
  holdFor(mount(), 50);
  expect(toasts()).toEqual(["识别插件账号尚未配置"]);
});

it("已配置插件时短按只提示手势", () => {
  setMobileSettingSnapshot({
    speechInput: {
      ...defaultSpeechInputSetting(),
      active: "plugin",
      plugin: {
        id: "tau.asr-seed",
        configurations: { "tau.asr-seed": { modelId: "m", config: {} } },
      },
    },
  } as unknown as SettingCompat);
  holdFor(mount(), 50);
  expect(toasts()).toEqual(["按住说话，松手写入"]);
});
