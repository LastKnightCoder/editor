import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TTSVoice } from "@tau/plugins";
import type { MobilePluginRuntime } from "../../../../app/plugins/runtime";
import {
  activePage,
  activeTitle,
  chooseFile,
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

const tts = vi.hoisted(() => ({
  withSession: vi.fn(),
  info: vi.fn(),
  voices: vi.fn(),
  synthesize: vi.fn(),
  clone: vi.fn(),
}));
vi.mock("../../../../services/plugin-tts", () => ({
  openMobilePluginTTS: vi.fn(),
  withMobilePluginTTS: tts.withSession,
}));

let runtime: MobilePluginRuntime;
let mounted: ReturnType<typeof mountTtsHarness> | null;

beforeEach(async () => {
  vi.clearAllMocks();
  window.history.replaceState(null, "");
  runtime = await createTtsRuntime();
  tts.info.mockReturnValue({ canClone: true, textInstructions: "纯文本" });
  tts.voices.mockResolvedValue([{ id: "clone-real-id", name: "复刻后的声音", type: "cloned" }]);
  tts.clone.mockResolvedValue({
    id: "clone-real-id",
    name: "复刻后的声音",
    description: "部署完成，可以合成",
    type: "cloned",
  });
  tts.withSession.mockImplementation(async (_runtime, _options, run) =>
    run({
      info: tts.info(),
      voices: tts.voices,
      synthesize: tts.synthesize,
      clone: tts.clone,
    })
  );
});

afterEach(async () => {
  mounted?.unmount();
  mounted = null;
  await runtime.dispose();
});

function initialState(): SettingState {
  return {
    current: makeSetting([makeAccount({ models: [{ id: "model-a" }, { id: "model-b" }] })], {
      providerId: "account-a",
      modelId: "model-a",
      voiceId: "voice-a",
    }),
  };
}

function sampleFile(type = "audio/mpeg"): File {
  const file = new File([new Uint8Array([1, 2, 3])], "sample.mp3", { type });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  return file;
}

async function prepareClone(state: SettingState, file = sampleFile()) {
  mounted = mountTtsHarness(state, runtime);
  await openPage("ttsClone", { instanceId: "account-a", modelId: "model-a" });
  await waitFor(() => activeTitle() === "音色复刻");
  await waitFor(() => !document.querySelector<HTMLInputElement>('input[type="file"]')?.disabled);
  await chooseFile(document.querySelector<HTMLInputElement>('input[type="file"]')!, file);
  await setInputValue(document.querySelector<HTMLInputElement>("#tts-clone-name")!, "我的声音");
}

describe("TTS 音色复刻", () => {
  it("上传真实文件并展示插件返回身份，可携带模型与音色跳测试", async () => {
    const state = initialState();
    await prepareClone(state);
    await click(findButton("开始复刻", activePage()));
    await waitFor(() => activePage()?.textContent?.includes("clone-real-id") ?? false);
    expect(tts.clone).toHaveBeenCalledWith(
      {
        file: {
          name: "sample.mp3",
          mimeType: "audio/mpeg",
          content: new Uint8Array([1, 2, 3]),
        },
        name: "我的声音",
      },
      expect.any(AbortSignal)
    );
    expect(activePage()?.textContent).toContain("复刻后的声音");
    expect(activePage()?.textContent).toContain("部署完成，可以合成");

    await click(findButton("刷新音色并测试", activePage()));
    await waitFor(() => activeTitle() === "测试语音");
    await waitFor(() => activePage()?.textContent?.includes("复刻后的声音") ?? false);
    expect(state.current.ttsUsageSettings?.default).toEqual({
      providerId: "account-a",
      modelId: "model-a",
      voiceId: "voice-a",
    });
  });

  it.each([
    ["audio/x-wav", "audio/wav"],
    ["audio/wave", "audio/wav"],
    ["audio/mp3", "audio/mpeg"],
    ["AUDIO/MP3", "audio/mpeg"],
    ["audio/m4a", "audio/mp4"],
    ["audio/x-m4a", "audio/mp4"],
  ])("非空 MIME 别名 %s 归一为 %s", async (input, expected) => {
    const state = initialState();
    await prepareClone(state, sampleFile(input));
    await click(findButton("开始复刻", activePage()));
    await waitFor(() => tts.clone.mock.calls.length === 1);
    expect(tts.clone.mock.calls[0][0].file.mimeType).toBe(expected);
  });

  it("canClone=false 显示明确空态且不发起复刻", async () => {
    tts.info.mockReturnValue({ canClone: false });
    const state = initialState();
    mounted = mountTtsHarness(state, runtime);
    await openPage("ttsClone", { instanceId: "account-a", modelId: "model-a" });
    await waitFor(() => activePage()?.textContent?.includes("当前模型不支持音色复刻") ?? false);
    expect(document.querySelector<HTMLInputElement>('input[type="file"]')?.disabled).toBe(true);
    expect(findButton("开始复刻", activePage())).toBeNull();
    expect(tts.clone).not.toHaveBeenCalled();
  });

  it("真实复刻错误保留页内并提供上传设置入口", async () => {
    const state = initialState();
    tts.clone.mockRejectedValue(new Error("请先配置远端上传插件，本地保存不能提供公网地址"));
    await prepareClone(state);
    expect(activePage()?.textContent).toContain("部分服务商需要公网地址");
    expect(findButton("开始复刻", activePage())?.hasAttribute("disabled")).toBe(false);
    await click(findButton("开始复刻", activePage()));
    await waitFor(() => activePage()?.textContent?.includes("本地保存不能提供公网地址") ?? false);
    await click(findButton("去上传设置", activePage()));
    await waitFor(() => activeTitle() === "图片与附件");
  });

  it("取消后不交付迟到复刻结果", async () => {
    const state = initialState();
    const pending = deferred<TTSVoice>();
    let taskSignal: AbortSignal | undefined;
    tts.clone.mockImplementation((_request, signal) => {
      taskSignal = signal;
      return pending.promise;
    });
    await prepareClone(state);
    await click(findButton("开始复刻", activePage()));
    await waitFor(() => Boolean(findButton("取消复刻", activePage())));
    await click(findButton("取消复刻", activePage()));
    expect(taskSignal?.aborted).toBe(true);
    pending.resolve({ id: "late-voice", name: "迟到结果", type: "cloned" });
    await act(async () => {
      await pending.promise;
      await Promise.resolve();
    });
    expect(activePage()?.textContent).not.toContain("late-voice");
    expect(activePage()?.textContent).not.toContain("迟到结果");
    expect(activePage()?.textContent).not.toContain("复刻音色已创建");
  });
});
