import { beforeAll, expect, it, vi } from "vitest";
const state = vi.hoisted(() => {
  const invoke = vi.fn(async (channel: string): Promise<unknown> => {
    if (channel === "content:create") return 17;
    if (channel === "vl-note:create") return { id: 42, contentId: 17, projectId: 7, title: "大纲" };
    if (channel === "vl-quiz:create-set") return { id: 21, projectId: 7, name: "测验" };
    if (channel === "vl-quiz:create-items-batch") return [{ id: 1, quizSetId: 21 }];
    if (channel === "plugin-entities:locate")
      return { id: 81, pluginId: "tau.podcast", kind: "episode" };
    return {};
  });
  window.electron = { platform: "darwin", invoke, on: vi.fn() } as unknown as ElectronAPI;
  return {
    invoke,
    finish: null as null | ((text: string) => void),
    request: null as unknown,
  };
});
vi.mock("@/commands", async importOriginal => ({
  ...(await importOriginal<typeof import("@/commands")>()),
  getCollaborationState: vi.fn(async () => ({ rooms: [], connected: false })),
}));
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
vi.mock("@/utils", async importOriginal => ({
  ...(await importOriginal<typeof import("@/utils")>()),
  getContentLength: () => 1,
  getMarkdown: () => "",
  importFromMarkdown: (text: string) => [{ type: "paragraph", children: [{ text }] }],
}));
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
beforeAll(() => useDynamicExtensionsStore.getState().initExtensions());
import { cancelVLTask, retryVLTask, startVLTask } from "../runner";
import { useVLTaskStore } from "../store";
import { setChatDatabase } from "@/services/chatDatabase";
import { quizKeys } from "../../../../quizQueries";
import { queryClient } from "@/queryClient";

function finishGeneration(text: string) {
  const finish = state.finish;
  if (!finish) throw new Error("生成任务未启动");
  finish(text);
}

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
  finishGeneration("原库的生成正文");
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
  await vi.waitFor(() => expect(complete).toBeTypeOf("function"));
  controller.abort();
  complete(17);
  await expect(opening).rejects.toThrow();
  expect(state.finish).toBeNull();
  expect(state.invoke.mock.calls.some(([channel]) => channel === "vl-note:create")).toBe(false);
});

function pluginOutput(complete: (input: { text: string }) => Promise<void>) {
  const prepare = vi.fn(async () => ({
    entity: "81",
    title: "播客脚本",
    instructions: "写对话",
  }));
  const fail = vi.fn(async (): Promise<void> => undefined);
  const grantNotebook = vi.fn(async () => 1);
  const output = {
    id: "plugin:tau.podcast:podcast",
    context: { pluginId: "tau.podcast" },
    definition: { title: "播客", kind: "episode", prepare, complete: vi.fn(complete), fail },
    mountId: 1,
  } as unknown as import("@/app/plugins/runtime").RegisteredPluginNotebookOutput;
  return { output, prepare, fail, grantNotebook };
}

it("插件产物：prepare 建占位并挂到 Notebook，宿主生成后把正文交给 complete", async () => {
  state.invoke.mockClear();
  state.finish = null;
  const { output, prepare, grantNotebook } = pluginOutput(async () => undefined);
  const started = await startVLTask({
    kind: "plugin",
    projectId: 7,
    mainDbName: "a",
    resourceIds: [3],
    resourceNames: ["Raft.pdf"],
    userPrompt: "多举例",
    plugin: { output, options: { minutes: 5 }, notebookTitle: "分布式", grantNotebook },
  });
  expect(prepare).toHaveBeenCalledWith(
    expect.objectContaining({
      notebook: { id: "7", title: "分布式" },
      resources: [{ id: "3", name: "Raft.pdf" }],
      userPrompt: "多举例",
      options: { minutes: 5 },
    })
  );
  expect(grantNotebook).toHaveBeenCalled();
  const link = (state.invoke.mock.calls as unknown as unknown[][]).find(
    args => args[0] === "plugin-links:add"
  );
  expect(link?.[1]).toMatchObject({
    pluginId: "tau.podcast",
    from: 81,
    to: { kind: "notebook", id: "7" },
    role: "output",
  });
  expect(started.pluginEntityId).toBe(81);
  expect(useVLTaskStore.getState().tasks[started.taskId].plugin).toMatchObject({
    pluginId: "tau.podcast",
    entityId: 81,
  });
  expect(state.request).toMatchObject({
    taskType: "plugin",
    taskPayload: { pluginId: "tau.podcast", title: "播客脚本", instructions: "写对话" },
  });
  finishGeneration("林舟: 你好");
  await vi.waitFor(() =>
    expect(useVLTaskStore.getState().tasks[started.taskId].status).toBe("succeeded")
  );
  expect(output.definition.complete).toHaveBeenCalledWith(
    expect.objectContaining({ entity: "81", text: "林舟: 你好" })
  );
  useVLTaskStore.getState().remove(started.taskId);
});

it("插件产物：complete 出错时通知插件，重试复用仍存在的产物", async () => {
  state.invoke.mockClear();
  state.finish = null;
  const { output, prepare, fail, grantNotebook } = pluginOutput(async () => {
    throw new Error("合成失败");
  });
  const started = await startVLTask({
    kind: "plugin",
    projectId: 7,
    mainDbName: "a",
    resourceIds: [],
    resourceNames: [],
    plugin: { output, options: undefined, notebookTitle: "分布式", grantNotebook },
  });
  finishGeneration("脚本");
  await vi.waitFor(() =>
    expect(useVLTaskStore.getState().tasks[started.taskId].status).toBe("failed")
  );
  expect(useVLTaskStore.getState().tasks[started.taskId].error).toBe("合成失败");
  expect(fail).toHaveBeenCalledWith({ entity: "81", reason: "failed", message: "合成失败" });
  vi.mocked(output.definition.complete).mockResolvedValueOnce(undefined);
  await retryVLTask(started.taskId);
  finishGeneration("重新生成的脚本");
  await vi.waitFor(() =>
    expect(useVLTaskStore.getState().tasks[started.taskId].status).toBe("succeeded")
  );
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(grantNotebook).toHaveBeenCalledTimes(1);
  useVLTaskStore.getState().remove(started.taskId);
});

it("插件取消清理完成后才允许重试，已删除的产物重新 prepare 并打开新实体", async () => {
  const invoke = state.invoke.getMockImplementation();
  if (!invoke) throw new Error("命令模拟未初始化");
  const entities = new Set([81]);
  state.invoke.mockImplementation(async channel => {
    if (channel === "plugin-entities:locate")
      return entities.size
        ? { id: [...entities][0], pluginId: "tau.podcast", kind: "episode" }
        : null;
    return invoke(channel);
  });
  const { output, prepare, fail, grantNotebook } = pluginOutput(async () => undefined);
  let finishCleanup!: () => void;
  fail.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        finishCleanup = () => {
          entities.delete(81);
          resolve();
        };
      })
  );
  try {
    const started = await startVLTask({
      kind: "plugin",
      projectId: 7,
      mainDbName: "a",
      resourceIds: [],
      resourceNames: [],
      plugin: { output, options: undefined, notebookTitle: "分布式", grantNotebook },
    });
    cancelVLTask(started.taskId);
    await vi.waitFor(() => expect(finishCleanup).toBeTypeOf("function"));
    expect(useVLTaskStore.getState().tasks[started.taskId].status).toBe("running");
    await expect(retryVLTask(started.taskId)).rejects.toThrow("仍在运行");
    finishCleanup();
    await vi.waitFor(() =>
      expect(useVLTaskStore.getState().tasks[started.taskId].status).toBe("cancelled")
    );
    prepare.mockImplementationOnce(async () => {
      entities.add(82);
      return { entity: "82", title: "播客脚本", instructions: "写对话" };
    });
    await retryVLTask(started.taskId);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(grantNotebook).toHaveBeenCalledTimes(2);
    expect(useVLTaskStore.getState().openRequest).toMatchObject({
      projectId: 7,
      target: { kind: "plugin-output", id: 82 },
    });
    finishGeneration("重试生成的脚本");
    await vi.waitFor(() =>
      expect(useVLTaskStore.getState().tasks[started.taskId].status).toBe("succeeded")
    );
    expect(output.definition.complete).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "82", text: "重试生成的脚本" })
    );
    useVLTaskStore.getState().remove(started.taskId);
  } finally {
    state.invoke.mockImplementation(invoke);
  }
});
