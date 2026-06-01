import { App } from "antd";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SubscriptionTree from "../SubscriptionTree";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const rssState = vi.hoisted(() => ({
  feeds: [
    {
      id: 1,
      title: "Example Feed",
      url: "https://example.com/feed.xml",
    },
  ],
  subscriptions: [
    {
      id: 10,
      feedId: 1,
      title: "Example Feed",
      category: "技术",
    },
  ],
  categories: ["技术", "产品"],
  unreadCounts: { 1: 3 },
  unsubscribe: vi.fn(),
  updateSubscription: vi.fn(),
}));

vi.mock("@/stores/useRssStore", () => ({
  default: (selector: (state: typeof rssState) => unknown) =>
    selector(rssState),
}));

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<App>{node}</App>);
  });

  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

const flushDropdown = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const openSubscriptionContextMenu = async (container: HTMLElement) => {
  const subscriptionButton = Array.from(
    container.querySelectorAll("button"),
  ).find((button) => button.textContent?.includes("Example Feed"));
  expect(subscriptionButton).toBeTruthy();

  await act(async () => {
    subscriptionButton?.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      }),
    );
  });
  await flushDropdown();
};

const clickMenuItem = async (label: string) => {
  const item = Array.from(document.body.querySelectorAll("li")).find((node) =>
    node.textContent?.includes(label),
  );
  expect(item).toBeTruthy();

  await act(async () => {
    item?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flushDropdown();
};

const changeInput = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);

  await act(async () => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("SubscriptionTree", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("右键订阅项时应展示包含分类操作的 Dropdown 菜单", async () => {
    const { root, container } = await mount(
      <SubscriptionTree
        selection={{ kind: "smart", group: "all" }}
        onSelect={vi.fn()}
      />,
    );

    await openSubscriptionContextMenu(container);

    expect(document.body.textContent).toContain("调整分类");
    expect(document.body.textContent).toContain("取消订阅");

    await unmount(root, container);
  });

  it("新建分类应使用自绘弹窗并提交分类名", async () => {
    const { root, container } = await mount(
      <SubscriptionTree
        selection={{ kind: "smart", group: "all" }}
        onSelect={vi.fn()}
      />,
    );

    await openSubscriptionContextMenu(container);
    await clickMenuItem("新建分类");

    expect(document.body.querySelector(".ant-modal")).toBeFalsy();
    expect(document.body.textContent).toContain("新建分类");
    expect(document.body.textContent).toContain("分类名称");
    expect(document.body.textContent).toContain("移动到此分类");

    const input = document.body.querySelector(
      'input[placeholder="输入分类名称"]',
    ) as HTMLInputElement | null;
    expect(input).toBeTruthy();
    await changeInput(input!, "资讯");

    const submitButton = Array.from(
      document.body.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("移动到此分类"));
    expect(submitButton).toBeTruthy();
    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(rssState.updateSubscription).toHaveBeenCalledWith(10, {
      category: "资讯",
    });

    await unmount(root, container);
  });
});
