/**
 * ChatContainer 拆分前的行为护栏：锁定发送流水线、待发送队列、停止、编辑重发、
 * 草稿登记与失败恢复这些「拆分后必须不变」的状态机。
 *
 * mock 边界只到两处：
 * - 传输层（window.electron 假桥：invoke 按通道分发、on/off 收集监听供测试注入事件）；
 * - UI 外壳桩（@tau/chat-ui 的 ChatContainerCore、MessageItem、ChatInputArea——
 *   只替换渲染，回调与 ref 句柄按真实 props 接线）。
 * store、piChatRuntime、piChatSessionManager、commands 全部走真实实现，断言落在
 * store 状态 / IPC 通道与载荷 / runtime 队列 / 对宿主的回调上。
 */
import { act } from "react";
import { PageProvider } from "@/page/PageProvider";
import { registerPageMeta } from "@/page/core/pageMeta";
import { ChatShortcuts } from "@/app/ChatShortcuts";
import { useOwnAssist } from "@/app/assistOwner";
import { useShellStore } from "@/app/shellStore";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ipc = vi.hoisted(() => {
  type Handler = (...args: any[]) => unknown;
  const calls: Array<{ channel: string; args: any[] }> = [];
  const overrides = new Map<string, Handler>();
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  const defaults = new Map<string, Handler>([
    // piSessionCreate 把 sessionId 放在首参对象里；宿主回传会话文件名供草稿登记
    [
      "pi-session:create",
      (input: any) => ({ ok: true, sessionFile: `f_${input.piSessionId}.jsonl` }),
    ],
    ["pi-session:prompt", () => ({ ok: true })],
    ["pi-session:abort", () => ({ ok: true })],
    ["pi-session:steer", () => ({ ok: true })],
    ["pi-session:set-system-prompt", () => ({ ok: true })],
    ["pi-session:set-active-tools", () => ({ ok: true })],
    // 重载恢复：找不到宿主会话，restoreSession 空转
    ["pi-session:find-by-scope", () => ({ ok: false })],
    ["pi-session:interactions", () => ({ ok: true, snapshots: [] })],
    ["pi-session:transcript", () => ({ ok: true, messages: [] })],
    ["pi-session:tree", () => ({ ok: true, nodes: [] })],
    ["pi-ai:thinking-levels", () => ({ ok: true, levels: [] })],
    ["pi-subagents:list", () => ({ revision: 0, agents: [] })],
    ["skill:list", () => []],
    ["chat-session:update", () => null],
    [
      "chat-session:create",
      (input: any) => ({
        id: input.id,
        scope: input.scope,
        domainRef: input.domainRef ?? null,
        sessionFile: input.sessionFile,
        cwd: input.cwd ?? "",
        title: input.title ?? "新对话",
        titleDirty: input.titleDirty ?? false,
        createTime: 1,
        updateTime: 1,
        messageCount: input.messageCount ?? 0,
        groupId: input.groupId ?? null,
        archived: false,
        orderNum: null,
      }),
    ],
  ]);
  window.electron = {
    platform: "darwin",
    invoke: (channel: string, ...args: any[]) => {
      calls.push({ channel, args });
      const handler = overrides.get(channel) ?? defaults.get(channel);
      return Promise.resolve(handler ? handler(...args) : { ok: true });
    },
    on: (channel: string, listener: (...args: any[]) => void) => {
      let set = listeners.get(channel);
      if (!set) listeners.set(channel, (set = new Set()));
      set.add(listener);
    },
    off: (channel: string, listener: (...args: any[]) => void) => {
      listeners.get(channel)?.delete(listener);
    },
    send: () => {},
  } as unknown as ElectronAPI;
  return {
    calls,
    overrides,
    emit: (channel: string, ...payload: any[]) => {
      listeners.get(channel)?.forEach(listener => listener(undefined, ...payload));
    },
    reset: () => {
      calls.length = 0;
      overrides.clear();
    },
  };
});

/* ChatContainerCore 桩：不渲染虚拟列表，但按真实协议调用 render* 回调与 ref，
   并把最新 props 暴露给测试（isLoading/error/queuedMessageCount/onStopGeneration） */
const coreShell = vi.hoisted(() => ({ props: null as any }));
vi.mock("@tau/chat-ui", async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  const React = await import("react");
  const CoreStub = React.forwardRef(function ChatContainerCoreStub(props: any, ref: any) {
    React.useImperativeHandle(
      ref,
      () => ({
        scrollToBottom: () => {},
        scrollToOffset: () => {},
        scrollToItemOffset: () => {},
        scrollToIndex: () => {},
      }),
      []
    );
    coreShell.props = props;
    const inputNode = props.renderChatInputArea
      ? props.renderChatInputArea({
          chatInputRef: props.inputRef,
          inputProps: { placeholder: "" },
        })
      : null;
    return React.createElement(
      "div",
      null,
      props.renderStatusBanner?.({ retryStatus: props.retryStatus, error: props.error }) ?? null,
      ...(props.messages ?? []).map((message: any, index: number) =>
        React.createElement(
          "div",
          { key: `stub-message-${index}` },
          props.renderMessage({ message, messageIndex: index })
        )
      ),
      props.renderInputWrapper
        ? React.createElement("div", { key: "stub-input" }, props.renderInputWrapper(inputNode))
        : null
    );
  });
  return { ...actual, ChatContainerCore: CoreStub };
});

/* ChatInputArea 桩：实现 ChatInputAreaHandle 协议（getValue/setValue/clear），测试经
   inputRef 读取输入框状态；onSteer 出现与否由组件的 canSteerNow 决定（桩只接线） */
const inputShell = vi.hoisted(() => ({
  state: null as null | { text: string; clears: number; setValues: string[] },
}));
vi.mock("@/components/ChatInputArea", async () => {
  const React = await import("react");
  const InputStub = React.forwardRef(function ChatInputAreaStub(_props: any, ref: any) {
    const state = React.useRef({ text: "", clears: 0, setValues: [] as string[] });
    inputShell.state = state.current;
    React.useImperativeHandle(ref, () => ({
      getValue: () =>
        state.current.text ? [{ type: "text" as const, text: state.current.text }] : [],
      setValue: (value: string) => {
        state.current.text = value;
        state.current.setValues.push(value);
      },
      clear: () => {
        state.current.text = "";
        state.current.clears += 1;
      },
      focusEnd: () => {},
      appendMention: () => {},
    }));
    return _props.onSteer
      ? React.createElement("button", {
          type: "button",
          "aria-label": "stub-steer",
          onClick: () => void _props.onSteer(),
        })
      : null;
  });
  return { default: InputStub };
});

/* MessageItem 桩：把编辑/重新生成回调接成按钮，供测试以 DOM 事件触发 */
vi.mock("@/components/ChatSidebar/MessageItem", async () => {
  const React = await import("react");
  const textOf = (message: any) =>
    typeof message.content === "string"
      ? message.content
      : (message.content ?? [])
          .filter((item: any) => item.type === "text")
          .map((item: any) => item.text)
          .join("\n");
  const MessageItemStub = (props: any) =>
    React.createElement(
      "div",
      { "data-stub-message": props.messageIndex },
      props.onEditMessage
        ? React.createElement("button", {
            type: "button",
            "aria-label": `stub-edit-${props.messageIndex}`,
            onClick: () => props.onEditMessage(props.messageIndex, textOf(props.message)),
          })
        : null,
      props.onRegenerateMessage
        ? React.createElement("button", {
            type: "button",
            "aria-label": `stub-regen-${props.messageIndex}`,
            onClick: () => void props.onRegenerateMessage(props.messageIndex),
          })
        : null
    );
  return { default: MessageItemStub };
});

import type { ChatContainerHandle } from "../ChatContainer";
import ChatContainer from "../ChatContainer";
import { chatSessionKey } from "@/services/piChatSession";
import { piChatRuntime } from "@/services/piChatRuntime";
import { usePiInteractionStore } from "@/services/piInteractions";
import useChatSessionStore, { ChatBucketStatus } from "@/stores/useChatSessionStore";
import useSettingStore from "@/stores/useSettingStore";
import { Role } from "@/constants";
import type { ChatMessage, RequestMessage, ResponseMessage } from "@/types";
import type { ChatSessionRow } from "@/types/chat-session";

registerPageMeta({ key: "pdf-detail", match: "single", label: "PDF", fields: {} });

if (typeof window.requestAnimationFrame !== "function") {
  window.requestAnimationFrame = (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0) as unknown as number;
  window.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
}

const text = (value: string) => [{ type: "text" as const, text: value }];
const flushMicrotasks = async (rounds = 25) => {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
};
// 覆盖 effect 里的 setTimeout(0)/100 与 settled 异步收尾链
const settleAct = async (ms = 40) => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
};

const CHAT_MODEL = { id: "m1", name: "模型一", input: ["text"], reasoning: false };
const CHAT_PROVIDER = {
  id: "p1",
  name: "服务商一",
  baseUrl: "http://localhost:1",
  apiKey: "key",
  api: "openai-completions",
  models: [CHAT_MODEL],
};

const draftChat = (id: string): ChatMessage =>
  ({
    id,
    createTime: 1,
    updateTime: 1,
    messages: [],
    title: "新对话",
    titleDirty: false,
    groupId: null,
    archived: false,
    orderNum: null,
    scope: "main-chat",
    domainRef: null,
  }) as ChatMessage;

const savedChat = (id: string, messages: ChatMessage["messages"]): ChatMessage => ({
  ...draftChat(id),
  titleDirty: true,
  sessionFile: `f_${id}.jsonl`,
  messages,
});

const userMessage = (body: string, entryIds?: string[]): RequestMessage =>
  ({
    clientId: `u-${body}`,
    role: Role.User,
    content: text(body),
    ...(entryIds ? { piEntryIds: entryIds } : {}),
  }) as RequestMessage;

const assistantMessage = (body: string, entryIds?: string[]): ResponseMessage =>
  ({
    clientId: `a-${body}`,
    role: Role.Assistant,
    content: body,
    ...(entryIds ? { piEntryIds: entryIds } : {}),
  }) as ResponseMessage;

/** editChat 要在目录里找到行才允许改会话树 */
const seedSessionRow = (chat: ChatMessage) => {
  const row: ChatSessionRow = {
    id: chat.id,
    scope: "main-chat",
    domainRef: null,
    sessionFile: chat.sessionFile!,
    cwd: "",
    title: chat.title,
    titleDirty: true,
    createTime: 1,
    updateTime: 1,
    messageCount: chat.messages.length,
    groupId: null,
    archived: false,
    orderNum: null,
    source: "desktop",
  };
  useChatSessionStore.setState({
    buckets: {
      ...useChatSessionStore.getState().buckets,
      "main-chat|": { rows: [row], status: ChatBucketStatus.SUCCESS },
    },
  });
};

interface MountOptions {
  chat: ChatMessage;
  chatScope?: string;
  beforeSendUserMessage?: (content: any[]) => Promise<boolean | void>;
}

let host: HTMLDivElement;
let root: Root;
let usedSessionKeys: string[] = [];

const mountChat = (options: MountOptions) => {
  const handle = { current: null as ChatContainerHandle | null };
  const sendLoadingValues: boolean[] = [];
  const onChatCreated = vi.fn();
  usedSessionKeys.push(
    chatSessionKey(options.chatScope ?? "main-chat", options.chat.id, options.chat.databaseName)
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Harness = () => (
    <QueryClientProvider client={queryClient}>
      <PageProvider initialKey="pdf-detail">
        <DndProvider backend={HTML5Backend}>
          <ChatContainer
            ref={handle}
            currentChat={options.chat}
            isDark={false}
            markdownComponents={{}}
            isVisible
            sendLoading={false}
            setSendLoading={value => sendLoadingValues.push(value)}
            titleRef={{ current: null }}
            onCreateNewMessage={() => {}}
            createMessageLoading={false}
            {...(options.chatScope ? { chatScope: options.chatScope } : {})}
            onChatCreated={onChatCreated}
            {...(options.beforeSendUserMessage
              ? { beforeSendUserMessage: options.beforeSendUserMessage }
              : {})}
          />
        </DndProvider>
      </PageProvider>
    </QueryClientProvider>
  );
  return { handle, sendLoadingValues, onChatCreated, Harness };
};

const renderChat = async (options: MountOptions) => {
  const mounted = mountChat(options);
  await act(async () => {
    root.render(<mounted.Harness />);
  });
  await settleAct(10);
  return mounted;
};

const send = async (handle: { current: ChatContainerHandle | null }, body: string) => {
  let result: boolean | undefined;
  await act(async () => {
    result = await handle.current!.sendUserMessage(text(body));
  });
  return result;
};

const emitPiEvent = (sessionId: string, event: Record<string, unknown>) => {
  act(() => {
    ipc.emit("pi-session-event", { sessionId, event });
  });
};

const callsOf = (channel: string) => ipc.calls.filter(call => call.channel === channel);
const promptPayloads = () => callsOf("pi-session:prompt").map(call => call.args[0]);
const createdSessionId = () => callsOf("pi-session:create")[0]?.args[0]?.sessionId as string;

const clickStub = async (selector: string) => {
  const button = host.querySelector<HTMLElement>(selector);
  expect(button, `缺少交互按钮：${selector}`).toBeTruthy();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();
  });
};

beforeEach(() => {
  ipc.reset();
  useChatSessionStore.setState({
    buckets: {},
    opened: {},
    currentIds: {},
    groups: [],
    draftCwds: {},
  });
  usePiInteractionStore.setState({ sessions: {}, readySessions: {} });
  useSettingStore.setState(state => ({
    setting: {
      ...state.setting,
      llmProviders: [CHAT_PROVIDER as never],
      llmUsageSettings: {
        ...state.setting.llmUsageSettings,
        chat: { providerId: "p1", modelId: "m1" },
        // 标题模型缺席：标题摘要流程短路，测试只锁定发送与队列状态机
        titleSummary: null,
      },
    },
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  for (const key of usedSessionKeys) piChatRuntime.disposeConversation(key);
  usedSessionKeys = [];
});

it.each([
  { scenario: "未分配时可以首次选择模型", previous: null },
  {
    scenario: "切换已有分配时保留思考档位",
    previous: { providerId: "old-provider", modelId: "old-model", thinkingLevel: "high" as const },
  },
])("输入框选择模型：$scenario", async ({ previous }) => {
  // 新服务商已保存模型时，对话分配仍可能为空。
  useSettingStore.getState().updateLLMUsageSetting("chat", previous);
  await renderChat({ chat: savedChat("chat-model-selection", []) });
  const input = coreShell.props.renderChatInputArea({ inputProps: {} });
  const item = input.props.modelGroups[0].children[0];
  await act(async () => input.props.onModelSelect({ key: item.key }));
  expect(useSettingStore.getState().setting.llmUsageSettings.chat).toEqual({
    ...(previous && { thinkingLevel: "high" }),
    providerId: CHAT_PROVIDER.id,
    modelId: CHAT_MODEL.id,
  });
});

describe("发送流水线", () => {
  it("在重开的对话里压缩当前文件，命令不进入消息历史或下一轮队列", async () => {
    const chat = savedChat("chat-compact", [userMessage("早先的问题"), assistantMessage("回答")]);
    const { handle } = await renderChat({ chat });
    ipc.overrides.set("pi-session:compact", ({ sessionId }) => {
      ipc.emit("pi-session-event", {
        sessionId,
        modelRef: { providerId: CHAT_PROVIDER.id, modelId: CHAT_MODEL.id },
        event: {
          type: "compaction_end",
          reason: "manual",
          aborted: false,
          result: { tokensBefore: 8200, estimatedTokensAfter: 300 },
        },
      });
      return { ok: true, estimatedTokensAfter: 300 };
    });
    expect(await send(handle, "/compact")).toBe(true);
    expect(callsOf("pi-session:create").at(-1)?.args[0]).toMatchObject({
      sessionFile: chat.sessionFile,
    });
    expect(callsOf("pi-session:compact").at(-1)?.args[0]).toEqual({
      sessionId: createdSessionId(),
    });
    expect(promptPayloads()).toEqual([]);
    expect(useChatSessionStore.getState().opened[chat.id]?.compaction).toMatchObject({
      tokensBefore: 8200,
      estimatedTokensAfter: 300,
      isCurrent: true,
    });

    await send(handle, "解释一下 /compact");
    expect(promptPayloads().map(payload => payload.text)).toEqual(["解释一下 /compact"]);
    expect(await send(handle, "/compact")).toBe(false);
    expect(piChatRuntime.listQueue(chatSessionKey("main-chat", chat.id))).toEqual([]);
    expect(callsOf("pi-session:compact")).toHaveLength(1);
  });

  it("首轮发送乐观写入用户消息与助手占位，并把展示形态随 prompt 交给宿主", async () => {
    const chat = draftChat("draft-1");
    const { handle, sendLoadingValues } = await renderChat({ chat });

    expect(await send(handle, "第一问")).toBe(true);

    expect(promptPayloads()).toHaveLength(1);
    const payload = promptPayloads()[0];
    expect(payload.text).toBe("第一问");
    expect(payload.images).toEqual([]);
    // display 携带 clientId：重开对话时文件卡片/mention 按原样显示的前提
    expect(payload.display).toMatchObject({
      content: [{ type: "text", text: "第一问" }],
    });
    expect(payload.display.clientId).toBeTruthy();

    const opened = useChatSessionStore.getState().opened["draft-1"];
    expect(opened?.messages).toHaveLength(2);
    expect(opened!.messages[0]).toMatchObject({ role: Role.User });
    expect(opened!.messages[1]).toMatchObject({ role: Role.Assistant });

    expect(sendLoadingValues).toContain(true);
  });

  it("草稿首轮登记为正式对话（id 不变）并交回宿主，settled 后以 JSONL 投影为准", async () => {
    const chat = draftChat("draft-2");
    const { handle, onChatCreated } = await renderChat({ chat });
    await send(handle, "第一问");

    expect(onChatCreated).toHaveBeenCalledWith("draft-2");
    const registerInput = callsOf("chat-session:create")[0]?.args[0];
    expect(registerInput).toMatchObject({
      id: "draft-2",
      scope: "main-chat",
      sessionFile: expect.any(String),
    });

    // pi 写完 JSONL 后的投影覆盖乐观写入（带 entry id）
    ipc.overrides.set("pi-session:transcript", () => ({
      ok: true,
      messages: [userMessage("第一问", ["e1"]), assistantMessage("回答", ["e2"])],
    }));
    const sessionId = createdSessionId();
    emitPiEvent(sessionId, { type: "agent_start" });
    emitPiEvent(sessionId, { type: "agent_settled" });
    await settleAct();

    const settled = useChatSessionStore.getState().opened["draft-2"];
    expect(settled?.messages).toHaveLength(2);
    expect(settled!.messages[1]).toMatchObject({ role: Role.Assistant, piEntryIds: ["e2"] });
    expect(coreShell.props.error).toBeFalsy();
  });

  it("beforeSendUserMessage 否决时整轮不发：不建会话、不写聊天行", async () => {
    const chat = draftChat("draft-3");
    const { handle } = await renderChat({
      chat,
      beforeSendUserMessage: async () => false,
    });

    expect(await send(handle, "被否决的问题")).toBe(false);
    expect(callsOf("pi-session:create")).toHaveLength(0);
    expect(callsOf("pi-session:prompt")).toHaveLength(0);
    expect(useChatSessionStore.getState().opened["draft-3"]?.messages ?? []).toHaveLength(0);
  });

  it("带参数的会话域（pdf-chat）按 scope 分桶登记，会话键带域前缀", async () => {
    const chat = draftChat("draft-4");
    const { handle } = await renderChat({ chat, chatScope: "pdf-chat:12" });
    await send(handle, "PDF 里的问题");

    const registerInput = callsOf("chat-session:create")[0]?.args[0];
    expect(registerInput).toMatchObject({ id: "draft-4", scope: "pdf-chat", domainRef: "12" });
    // 宿主登记键 = 会话键（`pdf-chat:<chatId>`），重载后 find-by-scope 靠它收养
    expect(callsOf("pi-session:create")[0]?.args[0]).toMatchObject({ scope: "pdf-chat:draft-4" });
  });
});

describe("运行中排队与停止", () => {
  it("流式中提交进待发送队列，本轮结束后自动按序发出（同一宿主会话）", async () => {
    const chat = draftChat("draft-q1");
    const { handle } = await renderChat({ chat });
    await send(handle, "第一条");
    const sessionId = createdSessionId();
    emitPiEvent(sessionId, { type: "agent_start" });

    // 运行中提交：入队而非直接发
    expect(await send(handle, "排队的")).toBe(true);
    expect(promptPayloads()).toHaveLength(1);
    expect(coreShell.props.queuedMessageCount).toBe(1);
    const key = chatSessionKey("main-chat", "draft-q1");
    expect(piChatRuntime.queueSize(key)).toBe(1);

    emitPiEvent(sessionId, { type: "agent_settled" });
    await settleAct();

    expect(promptPayloads().map(payload => payload.text)).toEqual(["第一条", "排队的"]);
    expect(promptPayloads()[1].sessionId).toBe(sessionId);
    expect(piChatRuntime.queueSize(key)).toBe(0);
  });

  it("停止立即中止宿主会话并解除发送占用；排队消息只暂停不丢，手动发送后接着排空", async () => {
    const chat = draftChat("draft-q2");
    const { handle, sendLoadingValues } = await renderChat({ chat });
    await send(handle, "第一条");
    const sessionId = createdSessionId();
    emitPiEvent(sessionId, { type: "agent_start" });
    await send(handle, "停止时排队的");
    const key = chatSessionKey("main-chat", "draft-q2");

    act(() => {
      coreShell.props.onStopGeneration();
    });
    expect(callsOf("pi-session:abort")[0]?.args[0]).toEqual({ sessionId });
    expect(sendLoadingValues.at(-1)).toBe(false);
    expect(piChatRuntime.isStreaming(key)).toBe(false);
    expect(piChatRuntime.isQueuePaused(key)).toBe(true);

    // 停止后的收尾不自动排空队列
    emitPiEvent(sessionId, { type: "agent_settled" });
    await settleAct();
    expect(promptPayloads()).toHaveLength(1);
    expect(piChatRuntime.queueSize(key)).toBe(1);

    // 手动发送 = 用户要继续：新内容直接发，旧队列随后自动排空
    await send(handle, "手动继续");
    expect(promptPayloads().map(payload => payload.text)).toEqual(["第一条", "手动继续"]);
    emitPiEvent(sessionId, { type: "agent_settled" });
    await settleAct();
    expect(promptPayloads().map(payload => payload.text)).toEqual([
      "第一条",
      "手动继续",
      "停止时排队的",
    ]);
    expect(piChatRuntime.queueSize(key)).toBe(0);
  });
});

describe("发送失败与恢复", () => {
  it("prompt 被拒时展示错误、解除占用并恢复输入草稿，乐观消息保留", async () => {
    const chat = draftChat("draft-e1");
    const { handle, sendLoadingValues } = await renderChat({ chat });
    ipc.overrides.set("pi-session:prompt", () => ({ ok: false, error: "网络异常" }));

    expect(await send(handle, "第一问")).toBe(true);

    expect(coreShell.props.error).toBe("网络异常");
    expect(sendLoadingValues.at(-1)).toBe(false);
    // 发送时清空输入，失败后非中止类错误要恢复草稿（setTimeout 100ms）
    expect(inputShell.state!.clears).toBeGreaterThanOrEqual(1);
    await settleAct(150);
    expect(inputShell.state!.setValues.at(-1)).toBe("第一问");

    // 乐观写入的用户消息与占位不回滚：失败重试语义由用户显式触发
    const opened = useChatSessionStore.getState().opened["draft-e1"];
    expect(opened?.messages).toHaveLength(2);
  });

  it("宿主还在处理上一轮时，等 settled 事件后自动重提同一载荷", async () => {
    const chat = draftChat("draft-e2");
    const { handle } = await renderChat({ chat });
    let attempt = 0;
    ipc.overrides.set("pi-session:prompt", () => {
      attempt += 1;
      return attempt === 1 ? { ok: false, error: "pi host is already processing" } : { ok: true };
    });

    // 发送在等宿主 settled 事件：act 内启动但不 await，等第一支 prompt 被拒后再注入事件
    let sendResult: boolean | undefined;
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = handle.current!.sendUserMessage(text("第一问"));
      await flushMicrotasks();
    });
    expect(promptPayloads()).toHaveLength(1);
    expect(coreShell.props.error).toBeFalsy();

    const sessionId = createdSessionId();
    emitPiEvent(sessionId, { type: "agent_settled" });
    await act(async () => {
      sendResult = await pending;
    });
    await settleAct();

    expect(sendResult).toBe(true);
    expect(promptPayloads()).toHaveLength(2);
    expect(promptPayloads()[1]).toEqual(promptPayloads()[0]);
    expect(coreShell.props.error).toBeFalsy();
  });
});

describe("编辑重发", () => {
  it("编辑已落盘的用户消息：先回退会话树，再以新内容发送并截断旧回答", async () => {
    const chat = savedChat("chat-edit", [
      userMessage("旧问题", ["e1"]),
      assistantMessage("旧回答", ["e2"]),
      userMessage("第二问", ["e3"]),
      assistantMessage("第二答", ["e4"]),
    ]);
    seedSessionRow(chat);
    const { handle } = await renderChat({ chat });

    await clickStub('[aria-label="stub-edit-0"]');
    // 编辑态：原内容回填输入框
    expect(inputShell.state!.setValues).toContain("旧问题");
    act(() => {
      handle.current!.setInputValue("新问题");
    });

    // 回退投影：会话树上只剩被编辑的那条用户消息
    ipc.overrides.set("pi-session:edit", () => ({
      ok: true,
      messages: [userMessage("旧问题", ["e1"])],
    }));

    expect(await send(handle, "新问题")).toBe(true);

    expect(callsOf("pi-session:edit")[0]?.args[0]?.edit).toEqual({ kind: "rewind", entryId: "e1" });
    expect(promptPayloads()[0]?.text).toBe("新问题");
    // 回退先于发送（顺序错了会带着旧回答继续对话）
    expect(ipc.calls.findIndex(call => call.channel === "pi-session:edit")).toBeLessThan(
      ipc.calls.findIndex(call => call.channel === "pi-session:prompt")
    );

    // 回退投影 + 新的乐观写入：旧回答与第二问被截掉
    const opened = useChatSessionStore.getState().opened["chat-edit"];
    expect(opened?.messages).toHaveLength(3);
    expect(opened!.messages[0]).toMatchObject({ role: Role.User, piEntryIds: ["e1"] });
    expect(opened!.messages[1]).toMatchObject({ role: Role.User });
    expect(opened!.messages[2]).toMatchObject({ role: Role.Assistant });
  });

  it("编辑尚未落盘的消息被拒绝：不改会话树、退出编辑态后可正常发送", async () => {
    const chat = savedChat("chat-edit2", [userMessage("还没落盘的问题")]);
    const { handle } = await renderChat({ chat });

    await clickStub('[aria-label="stub-edit-0"]');
    expect(await send(handle, "改后的内容")).toBe(false);
    expect(callsOf("pi-session:edit")).toHaveLength(0);
    expect(callsOf("pi-session:prompt")).toHaveLength(0);

    // 编辑态已退出：下一条消息按普通发送处理
    expect(await send(handle, "直接问")).toBe(true);
    expect(promptPayloads()[0]?.text).toBe("直接问");
    expect(callsOf("pi-session:edit")).toHaveLength(0);
  });
});

describe("运行中插话", () => {
  it("运行中插话交给宿主 steer 并登记待送达，成功交出后才清空输入", async () => {
    const chat = draftChat("draft-s1");
    const { handle } = await renderChat({ chat });
    await send(handle, "第一条");
    const sessionId = createdSessionId();
    emitPiEvent(sessionId, { type: "agent_start" });

    act(() => {
      handle.current!.setInputValue("插一句");
    });
    await clickStub('[aria-label="stub-steer"]');

    expect(callsOf("pi-session:steer")[0]?.args[0]).toMatchObject({
      sessionId,
      text: "插一句",
    });
    expect(piChatRuntime.listPendingSteers(chatSessionKey("main-chat", "draft-s1"))).toMatchObject([
      { text: "插一句" },
    ]);
    // 只有成功交出去才清输入框
    expect(inputShell.state!.clears).toBeGreaterThanOrEqual(1);
  });
});

it("快捷输入提交失败可保留原文重试，首条消息被接收时切换文档会话", async () => {
  const bucket = { scope: "pdf-chat" as const, domainRef: "42" };
  const store = useChatSessionStore.getState();
  store.setCurrent(bucket, "previous");
  const previousKey = chatSessionKey("pdf-chat:42", "previous");
  usedSessionKeys.push(previousKey);
  piChatRuntime.ensureConversation(previousKey, savedChat("previous", [userMessage("上一问")]), {
    publish: store.publishChat,
    settle: chat => store.settleChat(chat.id, chat.databaseName, chat.sessionFile),
  });
  piChatRuntime.bindSession(previousKey, "running-session");
  emitPiEvent("running-session", { type: "agent_start" });
  const origin = document.createElement("button");
  let panelOpen = false;
  function Reader() {
    useOwnAssist("pdf-detail", {
      isChatOpen: () => panelOpen,
      toggle: () => {
        panelOpen = !panelOpen;
      },
      quickChat: () => ({
        chatScope: "pdf-chat:42",
        toolScope: "pdf-42",
        show: id => {
          store.setCurrent(bucket, id);
          panelOpen = true;
        },
      }),
    });
    return <ChatShortcuts />;
  }
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <PageProvider initialKey="pdf-detail">
          <Reader />
        </PageProvider>
      </QueryClientProvider>
    )
  );
  host.append(origin);
  origin.focus();
  const shortcut = (key: string, shiftKey = false) =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        metaKey: key !== "Escape",
        shiftKey,
        bubbles: true,
        cancelable: true,
      })
    );
  await act(async () => {
    shortcut("J", true);
    await import("@/features/chat/components/QuickChatInput");
  });
  expect(document.activeElement).toBeInstanceOf(HTMLTextAreaElement);
  expect(panelOpen).toBe(false);
  await act(async () => {
    shortcut("Escape");
  });
  expect(document.activeElement).toBe(origin);
  expect(callsOf("chat-session:create")).toHaveLength(0);
  await act(async () => {
    shortcut("j");
  });
  expect(panelOpen).toBe(true);
  await act(async () => {
    shortcut("J", true);
  });
  const field = document.activeElement;
  if (!(field instanceof HTMLTextAreaElement)) throw new Error("快捷输入框未聚焦");
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
      field,
      "解释这一页"
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const submit = (isComposing = false) =>
    field.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        isComposing,
        bubbles: true,
        cancelable: true,
      })
    );
  await act(async () => {
    submit(true);
  });
  expect(callsOf("pi-session:prompt")).toHaveLength(0);

  ipc.overrides.set("pi-session:prompt", () => ({ ok: false, error: "暂时不可用" }));
  await act(async () => {
    submit();
  });
  expect(field.value).toBe("解释这一页");
  expect(useChatSessionStore.getState().currentIds["pdf-chat|42"]).toBe("previous");
  expect(useChatSessionStore.getState().buckets["pdf-chat|42"]?.rows ?? []).toEqual([]);
  expect(document.activeElement).toBe(field);

  const reply = Promise.withResolvers<{ ok: boolean }>();
  ipc.overrides.set("pi-session:prompt", () => reply.promise);
  await act(async () => {
    submit();
    submit();
  });
  const prompts = promptPayloads();
  expect(prompts).toHaveLength(2);
  const { sessionId, text: prompt } = prompts[1];
  expect(prompt).toBe("解释这一页");
  const created = callsOf("pi-session:create").at(-1)?.args[0];
  expect(created).toMatchObject({ chatScope: "pdf-chat:42", toolScope: "pdf-42" });
  expect(useChatSessionStore.getState().currentIds["pdf-chat|42"]).toBe("previous");
  emitPiEvent(sessionId, { type: "agent_start" });
  emitPiEvent(sessionId, {
    type: "message_start",
    message: { role: "user", content: text(prompt) },
  });
  const current = useChatSessionStore.getState();
  expect(current.currentIds["pdf-chat|42"]).toBe(created.piSessionId);
  expect(current.opened[created.piSessionId]?.messages[0]).toMatchObject({
    role: Role.User,
    content: text(prompt),
  });
  expect(piChatRuntime.isStreaming(previousKey)).toBe(true);
  expect(piChatRuntime.queueSize(previousKey)).toBe(0);
  expect(field.isConnected).toBe(false);
  expect(panelOpen).toBe(true);
  expect(useShellStore.getState().assistView).toBeNull();
  usedSessionKeys.push(chatSessionKey("pdf-chat:42", created.piSessionId));
  await act(async () => {
    reply.resolve({ ok: true });
  });
  expect(useChatSessionStore.getState().currentIds["pdf-chat|42"]).toBe(created.piSessionId);
});
