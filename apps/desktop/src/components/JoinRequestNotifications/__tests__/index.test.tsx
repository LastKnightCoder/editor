import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notify, NotificationHost } from "@tau/ui";
import JoinRequestNotifications from "../index";
import useCollaborationStore from "@/stores/useCollaborationStore";
import type { CollaborationSession, JoinRequest } from "@tau/collaboration";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@/electron", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  on: () => {},
  off: () => {},
  platform: "web",
}));

// 组件经契约层调用 collaboration 命令，装配直连 invokeMock 的桥
import { setCommandBridge } from "@tau/rpc";
setCommandBridge({
  call: (channel, args) => Promise.resolve(invokeMock(channel, ...args)),
});

(globalThis as { matchMedia?: unknown }).matchMedia ??= (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

const makeRequest = (id: string, nickname: string, documentId = "doc-1"): JoinRequest => ({
  id,
  documentId,
  deviceId: `device-${id}`,
  nickname,
  status: "pending",
  expiresAt: Date.now() + 86400000,
});

const makeSession = (id: string, title: string): CollaborationSession => ({
  id,
  title,
  ownerId: "owner",
  role: "owner",
  status: "active",
  members: [],
  updatedAt: Date.now(),
  serverUrl: "https://collab.example.com",
  connection: "connected",
  pending: false,
  leaving: false,
});

const LEAVE_BUFFER = 260;
const RESOLVED_STAY = 1600;

const cards = () => Array.from(document.querySelectorAll<HTMLElement>('[role="status"]'));
const button = (card: HTMLElement, text: string) =>
  Array.from(card.querySelectorAll("button")).find(
    b => b.textContent === text
  ) as HTMLButtonElement;
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
/** 让 decide 的 promise 链（bridge → invoke → then）落地 */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
const setStore = (patch: Parameters<typeof useCollaborationStore.setState>[0]) =>
  act(() => {
    useCollaborationStore.setState(patch);
  });

describe("JoinRequestNotifications", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    invokeMock.mockImplementation(() => Promise.resolve());
    useCollaborationStore.setState({ requests: [], sessions: [], synced: false });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <>
          <JoinRequestNotifications />
          <NotificationHost />
        </>
      );
    });
  });

  afterEach(() => {
    act(() => notify.dismiss());
    advance(LEAVE_BUFFER);
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("启动同步时已存在的待审批申请不弹通知", () => {
    setStore({
      requests: [makeRequest("req-existing", "存量用户")],
      sessions: [makeSession("doc-1", "产品需求文档")],
      synced: true,
    });
    // 后续 refresh 推送同样的存量申请同样不弹
    setStore({ requests: [makeRequest("req-existing", "存量用户")] });
    expect(cards()).toHaveLength(0);
  });

  it("运行期新到达的申请弹出通知，展示昵称、文档标题与头像", async () => {
    setStore({ sessions: [makeSession("doc-1", "产品需求文档")], synced: true });
    expect(cards()).toHaveLength(0);

    setStore({ requests: [makeRequest("req-new", "李四")] });
    await flush(); // appNotify 经 route 裁决后异步入栈
    const text = cards()[0].textContent;
    expect(text).toContain("李四请求加入协作");
    expect(text).toContain("「产品需求文档」");
    expect(text).toContain("李"); // 头像取昵称首字
  });

  it("点击同意调用 collaboration:decide，收成结果行后退场", async () => {
    setStore({ synced: true });
    setStore({ requests: [makeRequest("req-approve", "李四")] });
    await flush();

    act(() => button(cards()[0], "同意").click());
    await flush();
    expect(invokeMock).toHaveBeenCalledWith("collaboration:decide", "req-approve", true);
    expect(cards()[0].textContent).toBe("已同意李四加入协作");

    advance(RESOLVED_STAY + LEAVE_BUFFER);
    expect(cards()).toHaveLength(0);
  });

  it("点击拒绝调用 collaboration:decide，收成结果行后退场", async () => {
    setStore({ synced: true });
    setStore({ requests: [makeRequest("req-reject", "王五")] });
    await flush();

    act(() => button(cards()[0], "拒绝").click());
    await flush();
    expect(invokeMock).toHaveBeenCalledWith("collaboration:decide", "req-reject", false);
    expect(cards()[0].textContent).toBe("已拒绝王五的申请");

    advance(RESOLVED_STAY + LEAVE_BUFFER);
    expect(cards()).toHaveLength(0);
  });

  it("作答失败：卡内显示错误并解锁，通知保留", async () => {
    invokeMock.mockImplementation(() => Promise.reject(new Error("申请已过期")));
    setStore({ synced: true });
    setStore({ requests: [makeRequest("req-fail", "赵六")] });
    await flush();

    act(() => button(cards()[0], "同意").click());
    await flush();
    expect(cards()[0].textContent).toContain("申请已过期");
    expect(button(cards()[0], "同意").disabled).toBe(false);
  });

  it("申请在别处被处理后（不再 pending）通知自动关闭", async () => {
    setStore({ synced: true });
    setStore({ requests: [makeRequest("req-gone", "赵六")] });
    await flush();
    expect(cards()).toHaveLength(1);

    setStore({ requests: [] });
    advance(LEAVE_BUFFER);
    expect(cards()).toHaveLength(0);
  });

  it("作答中申请从 store 消失，不打断结果行", async () => {
    let settle!: () => void;
    invokeMock.mockImplementation(() => new Promise<void>(resolve => (settle = resolve)));
    setStore({ synced: true });
    setStore({ requests: [makeRequest("req-busy", "李四")] });
    await flush();

    act(() => button(cards()[0], "同意").click());
    await flush();
    // 作者同意后服务端刷新：申请不再 pending
    setStore({ requests: [] });
    advance(LEAVE_BUFFER);
    expect(cards()).toHaveLength(1);

    act(() => settle());
    await flush();
    expect(cards()[0].textContent).toBe("已同意李四加入协作");
  });

  it("手动关闭后同一申请不再弹出", async () => {
    setStore({ synced: true });
    setStore({ requests: [makeRequest("req-closed", "李四")] });
    await flush();
    act(() => button(cards()[0], "").click()); // 关闭钮只有图标
    advance(LEAVE_BUFFER);
    setStore({ requests: [makeRequest("req-closed", "李四")] });
    expect(cards()).toHaveLength(0);
  });

  it("多条申请：最新的在最上方，超过 3 张的进入叠层", async () => {
    setStore({ synced: true });
    setStore({
      requests: Array.from({ length: 4 }, (_, i) => makeRequest(`req-${i + 1}`, `用户${i + 1}`)),
    });
    await flush();

    expect(cards()).toHaveLength(4);
    // 服务端按申请时间升序返回，最新申请排在最上方
    expect(cards()[0].textContent).toContain("用户4");
    expect(cards().filter(c => c.hasAttribute("inert"))).toHaveLength(1);
  });
});
