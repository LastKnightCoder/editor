import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defaultSpeechInputSetting, type ASRTranscript } from "@tau/asr";

const mocks = vi.hoisted(() => ({
  runtime: { asr: {} },
  start: vi.fn(),
  createQuickCard: vi.fn(),
}));
vi.mock("../../../app/plugins/context", () => ({ useMobilePlugins: () => mocks.runtime }));
vi.mock("../../../services/speechInput", () => ({
  createMobileSpeechInputService: () => ({ start: mocks.start }),
}));
vi.mock("../../../services/tauri", () => ({ createQuickCard: mocks.createQuickCard }));

import { transcriptToContent, useVoiceCapture } from "../useVoiceCapture";
import { toastQueue } from "../../../components/toast";
import { setMobileSettingSnapshot } from "../../../services/mobileSettingsBridge";
import type { SettingCompat } from "../../../types";

let root: Root;
let host: HTMLDivElement;
let capture: ReturnType<typeof useVoiceCapture>;
const onOpen = vi.fn();
const onSaved = vi.fn();
const onOpenSettings = vi.fn();
const flush = () => act(async () => {});

function Harness() {
  capture = useVoiceCapture({ onOpen, onSaved, onOpenSettings });
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  toastQueue.clearAll();
  setMobileSettingSnapshot({
    speechInput: defaultSpeechInputSetting(),
  } as unknown as SettingCompat);
  mocks.createQuickCard.mockResolvedValue({ id: 42, contentId: 7 });
  mocks.start.mockImplementation(async (options: { onPreview: (text: string) => void }) => {
    let resolve!: (value: ASRTranscript) => void;
    const result = new Promise<ASRTranscript>(res => (resolve = res));
    return {
      result,
      stop: async () => {
        options.onPreview("周五前定方案");
        resolve({ text: "周五前定方案\n顺便问一下" });
      },
      cancel: async () => undefined,
    };
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setMobileSettingSnapshot(null);
});

it("识别原文按行拆成段落", () => {
  expect(transcriptToContent(" 一\n\n二 ")).toEqual([
    { type: "paragraph", children: [{ type: "formatted", text: "一" }] },
    { type: "paragraph", children: [{ type: "formatted", text: "二" }] },
  ]);
});

it("松手存成速记卡片，toast 可打开", async () => {
  act(() => void capture.begin());
  await flush();
  act(() => capture.finish());
  await flush();
  expect(mocks.createQuickCard).toHaveBeenCalledWith({
    content: transcriptToContent("周五前定方案\n顺便问一下"),
    count: "周五前定方案\n顺便问一下".length,
  });
  expect(onSaved).toHaveBeenCalled();
  const [toast] = toastQueue.list();
  expect(toast.text).toBe("已存进速记");
  toast.action?.onClick();
  expect(onOpen).toHaveBeenCalledWith(42);
});

it("取消不存卡片", async () => {
  act(() => void capture.begin());
  await flush();
  act(() => capture.cancel());
  await flush();
  expect(mocks.createQuickCard).not.toHaveBeenCalled();
});

it("识别插件未配置：不开始，提示去设置", () => {
  act(() =>
    setMobileSettingSnapshot({
      speechInput: {
        ...defaultSpeechInputSetting(),
        active: "plugin",
        plugin: { id: "tau.asr-seed", configurations: {} },
      },
    } as unknown as SettingCompat)
  );
  let started = true;
  act(() => {
    started = capture.begin();
  });
  expect(started).toBe(false);
  expect(mocks.start).not.toHaveBeenCalled();
  const [toast] = toastQueue.list();
  expect(toast.text).toBe("识别插件账号尚未配置");
  toast.action?.onClick();
  expect(onOpenSettings).toHaveBeenCalled();
});
