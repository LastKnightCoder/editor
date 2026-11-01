import { act, useEffect, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PluginEntityRecord } from "@/types/plugin-entities";

const mocks = vi.hoisted(() => ({ outputs: vi.fn<() => Promise<PluginEntityRecord[]>>() }));
vi.mock("@/electron", () => ({ on: vi.fn(), off: vi.fn() }));
vi.mock("@/commands/plugin-entities", () => ({ listNotebookPluginOutputs: mocks.outputs }));
vi.mock("@/commands/vibe-learning-project", () => ({
  getVibeLearningProject: async () => ({ id: 7, title: "分布式" }),
  recordVibeLearningProjectOpen: async () => undefined,
}));
vi.mock("@/commands/vibe-learning", () => ({
  getVLNotesByProjectId: async () => [],
  getVLResourcesByProjectId: async () => [],
}));
vi.mock("@/stores/useSettingStore", () => ({
  default: (select: (state: unknown) => unknown) =>
    select({ setting: { database: { active: "a" } } }),
}));
vi.mock("@/hooks/useDatabaseChangeEffect", () => ({
  useDatabaseChangeEffect: (effect: () => void) => {
    const callback = useRef(effect);
    useEffect(() => callback.current(), []);
  },
}));
vi.mock("@/hooks/useDockResize", () => ({
  DOCK_CHAT_MIN: 360,
  clampDockChatWidth: (width: number) => width,
  useDockResize: () => vi.fn(),
}));
vi.mock("@tau/ui", () => ({
  cn: () => "",
  toast: { error: vi.fn() },
  ResizableAndHideableSidebar: ({ children }: { children: ReactNode }) => children,
  FadeScroll: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../views/VibeLearningView/ChatPanel", () => ({ default: () => null }));
vi.mock("../views/VibeLearningView/AddResourceModal", () => ({ default: () => null }));
vi.mock("../views/VibeLearningView/generate", () => ({ default: () => null }));
vi.mock("../views/VibeLearningView/tree/ResourceGroup", () => ({ ResourceGroup: () => null }));
vi.mock("../views/VibeLearningView/tree/SourceRow", () => ({ SourceRow: () => null }));
vi.mock("../views/VibeLearningView/tree/OutputGroup", () => ({ OutputGroup: () => null }));
vi.mock("../views/VibeLearningView/stage/ResourceStage", () => ({ ResourceStage: () => null }));
vi.mock("../views/VibeLearningView/stage/NoteEditorView", () => ({ default: () => null }));
vi.mock("../views/VibeLearningView/resourceKinds", () => ({
  canOpenInStage: () => false,
  openResourceExternally: vi.fn(),
}));
vi.mock("../views/VibeLearningView/stage/PluginOutputStage", () => ({
  PluginOutputStage: ({ entity }: { entity: PluginEntityRecord }) => (
    <output>{entity.title}</output>
  ),
}));
vi.mock("../views/VibeLearningView/stage/TaskStage", () => ({
  TaskStage: ({ task }: { task: { status: string } }) => <output>{task.status}</output>,
}));

import VibeLearningView from "../views/VibeLearningView";
import { useVLTaskStore, type VLTask } from "../views/VibeLearningView/tasks/store";
import { setChatDatabase } from "@/services/chatDatabase";

let client: QueryClient;
let root: Root;
let container: HTMLDivElement;
let complete: (outputs: PluginEntityRecord[]) => void;
const selectionKey = "vibe-learning-opened-7";
const readSelection = () => JSON.parse(localStorage.getItem(selectionKey) ?? "null");
const entity = {
  id: 81,
  pluginId: "tau.podcast",
  kind: "episode",
  title: "Raft 播客",
} as PluginEntityRecord;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem(selectionKey, JSON.stringify({ kind: "plugin-output", id: 81 }));
  setChatDatabase("a");
  useVLTaskStore.setState({ tasks: {}, productVersion: {}, openRequest: null });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.outputs.mockReset().mockImplementation(
    () =>
      new Promise(resolve => {
        complete = resolve;
      })
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  client.clear();
  useVLTaskStore.setState({ tasks: {}, productVersion: {}, openRequest: null });
  setChatDatabase("");
  localStorage.clear();
});

async function mount() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <VibeLearningView projectId={7} />
      </QueryClientProvider>
    )
  );
}
async function waitFor(check: () => void) {
  await act(async () => {
    await vi.waitFor(check);
  });
}

it("产物查询迟到时保留选择，加载成功后恢复阅读区；已确认删除时才清除选择", async () => {
  await mount();
  expect(readSelection()).toEqual({
    kind: "plugin-output",
    id: 81,
  });
  await act(async () => complete([entity]));
  await waitFor(() => expect(container.textContent).toContain("Raft 播客"));
  mocks.outputs.mockResolvedValueOnce([]);
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["vibe-learning", "plugin-outputs"] });
  });
  await waitFor(() => expect(readSelection()).toBeNull());
});

it("列表刷新尚未拿到产物时仍能查看任务，取消删除产物后保留任务供重试", async () => {
  useVLTaskStore.getState().put({
    id: "task",
    databaseName: "a",
    projectId: 7,
    kind: "plugin",
    title: "播客脚本",
    plugin: { pluginId: "tau.podcast", kind: "episode", entityId: 81, label: "播客" },
    status: "running",
    phase: "分析资料",
    startedAt: 1,
    turns: [],
    output: "",
    outputTokens: 0,
    resourceNames: [],
  } satisfies VLTask);
  await mount();
  expect(container.textContent).toContain("running");
  await act(async () => {
    complete([]);
    useVLTaskStore.getState().patch("task", { status: "cancelled" });
  });
  await waitFor(() => expect(container.textContent).toContain("cancelled"));
  expect(readSelection()).toEqual({
    kind: "plugin-output",
    id: 81,
  });
});
