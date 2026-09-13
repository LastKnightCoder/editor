// 会话状态推导与展示层延迟揭示：参考 ActionSheet.test.tsx 的 act + createRoot 约定。
// 重点是锁住「session 引用重建不得重置延迟揭示计时器」——manager.changed() 每次广播
// 都会重建 session.info，若 effect 依赖对象引用，打字时揭示会被无限推迟。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CollaborationSession } from "@tau/collaboration";
import { sessionStatus, useStableSessionStatus, type SessionStatus } from "../session-status";

function makeSession(overrides: Partial<CollaborationSession> = {}): CollaborationSession {
  return {
    id: "doc-1",
    title: "协作文档",
    ownerId: "device-owner",
    role: "owner",
    status: "active",
    members: [],
    updatedAt: 0,
    serverUrl: "https://collab.example.com",
    connection: "connected",
    pending: false,
    leaving: false,
    ...overrides,
  };
}

type StatusController = {
  render: (session?: CollaborationSession) => Promise<void>;
  last: () => SessionStatus | undefined;
  cleanup: () => Promise<void>;
};

function createStatusController(): StatusController {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  const rendered: (SessionStatus | undefined)[] = [];

  function Probe({ session }: { session?: CollaborationSession }) {
    rendered.push(useStableSessionStatus(session));
    return null;
  }

  return {
    render: async session => {
      await act(async () => {
        root.render(<Probe session={session} />);
      });
      await act(async () => {
        await Promise.resolve();
      });
    },
    last: () => rendered[rendered.length - 1],
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe("sessionStatus", () => {
  it("仅「连接正常 + 有未同步改动」标记为瞬时同步", () => {
    const connected = sessionStatus(makeSession({ connection: "connected", pending: true }));
    expect(connected).toEqual({ label: "正在同步", tone: "syncing", transientSyncing: true });

    expect(sessionStatus(makeSession({ pending: false })).transientSyncing).toBeUndefined();
  });

  it("其余 syncing 分支不得标记为瞬时同步（它们需要立即显示）", () => {
    // 离线待同步：改动只在本机，用户必须立刻看到
    expect(
      sessionStatus(makeSession({ connection: "offline", pending: true })).transientSyncing
    ).toBeUndefined();
    // 共享已结束但有待恢复内容
    expect(
      sessionStatus(makeSession({ status: "closed", pending: true })).transientSyncing
    ).toBeUndefined();
    // 退出中
    expect(sessionStatus(makeSession({ leaving: true })).transientSyncing).toBeUndefined();
    // 错误态压过一切
    expect(sessionStatus(makeSession({ error: "身份验证失败", pending: true }))).toMatchObject({
      label: "身份验证失败",
      tone: "error",
    });
  });
});

describe("useStableSessionStatus", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("会话引用反复重建但字段不变时，不重置延迟揭示计时器", async () => {
    vi.useFakeTimers();
    const controller = createStatusController();

    await controller.render(makeSession({ pending: false }));
    expect(controller.last()?.label).toBe("已同步");

    // 开始打字：进入瞬时同步，此时不应立刻揭示
    await controller.render(makeSession({ pending: true }));
    expect(controller.last()?.label).toBe("已同步");

    // 期间服务端持续广播（manager.changed() 每次生成全新的 session.info 对象）
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await controller.render(makeSession({ pending: true }));
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await controller.render(makeSession({ pending: true }));

    // 距首次进入瞬时同步满 1s：计时器未被重建，揭示应已发生
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(controller.last()?.label).toBe("正在同步");

    await controller.cleanup();
  });

  it("未同步改动清零后立即回到已同步，无需等待揭示延迟", async () => {
    vi.useFakeTimers();
    const controller = createStatusController();

    await controller.render(makeSession({ pending: false }));
    await controller.render(makeSession({ pending: true }));
    expect(controller.last()?.label).toBe("已同步");

    await controller.render(makeSession({ pending: false }));
    expect(controller.last()?.label).toBe("已同步");

    await controller.cleanup();
  });

  it("会话消失后返回 undefined", async () => {
    const controller = createStatusController();

    await controller.render(makeSession());
    expect(controller.last()?.label).toBe("已同步");

    await controller.render(undefined);
    expect(controller.last()).toBeUndefined();

    await controller.cleanup();
  });
});
