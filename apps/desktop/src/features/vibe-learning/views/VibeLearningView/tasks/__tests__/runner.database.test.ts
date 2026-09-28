import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => {
  const invoke = vi.fn(async (channel: string): Promise<unknown> => {
    if (channel === "content:create") return 17;
    if (channel === "vl-note:create") return { id: 42, contentId: 17, projectId: 7, title: "大纲" };
    return {};
  });
  window.electron = { platform: "darwin", invoke } as unknown as ElectronAPI;
  return { invoke, finish: null as null | ((text: string) => void) };
});
vi.mock("@/commands", async () => await import("@/commands/content"));
vi.mock("@/services/generation-orchestrator", () => ({
  runGenerationTask: (
    _provider: unknown,
    _model: unknown,
    _request: unknown,
    callbacks: { onFinish(text: string): void }
  ) => {
    state.finish = callbacks.onFinish;
  },
}));
vi.mock("@/stores/useSettingStore", () => ({
  default: {
    getState: () => ({
      setting: {
        llmProviders: [{ id: "p", models: [{ id: "m" }] }],
        llmUsageSettings: { chat: { providerId: "p", modelId: "m" } },
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
vi.mock("@/services/podcast", () => ({ parseScript: () => [] }));
vi.mock("../podcastAudio", () => ({ synthesizePodcast: vi.fn() }));
vi.mock("@/utils", () => ({
  getContentLength: () => 1,
  getMarkdown: () => "",
  importFromMarkdown: (text: string) => [{ type: "paragraph", children: [{ text }] }],
}));
import { startVLTask } from "../runner";
import { useVLTaskStore } from "../store";
import { setChatDatabase } from "@/services/chatDatabase";

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
