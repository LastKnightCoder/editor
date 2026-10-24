import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginSettingsProps, TTSAudio } from "@tau/plugins";
import type { MobilePluginRuntime } from "../../../../app/plugins/runtime";
import { getNavigator } from "../../../../router";
import {
  activePage,
  activeTitle,
  click,
  createTtsRuntime,
  deferred,
  findButton,
  makeAccount,
  makeSetting,
  mountTtsHarness,
  openPage,
  setInputValue,
  waitFor,
  type SettingState,
} from "./harness";

vi.mock("@tau/shared", async importOriginal => {
  const React = await import("react");
  return {
    ...(await importOriginal<object>()),
    AudioPlayer: React.forwardRef<
      HTMLAudioElement,
      { src?: string; label?: string; info?: string }
    >(({ src, label, info }, ref) => (
      <audio ref={ref} data-testid="tts-audio" src={src} aria-label={label} data-info={info} />
    )),
  };
});

const native = vi.hoisted(() => ({
  create: vi.fn(),
  save: vi.fn(),
  rename: vi.fn(),
  deleteAccount: vi.fn(),
  addModel: vi.fn(),
  deleteModel: vi.fn(),
  select: vi.fn(),
}));
vi.mock("../../../../services/tts-settings", () => ({
  createTtsAccount: native.create,
  saveTtsConfig: native.save,
  renameTtsAccount: native.rename,
  deleteTtsAccount: native.deleteAccount,
  addTtsModel: native.addModel,
  deleteTtsModel: native.deleteModel,
  selectTtsUsage: native.select,
}));
const tts = vi.hoisted(() => ({
  withSession: vi.fn(),
  voices: vi.fn(),
  synthesize: vi.fn(),
  clone: vi.fn(),
  options: [] as { config: unknown; modelId: string }[],
}));
vi.mock("../../../../services/plugin-tts", () => ({
  openMobilePluginTTS: vi.fn(),
  withMobilePluginTTS: tts.withSession,
}));

function AuthorSettings({ ttsConfig }: PluginSettingsProps) {
  return (
    <button
      type="button"
      onClick={() => void ttsConfig?.save({ apiKey: "updated-key" }, ttsConfig.models)}
    >
      作者更新配置
    </button>
  );
}

let runtime: MobilePluginRuntime;
let mounted: ReturnType<typeof mountTtsHarness> | null;
let urlSequence = 0;

beforeEach(async () => {
  vi.clearAllMocks();
  tts.options.length = 0;
  urlSequence = 0;
  window.history.replaceState(null, "");
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:test-${++urlSequence}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => undefined);
  runtime = await createTtsRuntime(AuthorSettings);
  tts.voices.mockResolvedValue([
    { id: "voice-a", name: "系统女声", type: "system" },
    { id: "voice-b", name: "我的复刻", type: "cloned" },
  ]);
  tts.synthesize.mockResolvedValue({ audio: new Uint8Array([1, 2, 3, 4]), mime: "audio/mpeg" });
  tts.withSession.mockImplementation(async (_runtime, options, run) => {
    tts.options.push({ config: structuredClone(options.config), modelId: options.modelId });
    return run({
      info: { canClone: true, textInstructions: "使用纯文本" },
      voices: tts.voices,
      synthesize: tts.synthesize,
      clone: tts.clone,
    });
  });
});

afterEach(async () => {
  mounted?.unmount();
  mounted = null;
  await runtime.dispose();
  vi.restoreAllMocks();
});

function installNative(state: SettingState) {
  native.select.mockImplementation(async (_database, selection) => ({
    ...state.current,
    ttsUsageSettings: { default: selection },
  }));
  native.save.mockImplementation(async (_database, instanceId, _pluginId, config, models) => ({
    ...state.current,
    ttsProviders: state.current.ttsProviders?.map(account =>
      account.id === instanceId ? { ...account, config, models } : account
    ),
  }));
  native.deleteModel.mockImplementation(async (_database, instanceId, modelId) => {
    const providers = state.current.ttsProviders?.map(account =>
      account.id === instanceId
        ? { ...account, models: account.models.filter(model => model.id !== modelId) }
        : account
    );
    const usage = state.current.ttsUsageSettings?.default;
    const affected = providers?.find(account => account.id === instanceId);
    const nextUsage =
      usage && usage.providerId === instanceId && usage.modelId === modelId
        ? affected?.models.length
          ? { ...usage, modelId: affected.models[0].id, voiceId: "" }
          : null
        : usage;
    return {
      ...state.current,
      ttsProviders: providers,
      ttsUsageSettings: { default: nextUsage ?? null },
    };
  });
}

function initialState(): SettingState {
  return {
    current: makeSetting([makeAccount()], {
      providerId: "account-a",
      modelId: "model-a",
      voiceId: "voice-a",
    }),
  };
}

describe("TTS 合成试听", () => {
  it("搜索、刷新并手动输入音色后真实合成；重新生成和卸载回收 ObjectURL", async () => {
    const state = initialState();
    installNative(state);
    mounted = mountTtsHarness(state, runtime);
    await openPage("ttsTest", { instanceId: "account-a", modelId: "model-a" });
    await waitFor(() => tts.voices.mock.calls.length === 1);

    await click(findButton("未找到时可手动输入音色 ID", activePage()));
    const search = document.querySelector<HTMLInputElement>(
      'input[placeholder="搜索名称或音色 ID"]'
    )!;
    await setInputValue(search, "没有这个名字");
    expect(document.body.textContent).toContain("没有匹配的音色");
    await click(document.querySelector<HTMLElement>('[aria-label="刷新音色列表"]'));
    await waitFor(() => tts.voices.mock.calls.length >= 2);
    await setInputValue(
      document.querySelector<HTMLInputElement>("#tts-manual-voice")!,
      " manual-voice "
    );
    await click(findButton("使用此音色 ID"));

    await click(findButton("合成并试听", activePage()));
    await waitFor(() => Boolean(document.querySelector('[data-testid="tts-audio"]')));
    expect(tts.synthesize.mock.calls[0][0]).toEqual({
      text: expect.any(String),
      voiceId: "manual-voice",
    });
    expect(native.select).not.toHaveBeenCalled();
    const audio = document.querySelector<HTMLAudioElement>('[data-testid="tts-audio"]')!;
    expect(audio.src).toContain("blob:test-1");
    expect(audio.autoplay).toBe(false);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe("audio/mpeg");

    await click(findButton("重新生成", activePage()));
    await waitFor(
      () =>
        document
          .querySelector<HTMLAudioElement>('[data-testid="tts-audio"]')
          ?.src.includes("blob:test-2") ?? false
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
    mounted.unmount();
    mounted = null;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-2");
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it("失败留在页内且不会泄露账号 Key 或创建空音频", async () => {
    const state = initialState();
    installNative(state);
    tts.synthesize.mockRejectedValue(new Error("HTTP 401: super-secret-key"));
    mounted = mountTtsHarness(state, runtime);
    await openPage("ttsTest", { instanceId: "account-a" });
    await waitFor(() => tts.voices.mock.calls.length > 0);
    await click(findButton("合成并试听", activePage()));
    await waitFor(() => activePage()?.textContent?.includes("HTTP 401") ?? false);
    expect(activePage()?.textContent).toContain("•••");
    expect(activePage()?.textContent).not.toContain("super-secret-key");
    expect(document.querySelector('[data-testid="tts-audio"]')).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(findButton("检查账号配置", activePage())).toBeTruthy();
  });

  it("取消会中止请求，迟到音频不交付", async () => {
    const state = initialState();
    installNative(state);
    const pending = deferred<TTSAudio>();
    let taskSignal: AbortSignal | undefined;
    tts.synthesize.mockImplementation((_request, signal) => {
      taskSignal = signal;
      return pending.promise;
    });
    mounted = mountTtsHarness(state, runtime);
    await openPage("ttsTest", { instanceId: "account-a" });
    await waitFor(() => tts.voices.mock.calls.length > 0);
    await click(findButton("合成并试听", activePage()));
    await waitFor(() => Boolean(findButton("取消测试", activePage())));
    await click(findButton("取消测试", activePage()));
    expect(taskSignal?.aborted).toBe(true);
    pending.resolve({ audio: new Uint8Array([9]), mime: "audio/mpeg" });
    await act(async () => {
      await pending.promise;
      await Promise.resolve();
    });
    expect(document.querySelector('[data-testid="tts-audio"]')).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(activePage()?.textContent).not.toContain("合成成功");
  });

  it("从账号页返回后用最新保存配置刷新音色", async () => {
    const state = initialState();
    installNative(state);
    mounted = mountTtsHarness(state, runtime);
    await openPage("ttsTest", { instanceId: "account-a" });
    await waitFor(() =>
      tts.options.some(option => JSON.stringify(option.config).includes("super-secret-key"))
    );
    await openPage("ttsAccount", { instanceId: "account-a" });
    await waitFor(() => activeTitle() === "测试账号");
    await click(findButton("作者更新配置", activePage()));
    await waitFor(() =>
      JSON.stringify(state.current.ttsProviders?.[0].config).includes("updated-key")
    );
    await act(async () => {
      await getNavigator().goBack("code");
    });
    await waitFor(() => activeTitle() === "测试语音");
    await waitFor(() => JSON.stringify(tts.options.at(-1)?.config).includes("updated-key"));
  });

  it("保活页返回时当前模型已删除则重选模型、清音色，后续合成使用有效模型", async () => {
    const state: SettingState = {
      current: makeSetting([makeAccount({ models: [{ id: "model-a" }, { id: "model-b" }] })], {
        providerId: "account-a",
        modelId: "model-a",
        voiceId: "voice-a",
      }),
    };
    installNative(state);
    mounted = mountTtsHarness(state, runtime);
    await openPage("ttsTest", { instanceId: "account-a", modelId: "model-a" });
    await waitFor(() => tts.voices.mock.calls.length > 0);
    await openPage("ttsAccount", { instanceId: "account-a" });
    await openPage("ttsModels", { instanceId: "account-a" });
    await waitFor(() => activeTitle() === "管理模型");
    await click(document.querySelector<HTMLElement>('[aria-label="删除模型 model-a"]'));
    await waitFor(() => state.current.ttsProviders?.[0].models.length === 1);
    await act(async () => {
      await getNavigator().goBack("code");
    });
    await waitFor(() => activeTitle() === "测试账号");
    await act(async () => {
      await getNavigator().goBack("code");
    });
    await waitFor(() => activeTitle() === "测试语音");
    await waitFor(() => activePage()?.textContent?.includes("model-b") ?? false);
    expect(activePage()?.textContent).toContain("未设置");
    expect(findButton("合成并试听", activePage())?.hasAttribute("disabled")).toBe(true);
    expect(tts.synthesize).not.toHaveBeenCalled();

    await click(findButton("未找到时可手动输入音色 ID", activePage()));
    await setInputValue(document.querySelector<HTMLInputElement>("#tts-manual-voice")!, "voice-b");
    await click(findButton("使用此音色 ID"));
    const optionCount = tts.options.length;
    await click(findButton("合成并试听", activePage()));
    await waitFor(() => tts.synthesize.mock.calls.length === 1);
    expect(tts.options[optionCount]?.modelId).toBe("model-b");
  });

  it("保活页返回时全部模型已删除则禁止合成", async () => {
    const state = initialState();
    installNative(state);
    mounted = mountTtsHarness(state, runtime);
    await openPage("ttsTest", { instanceId: "account-a", modelId: "model-a" });
    await waitFor(() => tts.voices.mock.calls.length > 0);
    await openPage("ttsAccount", { instanceId: "account-a" });
    await openPage("ttsModels", { instanceId: "account-a" });
    await waitFor(() => activeTitle() === "管理模型");
    await click(document.querySelector<HTMLElement>('[aria-label="删除模型 model-a"]'));
    await waitFor(() => state.current.ttsProviders?.[0].models.length === 0);
    await act(async () => {
      await getNavigator().goBack("code");
    });
    await waitFor(() => activeTitle() === "测试账号");
    await act(async () => {
      await getNavigator().goBack("code");
    });
    await waitFor(() => activeTitle() === "测试语音");
    await waitFor(() => activePage()?.textContent?.includes("模型未设置") ?? false);
    expect(activePage()?.textContent).toContain("语音插件或模型不可用");
    expect(findButton("合成并试听", activePage())?.hasAttribute("disabled")).toBe(true);
    expect(tts.synthesize).not.toHaveBeenCalled();
  });
});
