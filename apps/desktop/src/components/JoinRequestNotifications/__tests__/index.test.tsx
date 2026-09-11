import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

/** 等待 AnimatePresence 的退出动画在 jsdom 的 rAF 实现下走完。 */
const waitForExitAnimation = () =>
  act(async () => {
    await new Promise(resolve => setTimeout(resolve, 400));
  });

/** stacked 省略时返回全部通知卡，否则按完整/堆叠状态过滤。 */
const queryCards = (stacked?: boolean) =>
  document.querySelectorAll(
    stacked === undefined
      ? '[data-testid="join-request-notification"]'
      : stacked
        ? '[data-testid="join-request-notification"][data-stacked]'
        : '[data-testid="join-request-notification"]:not([data-stacked])'
  );

describe("JoinRequestNotifications", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    invokeMock.mockImplementation(() => Promise.resolve());
    useCollaborationStore.setState({ requests: [], sessions: [], synced: false });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<JoinRequestNotifications />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("启动同步时已存在的待审批申请不弹通知", () => {
    act(() => {
      useCollaborationStore.setState({
        requests: [makeRequest("req-existing", "存量用户")],
        sessions: [makeSession("doc-1", "产品需求文档")],
        synced: true,
      });
    });
    // 后续 refresh 推送同样的存量申请同样不弹
    act(() => {
      useCollaborationStore.setState({ requests: [makeRequest("req-existing", "存量用户")] });
    });
    expect(document.querySelector('[data-testid="join-request-notification"]')).toBeNull();
  });

  it("运行期新到达的申请弹出通知，展示昵称与文档标题", () => {
    act(() => {
      useCollaborationStore.setState({
        sessions: [makeSession("doc-1", "产品需求文档")],
        synced: true,
      });
    });
    expect(document.querySelector('[data-testid="join-request-notification"]')).toBeNull();

    act(() => {
      useCollaborationStore.setState({ requests: [makeRequest("req-new", "李四")] });
    });

    const card = document.querySelector('[data-testid="join-request-notification"]');
    expect(card?.textContent).toContain("李四");
    expect(card?.textContent).toContain("请求加入协作 · 产品需求文档");
  });

  it("点击同意调用 collaboration:decide 且通知消失", async () => {
    act(() => {
      useCollaborationStore.setState({ synced: true });
    });
    act(() => {
      useCollaborationStore.setState({ requests: [makeRequest("req-approve", "李四")] });
    });
    const card = document.querySelector('[data-testid="join-request-notification"]');
    const approve = Array.from(card!.querySelectorAll("button")).find(
      button => button.textContent === "同意"
    );

    await act(async () => {
      approve?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith("collaboration:decide", "req-approve", true);
    await waitForExitAnimation();
    expect(document.querySelector('[data-testid="join-request-notification"]')).toBeNull();
  });

  it("点击拒绝调用 collaboration:decide 且通知消失", async () => {
    act(() => {
      useCollaborationStore.setState({ synced: true });
    });
    act(() => {
      useCollaborationStore.setState({ requests: [makeRequest("req-reject", "王五")] });
    });
    const card = document.querySelector('[data-testid="join-request-notification"]');
    const reject = Array.from(card!.querySelectorAll("button")).find(
      button => button.textContent === "拒绝"
    );

    await act(async () => {
      reject?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith("collaboration:decide", "req-reject", false);
    await waitForExitAnimation();
    expect(document.querySelector('[data-testid="join-request-notification"]')).toBeNull();
  });

  it("申请在别处被处理后（不再 pending）通知自动消失", async () => {
    act(() => {
      useCollaborationStore.setState({ synced: true });
    });
    act(() => {
      useCollaborationStore.setState({ requests: [makeRequest("req-gone", "赵六")] });
    });
    expect(document.querySelector('[data-testid="join-request-notification"]')).toBeTruthy();

    act(() => {
      useCollaborationStore.setState({ requests: [] });
    });
    await waitForExitAnimation();
    expect(document.querySelector('[data-testid="join-request-notification"]')).toBeNull();
  });

  it("新通知插入最上方，超过 3 张时其余以真实卡片层叠呈现", () => {
    act(() => {
      useCollaborationStore.setState({ synced: true });
    });
    act(() => {
      useCollaborationStore.setState({
        requests: Array.from({ length: 4 }, (_, i) => makeRequest(`req-${i + 1}`, `用户${i + 1}`)),
      });
    });

    // 4 张申请：3 张完整卡 + 1 张堆叠卡（真实卡片收拢露出顶部边缘）
    expect(queryCards(false)).toHaveLength(3);
    expect(queryCards(true)).toHaveLength(1);
    // 服务端按申请时间升序返回，最新申请（后到的）排在最上方
    expect(queryCards(false)[0].textContent).toContain("用户4");

    act(() => {
      useCollaborationStore.setState({
        requests: [
          ...Array.from({ length: 4 }, (_, i) => makeRequest(`req-${i + 1}`, `用户${i + 1}`)),
          makeRequest("req-5", "用户5"),
        ],
      });
    });
    // 后到达的第 5 条插入最上方，堆叠至多两层
    expect(queryCards(false)).toHaveLength(3);
    expect(queryCards(true)).toHaveLength(2);
    expect(queryCards(false)[0].textContent).toContain("用户5");
  });

  it("堆叠层数最多两层，无论积压多少", () => {
    act(() => {
      useCollaborationStore.setState({ synced: true });
    });
    act(() => {
      useCollaborationStore.setState({
        requests: Array.from({ length: 6 }, (_, i) => makeRequest(`req-${i + 1}`, `用户${i + 1}`)),
      });
    });

    expect(queryCards(false)).toHaveLength(3);
    expect(queryCards(true)).toHaveLength(2);
  });

  it("处理最上方通知后，堆叠的申请升格为完整卡片", async () => {
    act(() => {
      useCollaborationStore.setState({ synced: true });
    });
    act(() => {
      useCollaborationStore.setState({
        requests: Array.from({ length: 4 }, (_, i) => makeRequest(`req-${i + 1}`, `用户${i + 1}`)),
      });
    });

    const approve = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '[data-testid="join-request-notification"]:not([data-stacked]) button'
      )
    ).find(button => button.textContent === "同意");
    await act(async () => {
      approve?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await waitForExitAnimation();

    // 最上方（用户 4）被处理后仍满 3 张完整卡：最旧的用户 1 从堆叠区升格
    expect(queryCards(false)).toHaveLength(3);
    expect(queryCards(true)).toHaveLength(0);
    expect(queryCards(false)[0].textContent).not.toContain("用户4");
    expect(queryCards(false)[2].textContent).toContain("用户1");
  });
});
