import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobilePluginRuntime } from "../../../../app/plugins/runtime";
import { getNavigator } from "../../../../router";
import {
  click,
  createTtsRuntime,
  findButton,
  makeAccount,
  makeSetting,
  mountTtsHarness,
  setInputValue,
  waitFor,
  type SettingState,
} from "../../../settings/tts/__tests__/harness";
import { TtsGenerateSheet } from "../TtsGenerateSheet";
import type { TtsInsertIntent, TtsInsertTarget } from "../ttsInsertTarget";

vi.mock("@tau/shared", async importOriginal => {
  const React = await import("react");
  return {
    ...(await importOriginal<object>()),
    AudioPlayer: React.forwardRef<HTMLAudioElement, { src?: string; info?: string }>(
      ({ src, info }, ref) => <audio ref={ref} data-testid="tts-audio" src={src} data-info={info} />
    ),
  };
});

const tts = vi.hoisted(() => ({
  withSession: vi.fn(),
  voices: vi.fn(),
  synthesize: vi.fn(),
}));
vi.mock("../../../../services/plugin-tts", () => ({
  openMobilePluginTTS: vi.fn(),
  withMobilePluginTTS: tts.withSession,
}));

let runtime: MobilePluginRuntime;
let mounted: ReturnType<typeof mountTtsHarness> | null = null;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:tts");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => undefined);
  runtime = await createTtsRuntime();
  tts.voices.mockResolvedValue([
    { id: "voice-a", name: "中文女声", type: "system" },
    { id: "voice-b", name: "沉稳男声", type: "system" },
  ]);
  tts.synthesize.mockResolvedValue({ audio: new Uint8Array([1, 2, 3]), mime: "audio/mpeg" });
  tts.withSession.mockImplementation(async (_runtime, _options, run) =>
    run({ info: {}, voices: tts.voices, synthesize: tts.synthesize })
  );
});

afterEach(async () => {
  mounted?.unmount();
  mounted = null;
  await runtime.dispose();
  vi.restoreAllMocks();
});

function makeTarget(intent: TtsInsertIntent, commit = vi.fn(async () => true)): TtsInsertTarget {
  return {
    id: crypto.randomUUID(),
    intent,
    signal: new AbortController().signal,
    commit,
    dispose: vi.fn(),
  };
}

function Host({ target, onInserted }: { target: TtsInsertTarget; onInserted: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <TtsGenerateSheet
      target={open ? target : null}
      onClose={() => setOpen(false)}
      onInserted={() => {
        onInserted();
        setOpen(false);
      }}
    />
  );
}

function mount(state: SettingState, target: TtsInsertTarget, onInserted = vi.fn()) {
  mounted = mountTtsHarness(state, runtime, <Host target={target} onInserted={onInserted} />);
  return onInserted;
}

const textarea = () => document.querySelector<HTMLTextAreaElement>("#tts-generate-text");
const requireTextarea = () => {
  const element = textarea();
  if (!element) throw new Error("找不到文本框");
  return element;
};

const configured = (): SettingState => ({
  current: makeSetting([makeAccount()], {
    providerId: "account-a",
    modelId: "model-a",
    voiceId: "voice-b",
  }),
});

describe("TtsGenerateSheet", () => {
  it("没有语音服务时引导去设置", async () => {
    mount({ current: makeSetting() }, makeTarget({ kind: "insert" }));
    await waitFor(() => !!findButton("去设置语音合成"));
    expect(textarea()).toBeNull();
  });

  it("选中文字预填，生成后试听并按当前服务的音色与语速合成，确认后写入", async () => {
    const commit = vi.fn(async () => true);
    const target = makeTarget({ kind: "after-selection", text: "遗忘曲线" }, commit);
    const onInserted = mount(configured(), target);
    await waitFor(() => !!textarea());
    expect(requireTextarea().value).toBe("遗忘曲线");
    await waitFor(() => document.body.textContent?.includes("沉稳男声") ?? false);

    await click(document.querySelector<HTMLElement>('[role="radio"][aria-checked="false"]'));
    await click(findButton("生成并试听"));
    await waitFor(() => !!document.querySelector('[data-testid="tts-audio"]'));
    expect(tts.synthesize).toHaveBeenCalledWith(
      { text: "遗忘曲线", voiceId: "voice-b", options: { speed: 0.8 } },
      expect.any(AbortSignal)
    );

    await click(findButton("插入到文档"));
    await waitFor(() => onInserted.mock.calls.length > 0);
    expect(commit).toHaveBeenCalledWith({ blob: expect.any(Blob), text: "遗忘曲线" });
  });

  it("改了文字后旧结果不能插入，需要重新生成", async () => {
    mount(configured(), makeTarget({ kind: "insert" }));
    await waitFor(() => !!textarea());
    await setInputValue(requireTextarea(), "第一版");
    await waitFor(() => !(findButton("生成并试听") as HTMLButtonElement | null)?.disabled);
    await click(findButton("生成并试听"));
    await waitFor(() => !!findButton("插入到文档"));

    await setInputValue(requireTextarea(), "第二版");
    expect(findButton("插入到文档")).toBeNull();
    expect(
      document.querySelector('[data-testid="tts-audio"]')?.getAttribute("data-info")
    ).toContain("重新生成");
  });

  it("超出字数上限时不可生成", async () => {
    mount(configured(), makeTarget({ kind: "insert" }));
    await waitFor(() => !!textarea());
    await setInputValue(requireTextarea(), "字".repeat(1001));
    expect((findButton("生成并试听") as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain("1001 / 1000");
  });

  it("写入失败时保留结果并显示原因", async () => {
    const commit = vi.fn(async () => {
      throw new Error("磁盘已满");
    });
    const onInserted = mount(
      configured(),
      makeTarget({ kind: "replace", element: {} as never, text: "原文" }, commit)
    );
    await waitFor(() => !!textarea());
    await waitFor(() => !(findButton("生成并试听") as HTMLButtonElement | null)?.disabled);
    await click(findButton("生成并试听"));
    await waitFor(() => !!findButton("替换音频"));
    await click(findButton("替换音频"));
    await waitFor(() => document.body.textContent?.includes("磁盘已满") ?? false);
    expect(onInserted).not.toHaveBeenCalled();
    expect(findButton("替换音频")).not.toBeNull();
  });

  it("有未插入的结果时关闭先确认", async () => {
    mount(configured(), makeTarget({ kind: "after-selection", text: "要点" }));
    await waitFor(() => !(findButton("生成并试听") as HTMLButtonElement | null)?.disabled);
    await click(findButton("生成并试听"));
    await waitFor(() => !!findButton("插入到文档"));
    await act(async () => {
      await getNavigator().goBack("android");
    });
    await waitFor(() => document.body.textContent?.includes("放弃生成的音频") ?? false);
  });
});
