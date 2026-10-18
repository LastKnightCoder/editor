import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => {
  const invoke = vi.fn(async (channel: string): Promise<unknown> => {
    if (channel === "content:create") return 17;
    if (channel === "vl-note:create") return { id: 42, contentId: 17, projectId: 7, title: "大纲" };
    if (channel === "vl-quiz:create-set") return { id: 21, projectId: 7, name: "测验" };
    if (channel === "vl-quiz:create-items-batch") return [{ id: 1, quizSetId: 21 }];
    if (channel === "podcast:create") return { id: 81 };
    return {};
  });
  window.electron = { platform: "darwin", invoke, on: vi.fn() } as unknown as ElectronAPI;
  return {
    invoke,
    finish: null as null | ((text: string) => void),
    request: null as unknown,
    tts: null as import("@/types/tts").ITTSProvider | null,
    synthesize: vi.fn(),
    parse: vi.fn(),
  };
});
vi.mock("@/commands", async () => await import("@/commands/content"));
vi.mock("@/services/generation-orchestrator", () => ({
  runGenerationTask: (
    _provider: unknown,
    _model: unknown,
    request: unknown,
    callbacks: { onFinish(text: string): void }
  ) => {
    state.finish = callbacks.onFinish;
    state.request = request;
  },
}));
vi.mock("@/stores/useSettingStore", () => ({
  default: {
    getState: () => ({
      setting: {
        llmProviders: [{ id: "p", models: [{ id: "m" }] }],
        llmUsageSettings: {
          chat: { providerId: "p", modelId: "m" },
          podcastGeneration: { providerId: "p", modelId: "m" },
        },
      },
    }),
  },
}));
vi.mock("@/tools/vibeLearningSearchTool", () => ({
  createUnifiedVibeLearningTool: () => ({
    name: "query",
    description: "检索",
    parameters: {},
    executor: async () => "资料",
  }),
}));
vi.mock("@/services/podcast", () => ({ parseScript: state.parse }));
vi.mock("../podcastAudio", () => ({ synthesizePodcast: state.synthesize }));
vi.mock("@/utils/tts", () => ({ TTSProviderFactory: { getTTSProvider: () => state.tts } }));
vi.mock("@/utils", () => ({
  getContentLength: () => 1,
  getMarkdown: () => "",
  importFromMarkdown: (text: string) => [{ type: "paragraph", children: [{ text }] }],
}));
import { startVLTask } from "../runner";
import { useVLTaskStore } from "../store";
import { setChatDatabase } from "@/services/chatDatabase";
import { quizKeys } from "../../../../quizQueries";
import { queryClient } from "@/queryClient";

it("后台测验切库后仍落原库，仅刷新原库缓存，不回写全局选择", async () => {
  state.invoke.mockClear();
  setChatDatabase("a");
  queryClient.setQueryData(quizKeys.sets("a", 7), []);
  queryClient.setQueryData(quizKeys.sets("b", 7), []);
  const started = await startVLTask({
    kind: "quiz",
    projectId: 7,
    mainDbName: "a",
    resourceIds: [],
    resourceNames: [],
  });
  setChatDatabase("b");
  const finish = state.finish;
  if (!finish) throw new Error("生成未启动");
  finish('[{"type":"qa","prompt":"测试问题","detail":"答案"}]');
  await vi.waitFor(() =>
    expect(useVLTaskStore.getState().tasks[started.taskId].status).toBe("succeeded")
  );
  const calls = state.invoke.mock.calls as unknown as unknown[][];
  for (const call of calls.filter(args => String(args[0]).startsWith("vl-quiz:"))) {
    expect(call.at(-1)).toEqual({ toolDatabaseName: "a" });
  }
  expect(calls.some(args => args[0] === "vl-quiz:create-items-batch")).toBe(true);
  expect(calls.some(args => args[0] === "vl-quiz:list-sets")).toBe(false);
  expect(queryClient.getQueryState(quizKeys.sets("a", 7))?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(quizKeys.sets("b", 7))?.isInvalidated).toBe(false);
  queryClient.clear();
  useVLTaskStore.getState().remove(started.taskId);
  setChatDatabase("");
});

it("生成工具启动的真实后台任务在切库后仍把正文写回原库", async () => {
  setChatDatabase("a");
  const started = await startVLTask({
    kind: "outline",
    projectId: 7,
    mainDbName: "a",
    resourceIds: [],
    resourceNames: [],
  });
  setChatDatabase("b");
  expect(state.finish).not.toBeNull();
  state.finish!("原库的生成正文");
  await vi.waitFor(() =>
    expect(useVLTaskStore.getState().tasks[started.taskId].status).toBe("succeeded")
  );
  const calls = state.invoke.mock.calls as unknown as unknown[][];
  expect(calls.some(args => args[0] === "content:update")).toBe(true);
  for (const args of calls.filter(args =>
    ["content:create", "vl-note:create", "content:update"].includes(String(args[0]))
  )) {
    expect(args.at(-1)).toEqual({ toolDatabaseName: "a" });
  }
  expect(useVLTaskStore.getState().tasks[started.taskId].databaseName).toBe("a");
  useVLTaskStore.getState().remove(started.taskId);
  setChatDatabase("");
});

it("任务准备期间取消，不会继续登记产物或启动后台生成", async () => {
  state.finish = null;
  state.invoke.mockClear();
  let complete!: (value: number) => void;
  state.invoke.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        complete = resolve as (value: number) => void;
      })
  );
  const controller = new AbortController();
  const opening = startVLTask({
    kind: "outline",
    projectId: 7,
    mainDbName: "a",
    resourceIds: [],
    resourceNames: [],
    startSignal: controller.signal,
  });
  controller.abort();
  complete(17);
  await expect(opening).rejects.toThrow();
  expect(state.finish).toBeNull();
  expect(state.invoke.mock.calls.some(([channel]) => channel === "vl-note:create")).toBe(false);
});

it("播客脚本与音频沿用开始时的同一语音实例，不重新读取当前账号", async () => {
  state.invoke.mockClear();
  state.finish = null;
  const synth = {
    getVoiceList: vi.fn(),
    synthesizeSpeech: vi.fn(),
    dispose: vi.fn(async () => {}),
  };
  state.tts = {
    getProviderName: () => "account-a",
    isConfigured: () => true,
    getTextInstructions: async () => "rules-a",
    synthesis: synth,
  };
  const lines = [{ speaker: "A", text: "hello", voiceId: "voice-a", startTime: 0, duration: 1 }];
  state.parse.mockReturnValue(lines);
  state.synthesize.mockResolvedValue({ audioUrl: "https://files.test/a.wav", duration: 1, lines });
  const started = await startVLTask({
    kind: "podcast",
    projectId: 7,
    mainDbName: "a",
    resourceIds: [],
    resourceNames: [],
    podcast: { name: "episode", speakers: [], durationMin: 1, durationMax: 2 },
  });
  await vi.waitFor(() => expect(state.finish).not.toBeNull());
  state.tts = {
    getProviderName: () => "account-b",
    isConfigured: () => true,
    synthesis: { getVoiceList: vi.fn(), synthesizeSpeech: vi.fn() },
  };
  state.finish!("script");
  await vi.waitFor(() =>
    expect(useVLTaskStore.getState().tasks[started.taskId].status).toBe("succeeded")
  );
  expect(state.request).toMatchObject({
    taskPayload: { ttsPromptOptions: { textInstructions: "rules-a" } },
  });
  expect(state.synthesize.mock.calls.at(-1)?.[2]).toBe(synth);
  expect(synth.dispose).toHaveBeenCalled();
  useVLTaskStore.getState().remove(started.taskId);
});

it("播客合成返回前会话被关闭，不创建迟到的播客记录", async () => {
  state.invoke.mockClear();
  state.finish = null;
  state.synthesize.mockClear();
  const controller = new AbortController();
  state.tts = {
    getProviderName: () => "a",
    isConfigured: () => true,
    getTextInstructions: async () => "plain",
    synthesis: {
      signal: controller.signal,
      getVoiceList: vi.fn(),
      synthesizeSpeech: vi.fn(),
      dispose: vi.fn(async () => {}),
    },
  };
  const lines = [{ speaker: "A", text: "hello", voiceId: "v", startTime: 0, duration: 1 }];
  state.parse.mockReturnValue(lines);
  let finishAudio!: (value: unknown) => void;
  state.synthesize.mockImplementation(
    () =>
      new Promise(resolve => {
        finishAudio = resolve;
      })
  );
  const started = await startVLTask({
    kind: "podcast",
    projectId: 7,
    mainDbName: "a",
    resourceIds: [],
    resourceNames: [],
    podcast: { name: "episode", speakers: [], durationMin: 1, durationMax: 2 },
  });
  await vi.waitFor(() => expect(state.finish).not.toBeNull());
  state.finish!("script");
  await vi.waitFor(() => expect(state.synthesize).toHaveBeenCalledTimes(1));
  controller.abort();
  finishAudio({ audioUrl: "https://files.test/late.wav", duration: 1, lines });
  await vi.waitFor(() =>
    expect(useVLTaskStore.getState().tasks[started.taskId].status).toBe("failed")
  );
  expect(state.invoke.mock.calls.some(([channel]) => channel === "podcast:create")).toBe(false);
  useVLTaskStore.getState().remove(started.taskId);
});
