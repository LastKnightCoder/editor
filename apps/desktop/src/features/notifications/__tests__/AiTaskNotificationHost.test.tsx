import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubagentSnapshot, SubagentView } from "@/types/subagent";
import type { VLResourceTaskStatus } from "@/types/vibe-learning";

const mocks = vi.hoisted(() => ({
  notify: Object.assign(
    vi.fn(
      (options: import("@/services/notifications/notify").AppNotifyOptions) =>
        options.id ?? "generated"
    ),
    { dismiss: vi.fn() }
  ),
  listSubagents: vi.fn(),
  activeTasks: vi.fn(),
  openPage: vi.fn(),
  closeSettings: vi.fn(),
  events: new Map<string, (_event: unknown, payload: VLResourceTaskStatus) => void>(),
  page: { key: "home", params: {} as Record<string, unknown> },
}));
vi.mock("@/services/notifications/notify", () => ({ appNotify: mocks.notify }));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: "work.db" } } }) },
}));
vi.mock("@/app/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ open: false, closeSettings: mocks.closeSettings }) },
}));
vi.mock("@/services/page-navigation", () => ({
  openPage: mocks.openPage,
  getPageNavigation: () => ({ state: { back: [mocks.page] } }),
}));
vi.mock("@/commands/subagents", () => ({
  listSubagents: mocks.listSubagents,
  onSubagentsChanged: () => () => undefined,
}));
vi.mock("@/commands/vibe-learning", () => ({ getVLActiveTasks: mocks.activeTasks }));
vi.mock("@/commands/embedding-model", () => ({ onEmbeddingIndexProgress: () => () => undefined }));
vi.mock("@/services/webClipTaskRunner", () => ({
  webClipTaskRunner: { onComplete: () => () => undefined, onError: () => () => undefined },
}));
vi.mock("@/services/piChatRuntime", () => ({
  piChatRuntime: {
    findBySessionId: () => undefined,
    findByKey: () => undefined,
    subscribe: () => () => undefined,
    onRunOutcome: () => () => undefined,
  },
}));
vi.mock("@/commands/piSession", () => ({
  onPiSessionInteractions: vi.fn(),
  piSessionInteractions: vi.fn(),
  piSessionApproveTool: vi.fn(),
  piSessionAnswerQuestion: vi.fn(),
}));
vi.mock("@/electron", async importOriginal => ({
  ...(await importOriginal<typeof import("@/electron")>()),
  invoke: vi.fn(),
  on: (channel: string, callback: (_event: unknown, payload: VLResourceTaskStatus) => void) =>
    mocks.events.set(channel, callback),
  off: (channel: string) => mocks.events.delete(channel),
}));

import { receiveInteractions, usePiInteractionStore } from "@/services/piInteractions";
import { resetAiNotifyState } from "@/services/notifications/aiNotify";
import { AiTaskNotificationHost } from "../AiTaskNotificationHost";

let root: Root;
let container: HTMLDivElement;
let mounted: boolean;
const child: SubagentView = {
  hostId: "child-host",
  parentScope: "work\u0000main-chat:parent-chat",
  runs: [],
  agent: {
    agentId: "child",
    parentKey: "parent",
    title: "Research",
    databaseName: "work",
    cwd: "",
    createdAt: 1,
  },
};
const pendingApproval = (revision: number, pending: boolean) =>
  receiveInteractions({
    sessionId: "child-host",
    revision,
    questions: [],
    approvals: pending
      ? [
          {
            requestId: "request-1",
            sessionId: "child-host",
            toolCallId: "call",
            toolName: "write",
            risk: "write",
            input: "{}",
            requestedAt: 1,
          },
        ]
      : [],
  });
const mount = async () => {
  await act(async () => {
    root.render(<AiTaskNotificationHost />);
  });
  mounted = true;
};

beforeEach(() => {
  vi.clearAllMocks();
  resetAiNotifyState();
  usePiInteractionStore.setState({ sessions: {}, readySessions: {} });
  mocks.page = { key: "home", params: {} };
  mocks.listSubagents.mockResolvedValue({ revision: 1, agents: [] });
  mocks.activeTasks.mockResolvedValue([]);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.spyOn(document, "hasFocus").mockReturnValue(false);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mounted = false;
});
afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("AI 通知宿主事件竞态", () => {
  it("审批先于子 Agent 元数据到达时，补齐后可回到父对话，处理后撤销", async () => {
    let resolveAgents!: (snapshot: SubagentSnapshot) => void;
    mocks.listSubagents.mockReturnValue(
      new Promise(resolve => {
        resolveAgents = resolve;
      })
    );
    await mount();
    await act(async () => pendingApproval(1, true));
    expect(mocks.notify).not.toHaveBeenCalled();
    await act(async () => resolveAgents({ revision: 1, agents: [child] }));
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ai-approval:request-1", sticky: true })
    );
    const action = mocks.notify.mock.calls[0][0].actions?.[0];
    if (!action?.onClick) throw new Error("Missing review action");
    await action.onClick();
    expect(mocks.openPage).toHaveBeenCalledWith("chat", { id: "parent-chat" });
    await act(async () => pendingApproval(2, false));
    expect(mocks.notify.dismiss).toHaveBeenCalledWith("ai-approval:request-1");
  });

  it("宿主关闭后迟到的子 Agent 快照不能重新创建通知", async () => {
    let resolveAgents!: (snapshot: SubagentSnapshot) => void;
    mocks.listSubagents.mockReturnValue(
      new Promise(resolve => {
        resolveAgents = resolve;
      })
    );
    await mount();
    await act(async () => pendingApproval(1, true));
    await act(async () => root.unmount());
    mounted = false;
    await act(async () => resolveAgents({ revision: 1, agents: [child] }));
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("队列快照与实时终态交错时不漏计、不重计，其他 Notebook 不抑制通知", async () => {
    vi.useFakeTimers();
    let resolveTasks!: (tasks: VLResourceTaskStatus[]) => void;
    mocks.activeTasks.mockReturnValue(
      new Promise(resolve => {
        resolveTasks = resolve;
      })
    );
    mocks.page = { key: "vibe-learning-detail", params: { id: 2 } };
    vi.mocked(document.hasFocus).mockReturnValue(true);
    await mount();
    const first: VLResourceTaskStatus = {
      taskId: "a",
      resourceId: 1,
      projectId: 1,
      mainDbName: "work",
      status: "indexing",
    };
    const second: VLResourceTaskStatus = { ...first, taskId: "b", resourceId: 2 };
    const emit = (task: VLResourceTaskStatus) =>
      mocks.events.get("vibe-learning-status-change")?.(null, task);
    emit({ ...second, status: "completed" });
    await act(async () => resolveTasks([first, second]));
    await vi.advanceTimersByTimeAsync(1_200);
    expect(mocks.notify).not.toHaveBeenCalled();
    emit({ ...first, status: "failed" });
    await vi.advanceTimersByTimeAsync(1_200);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ id: "vl-resources-batch:1", tone: "danger" })
    );
    emit({ ...second, status: "completed" });
    await vi.advanceTimersByTimeAsync(1_200);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });
});
