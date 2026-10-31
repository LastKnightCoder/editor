import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createEditor, Node, type Editor } from "slate";
import { withHistory } from "slate-history";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ASRError, defaultSpeechInputSetting, type ASRTranscript } from "@tau/asr";

const mocks = vi.hoisted(() => ({
  runtime: { asr: {} },
  start: vi.fn(),
  push: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("../../../app/plugins/context", () => ({ useMobilePlugins: () => mocks.runtime }));
vi.mock("../../../router/pageLifecycle", () => ({
  useOptionalPageInstanceContext: () => ({ navigator: { push: mocks.push } }),
}));
vi.mock("../../../services/speechInput", () => ({
  createMobileSpeechInputService: () => ({ start: mocks.start }),
}));
vi.mock("../../../services/ai", () => ({
  getMobileAiService: () => ({ generation: { start: mocks.generate } }),
}));

import { VoicePanel } from "../VoicePanel";
import { QUIET_STOP_MS, useVoiceDictation } from "../useVoiceDictation";
import { HOLD_DELAY_MS } from "../useHoldGesture";
import { setMobileSettingSnapshot } from "../../../services/mobileSettingsBridge";
import type { SettingCompat } from "../../../types";

let root: Root;
let host: HTMLDivElement;
let editor: Editor;
let session: {
  resolve: (value: ASRTranscript) => void;
  reject: (error: unknown) => void;
  preview: (text: string) => void;
  stop: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
};

function Harness() {
  const dictation = useVoiceDictation({ getEditor: () => editor, mode: "point" });
  return <VoicePanel dictation={dictation} height={280} />;
}

const mic = () => document.querySelector<HTMLButtonElement>("button.voice-mic")!;
const byLabel = (label: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const text = () => editor.children.map(node => Node.string(node)).join("\n");
const flush = () => act(async () => {});

function pointer(type: string, target: EventTarget, init: { x?: number; y?: number } = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.x ?? 0,
    clientY: init.y ?? 0,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  target.dispatchEvent(event);
}

function tap(target: HTMLElement) {
  act(() => pointer("pointerdown", target));
  act(() => pointer("pointerup", window));
}

function enableRefinement() {
  act(() =>
    setMobileSettingSnapshot({
      database: { active: "data.db", databases: [] },
      llmProviders: [
        {
          id: "p",
          name: "P",
          baseUrl: "https://x.test",
          api: "openai-completions",
          models: [{ id: "m", reasoning: false, input: ["text"] }],
        },
      ],
      llmUsageSettings: { speechInputRefinement: { providerId: "p", modelId: "m" } },
      speechInput: defaultSpeechInputSetting(),
    } as unknown as SettingCompat)
  );
}

beforeAll(() => {
  if (typeof AbortSignal.any === "function") return;
  AbortSignal.any = (signals: AbortSignal[]) => {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) controller.abort(signal.reason);
      else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
    }
    return controller.signal;
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  setMobileSettingSnapshot({
    speechInput: defaultSpeechInputSetting(),
  } as unknown as SettingCompat);
  editor = withHistory(createEditor());
  editor.children = [{ type: "paragraph", children: [{ type: "formatted", text: "下一步：" }] }];
  editor.selection = {
    anchor: { path: [0, 0], offset: 4 },
    focus: { path: [0, 0], offset: 4 },
  };
  mocks.start.mockReset();
  mocks.generate.mockReset();
  mocks.start.mockImplementation(async (options: { onPreview: (text: string) => void }) => {
    const result = new Promise<ASRTranscript>((resolve, reject) => {
      session = {
        resolve,
        reject,
        preview: options.onPreview,
        stop: vi.fn(async () => session.resolve({ text: "拆成三个问答" })),
        cancel: vi.fn(async () => session.reject(new ASRError("cancelled", "已取消"))),
      };
    });
    void result.catch(() => undefined);
    return { result, stop: () => session.stop(), cancel: () => session.cancel() };
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
  vi.useRealTimers();
});

describe("语音面板", () => {
  it("按模型分配润色，失败可重试，切换原文后仍能整段撤回", async () => {
    vi.useRealTimers();
    enableRefinement();
    mocks.generate
      .mockResolvedValueOnce({ result: Promise.resolve({ outcome: "failed" }), abort: vi.fn() })
      .mockResolvedValueOnce({
        result: Promise.resolve({
          outcome: "completed",
          response: { content: "拆分为三个问答。" },
        }),
        abort: vi.fn(),
      });
    tap(mic());
    await flush();
    tap(mic());
    await flush();
    expect(text()).toBe("下一步：拆成三个问答");
    await act(async () => {
      await vi.waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
    });
    expect(document.body.textContent).toContain("润色失败，已用原文");
    const clickText = (label: string) =>
      act(() => {
        [...document.querySelectorAll("button")].find(node => node.textContent === label)!.click();
      });
    clickText("重试");
    await flush();
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(text()).toBe("下一步：拆分为三个问答。");
    clickText("用原文");
    expect(text()).toBe("下一步：拆成三个问答");
    act(() => byLabel("撤回这段").click());
    expect(text()).toBe("下一步：");
  });

  it("润色期间开始下一段：中止旧润色并启动新的识别，旧结果不覆盖正文", async () => {
    vi.useRealTimers();
    enableRefinement();
    let resolve!: (value: object) => void;
    const abort = vi.fn();
    mocks.generate.mockResolvedValue({ result: new Promise(res => (resolve = res)), abort });
    tap(mic());
    await flush();
    tap(mic());
    await flush();
    await act(async () => {
      await vi.waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
    });
    expect(document.body.textContent).toContain("AI 润色中");
    tap(mic());
    await flush();
    expect(abort).toHaveBeenCalledOnce();
    expect(mocks.start).toHaveBeenCalledTimes(2);
    act(() => resolve({ outcome: "completed", response: { content: "迟到的润色" } }));
    await flush();
    expect(text()).toBe("下一步：拆成三个问答");
    expect(byLabel("停止并写入")).toBeTruthy();
  });

  it("轻点开始、再点停止：写入插入点并显示字数，撤回这段恢复原文", async () => {
    expect(byLabel("撤回这段").disabled).toBe(true);
    tap(mic());
    await flush();
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(byLabel("停止并写入")).toBeTruthy();

    tap(mic());
    await flush();
    expect(session.stop).toHaveBeenCalled();
    expect(text()).toBe("下一步：拆成三个问答");
    expect(document.body.textContent).toContain("已写入 6 字");

    act(() => byLabel("撤回这段").click());
    expect(text()).toBe("下一步：");
    expect(byLabel("撤回这段").disabled).toBe(true);
  });

  it("停止后可以接着说，第二段接在第一段之后", async () => {
    tap(mic());
    await flush();
    tap(mic());
    await flush();
    tap(mic());
    await flush();
    tap(mic());
    await flush();
    expect(text()).toBe("下一步：拆成三个问答拆成三个问答");
  });

  it("换行在插入点另起一段", async () => {
    tap(mic());
    await flush();
    tap(mic());
    await flush();
    act(() => byLabel("换行").click());
    expect(editor.children).toHaveLength(2);
    expect(Node.string(editor.children[1])).toBe("");
  });

  it("按住说：按下即开始录音，松手写入；上滑到 ✕ 松手取消", async () => {
    act(() => pointer("pointerdown", mic()));
    expect(mocks.start).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(HOLD_DELAY_MS));
    await flush();
    const cancelTarget = document.querySelector<HTMLElement>('[aria-label="上滑到此处取消"]')!;
    expect(cancelTarget).toBeTruthy();
    cancelTarget.getBoundingClientRect = () =>
      ({ left: 100, right: 160, top: 0, bottom: 60 }) as DOMRect;
    act(() => pointer("pointermove", window, { x: 130, y: 30 }));
    expect(document.body.textContent).toContain("松手取消");
    act(() => pointer("pointerup", window, { x: 130, y: 30 }));
    await flush();
    expect(session.cancel).toHaveBeenCalled();
    expect(text()).toBe("下一步：");

    act(() => pointer("pointerdown", mic()));
    act(() => vi.advanceTimersByTime(HOLD_DELAY_MS));
    await flush();
    act(() => pointer("pointerup", window, { x: 0, y: 500 }));
    await flush();
    expect(text()).toBe("下一步：拆成三个问答");
  });

  it("长时间没有新文字自动停止并写入", async () => {
    tap(mic());
    await flush();
    act(() => session.preview("拆成"));
    act(() => vi.advanceTimersByTime(QUIET_STOP_MS - 1));
    expect(session.stop).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    await flush();
    expect(session.stop).toHaveBeenCalled();
    expect(text()).toBe("下一步：拆成三个问答");
  });

  it("识别插件未配置：麦克风禁用，面板内给去设置", () => {
    act(() =>
      setMobileSettingSnapshot({
        speechInput: {
          ...defaultSpeechInputSetting(),
          active: "plugin",
          plugin: { id: "tau.asr-seed", configurations: {} },
        },
      } as unknown as SettingCompat)
    );
    expect(mic().disabled).toBe(true);
    expect(document.body.textContent).toContain("识别插件账号尚未配置");
    const settings = [...document.querySelectorAll("button")].find(
      node => node.textContent === "去设置语音识别"
    )!;
    act(() => settings.click());
    expect(mocks.push).toHaveBeenCalledWith("settingsModule", { module: "speech-input" });
  });

  it("识别出错显示在面板里", async () => {
    tap(mic());
    await flush();
    act(() => session.reject(new Error("麦克风权限被拒绝")));
    await flush();
    expect(document.body.textContent).toContain("麦克风权限被拒绝");
    expect(byLabel("开始说话")).toBeTruthy();
  });
});
