import { beforeEach, expect, it, vi } from "vitest";
import { Role } from "@tau/shared/chat-core";
import {
  buildMessage,
  createChat,
  regenerateLast,
  releaseChatLibrary,
  sendMessage,
  useChatStore,
} from "../chatController";

const service = vi.hoisted(() => ({
  tools: { list: vi.fn() },
  sessions: {
    create: vi.fn(async () => ({ row: { title: "已有对话" }, messages: [], revision: "r1" })),
    editHistory: vi.fn(async () => ({ revision: "r2" })),
  },
  runs: {
    start: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
  },
}));
vi.mock("../../ai", () => ({ getMobileAiService: () => service }));
vi.mock("../hostTools", () => ({
  registerHostCapabilities: () => ({ toolIds: ["host:read"], dispose: vi.fn() }),
}));

beforeEach(async () => {
  await releaseChatLibrary("one.db");
  vi.clearAllMocks();
  service.tools.list.mockReturnValue([]);
  useChatStore.setState({ chats: {} });
  await createChat("one.db", "chat-1", { providerId: "provider", modelId: "model" });
});

it("每轮读取本库当前工具，插件新增和停用立即反映到聊天请求", async () => {
  service.tools.list.mockReturnValue([{ id: "host:read" }, { id: "plugin:notes:lookup" }]);
  await sendMessage("chat-1", "查找笔记");
  expect(service.tools.list).toHaveBeenCalledWith({ databaseName: "one.db" });
  expect(service.runs.start).toHaveBeenLastCalledWith(
    expect.objectContaining({
      toolIds: ["host:read", "plugin:notes:lookup"],
    })
  );
  useChatStore.getState().patch("chat-1", { runId: null });
  service.tools.list.mockReturnValue([{ id: "plugin:calendar:lookup" }]);
  await sendMessage("chat-1", "再查日程");
  expect(service.runs.start).toHaveBeenLastCalledWith(
    expect.objectContaining({
      toolIds: ["host:read", "plugin:calendar:lookup"],
    })
  );
});

it("手动 Skill 绑定消息并进入运行，历史重新生成仍携带原选择", async () => {
  const input = { text: "整理周报", skillIds: ["notes:weekly", "notes:weekly"] };
  await sendMessage("chat-1", input);
  expect(service.runs.start).toHaveBeenLastCalledWith(
    expect.objectContaining({
      skillIds: ["notes:weekly"],
      message: [{ type: "text", text: "整理周报", skills: ["notes:weekly"] }],
    })
  );
  useChatStore.getState().patch("chat-1", {
    runId: null,
    messages: [{ role: Role.User, content: buildMessage(input), piEntryIds: ["user-entry"] }],
  });
  await regenerateLast("chat-1");
  expect(service.sessions.editHistory).toHaveBeenCalledWith(
    { databaseName: "one.db", sessionId: "chat-1" },
    "r1",
    { kind: "rewind", entryId: "user-entry" }
  );
  expect(service.runs.start).toHaveBeenLastCalledWith(
    expect.objectContaining({
      expectedRevision: "r2",
      skillIds: ["notes:weekly"],
    })
  );
});

it("纯图片的手动 Skill 保留在展示消息中，不改变图片输入", () => {
  expect(
    buildMessage({ text: "", images: ["data:image/png;base64,AA=="], skillIds: ["notes:vision"] })
  ).toEqual([
    { type: "image", image: "data:image/png;base64,AA==" },
    { type: "text", text: "", skills: ["notes:vision"] },
  ]);
});

it("内置 Skill 的历史标识与桌面一致，运行时恢复来源限定", async () => {
  await sendMessage("chat-1", { text: "查数据库", skillIds: ["internal:database-schema"] });
  expect(service.runs.start).toHaveBeenLastCalledWith(
    expect.objectContaining({
      message: [{ type: "text", text: "查数据库", skills: ["database-schema"] }],
      skillIds: ["internal:database-schema"],
    })
  );
});
