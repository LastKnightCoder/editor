import type { TTSAudio } from "@tau/plugins";
import { ttsWorkspaceT } from "@/services/tts-workspace.binding";
/**
 * 回归测试：切换音色不得清空已输入的文本。
 * 根因曾是 loadVoices 的 useCallback 依赖 selectedVoiceId，切音色 → 回调重建 →
 * 初始化 effect 重跑 → setText("")。修复后文本重置只随 open 变化。
 */
import { act, useSyncExternalStore } from "react";
import { desktopI18n, desktopLocaleSource } from "@/app/i18n/runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TTSGenerateModal from "../index";

const voices = [
  {
    id: "voice-a",
    name: "音色A",
    description: "女声",
    type: "system" as const,
    provider: "minimax" as const,
  },
  {
    id: "voice-b",
    name: "音色B",
    description: "男声",
    type: "system" as const,
    provider: "minimax" as const,
  },
];

const synthesizer = {
  getVoiceList: vi.fn(async () => voices),
  synthesizeSpeech: vi.fn(async (): Promise<TTSAudio> => ({
    audio: new Uint8Array([1, 2, 3, 4]),
    mime: "audio/ogg",
  })),
  dispose: vi.fn(async () => undefined),
};

vi.mock("@/utils/tts/TTSProviderFactory", () => ({
  TTSProviderFactory: {
    getTTSProvider: vi.fn(() => ({
      isConfigured: () => true,
      synthesis: synthesizer,
    })),
    getSpeechSynthesizer: vi.fn(() => synthesizer),
  },
}));

let container: HTMLDivElement;
let root: Root;
const confirm = vi.fn<(blob: Blob, text: string) => void | Promise<void>>();
const cancel = vi.fn();
function View({ open }: { open: boolean }) {
  useSyncExternalStore(desktopI18n.subscribe, desktopI18n.getSnapshot, desktopI18n.getSnapshot);
  return <TTSGenerateModal open={open} onCancel={cancel} onConfirm={confirm} />;
}
const render = (open: boolean) => act(async () => root.render(<View open={open} />));

/** 受控 textarea 赋值（jsdom 不派生用户输入，走原生 value setter + input 事件） */
const typeText = async (value: string) => {
  const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

/** 等音色列表加载并默认选中第一项（触发器回显其名称） */
const waitForVoicesLoaded = async () => {
  await act(async () => {
    await vi.waitFor(() => {
      const trigger = document.querySelector('[role="combobox"]');
      expect(trigger?.textContent).toContain("音色A");
    });
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  confirm.mockReset();
  synthesizer.synthesizeSpeech
    .mockReset()
    .mockResolvedValue({ audio: new Uint8Array([1, 2, 3, 4]), mime: "audio/ogg" });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  desktopLocaleSource.setLocale("zh-CN");
  vi.restoreAllMocks();
});

it("输入文本后切换音色，文本保留不被清空", async () => {
  await render(true);
  await waitForVoicesLoaded();

  await typeText("你好，世界");
  expect((document.querySelector("textarea") as HTMLTextAreaElement).value).toBe("你好，世界");

  // 打开音色下拉（弹层渲染在 body 的 Portal 中），选择另一项
  const trigger = document.querySelector('[role="combobox"]') as HTMLButtonElement;
  await act(async () => trigger.click());
  const option = await act(async () => {
    return await vi.waitFor(() => {
      const found = [...document.querySelectorAll('[role="option"]')].find(node =>
        node.textContent?.includes("音色B")
      );
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
  });
  await act(async () => option.click());

  expect((document.querySelector("textarea") as HTMLTextAreaElement).value).toBe("你好，世界");
  // 音色确实切换成功
  expect(document.querySelector('[role="combobox"]')?.textContent).toContain("音色B");
});

it("重新打开弹窗时文本才被重置", async () => {
  await render(true);
  await waitForVoicesLoaded();
  await typeText("保留我");

  await render(false);
  await render(true);
  expect((document.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
});

it("生成和添加挂起期间换语保留voice/text/真实audio实例，不重新合成播放或提交", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:original-tts");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  let complete!: (value: TTSAudio) => void;
  synthesizer.synthesizeSpeech.mockImplementation(
    () =>
      new Promise(resolve => {
        complete = resolve;
      })
  );
  await render(true);
  await waitForVoicesLoaded();
  const voice = document.querySelector<HTMLButtonElement>('[role="combobox"]');
  if (!voice) throw new Error("missing voice selector");
  await act(async () => voice.click());
  const other = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(node =>
    node.textContent?.includes("音色B")
  );
  if (!other) throw new Error("missing raw voice option");
  await act(async () => other.click());
  const rawText = "  用户手写 Mixed  ";
  await typeText(rawText);
  const input = document.querySelector<HTMLTextAreaElement>("textarea");
  if (!input) throw new Error("missing text draft");
  const generate = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    button => button.textContent?.trim() === ttsWorkspaceT("action.generate")
  );
  const add = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    button => button.textContent?.trim() === ttsWorkspaceT("action.add")
  );
  if (!generate || !add) throw new Error("missing TTS actions");
  await act(async () => generate.click());
  expect(synthesizer.synthesizeSpeech).toHaveBeenCalledExactlyOnceWith("用户手写 Mixed", "voice-b");
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(document.querySelector("textarea")).toBe(input);
    expect(input.value).toBe(rawText);
    expect(voice.textContent).toContain("音色B");
    expect(synthesizer.synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(synthesizer.getVoiceList).toHaveBeenCalledTimes(1);
    expect(synthesizer.dispose).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  }
  await act(async () => desktopLocaleSource.setLocale("zh-CN"));
  await act(async () => complete({ audio: new Uint8Array([1, 2, 3, 4]), mime: "audio/ogg" }));
  const audio = document.querySelector("audio");
  if (!audio) throw new Error("missing generated audio");
  const blob = create.mock.calls[0]?.[0];
  if (!(blob instanceof Blob)) throw new Error("missing generated Blob");
  expect(blob.type).toBe("audio/ogg");
  expect(blob.size).toBe(4);
  expect(synthesizer.dispose).toHaveBeenCalledTimes(1);
  audio.currentTime = 13.5;
  audio.volume = 0.4;
  audio.playbackRate = 1.25;
  const preview = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    button => button.getAttribute("aria-label") === ttsWorkspaceT("preview.play")
  );
  if (!preview) throw new Error("missing audio preview");
  await act(async () => preview.click());
  await act(async () => {
    input.focus();
    input.setSelectionRange(3, 8);
  });
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(document.querySelector("audio")).toBe(audio);
    expect(audio.getAttribute("src")).toBe("blob:original-tts");
    expect([audio.currentTime, audio.volume, audio.playbackRate]).toEqual([13.5, 0.4, 1.25]);
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([3, 8]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
  }
  let added!: () => void;
  confirm.mockImplementation(
    () =>
      new Promise(resolve => {
        added = resolve;
      })
  );
  await act(async () => add.click());
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(confirm).toHaveBeenCalledExactlyOnceWith(blob, "用户手写 Mixed");
    expect(document.querySelector("audio")).toBe(audio);
    expect(synthesizer.synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  }
  await act(async () => added());
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(revoke).not.toHaveBeenCalled();
});
