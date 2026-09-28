/**
 * runtime 条目回收（M4-e）：空闲条目按最近使用保留上限；挂着的、在跑的、等待交互的、有队列/插话的
 * 一律不回收；切库清掉全部空闲条目。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ChatMessage } from "@/types";
import { piChatRuntime, type PiChatRuntimeDeps } from "../piChatRuntime";
import { usePiInteractionStore } from "../piInteractions";

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: AgentSessionEvent) => void>(),
}));
vi.mock("@/constants", () => ({ Role: { Assistant: "assistant", User: "user" } }));
vi.mock("@/commands/piSession", () => ({
  onPiSessionEvent: (id: string, listener: (event: AgentSessionEvent) => void) => {
    mocks.listeners.set(id, listener);
    return () => mocks.listeners.delete(id);
  },
  onPiSessionInteractions: vi.fn(),
  piSessionInteractions: vi.fn().mockResolvedValue({ ok: true, snapshots: [] }),
  piSessionApproveTool: vi.fn(),
  piSessionAnswerQuestion: vi.fn(),
}));

const chat = (id: string): ChatMessage =>
  ({
    id,
    title: "t",
    titleDirty: true,
    createTime: 1,
    updateTime: 1,
    messages: [],
  }) as unknown as ChatMessage;
const deps = (): PiChatRuntimeDeps => ({ publish: vi.fn(), settle: vi.fn(async () => null) });
const keys: string[] = [];
const open = (id: string) => {
  const key = `main-chat:${id}`;
  keys.push(key);
  piChatRuntime.ensureConversation(key, chat(id), deps());
  return key;
};
/** 条目还在 = 再 ensure 拿到的是同一个容器 */
const alive = (key: string, container: { current: ChatMessage }) =>
  piChatRuntime.ensureConversation(key, chat("x"), deps()) === container;

beforeEach(() => {
  usePiInteractionStore.setState({ sessions: {}, readySessions: {} });
});
afterEach(() => {
  keys.splice(0).forEach(key => piChatRuntime.disposeConversation(key));
});

describe("runtime 条目回收", () => {
  it("空闲条目超过上限按最近使用淘汰", () => {
    vi.useFakeTimers();
    const containers = ["a", "b", "c"].map((id, index) => {
      vi.setSystemTime(1000 + index);
      const key = open(id);
      return { key, container: piChatRuntime.ensureConversation(key, chat(id), deps()) };
    });
    vi.useRealTimers();
    const doomed = piChatRuntime.sweepIdle(2);
    expect(doomed).toEqual(["main-chat:a"]);
    expect(alive(containers[1].key, containers[1].container)).toBe(true);
  });

  it("挂着的条目不回收；卸载后才可回收", () => {
    const key = open("mounted");
    const release = piChatRuntime.retain(key);
    expect(piChatRuntime.sweepIdle(0)).not.toContain(key);
    release();
    // release 内部做了一次上限回收（默认上限远大于 1，所以还在），显式清零才淘汰
    expect(piChatRuntime.sweepIdle(0)).toContain(key);
  });

  it("在跑、等待交互、有队列的条目不回收；切库清掉其余空闲条目", () => {
    const running = open("running");
    piChatRuntime.bindSession(running, "s-running");
    mocks.listeners.get("s-running")?.({ type: "agent_start" } as AgentSessionEvent);

    const waiting = open("waiting");
    piChatRuntime.bindSession(waiting, "s-waiting");
    usePiInteractionStore.setState({
      sessions: {
        "s-waiting": {
          sessionId: "s-waiting",
          revision: 1,
          approvals: [{ requestId: "r" } as never],
          questions: [],
        },
      },
    });

    const queued = open("queued");
    piChatRuntime.enqueueMessage(queued, [{ type: "text", text: "待发送" }]);

    const idle = open("idle");

    const released = piChatRuntime.releaseIdle();
    expect(released).toContain(idle);
    expect(released).not.toContain(running);
    expect(released).not.toContain(waiting);
    expect(released).not.toContain(queued);
  });
});
